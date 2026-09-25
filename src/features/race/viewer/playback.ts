import { checkpointDuration, type MotionMode } from './motion';
import type { RaceSimulationState } from "../../../simulation/race/types";
import { assessCheckpoint, initialAttention, type Attention, type AttentionMemory, type StrategicReason } from "./attention";
export const PLAYBACK_SPEEDS = [1, 2, 4, 8] as const;
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];
/** Maximum committed checkpoints one Next Strategic Event run may advance before stopping on its own. */
export const SEEK_LIMIT = 20;
/**
 * Scheduler state. `busy` (a mutation in flight) is orthogonal: any phase can be waiting for a mutation.
 * - paused: no checkpoint will be requested.
 * - running: one checkpoint per interval at the selected speed.
 * - seeking: Next Strategic Event, one committed checkpoint at a time at seek cadence.
 * - finished: terminal; nothing is ever scheduled again.
 */
export type PlaybackPhase = 'paused' | 'running' | 'seeking' | 'finished';
export type PlaybackSnapshot = {
    phase: PlaybackPhase;
    playing: boolean;
    motion: MotionMode;
    latencyMs: number;
    busy: boolean;
    speed: PlaybackSpeed;
    autoPause: boolean;
    skipping: boolean;
    /** Why playback stopped (null while running or after a manual pause). */
    reason: StrategicReason | null;
    /** The attention item that stopped playback, when a strategic change did. */
    attention: Attention | null;
    /** Further strategic items detected at the same checkpoint. */
    moreAttention: number;
    /** Most recent strategic item, shown even when auto-pause is off and playback continued. */
    lastAttention: Attention | null;
    /** Last successfully saved player command, identifying its driver (cleared when playback resumes). */
    confirmation: CommandInfo | null;
    error: string | null;
};
/** What a player command did, so confirmations can always name the driver it targeted. */
export interface CommandInfo { entrantId: string; kind: 'pit' | 'paceMode' | 'fuelMode' | 'ersMode'; value: string | null }
export interface PlaybackClock {
    set(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
    clear(timer: ReturnType<typeof setTimeout>): void;
    /** Presentation clock for the checkpoint budget; defaults to Date.now. */
    now?(): number;
}
const defaultClock: PlaybackClock = { set: (callback, delay) => setTimeout(callback, delay), clear: timer => clearTimeout(timer), now: () => Date.now() };
/**
 * Playback orchestration only; the Race itself advances exclusively through `advance`, one committed checkpoint at a
 * time, so 1×, 8× and Next Strategic Event all execute the identical authoritative sequence.
 *
 * Invariants: at most one timer; at most one mutation (advance or command) in flight; nothing is scheduled while paused,
 * busy or finished. Each committed checkpoint carries a presentation "budget" (its interval at the current speed). The
 * budget is only consumed while cars are visibly moving, so Pause→Resume continues exactly where the interval stopped
 * and a checkpoint whose motion has already settled advances immediately instead of waiting a full interval.
 */
export class PlaybackController {
    private state: RaceSimulationState;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private listeners = new Set<() => void>();
    private seekRemaining = 0;
    private memory: AttentionMemory;
    /** Remaining interval of the current checkpoint (ms at the current cadence) and when consumption last started. */
    private budgetMs = 0;
    private budgetSince: number | null = null;
    /** Serialises every mutation (advance and command); never more than one in flight. */
    private mutation: Promise<unknown> = Promise.resolve();
    /** Mutations accepted but not yet finished; `busy` is true while any are pending. */
    private pending = 0;
    private snapshot: PlaybackSnapshot;
    constructor(state: RaceSimulationState, private playerTeamId: string, private advance: (state: RaceSimulationState) => Promise<RaceSimulationState>, private clock: PlaybackClock = defaultClock) {
        this.state = state;
        this.memory = initialAttention(state, playerTeamId);
        const finished = state.status === 'FINISHED';
        this.snapshot = { phase: finished ? 'finished' : 'paused', playing: false, motion: 'paused', latencyMs: 0, busy: false, speed: 1, autoPause: true, skipping: false, reason: finished ? 'FINISH' : null, attention: null, moreAttention: 0, lastAttention: null, confirmation: null, error: null };
    }
    getSnapshot = () => this.snapshot;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    getState = () => this.state;
    private emit(patch: Partial<PlaybackSnapshot>) {
        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners) listener();
    }
    private now() { return this.clock.now?.() ?? Date.now(); }
    private get finished() { return this.state.status === 'FINISHED'; }
    private interval() { return checkpointDuration(this.snapshot.speed, this.state.incidents?.mode, this.snapshot.skipping); }
    private clearTimer() { if (this.timer !== null) this.clock.clear(this.timer); this.timer = null; }
    /** Charges elapsed visible-motion time to the budget and stops the budget clock. */
    private consume() {
        if (this.budgetSince !== null) this.budgetMs = Math.max(0, this.budgetMs - (this.now() - this.budgetSince));
        this.budgetSince = null;
    }
    /** Re-expresses the remaining budget at a new cadence, preserving the fraction of the interval still to run. */
    private rescale(before: number, after: number) {
        const moving = this.budgetSince !== null;
        this.consume();
        this.budgetMs = before > 0 ? this.budgetMs * after / before : after;
        if (moving) this.budgetSince = this.now();
    }
    /** The single scheduling path: replaces any pending timer; never schedules while paused, busy or finished. */
    private schedule() {
        this.clearTimer();
        if (!this.snapshot.playing || this.snapshot.busy || this.finished) return;
        const remaining = Math.max(0, this.budgetMs - (this.budgetSince === null ? 0 : this.now() - this.budgetSince));
        this.timer = this.clock.set(() => { this.timer = null; void this.tick(); }, remaining);
    }
    private start(seeking: boolean) {
        const before = this.interval();
        this.emit({ playing: true, skipping: seeking, phase: seeking ? 'seeking' : 'running', motion: 'playing', reason: null, attention: null, moreAttention: 0, confirmation: null, error: null });
        this.rescale(before, this.interval());
        this.budgetSince ??= this.now();
        this.schedule();
    }
    /** Stops requesting checkpoints. An in-flight mutation completes safely and playback then stays paused. */
    pause = () => {
        this.clearTimer();
        this.consume();
        this.seekRemaining = 0;
        this.emit({ playing: false, skipping: false, phase: this.finished ? 'finished' : 'paused', motion: 'paused' });
    };
    /** Resume: continues the current interval where it stopped; if the checkpoint's motion already settled, advances now. */
    play = () => { if (this.finished || this.snapshot.playing) return; this.start(false); };
    setSpeed = (speed: PlaybackSpeed) => {
        if (!PLAYBACK_SPEEDS.includes(speed) || speed === this.snapshot.speed) return;
        const before = this.interval();
        this.emit({ speed });
        if (!this.snapshot.skipping) this.rescale(before, this.interval());
        this.schedule();
    };
    setAutoPause = (autoPause: boolean) => this.emit({ autoPause });
    /** Next Strategic Event: advances real committed checkpoints one at a time until a public strategic change. */
    skip = () => { if (this.finished) return; this.seekRemaining = SEEK_LIMIT; this.start(true); };
    step = async () => {
        this.pause();
        if (this.snapshot.busy || this.finished) return;
        this.emit({ motion: 'settle', reason: null, attention: null, moreAttention: 0, confirmation: null });
        await this.tick();
    };
    /** Runs `work` strictly after any in-flight mutation; `busy` stays true until every accepted mutation has finished. */
    private exclusive<T>(work: () => Promise<T>): Promise<T> {
        // Nothing pending: start now (same tick). Otherwise queue strictly behind the in-flight mutation.
        const started = this.pending === 0 ? work() : this.mutation.then(work);
        this.pending++;
        this.emit({ busy: true, error: null });
        const next = started.finally(() => { this.pending--; this.emit({ busy: this.pending > 0 }); this.schedule(); });
        this.mutation = next.catch(() => undefined);
        return next;
    }
    private tick() {
        if (this.pending > 0 || this.finished) return Promise.resolve();
        this.clearTimer();
        return this.exclusive(async () => {
            const requestedAt = this.now();
            try {
                const after = await this.advance(this.state);
                this.state = after;
                // Match the observed checkpoint cadence, including persistence time, to avoid a stop at every lap.
                this.emit({ latencyMs: Math.min(1500, Math.max(0, this.now() - requestedAt)) });
                const { items, memory } = assessCheckpoint(this.memory, after, this.playerTeamId);
                this.memory = memory;
                const top = items[0] ?? null;
                if (top) this.emit({ lastAttention: top });
                if (this.snapshot.skipping) this.seekRemaining--;
                // A fresh checkpoint starts a fresh budget; it only runs while its motion is visible.
                this.budgetMs = this.interval();
                this.budgetSince = this.snapshot.motion === 'paused' ? null : this.now();
                if (after.status === 'FINISHED') {
                    const settle = this.snapshot.motion !== 'paused';
                    this.pause();
                    this.emit({ phase: 'finished', reason: 'FINISH', attention: top, moreAttention: Math.max(0, items.length - 1), motion: settle ? 'settle' : 'paused' });
                }
                else if (top && !this.snapshot.playing && !this.snapshot.skipping) {
                    // Single step (or a pause that arrived mid-request): explain, without touching the settle budget.
                    this.emit({ reason: top.reason, attention: top, moreAttention: items.length - 1 });
                }
                else if (top && (this.snapshot.autoPause || this.snapshot.skipping)) {
                    this.pause();
                    this.emit({ reason: top.reason, attention: top, moreAttention: items.length - 1 });
                }
                else if (this.snapshot.skipping && this.seekRemaining <= 0) {
                    this.pause();
                    this.emit({ reason: 'LIMIT', attention: null, moreAttention: 0 });
                }
            }
            catch (error) {
                this.pause();
                this.emit({ error: error instanceof Error ? error.message : 'PERSISTENCE_FAILED' });
            }
        });
    }
    /**
     * Player command (pace, fuel, ERS, pit). Stops playback first, waits for any in-flight advance to commit, then runs
     * alone. Playback stays paused afterwards so the player explicitly resumes.
     */
    command = async (work: (state: RaceSimulationState) => Promise<RaceSimulationState>, info: CommandInfo | null = null) => {
        const interrupted = this.snapshot.playing || this.snapshot.skipping;
        this.pause();
        return this.exclusive(async () => {
            if (this.finished) return false;
            try {
                this.state = await work(this.state);
                this.emit({ confirmation: info, ...(interrupted ? { reason: 'COMMAND' as const, attention: null, moreAttention: 0 } : {}) });
                return true;
            }
            catch (error) {
                this.emit({ error: error instanceof Error ? error.message : 'PERSISTENCE_FAILED' });
                return false;
            }
        });
    };
}

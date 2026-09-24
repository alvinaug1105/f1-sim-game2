import { checkpointDuration, type MotionMode } from './motion';
import type { RaceSimulationState } from "../../../simulation/race/types";
import { strategicEvent, type StrategicReason } from "./model";
export const PLAYBACK_SPEEDS = [1, 2, 4, 8] as const;
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];
export type PlaybackSnapshot = {
    playing: boolean;
    motion: MotionMode;
    latencyMs: number;
    busy: boolean;
    speed: PlaybackSpeed;
    autoPause: boolean;
    skipping: boolean;
    reason: StrategicReason | null;
    error: string | null;
};
/** One timer, one in-flight mutation. Speed changes only the delay AFTER a committed checkpoint. */
export interface PlaybackClock {
    set(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
    clear(timer: ReturnType<typeof setTimeout>): void;
}
const defaultClock: PlaybackClock = { set: (callback, delay) => setTimeout(callback, delay), clear: timer => clearTimeout(timer) };
export class PlaybackController {
    private state: RaceSimulationState;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private listeners = new Set<() => void>();
    private skipRemaining = 0;
    private snapshot: PlaybackSnapshot = { playing: false, motion: 'paused', latencyMs: 0, busy: false, speed: 1, autoPause: true, skipping: false, reason: null, error: null };
    constructor(state: RaceSimulationState, private playerTeamId: string, private advance: (state: RaceSimulationState) => Promise<RaceSimulationState>, private clock: PlaybackClock = defaultClock) { this.state = state; }
    getSnapshot = () => this.snapshot;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    getState = () => this.state;
    private emit(patch: Partial<PlaybackSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners)
        listener(); }
    private clear() { if (this.timer !== null)
        this.clock.clear(this.timer); this.timer = null; }
    pause = () => { this.clear(); this.skipRemaining = 0; this.emit({ playing: false, skipping: false, motion: 'paused' }); };
    play = () => { if (this.state.status === 'FINISHED')
        return; this.emit({ playing: true, motion: 'playing', reason: null, error: null }); this.schedule(); };
    setSpeed = (speed: PlaybackSpeed) => { if (!PLAYBACK_SPEEDS.includes(speed))
        return; this.emit({ speed }); this.clear(); this.schedule(); };
    setAutoPause = (autoPause: boolean) => this.emit({ autoPause });
    skip = () => { if (this.state.status === 'FINISHED')
        return; this.skipRemaining = 20; this.emit({ playing: true, motion: 'playing', skipping: true, reason: null, error: null }); this.clear(); this.schedule(); };
    step = async () => { this.pause(); this.emit({ motion: 'settle' }); await this.tick(); };
    private schedule() { if (!this.snapshot.playing || this.snapshot.busy || this.timer !== null || this.state.status === 'FINISHED')
        return; this.timer = this.clock.set(() => { this.timer = null; void this.tick(); }, checkpointDuration(this.snapshot.speed, this.state.incidents?.mode, this.snapshot.skipping)); }
    private async tick() {
        if (this.snapshot.busy || this.state.status === 'FINISHED')
            return;
        const before = this.state, requestedAt = Date.now();
        this.emit({ busy: true, error: null });
        try {
            const after = await this.advance(before);
            this.state = after;
            // Match the observed checkpoint cadence, including persistence time, to avoid a stop at every lap.
            this.emit({ latencyMs: Math.min(1500, Math.max(0, Date.now() - requestedAt)) });
            const reason = strategicEvent(before, after, this.playerTeamId);
            if (this.snapshot.skipping)
                this.skipRemaining--;
            if (after.status === 'FINISHED' || (reason && (this.snapshot.autoPause || this.snapshot.skipping)) || (this.snapshot.skipping && this.skipRemaining <= 0)) {
                const finishing = after.status === 'FINISHED' && this.snapshot.motion !== 'paused';
                this.pause();
                this.emit({ reason: reason ?? 'LIMIT', motion: finishing ? 'settle' : 'paused' });
            }
        }
        catch (error) {
            this.pause();
            this.emit({ error: error instanceof Error ? error.message : 'PERSISTENCE_FAILED' });
        }
        finally {
            this.emit({ busy: false });
            this.schedule();
        }
    }
    command = async (work: (state: RaceSimulationState) => Promise<RaceSimulationState>) => {
        if (this.snapshot.busy)
            return false;
        this.pause();
        this.emit({ busy: true, error: null, reason: null });
        try {
            this.state = await work(this.state);
            return true;
        }
        catch (error) {
            this.emit({ error: error instanceof Error ? error.message : 'PERSISTENCE_FAILED' });
            return false;
        }
        finally {
            this.emit({ busy: false });
        }
    };
}

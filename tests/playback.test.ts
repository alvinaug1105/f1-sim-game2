import { describe, it, expect, vi, afterEach } from 'vitest';
import { PlaybackController, SEEK_LIMIT } from '../src/features/race/viewer/playback';
import { assessCheckpoint, initialAttention, BATTLE_EXIT_MS } from '../src/features/race/viewer/attention';
import { advanceRace, advanceRaceLap } from '../src/simulation/race/engine';
import { quietRace, neutralise } from './helpers/incidents';
import { modes } from './helpers/commands';
import type { RaceSimulationState } from '../src/simulation/race/types';
afterEach(() => vi.useRealTimers());
const team = (s: RaceSimulationState) => s.input.entrants[0].teamId;
/** Advance mock that tracks concurrent calls and the lap it was asked to advance from. */
function recorder(transform: (s: RaceSimulationState, call: number) => RaceSimulationState = s => advanceRaceLap(s), latency = 0) {
    let active = 0, peak = 0, calls = 0;
    const laps: number[] = [];
    const advance = vi.fn(async (s: RaceSimulationState) => {
        active++; peak = Math.max(peak, active); laps.push(s.lap);
        if (latency) await new Promise(resolve => setTimeout(resolve, latency));
        active--; return transform(s, ++calls);
    });
    return { advance, laps, peak: () => peak };
}
/** Current weather only (no hidden timeline): sets the state the player can already see. */
const raining = (s: RaceSimulationState, rainfallIntensity: number): RaceSimulationState => ({ ...s, weather: { ...s.weather!, rainfallIntensity } });
const wear = (s: RaceSimulationState, wearPermille: number): RaceSimulationState => ({ ...s, entrants: s.entrants.map((e, i) => i === 0 ? { ...e, stint: { ...e.stint!, tyre: { ...e.stint!.tyre, wearPermille } } } : e) });
describe('playback scheduler', () => {
    it('Resume advances immediately when the current checkpoint has nothing left to animate', async () => {
        vi.useFakeTimers(); const s = quietRace(), r = recorder(), c = new PlaybackController(s, team(s), r.advance);
        c.play(); await vi.advanceTimersByTimeAsync(0);
        expect(r.advance).toHaveBeenCalledTimes(1); c.pause();
        // After a single step the checkpoint settles while paused; a later Resume must not wait a fresh interval.
        const stepped = new PlaybackController(s, team(s), r.advance); await stepped.step(); await vi.advanceTimersByTimeAsync(10000);
        stepped.play(); await vi.advanceTimersByTimeAsync(0);
        expect(r.advance).toHaveBeenCalledTimes(3);
    });
    it('Pause→Resume continues the interrupted interval instead of restarting it (no dead time)', async () => {
        vi.useFakeTimers(); const s = quietRace(), r = recorder(), c = new PlaybackController(s, team(s), r.advance);
        c.play(); await vi.advanceTimersByTimeAsync(0);            // lap 1 committed at t=0, next due at 2400
        await vi.advanceTimersByTimeAsync(1000); c.pause();         // 1400 ms of the interval remain
        await vi.advanceTimersByTimeAsync(60000);                   // a long pause schedules nothing
        expect(r.advance).toHaveBeenCalledTimes(1);
        c.play(); await vi.advanceTimersByTimeAsync(1399); expect(r.advance).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1); expect(r.advance).toHaveBeenCalledTimes(2);
    });
    it('repeated Resume never double-schedules and never overlaps requests', async () => {
        vi.useFakeTimers(); const s = quietRace(), r = recorder(undefined, 300), c = new PlaybackController(s, team(s), r.advance);
        c.play(); c.play(); c.pause(); c.play(); c.play();
        await vi.advanceTimersByTimeAsync(150); c.pause(); c.play(); c.play();   // Resume while the request is in flight
        await vi.advanceTimersByTimeAsync(2400 + 300 - 150 - 1);
        expect(r.advance).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1); expect(r.advance).toHaveBeenCalledTimes(2);
        expect(r.peak()).toBe(1); expect(r.laps).toEqual([0, 1]);
        c.pause();
    });
    it('speed changes replace the pending timer at once, preserving the fraction of the interval left', async () => {
        vi.useFakeTimers(); const s = quietRace(), r = recorder(), c = new PlaybackController(s, team(s), r.advance);
        c.play(); await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(600); c.setSpeed(4);       // 1800 of 2400 left at 1× → 450 of 600 at 4×
        await vi.advanceTimersByTimeAsync(449); expect(r.advance).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1); expect(r.advance).toHaveBeenCalledTimes(2);
        c.setSpeed(1); c.setSpeed(8); c.setSpeed(2);                  // rapid changes: still one timer, sequential laps
        await vi.advanceTimersByTimeAsync(5000);
        expect(r.peak()).toBe(1); expect(r.laps).toEqual(r.laps.map((_, i) => i));
        c.pause();
    });
    it('Pause stops future requests; an in-flight request commits safely and playback stays paused', async () => {
        vi.useFakeTimers(); const s = quietRace();
        let finish!: (value: RaceSimulationState) => void;
        const advance = vi.fn(() => new Promise<RaceSimulationState>(resolve => { finish = resolve; }));
        const c = new PlaybackController(s, team(s), advance);
        c.play(); await vi.advanceTimersByTimeAsync(0); c.pause();
        const next = advanceRaceLap(s); finish(next); await vi.advanceTimersByTimeAsync(60000);
        expect(advance).toHaveBeenCalledTimes(1); expect(c.getState()).toBe(next);
        expect(c.getSnapshot()).toMatchObject({ playing: false, busy: false, phase: 'paused', motion: 'paused' });
    });
    it('a player command waits for the in-flight advance, never overlaps it, and leaves playback paused', async () => {
        vi.useFakeTimers(); const s = quietRace();
        let active = 0, peak = 0, finish!: (value: RaceSimulationState) => void;
        const advance = vi.fn(() => { active++; peak = Math.max(peak, active); return new Promise<RaceSimulationState>(resolve => { finish = v => { active--; resolve(v); }; }); });
        const c = new PlaybackController(s, team(s), advance);
        c.play(); await vi.advanceTimersByTimeAsync(0);
        const work = vi.fn(async (state: RaceSimulationState) => { active++; peak = Math.max(peak, active); const out = modes(state, { paceMode: 'PUSH' }); active--; return out; });
        const done = c.command(work);
        await vi.advanceTimersByTimeAsync(0);
        expect(work).not.toHaveBeenCalled(); expect(c.getSnapshot().busy).toBe(true);
        finish(advanceRaceLap(s)); expect(await done).toBe(true);
        expect(work).toHaveBeenCalledWith(expect.objectContaining({ lap: 1 }));   // the command sees the committed checkpoint
        await vi.advanceTimersByTimeAsync(60000);
        expect(peak).toBe(1); expect(advance).toHaveBeenCalledTimes(1);
        expect(c.getSnapshot()).toMatchObject({ playing: false, busy: false, reason: 'COMMAND' });
        expect(c.getState().entrants[0].commands!.paceMode).toBe('PUSH');
    });
});
describe('Next Strategic Event', () => {
    it('advances committed checkpoints one at a time and stops on a public strategic change', async () => {
        vi.useFakeTimers(); const s = quietRace();
        const r = recorder((state, call) => call === 4 ? raining(advanceRaceLap(state), 500) : advanceRaceLap(state));
        const c = new PlaybackController(s, team(s), r.advance); c.setAutoPause(false);
        c.skip(); await vi.runAllTimersAsync();
        expect(r.laps).toEqual([0, 1, 2, 3]); expect(r.peak()).toBe(1);
        expect(c.getSnapshot()).toMatchObject({ playing: false, reason: 'WEATHER', attention: { kind: 'RAIN_START', lap: 4 } });
    });
    it('is bounded and produces the same authoritative state as normal 1× playback', async () => {
        vi.useFakeTimers(); const s = quietRace();
        const seek = new PlaybackController(s, team(s), async state => advanceRaceLap(state));
        seek.skip(); await vi.runAllTimersAsync();
        expect(seek.getSnapshot().reason === 'LIMIT' ? seek.getState().lap : SEEK_LIMIT).toBeLessThanOrEqual(SEEK_LIMIT);
        const lap = seek.getState().lap;
        expect(seek.getState()).toEqual(advanceRace(s, lap));
    });
    it('Race finish stops scheduling permanently', async () => {
        vi.useFakeTimers(); const s = advanceRace(quietRace(), 57), r = recorder();
        const c = new PlaybackController(s, team(s), r.advance);
        c.play(); await vi.runAllTimersAsync();
        expect(c.getState().status).toBe('FINISHED'); expect(c.getSnapshot()).toMatchObject({ phase: 'finished', reason: 'FINISH', playing: false });
        c.play(); c.skip(); c.setSpeed(8); await c.step(); await vi.advanceTimersByTimeAsync(60000);
        expect(r.advance).toHaveBeenCalledTimes(1); expect(c.getSnapshot().phase).toBe('finished');
        expect(await c.command(async state => state)).toBe(false);
    });
});
describe('auto-pause and strategic attention', () => {
    it('auto-pause on stops at a strategic change and explains it; off keeps playing and still reports it', async () => {
        vi.useFakeTimers(); const s = quietRace();
        const on = new PlaybackController(s, team(s), async state => neutralise(advanceRaceLap(state), 'SAFETY_CAR'));
        on.play(); await vi.runAllTimersAsync();
        expect(on.getSnapshot()).toMatchObject({ playing: false, reason: 'CONTROL', attention: { kind: 'SAFETY_CAR' } });
        const r = recorder((state, call) => call >= 2 ? raining(advanceRaceLap(state), 800) : advanceRaceLap(state));
        const off = new PlaybackController(s, team(s), r.advance); off.setAutoPause(false);
        off.play(); await vi.advanceTimersByTimeAsync(3 * 2400);
        expect(off.getSnapshot()).toMatchObject({ playing: true, reason: null, lastAttention: { kind: 'RAIN_START' } });
        expect(r.advance.mock.calls.length).toBeGreaterThanOrEqual(3); off.pause();
    });
    it('an unchanged warning never stops playback twice', async () => {
        vi.useFakeTimers(); const s = advanceRace(quietRace(), 3), p = s.input.tyres!.profiles[s.entrants[0].stint!.tyre.compound];
        // Player tyre crosses into high wear once, then stays there on every later checkpoint.
        const c = new PlaybackController(s, team(s), async state => wear(advanceRaceLap(state), p.degradationStartWear + 10));
        c.play(); await vi.runAllTimersAsync();
        expect(c.getSnapshot()).toMatchObject({ reason: 'TYRE', attention: { kind: 'TYRE_HIGH', entrantId: s.entrants[0].entrantId } });
        const lap = c.getState().lap;
        c.play(); await vi.advanceTimersByTimeAsync(5 * 2400);
        expect(c.getState().lap).toBeGreaterThanOrEqual(lap + 4); expect(c.getSnapshot().playing).toBe(true); c.pause();
    });
    it('battles use entry transitions with hysteresis, and are silent on lap 1 and around neutralisation', () => {
        const base = advanceRace(quietRace(), 5), me = base.entrants[1].entrantId;   // second player car; the AI car behind it closes in
        const at = (interval: number, lap = 6, mode: 'GREEN' | 'VSC' = 'GREEN'): RaceSimulationState => ({ ...base, lap, incidents: { ...base.incidents!, mode }, entrants: base.entrants.map((e, i) => ({ ...e, position: i + 1, intervalToAheadMs: i === 0 ? null : i === 2 ? interval : 5000 })) });
        const run = (states: RaceSimulationState[], memory = initialAttention(at(3000), team(base))) => states.map(state => { const r = assessCheckpoint(memory, state, team(base)); memory = r.memory; return r.items.filter(i => i.reason === 'BATTLE').map(i => i.kind).join(); });
        expect(run([at(1200), at(900), at(1100), at(900), at(BATTLE_EXIT_MS + 100), at(900)])).toEqual(['', 'BATTLE_BEHIND', '', '', '', 'BATTLE_BEHIND']);
        expect(base.input.entrants[1].teamId).toBe(team(base)); expect(base.input.entrants[2].teamId).not.toBe(team(base)); expect(me).toBe('pit-entrant-1');
        expect(run([at(900, 1)])).toEqual(['']);
        expect(run([at(900, 6, 'VSC'), at(900, 7, 'GREEN'), at(900, 8)])).toEqual(['', '', '']);
    });
    it('fuel deficit and Race Control announce once per transition', () => {
        const s = advanceRace(quietRace(), 5), t = team(s), first = s.entrants[0];
        const short = { ...s, entrants: s.entrants.map((e, i) => i === 0 ? { ...e, fuelMassKg: 1 } : e) };
        let r = assessCheckpoint(initialAttention(s, t), short, t);
        expect(r.items.map(i => i.kind)).toContain('FUEL'); expect(r.items.find(i => i.kind === 'FUEL')!.entrantId).toBe(first.entrantId);
        r = assessCheckpoint(r.memory, { ...short, lap: 6 }, t); expect(r.items.map(i => i.kind)).not.toContain('FUEL');
        const vsc = neutralise(s, 'VSC');
        const a = assessCheckpoint(initialAttention(s, t), vsc, t), b = assessCheckpoint(a.memory, { ...vsc, lap: 6 }, t), c = assessCheckpoint(b.memory, { ...vsc, lap: 7, incidents: { ...vsc.incidents!, mode: 'GREEN' } }, t);
        expect([a, b, c].map(x => x.items.map(i => i.kind).join())).toEqual(['VSC', '', 'RESTART']);
    });
    it('never reads hidden future weather: editing the unseen timeline changes nothing', () => {
        const s = advanceRace(quietRace(), 5), t = team(s), next = advanceRaceLap(s);
        const hidden = { ...next, input: { ...next.input, weather: { ...next.input.weather!, timeline: [{ startLap: 7, rainfall: 1000, airTemperatureMilliC: 15000 }] } } };
        expect(assessCheckpoint(initialAttention(s, t), hidden, t).items).toEqual(assessCheckpoint(initialAttention(s, t), next, t).items);
    });
});

/**
 * Deterministic Qualifying auto manager, shared by AI teams and by the player's cars under Simulate Qualifying /
 * Simulate Remainder. It sees only what a team would: the clock, the current classification and cutoff, its own
 * time, current conditions and current traffic. It never reads the hidden setup truth, the weather timeline, future
 * track evolution or the RNG. Timing uses the public planning lap, not a car's own hidden lap model.
 */
import { waterBand } from "../practice/model";
import type { TyreCompound } from "../race/tyres/model";
import { phaseClassification } from "./classification";
import { maxPushLaps, phaseFormat, timeToLastFlyingStart, type QualifyingState, type RunPlan } from "./model";
export type AutoDecision = { kind: "wait" } | { kind: "send"; plan: RunPlan };
const WAIT: AutoDecision = { kind: "wait" };
function busy(state: QualifyingState) {
    const onTrack = state.entrants.filter(e => e.location !== "GARAGE").length;
    return onTrack >= Math.max(6, Math.ceil(phaseFormat(state).eligible * .45));
}
export function autoGarageDecision(state: QualifyingState, index: number): AutoDecision {
    const e = state.entrants[index], f = phaseFormat(state), remaining = f.durationMs - state.phaseElapsedMs;
    if (e.readyAtMs > state.phaseElapsedMs) return WAIT;
    const possible = maxPushLaps(state);
    if (possible < 1) return WAIT;
    const band = waterBand(state.weather);
    const compound: TyreCompound = band === 2 ? "WET" : band === 1 ? "INTERMEDIATE" : "SOFT";
    const send = (pushLaps: number): AutoDecision => ({ kind: "send", plan: { compound, pushLaps: Math.max(1, Math.min(pushLaps, possible)) } });
    // Final-run window: the last timed lap starts shortly before the flag, staggered per car.
    const finalWindow = remaining <= timeToLastFlyingStart(state.input, 1) + 75_000 + e.windowOffsetMs;
    const maxAttempts = state.phase === "Q3" ? 2 : 3;
    if (e.attempts >= maxAttempts) return WAIT;
    // 1. First run: a banker lap at this car's staggered release time (earlier if the window is already closing).
    if (e.attempts === 0) return state.phaseElapsedMs >= e.releaseAtMs || finalWindow ? send(2) : WAIT;
    const best = e.best[state.phase];
    // 2. No time yet (aborted or traffic-ruined run): go again straight away.
    if (!best) return send(2);
    // 3. Q1/Q2: a comfortably safe banker stays in the garage.
    if (state.phase !== "Q3" && f.advancing < f.eligible) {
        const position = phaseClassification(state, state.phase).indexOf(index) + 1, margin = Math.max(1, Math.round(f.eligible * .15));
        if (position <= f.advancing - margin) return WAIT;
    }
    if (state.phase !== "Q3" && f.advancing >= f.eligible) return WAIT; // nobody can be eliminated (small fields)
    // 4. Final attempt in the window; a busy track delays a car that still has time in hand.
    if (!finalWindow) return WAIT;
    if (busy(state) && remaining > timeToLastFlyingStart(state.input, 1) + 40_000 + (index % 3) * 10_000) return WAIT;
    return send(1);
}

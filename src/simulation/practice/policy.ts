/**
 * Deterministic Practice auto manager, shared by AI teams and by the player's cars under Simulate Session /
 * Simulate Remainder. It sees exactly what a team would: current conditions, its own driver feedback, the clock.
 * It never reads the hidden ideal setup, the weather timeline or future RNG draws.
 */
import type { StatefulRandomSource } from "../core/random";
import type { TyreCompound } from "../race/tyres/model";
import { SETUP_DIMENSIONS, maxRunLaps, waterBand, type PracticeState, type RunPlan, type Setup } from "./model";
export type AutoDecision = { kind: "wait" } | { kind: "setup"; setup: Setup } | { kind: "send"; plan: RunPlan };
/** Setup step towards the driver's feedback: bigger for "too high/low", smaller for "slightly". */
const STEP = { 1: 4, 2: 9 } as const;
export function adjustFromFeedback(setup: Setup, feedback: NonNullable<PracticeState["entrants"][number]["preparation"]["feedback"]>): Setup {
    return Object.fromEntries(SETUP_DIMENSIONS.map(d => {
        const level = feedback[d], move = level === 0 ? 0 : Math.sign(level) * STEP[Math.abs(level) as 1 | 2];
        return [d, Math.max(0, Math.min(100, setup[d] - move))];
    })) as Setup;
}
function dryCompound(runNumber: number, rng: StatefulRandomSource): TyreCompound {
    if (runNumber === 0) return "MEDIUM";
    const roll = rng.next();
    return roll < .4 ? "MEDIUM" : roll < .7 ? "SOFT" : "HARD";
}
export function autoGarageDecision(state: PracticeState, index: number, rng: StatefulRandomSource): AutoDecision {
    const e = state.entrants[index], p = e.preparation;
    // 1. Act once on fresh, reasonably reliable feedback about the current setup.
    if (p.feedback && p.feedbackRevision === p.setupRevision && p.feedbackReliability >= 200) {
        const next = adjustFromFeedback(p.setup, p.feedback);
        if (SETUP_DIMENSIONS.some(d => next[d] !== p.setup[d])) return { kind: "setup", setup: next };
    }
    // 2. Otherwise go out when the car is ready and a run still fits.
    if (e.readyAtMs > state.elapsedMs) return { kind: "wait" };
    const fits = maxRunLaps(state);
    if (fits < 1) return { kind: "wait" };
    const band = waterBand(state.weather);
    const compound: TyreCompound = band === 2 ? "WET" : band === 1 ? "INTERMEDIATE" : dryCompound(e.runs.length, rng);
    const remaining = state.input.durationMs - state.elapsedMs;
    const pace = band === 0 && remaining < 15 * 60_000 ? "PERFORMANCE" : "BALANCED";
    const targetLaps = Math.max(1, Math.min(fits, 3 + Math.floor(rng.next() * 6)));
    return { kind: "send", plan: { compound, targetLaps, pace } };
}

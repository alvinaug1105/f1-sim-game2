/**
 * Deterministic Practice engine. One authoritative step advances the session clock by `stepMs`; every lap time,
 * weather tick, feedback reading and auto-manager decision is drawn from the persisted RNG in a fixed order, so the
 * same start state + commands reproduce exactly whether observed at 1×, 8× or simulated to the end.
 */
import { createSeededRandom, type StatefulRandomSource } from "../core/random";
import { tyreContributions, type TyreCompound } from "../race/tyres/model";
import { advanceWeather, advanceWeatherTyre, validateWeatherConfiguration, waterPenaltyMs } from "../race/weather/model";
import { startingTyre } from "../race/tyres/profiles";
import {
    ACCLIMATISATION_RATE, GARAGE_TURNAROUND_MS, IN_LAP_PERMILLE, MAX_RUN_LAPS, OUT_LAP_PERMILLE, PACE_EFFECT, PACE_EMPHASES, maxRunLaps,
    PRACTICE_COMPOUNDS, SETUP_DIMENSIONS, SETUP_WORK_MS, TYRE_KNOWLEDGE_RATE, compoundFit, confidenceAfterChange, confidenceAfterRun,
    effectiveIdeal, feedbackLevel, feedbackReliability, initialPreparation, isSetup, learn, setupPenaltyMs,
    type FeedbackLevel, type PracticeEntrantState, type PracticeInput, type PracticeLocation, type PracticeRun, type PracticeState,
    type Preparation, type RunPlan, type Setup, type SetupDimension,
} from "./model";
import { autoGarageDecision } from "./policy";
export type PracticeRuleCode = "STALE" | "FINISHED" | "NOT_IN_GARAGE" | "NOT_READY" | "NOT_ON_TRACK" | "PLAN_INVALID" | "PLAN_TOO_LONG" | "SETUP_INVALID" | "NOT_FOUND";
export class PracticeRuleError extends Error {
    constructor(readonly code: PracticeRuleCode) { super(`Practice rule: ${code}`); }
}
function integer(n: number, lo: number, hi: number) { if (!Number.isSafeInteger(n) || n < lo || n > hi) throw new RangeError("Invalid practice value"); }
export function validatePracticeInput(input: PracticeInput) {
    if (input.version !== 1) throw new RangeError("Unsupported practice version");
    integer(input.seed, 0, 0xffffffff); integer(input.durationMs, 60_000, 4 * 3_600_000); integer(input.stepMs, 1_000, 600_000);
    integer(input.weatherTickMs, input.stepMs, 3_600_000); integer(input.baseLapTimeMs, 30_000, 300_000);
    validateWeatherConfiguration(input.weather, weatherTicks(input));
    if (!input.entrants.length || new Set(input.entrants.map(e => e.entrantId)).size !== input.entrants.length) throw new RangeError("Invalid practice entrants");
    for (const e of input.entrants) if (!isSetup(e.ideal)) throw new RangeError("Invalid practice ideal");
}
/** Number of weather ticks the frozen configuration covers (the session plus a short overtime allowance). */
export function weatherTicks(input: Pick<PracticeInput, "durationMs" | "weatherTickMs">) { return Math.ceil(input.durationMs / input.weatherTickMs) + 3; }
export function chequered(state: PracticeState) { return state.elapsedMs >= state.input.durationMs; }
export function isAuto(state: PracticeState, index: number) { return state.input.entrants[index].controller === "AI" || state.autoPlayer; }
/** Creates a session at time 0. `preparations` carry weekend learning in from the previous Practice session. */
export function createPractice(input: PracticeInput, preparations: Readonly<Record<string, Preparation>> = {}): PracticeState {
    validatePracticeInput(input);
    const rng = createSeededRandom(input.seed);
    const entrants = input.entrants.map((e, index): PracticeEntrantState => ({
        entrantId: e.entrantId, location: "GARAGE", distance: 0, lapElapsedMs: 0, lapTimeMs: 0, tyre: null, run: null, runs: [],
        // Auto-managed cars leave the garage at staggered, deterministic times so the session never looks synchronised.
        readyAtMs: e.controller === "AI" ? 60_000 + Math.floor(rng.next() * 8) * 30_000 + index * 15_000 : 0,
        lapsCompleted: 0, timedLaps: 0, lastLapMs: null, bestLapMs: null, bestLapCompound: null, commandRevision: 0,
        preparation: preparations[e.entrantId] ?? initialPreparation(),
    }));
    return { practiceVersion: 1, input, rngState: rng.getState(), elapsedMs: 0, status: "RUNNING", weather: structuredClone(input.weather.initial), weatherTick: 1, evolution: 0, autoPlayer: false, entrants };
}
function lapMs(state: PracticeState, index: number, e: PracticeEntrantState, kind: PracticeLocation, rng: StatefulRandomSource) {
    const source = state.input.entrants[index], tyre = e.tyre!, profile = state.input.tyres.profiles[tyre.compound], plan = e.run!.plan;
    const t = tyreContributions(tyre, profile);
    const flying = state.input.baseLapTimeMs
        + Math.round((100 - source.car.performance) / 100 * 3000) + Math.round((100 - source.driver.pace) / 100 * 1500)
        + t.tyreCompoundMs + t.tyreWearMs + t.tyreTemperatureMs
        + waterPenaltyMs(tyre.compound, state.weather.trackWater, state.input.weather)
        + setupPenaltyMs(e.preparation.setup, effectiveIdeal(source.ideal, state.weather))
        + Math.round((1000 - e.preparation.acclimatisation) * .8)
        + PACE_EFFECT[plan.pace].lapMs
        - Math.round(state.evolution * .6)
        + Math.round((rng.next() * 2 - 1) * (250 + (100 - source.driver.consistency) * 10));
    return kind === "OUT_LAP" ? Math.round(flying * OUT_LAP_PERMILLE / 1000) : kind === "IN_LAP" ? Math.round(flying * IN_LAP_PERMILLE / 1000) : flying;
}
function gaussian(rng: StatefulRandomSource) { return Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next()); }
/** Qualitative driver feedback after a run. Noise shrinks with representative laps and familiarity; never exact. */
function runFeedback(state: PracticeState, index: number, e: PracticeEntrantState, timedLaps: number, rng: StatefulRandomSource): Preparation {
    const p = e.preparation, ideal = effectiveIdeal(state.input.entrants[index].ideal, state.weather);
    const sigma = 22 / Math.sqrt(timedLaps) * (1300 - p.acclimatisation * .6) / 1000;
    const feedback = Object.fromEntries(SETUP_DIMENSIONS.map(d => [d, feedbackLevel(p.setup[d] - ideal[d] + gaussian(rng) * sigma)])) as Record<SetupDimension, FeedbackLevel>;
    return { ...p, feedback, feedbackReliability: feedbackReliability(timedLaps, p.acclimatisation), feedbackRevision: p.setupRevision, confidence: confidenceAfterRun(p.confidence, timedLaps, p.acclimatisation) };
}
function endRun(state: PracticeState, index: number, e: PracticeEntrantState, at: number, rng: StatefulRandomSource): PracticeEntrantState {
    const run: PracticeRun = { ...e.run!, endedAtMs: at };
    const preparation = run.timedLaps > 0 ? runFeedback(state, index, e, run.timedLaps, rng) : e.preparation;
    const extra = isAuto(state, index) ? Math.floor(rng.next() * 6) * 30_000 : 0;
    return { ...e, location: "GARAGE", lapElapsedMs: 0, lapTimeMs: 0, run: null, runs: [...e.runs, run], readyAtMs: at + GARAGE_TURNAROUND_MS + extra, preparation };
}
/** Simulates one entrant's running for the window [from, to). Lap completions happen at exact times inside the window. */
function drive(state: PracticeState, index: number, start: PracticeEntrantState, from: number, to: number, rng: StatefulRandomSource, fieldLaps: { count: number }): PracticeEntrantState {
    let e = start, now = from;
    while (e.location !== "GARAGE") {
        const need = e.lapTimeMs - e.lapElapsedMs;
        if (now + need > to) { e = { ...e, lapElapsedMs: e.lapElapsedMs + (to - now), distance: Math.floor(e.distance) + (e.lapElapsedMs + (to - now)) / e.lapTimeMs }; break; }
        now += need;
        const completed = e.location, lap = e.lapTimeMs, done = state.input.durationMs <= now;
        e = { ...e, lapElapsedMs: 0, distance: Math.floor(e.distance) + 1, lapsCompleted: e.lapsCompleted + 1 };
        const plan = e.run!.plan, tyres = { ...state.input.tyres, tyreWearMultiplierPermille: Math.round(state.input.tyres.tyreWearMultiplierPermille * PACE_EFFECT[plan.pace].wearPermille / 1000) };
        if (completed !== "IN_LAP") e = { ...e, tyre: advanceWeatherTyre(e.tyre!, tyres, state.weather, state.input.weather) };
        if (completed === "FLYING") {
            fieldLaps.count++;
            const p = e.preparation, fit = compoundFit(plan.compound, state.weather);
            const best = e.bestLapMs === null || lap < e.bestLapMs;
            e = {
                ...e, lastLapMs: lap, timedLaps: e.timedLaps + 1, bestLapMs: best ? lap : e.bestLapMs, bestLapCompound: best ? plan.compound : e.bestLapCompound,
                run: { ...e.run!, timedLaps: e.run!.timedLaps + 1, bestLapMs: e.run!.bestLapMs === null || lap < e.run!.bestLapMs ? lap : e.run!.bestLapMs },
                preparation: { ...p, acclimatisation: learn(p.acclimatisation, ACCLIMATISATION_RATE), representativeLaps: p.representativeLaps + 1, tyreKnowledge: { ...p.tyreKnowledge, [plan.compound]: learn(p.tyreKnowledge[plan.compound], TYRE_KNOWLEDGE_RATE[fit]) } },
            };
        }
        // Chequered flag: whatever lap just finished was the last one; the car stops in the garage.
        if (done || completed === "IN_LAP") { e = endRun(state, index, e, now, rng); break; }
        const wornOut = isAuto(state, index) && (e.tyre!.wearPermille >= state.input.tyres.profiles[plan.compound].cliffWear || compoundFit(plan.compound, state.weather) === 0);
        const next: PracticeLocation = e.run!.callIn || e.run!.timedLaps >= plan.targetLaps || wornOut ? "IN_LAP" : "FLYING";
        e = { ...e, location: next };
        e = { ...e, lapTimeMs: lapMs(state, index, e, next, rng) };
    }
    return e;
}
/** Advances the authoritative session by one step. A finished session is returned unchanged. */
export function stepPractice(state: PracticeState): PracticeState {
    if (state.status === "FINISHED") return state;
    const rng = createSeededRandom(state.rngState), from = state.elapsedMs, to = from + state.input.stepMs;
    let working: PracticeState = state;
    // 1. Garage decisions for auto-managed cars (AI always; the player's cars only under auto-simulation).
    for (let i = 0; i < working.entrants.length; i++) {
        if (!isAuto(working, i) || working.entrants[i].location !== "GARAGE" || chequered(working)) continue;
        const decision = autoGarageDecision(working, i, rng);
        if (decision.kind === "setup") working = applySetup(working, i, decision.setup);
        else if (decision.kind === "send") working = launch(working, i, decision.plan, rng);
    }
    // 2. Running: every car on track drives the whole window in entrant order.
    const fieldLaps = { count: 0 };
    const entrants = working.entrants.map((e, i) => e.location === "GARAGE" ? e : drive(working, i, e, from, to, rng, fieldLaps));
    // 3. Weather ticks and track evolution.
    let weather = working.weather, weatherTick = working.weatherTick, evolution = Math.min(1000, working.evolution + fieldLaps.count * 3);
    const targetTick = Math.floor(to / state.input.weatherTickMs) + 1;
    while (weatherTick < targetTick) { weather = advanceWeather(weather, state.input.weather, ++weatherTick); if (weather.trackWater >= 100) evolution = Math.round(evolution * .9); }
    const after: PracticeState = { ...working, entrants, weather, weatherTick, evolution, elapsedMs: to, rngState: rng.getState() };
    return after.elapsedMs >= after.input.durationMs && after.entrants.every(e => e.location === "GARAGE") ? { ...after, status: "FINISHED" } : after;
}
export function advancePractice(state: PracticeState, steps: number) { let s = state; for (let i = 0; i < steps && s.status !== "FINISHED"; i++) s = stepPractice(s); return s; }
/** Same step function to the flag; bounded so a malformed state can never loop forever. */
export function runPracticeToEnd(state: PracticeState) {
    const limit = Math.ceil((state.input.durationMs + 20 * 60_000) / state.input.stepMs) + 5;
    const s = advancePractice(state, limit);
    if (s.status !== "FINISHED") throw new RangeError("Practice did not finish");
    return s;
}
function launch(state: PracticeState, index: number, plan: RunPlan, rng: StatefulRandomSource): PracticeState {
    const e = state.entrants[index];
    const run: PracticeRun = { number: e.runs.length + 1, plan, timedLaps: 0, bestLapMs: null, callIn: false, startedAtMs: state.elapsedMs, endedAtMs: null };
    const out: PracticeEntrantState = { ...e, location: "OUT_LAP", tyre: startingTyre(plan.compound), run, lapElapsedMs: 0, distance: Math.round(e.distance) };
    return replace(state, index, { ...out, lapTimeMs: lapMs(state, index, out, "OUT_LAP", rng) });
}
function applySetup(state: PracticeState, index: number, setup: Setup): PracticeState {
    const e = state.entrants[index], p = e.preparation;
    return replace(state, index, { ...e, readyAtMs: Math.max(e.readyAtMs, state.elapsedMs + SETUP_WORK_MS), preparation: { ...p, setup, setupRevision: p.setupRevision + 1, confidence: confidenceAfterChange(p.confidence, p.setup, setup) } });
}
function replace(state: PracticeState, index: number, entrant: PracticeEntrantState): PracticeState {
    return { ...state, entrants: state.entrants.map((e, i) => i === index ? entrant : e) };
}
function target(state: PracticeState, entrantId: string, revision: number) {
    if (state.status === "FINISHED") throw new PracticeRuleError("FINISHED");
    const index = state.entrants.findIndex(e => e.entrantId === entrantId);
    if (index < 0) throw new PracticeRuleError("NOT_FOUND");
    if (state.entrants[index].commandRevision !== revision) throw new PracticeRuleError("STALE");
    return index;
}
const bump = (state: PracticeState, index: number) => replace(state, index, { ...state.entrants[index], commandRevision: state.entrants[index].commandRevision + 1 });
export function isRunPlan(value: unknown): value is RunPlan {
    const p = value as RunPlan;
    return !!p && PRACTICE_COMPOUNDS.includes(p.compound) && PACE_EMPHASES.includes(p.pace) && Number.isSafeInteger(p.targetLaps) && p.targetLaps >= 1 && p.targetLaps <= MAX_RUN_LAPS;
}
/** Player command: send a car out on a run. Garage-only, after any setup work, and only if the plan fits the clock. */
export function sendOut(state: PracticeState, entrantId: string, revision: number, plan: RunPlan): PracticeState {
    const index = target(state, entrantId, revision), e = state.entrants[index];
    if (!isRunPlan(plan) || !state.input.tyres.profiles[plan.compound]) throw new PracticeRuleError("PLAN_INVALID");
    if (e.location !== "GARAGE") throw new PracticeRuleError("NOT_IN_GARAGE");
    if (chequered(state)) throw new PracticeRuleError("FINISHED");
    if (e.readyAtMs > state.elapsedMs) throw new PracticeRuleError("NOT_READY");
    if (plan.targetLaps > maxRunLaps(state)) throw new PracticeRuleError("PLAN_TOO_LONG");
    const rng = createSeededRandom(state.rngState);
    return { ...bump(launch(state, index, plan, rng), index), rngState: rng.getState() };
}
/** Player command: finish the current lap, then complete an in-lap. */
export function callIn(state: PracticeState, entrantId: string, revision: number): PracticeState {
    const index = target(state, entrantId, revision), e = state.entrants[index];
    if (e.location !== "OUT_LAP" && e.location !== "FLYING") throw new PracticeRuleError("NOT_ON_TRACK");
    return bump(replace(state, index, { ...e, run: { ...e.run!, callIn: true } }), index);
}
/** Player command: setup changes are only possible in the garage and take a short work period. */
export function changeSetup(state: PracticeState, entrantId: string, revision: number, setup: Setup): PracticeState {
    const index = target(state, entrantId, revision);
    if (!isSetup(setup)) throw new PracticeRuleError("SETUP_INVALID");
    if (state.entrants[index].location !== "GARAGE") throw new PracticeRuleError("NOT_IN_GARAGE");
    if (SETUP_DIMENSIONS.every(d => setup[d] === state.entrants[index].preparation.setup[d])) return state;
    return bump(applySetup(state, index, setup), index);
}
/** Hands the player's cars to the same auto manager the AI uses (Simulate Session / Remainder). */
export function enableAutoPlayer(state: PracticeState): PracticeState { return state.autoPlayer ? state : { ...state, autoPlayer: true }; }
export type { TyreCompound };

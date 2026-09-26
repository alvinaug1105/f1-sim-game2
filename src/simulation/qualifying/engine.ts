/**
 * Deterministic Qualifying engine. One authoritative step advances the phase clock by `stepMs`; lap completions happen
 * at exact times inside the step, and every lap variation, traffic encounter and auto-manager plan comes from the
 * persisted RNG in a fixed order, so 1×, 8×, Next Relevant Event and Simulate Remainder replay identically.
 *
 * Clock rules: a lap that STARTS before the phase clock expires may finish and counts; an out lap that completes after
 * expiry cannot start a timed lap; no car may leave the garage after expiry. The phase freezes once no timed lap is
 * still running.
 */
import { createSeededRandom, type StatefulRandomSource } from "../core/random";
import { tyreContributions } from "../race/tyres/model";
import { startingTyre } from "../race/tyres/profiles";
import { advanceWeather, advanceWeatherTyre, validateWeatherConfiguration, waterPenaltyMs } from "../race/weather/model";
import { effectiveIdeal, isSetup, setupPenaltyMs } from "../practice/model";
import { finalClassification, phaseClassification } from "./classification";
import {
    GARAGE_TURNAROUND_MS, IN_LAP_PERMILLE, INITIAL_EVOLUTION, OUT_LAP_PERMILLE, PHASE_DURATION_MS, QUALIFYING_PHASES, isRunPlan, maxPushLaps, phaseFormat, phaseIndex,
    qualifyingWeatherTicks, timeToLastFlyingStart,
    type QualifyingEntrantState, type QualifyingInput, type QualifyingLocation, type QualifyingPhase, type QualifyingState, type RunPlan,
} from "./model";
import { autoGarageDecision } from "./policy";
export type QualifyingRuleCode =
    | "STALE" | "FINISHED" | "PHASE_COMPLETE" | "PHASE_RUNNING" | "CLOCK_EXPIRED" | "NOT_IN_GARAGE" | "NOT_READY" | "NOT_ON_TRACK"
    | "ELIMINATED" | "PLAN_INVALID" | "PLAN_TOO_LONG" | "NOT_FOUND";
export class QualifyingRuleError extends Error {
    constructor(readonly code: QualifyingRuleCode) { super(`Qualifying rule: ${code}`); }
}
/** Lap-time weights (ms per 100 rating points). Qualifying-specific; Race v7 equations are separate and unchanged. */
export const CAR_RANGE_MS = 5000, DRIVER_RANGE_MS = 2500;
function integer(n: number, lo: number, hi: number) { if (!Number.isSafeInteger(n) || n < lo || n > hi) throw new RangeError("Invalid qualifying value"); }
export function validateQualifyingInput(input: QualifyingInput) {
    if (input.version !== 1) throw new RangeError("Unsupported qualifying version");
    integer(input.seed, 0, 0xffffffff); integer(input.stepMs, 1_000, 120_000); integer(input.weatherTickMs, input.stepMs, 3_600_000); integer(input.baseLapTimeMs, 30_000, 300_000);
    const n = input.entrants.length;
    if (!n || new Set(input.entrants.map(e => e.entrantId)).size !== n) throw new RangeError("Invalid qualifying entrants");
    const [q1, q2, q3] = input.format.phases;
    if (input.format.phases.length !== 3 || q1.eligible !== n || q2.eligible !== q1.advancing || q3.eligible !== q2.advancing || q3.advancing !== q3.eligible || q1.advancing > n) throw new RangeError("Invalid qualifying format");
    for (const p of input.format.phases) integer(p.durationMs, 60_000, 3_600_000);
    validateWeatherConfiguration(input.weather, qualifyingWeatherTicks(input.format, input.weatherTickMs));
    for (const e of input.entrants) {
        for (const n of [e.driver.pace, e.driver.consistency, e.car.performance]) if (!Number.isFinite(n) || n < 0 || n > 100) throw new RangeError("Invalid qualifying rating");
        if (!isSetup(e.preparation.setup) || !isSetup(e.preparation.ideal)) throw new RangeError("Invalid qualifying preparation");
        integer(e.preparation.confidence, 0, 1000); integer(e.preparation.acclimatisation, 0, 1000); integer(e.fallbackRank, 0, 10_000);
    }
}
export const isAuto = (state: QualifyingState, index: number) => state.input.entrants[index].controller === "AI" || state.autoPlayer;
export const phaseExpired = (state: QualifyingState) => state.phaseElapsedMs >= phaseFormat(state).durationMs;
/** Deterministic per-phase auto-manager plan: staggered first release and final-run window (never a mass release). */
function planPhase(state: QualifyingState, rng: StatefulRandomSource): QualifyingState {
    const phase = state.phase;
    return { ...state, entrants: state.entrants.map((e, i) => {
        if (e.eliminatedIn !== null) return e;
        const standard = phase === "Q1" ? 45_000 + Math.floor(rng.next() * 14) * 30_000 + (i % 4) * 10_000
            : phase === "Q2" ? 30_000 + Math.floor(rng.next() * 8) * 30_000 : 30_000 + Math.floor(rng.next() * 6) * 20_000;
        // Release times are tuned to the Grand Prix phase lengths; a shorter phase (Sprint Qualifying) compresses them
        // proportionally. For standard lengths the ratio is exactly 1, so Grand Prix Qualifying is unchanged.
        const duration = phaseFormat(state).durationMs, reference = PHASE_DURATION_MS[phase];
        const releaseAtMs = duration === reference ? standard : Math.round(standard * duration / reference);
        return { ...e, readyAtMs: 0, attempts: 0, releaseAtMs, windowOffsetMs: Math.floor(rng.next() * 16) * 10_000 };
    }) };
}
export function createQualifying(input: QualifyingInput): QualifyingState {
    validateQualifyingInput(input);
    const rng = createSeededRandom(input.seed);
    const entrants = input.entrants.map((e): QualifyingEntrantState => ({
        entrantId: e.entrantId, location: "GARAGE", distance: 0, lapElapsedMs: 0, lapTimeMs: 0, lapTrafficMs: 0, tyre: null, run: null,
        readyAtMs: 0, releaseAtMs: 0, windowOffsetMs: 0, attempts: 0, eliminatedIn: null, best: { Q1: null, Q2: null, Q3: null },
        lastLapMs: null, lastLapTrafficMs: 0, lapsCompleted: 0, commandRevision: 0, finalPosition: null,
    }));
    const state: QualifyingState = { qualifyingVersion: 1, input, rngState: 0, status: "RUNNING", phase: "Q1", phaseStatus: "RUNNING", phaseElapsedMs: 0, sessionElapsedMs: 0,
        weather: structuredClone(input.weather.initial), weatherTick: 1, evolution: INITIAL_EVOLUTION, autoPlayer: false, entrants };
    const planned = planPhase(state, rng);
    return { ...planned, rngState: rng.getState() };
}
/**
 * Lap time. Flying laps add deterministic driver variation, an occasional mistake and the traffic cost; out and in
 * laps are slower multiples of the same nominal lap. Practice preparation feeds in modestly (setup quality,
 * acclimatisation, confidence and tyre knowledge) so it helps without deciding the result.
 */
function lapTime(state: QualifyingState, index: number, e: QualifyingEntrantState, kind: QualifyingLocation, rng: StatefulRandomSource | null, trafficMs = 0) {
    const source = state.input.entrants[index], p = source.preparation, tyre = e.tyre!, run = e.run!;
    const t = tyreContributions(tyre, state.input.tyres.profiles[tyre.compound]);
    const nominal = state.input.baseLapTimeMs
        + Math.round((100 - source.car.performance) / 100 * CAR_RANGE_MS) + Math.round((100 - source.driver.pace) / 100 * DRIVER_RANGE_MS)
        + t.tyreCompoundMs + t.tyreWearMs + t.tyreTemperatureMs
        + waterPenaltyMs(tyre.compound, state.weather.trackWater, state.input.weather)
        + Math.round(setupPenaltyMs(p.setup, effectiveIdeal(p.ideal, state.weather)) / 2)
        + Math.round((1000 - p.acclimatisation) * .3) + Math.round((1000 - p.confidence) * .15) + Math.round((1000 - p.tyreKnowledge[tyre.compound]) * .2)
        // Fuel follows the plan automatically: carrying fuel for further push laps costs a little.
        + Math.max(0, run.plan.pushLaps - run.pushDone - 1) * 60
        - Math.round(state.evolution * .8);
    if (kind === "OUT_LAP") return Math.round(nominal * OUT_LAP_PERMILLE / 1000);
    if (kind === "IN_LAP") return Math.round(nominal * IN_LAP_PERMILLE / 1000);
    const r = rng!, amplitude = (150 + (100 - source.driver.consistency) * 8) * (1300 - p.confidence * .5) / 1000;
    const variation = Math.round((r.next() + r.next() - 1) * amplitude);
    const mistake = r.next() < .02 + (100 - source.driver.consistency) * .003 ? 600 + Math.round(r.next() * 900) : (r.next(), 0);
    return nominal + variation + mistake + trafficMs;
}
interface Position { readonly index: number; readonly distance: number; readonly lapTimeMs: number; readonly location: QualifyingLocation }
/**
 * Traffic met on a timed lap that starts at phase time `at`, judged from where the other cars are (projected from the
 * start of the step). A car on an out/in lap within reach will be caught during the lap; a car just ahead on its own
 * timed lap costs dirty air. Deterministic via the RNG.
 */
function trafficFor(index: number, at: number, from: number, positions: readonly Position[], rng: StatefulRandomSource) {
    let loss = 0;
    for (const p of positions) {
        if (p.index === index || p.location === "GARAGE") continue;
        // `distance` already includes the progress made in the current lap; project it forward to `at`.
        const ahead = (((p.distance + (at - from) / Math.max(1, p.lapTimeMs)) % 1) + 1) % 1;
        // Slow cars usually move aside (small cost); sometimes the meeting point is bad (a real loss).
        if ((p.location === "OUT_LAP" || p.location === "IN_LAP") && ahead < .15) loss += rng.next() < .3 ? 250 + Math.round(rng.next() * 650) : Math.round(rng.next() * 120);
        else if (p.location === "FLYING" && ahead < .02) loss += 60 + Math.round(rng.next() * 120);
    }
    return Math.min(2500, loss);
}
/** Distance is quantised to micro-laps, exactly what persistence stores, so a reloaded state replays bit-for-bit. */
const microlaps = (laps: number) => Math.round(laps * 1e6) / 1e6;
function replace(state: QualifyingState, index: number, entrant: QualifyingEntrantState): QualifyingState {
    return { ...state, entrants: state.entrants.map((e, i) => i === index ? entrant : e) };
}
function launch(state: QualifyingState, index: number, plan: RunPlan): QualifyingState {
    const e = state.entrants[index];
    const out: QualifyingEntrantState = { ...e, location: "OUT_LAP", tyre: startingTyre(plan.compound), lapElapsedMs: 0, lapTrafficMs: 0, distance: Math.round(e.distance),
        attempts: e.attempts + 1, run: { plan, pushDone: 0, callIn: false, startedAtMs: state.phaseElapsedMs } };
    return replace(state, index, { ...out, lapTimeMs: lapTime(state, index, out, "OUT_LAP", null) });
}
/** Drives one car through the window [from, to) of the phase clock. */
function drive(state: QualifyingState, index: number, start: QualifyingEntrantState, from: number, to: number, rng: StatefulRandomSource, positions: readonly Position[], laps: { count: number }) {
    const duration = phaseFormat(state).durationMs;
    let e = start, now = from;
    while (e.location !== "GARAGE") {
        const need = e.lapTimeMs - e.lapElapsedMs;
        if (now + need > to) { e = { ...e, lapElapsedMs: e.lapElapsedMs + (to - now), distance: microlaps(Math.floor(e.distance) + (e.lapElapsedMs + (to - now)) / e.lapTimeMs) }; break; }
        now += need; laps.count++;
        const completed = e.location, lap = e.lapTimeMs;
        e = { ...e, lapElapsedMs: 0, distance: Math.floor(e.distance) + 1, lapsCompleted: e.lapsCompleted + 1 };
        if (completed === "IN_LAP") { e = { ...e, location: "GARAGE", run: null, tyre: null, lapTimeMs: 0, lapTrafficMs: 0, readyAtMs: now + GARAGE_TURNAROUND_MS }; break; }
        e = { ...e, tyre: advanceWeatherTyre(e.tyre!, state.input.tyres, state.weather, state.input.weather) };
        if (completed === "FLYING") {
            const best = e.best[state.phase], improved = best === null || lap < best.ms;
            e = { ...e, lastLapMs: lap, lastLapTrafficMs: e.lapTrafficMs, run: { ...e.run!, pushDone: e.run!.pushDone + 1 },
                best: improved ? { ...e.best, [state.phase]: { ms: lap, setAtMs: now } } : e.best };
        }
        // A timed lap may only START before the flag; afterwards every car heads for the pits.
        const expired = now >= duration, run = e.run!;
        const next: QualifyingLocation = expired || run.callIn || (completed === "FLYING" && run.pushDone >= run.plan.pushLaps) ? "IN_LAP" : "FLYING";
        const traffic = next === "FLYING" ? trafficFor(index, now, from, positions, rng) : 0;
        e = { ...e, location: next, lapTrafficMs: traffic };
        e = { ...e, lapTimeMs: lapTime(state, index, e, next, rng, traffic) };
    }
    return e;
}
/** Freezes the phase classification exactly once; eliminates the slowest cars or finishes the session. */
function completePhase(state: QualifyingState): QualifyingState {
    const f = phaseFormat(state), last = phaseIndex(state.phase) === QUALIFYING_PHASES.length - 1;
    const order = phaseClassification(state, state.phase), out = new Set(last ? [] : order.slice(f.advancing));
    const entrants = state.entrants.map((e, i) => ({ ...e, location: "GARAGE" as const, run: null, tyre: null, lapElapsedMs: 0, lapTimeMs: 0, lapTrafficMs: 0,
        eliminatedIn: out.has(i) ? state.phase : e.eliminatedIn }));
    const frozen: QualifyingState = { ...state, entrants, phaseStatus: "COMPLETE" };
    if (!last) return frozen;
    const final = finalClassification(frozen);
    return { ...frozen, status: "FINISHED", entrants: frozen.entrants.map((e, i) => ({ ...e, finalPosition: final.indexOf(i) + 1 })) };
}
function advanceWeatherTo(state: QualifyingState, sessionElapsedMs: number) {
    let { weather, weatherTick, evolution } = state;
    const target = Math.floor(sessionElapsedMs / state.input.weatherTickMs) + 1;
    while (weatherTick < target) { weather = advanceWeather(weather, state.input.weather, ++weatherTick); if (weather.trackWater >= 100) evolution = Math.round(evolution * .92); }
    return { weather, weatherTick, evolution };
}
/** Current track traffic, from the cars on track now (never future knowledge). */
export function trafficBand(state: QualifyingState): "CLEAR" | "MODERATE" | "BUSY" {
    const onTrack = state.entrants.filter(e => e.location !== "GARAGE").length, eligible = phaseFormat(state).eligible;
    return onTrack <= 3 ? "CLEAR" : onTrack >= Math.max(6, Math.ceil(eligible * .45)) ? "BUSY" : "MODERATE";
}
/** One authoritative step. A finished session or a completed (frozen) phase is returned unchanged. */
export function stepQualifying(state: QualifyingState): QualifyingState {
    if (state.status === "FINISHED" || state.phaseStatus === "COMPLETE") return state;
    const rng = createSeededRandom(state.rngState), from = state.phaseElapsedMs, to = from + state.input.stepMs;
    let working = state;
    // 1. Auto-managed garage decisions (AI always; the player's cars only under auto-management), before the flag.
    if (!phaseExpired(working)) for (let i = 0; i < working.entrants.length; i++) {
        const e = working.entrants[i];
        if (!isAuto(working, i) || e.eliminatedIn !== null || e.location !== "GARAGE") continue;
        const decision = autoGarageDecision(working, i);
        if (decision.kind === "send") working = launch(working, i, decision.plan);
    }
    // 2. Every car on track drives the whole window, in entrant order, against the positions at the start of the step.
    const positions: Position[] = working.entrants.map((e, index) => ({ index, distance: e.distance, lapTimeMs: e.lapTimeMs, location: e.location }));
    const laps = { count: 0 };
    const entrants = working.entrants.map((e, i) => e.location === "GARAGE" ? e : drive(working, i, e, from, to, rng, positions, laps));
    // 3. Track evolution (rubber from every lap, diminishing) and weather ticks on the continuous session clock.
    let evolution = working.evolution;
    for (let n = 0; n < laps.count; n++) evolution = Math.min(1000, evolution + Math.max(1, Math.round((1000 - evolution) * 5 / 1000)));
    const sessionElapsedMs = working.sessionElapsedMs + state.input.stepMs;
    const weather = advanceWeatherTo({ ...working, evolution }, sessionElapsedMs);
    const after: QualifyingState = { ...working, ...weather, entrants, phaseElapsedMs: to, sessionElapsedMs, rngState: rng.getState() };
    // 4. The phase freezes once the clock has expired and no timed lap is still running.
    return to >= phaseFormat(after).durationMs && after.entrants.every(e => e.location !== "FLYING") ? completePhase(after) : after;
}
/** After a completed phase: the break (weather keeps evolving) and the next phase with eligible cars in the garage. */
export function continuePhase(state: QualifyingState, expectedPhase: QualifyingPhase): QualifyingState {
    if (state.status === "FINISHED") throw new QualifyingRuleError("FINISHED");
    if (state.phaseStatus !== "COMPLETE") throw new QualifyingRuleError("PHASE_RUNNING");
    if (state.phase !== expectedPhase) throw new QualifyingRuleError("STALE");
    const rng = createSeededRandom(state.rngState), sessionElapsedMs = state.sessionElapsedMs + state.input.format.intermissionMs;
    const next: QualifyingState = { ...state, ...advanceWeatherTo(state, sessionElapsedMs), sessionElapsedMs, phase: QUALIFYING_PHASES[phaseIndex(state.phase) + 1], phaseStatus: "RUNNING", phaseElapsedMs: 0 };
    return { ...planPhase(next, rng), rngState: rng.getState() };
}
/** Service/playback step: under auto-management a completed phase continues by itself. */
export function advanceQualifying(state: QualifyingState): QualifyingState {
    return state.status === "RUNNING" && state.phaseStatus === "COMPLETE" && state.autoPlayer ? continuePhase(state, state.phase) : stepQualifying(state);
}
/** Same step function to the end; bounded so a malformed state can never loop forever. */
export function runQualifyingToEnd(state: QualifyingState) {
    let s = state;
    // "To the end" continues every completed phase; callers enable auto-management for the player's cars first.
    for (let n = 0; n < 2_000 && s.status !== "FINISHED"; n++) s = s.phaseStatus === "COMPLETE" ? continuePhase(s, s.phase) : stepQualifying(s);
    if (s.status !== "FINISHED") throw new RangeError("Qualifying did not finish");
    return s;
}
export function enableAutoPlayer(state: QualifyingState): QualifyingState { return state.autoPlayer ? state : { ...state, autoPlayer: true }; }
function target(state: QualifyingState, entrantId: string, revision: number) {
    if (state.status === "FINISHED") throw new QualifyingRuleError("FINISHED");
    const index = state.entrants.findIndex(e => e.entrantId === entrantId);
    if (index < 0) throw new QualifyingRuleError("NOT_FOUND");
    if (state.entrants[index].commandRevision !== revision) throw new QualifyingRuleError("STALE");
    if (state.entrants[index].eliminatedIn !== null) throw new QualifyingRuleError("ELIMINATED");
    if (state.phaseStatus === "COMPLETE") throw new QualifyingRuleError("PHASE_COMPLETE");
    return index;
}
const bump = (state: QualifyingState, index: number) => replace(state, index, { ...state.entrants[index], commandRevision: state.entrants[index].commandRevision + 1 });
/** Player command: send a car out on a run. Garage-only, before the flag, and only if the last timed lap can start in time. */
export function sendOut(state: QualifyingState, entrantId: string, revision: number, plan: RunPlan): QualifyingState {
    const index = target(state, entrantId, revision), e = state.entrants[index];
    if (!isRunPlan(plan) || !state.input.tyres.profiles[plan.compound]) throw new QualifyingRuleError("PLAN_INVALID");
    if (e.location !== "GARAGE") throw new QualifyingRuleError("NOT_IN_GARAGE");
    if (phaseExpired(state)) throw new QualifyingRuleError("CLOCK_EXPIRED");
    if (e.readyAtMs > state.phaseElapsedMs) throw new QualifyingRuleError("NOT_READY");
    if (plan.pushLaps > maxPushLaps(state)) throw new QualifyingRuleError("PLAN_TOO_LONG");
    return bump(launch(state, index, plan), index);
}
/** Player command: abort after the current lap (a timed lap in progress still counts), then an in lap. */
export function callIn(state: QualifyingState, entrantId: string, revision: number): QualifyingState {
    const index = target(state, entrantId, revision), e = state.entrants[index];
    if (e.location !== "OUT_LAP" && e.location !== "FLYING") throw new QualifyingRuleError("NOT_ON_TRACK");
    return bump(replace(state, index, { ...e, run: { ...e.run!, callIn: true } }), index);
}
export { timeToLastFlyingStart };

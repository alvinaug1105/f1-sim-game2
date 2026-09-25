/**
 * Qualifying simulation model (version 1). Pure and deterministic: no React, Prisma, browser APIs, wall clock or locale.
 * One Career QUALIFYING session runs three internal phases (Q1 → Q2 → Q3). Reuses the shared tyre and weather
 * primitives and the Practice setup helpers; the Race v7 simulation is untouched.
 */
import type { TyreCompound, TyreConfiguration, TyreState } from "../race/tyres/model";
import type { WeatherConfiguration, WeatherState } from "../race/weather/model";
import type { Setup } from "../practice/model";
export const QUALIFYING_VERSION = 1;
export const QUALIFYING_PHASES = ["Q1", "Q2", "Q3"] as const;
export type QualifyingPhase = typeof QUALIFYING_PHASES[number];
export type QualifyingPhaseStatus = "RUNNING" | "COMPLETE";
export type QualifyingStatus = "RUNNING" | "FINISHED";
export type QualifyingLocation = "GARAGE" | "OUT_LAP" | "FLYING" | "IN_LAP";
export type QualifyingController = "PLAYER" | "AI";
export const QUALIFYING_COMPOUNDS: readonly TyreCompound[] = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];
export const MAX_PUSH_LAPS = 3;
/** 2026 standard phase lengths and the break between phases. */
export const PHASE_DURATION_MS: Readonly<Record<QualifyingPhase, number>> = { Q1: 18 * 60_000, Q2: 15 * 60_000, Q3: 13 * 60_000 };
export const INTERMISSION_MS = 7 * 60_000;
export const QUALIFYING_STEP_MS = 20_000;
export const QUALIFYING_WEATHER_TICK_MS = 90_000;
export const GARAGE_TURNAROUND_MS = 60_000;
export const OUT_LAP_PERMILLE = 1250;
export const IN_LAP_PERMILLE = 1200;
/** Track rubber at the start of Qualifying (Practice has already run). */
export const INITIAL_EVOLUTION = 300;
export interface PhaseFormat { readonly phase: QualifyingPhase; readonly durationMs: number; readonly eligible: number; readonly advancing: number }
export interface QualifyingFormat { readonly phases: readonly PhaseFormat[]; readonly intermissionMs: number }
/**
 * Data-driven format by eligible field size: Q3 is a top-10 shoot-out and Q2 keeps 10 + half of the remainder
 * (rounded up). 22 → 16 → 10, 20 → 15 → 10; a field of 10 or fewer runs all three phases with every car.
 */
export function qualifyingFormat(entrants: number): QualifyingFormat {
    if (!Number.isSafeInteger(entrants) || entrants < 1) throw new RangeError("Invalid qualifying field size");
    const q3 = Math.min(10, entrants), q2 = entrants <= 10 ? entrants : 10 + Math.ceil((entrants - 10) / 2);
    const sizes = [entrants, q2, q3], next = [q2, q3, q3];
    return { phases: QUALIFYING_PHASES.map((phase, i) => ({ phase, durationMs: PHASE_DURATION_MS[phase], eligible: sizes[i], advancing: next[i] })), intermissionMs: INTERMISSION_MS };
}
export interface RunPlan { readonly compound: TyreCompound; readonly pushLaps: number }
/** A timed lap: `setAtMs` is the phase clock time the lap was completed (earlier wins a tie). */
export interface PhaseTime { readonly ms: number; readonly setAtMs: number }
/** Frozen, server-side preparation carried from Practice. `ideal` is hidden truth and never leaves the server. */
export interface QualifyingPreparation {
    readonly setup: Setup;
    readonly ideal: Setup;
    readonly confidence: number;
    readonly acclimatisation: number;
    readonly tyreKnowledge: Readonly<Record<TyreCompound, number>>;
}
export interface QualifyingEntrantInput {
    readonly entrantId: string;
    readonly driverId: string;
    readonly teamId: string;
    readonly controller: QualifyingController;
    readonly driver: { readonly pace: number; readonly consistency: number };
    readonly car: { readonly performance: number };
    readonly preparation: QualifyingPreparation;
    /** Q1 no-time fallback: 1 = best (latest completed Practice classification, else entry order). */
    readonly fallbackRank: number;
}
export interface QualifyingInput {
    readonly version: 1;
    readonly seed: number;
    readonly stepMs: number;
    readonly weatherTickMs: number;
    readonly baseLapTimeMs: number;
    readonly format: QualifyingFormat;
    readonly tyres: TyreConfiguration;
    /** Frozen at session start. Only current conditions and the approximate forecast are ever shown. */
    readonly weather: WeatherConfiguration;
    readonly entrants: readonly QualifyingEntrantInput[];
}
export interface QualifyingRun {
    readonly plan: RunPlan;
    /** Timed (push) laps completed in this run. */
    readonly pushDone: number;
    readonly callIn: boolean;
    readonly startedAtMs: number;
}
export interface QualifyingEntrantState {
    readonly entrantId: string;
    readonly location: QualifyingLocation;
    /** Unwrapped laps driven this session (integer at the line); map progress only. */
    readonly distance: number;
    readonly lapElapsedMs: number;
    readonly lapTimeMs: number;
    /** Hidden until the lap is complete: time lost to traffic on the current lap. */
    readonly lapTrafficMs: number;
    readonly tyre: TyreState | null;
    readonly run: QualifyingRun | null;
    /** Phase clock time from which the car may leave the garage. */
    readonly readyAtMs: number;
    /** Auto-manager plan for this phase (hidden): first release and final-run window offset. */
    readonly releaseAtMs: number;
    readonly windowOffsetMs: number;
    /** Runs started in the current phase. */
    readonly attempts: number;
    readonly eliminatedIn: QualifyingPhase | null;
    readonly best: Readonly<Record<QualifyingPhase, PhaseTime | null>>;
    readonly lastLapMs: number | null;
    readonly lastLapTrafficMs: number;
    readonly lapsCompleted: number;
    readonly commandRevision: number;
    readonly finalPosition: number | null;
}
export interface QualifyingState {
    readonly qualifyingVersion: 1;
    readonly input: QualifyingInput;
    readonly rngState: number;
    readonly status: QualifyingStatus;
    readonly phase: QualifyingPhase;
    readonly phaseStatus: QualifyingPhaseStatus;
    readonly phaseElapsedMs: number;
    /** Continuous session time (phases, overtime and breaks); drives weather ticks and is the stale-request token. */
    readonly sessionElapsedMs: number;
    readonly weather: WeatherState;
    readonly weatherTick: number;
    /** Track rubber / grip, 0–1000. */
    readonly evolution: number;
    readonly autoPlayer: boolean;
    readonly entrants: readonly QualifyingEntrantState[];
}
export const phaseIndex = (phase: QualifyingPhase) => QUALIFYING_PHASES.indexOf(phase);
export function phaseFormat(state: Pick<QualifyingState, "input" | "phase">, phase: QualifyingPhase = state.phase) {
    return state.input.format.phases[phaseIndex(phase)];
}
/** Weather ticks the frozen configuration must cover: the whole session plus generous overtime. */
export function qualifyingWeatherTicks(format: QualifyingFormat, weatherTickMs: number) {
    const total = format.phases.reduce((sum, p) => sum + p.durationMs + 6 * 60_000, 0) + 2 * format.intermissionMs;
    return Math.ceil(total / weatherTickMs) + 3;
}
/** Public planning lap (no hidden inputs): used for plan validation and auto-manager timing. */
export function planningLapMs(input: Pick<QualifyingInput, "baseLapTimeMs">) { return Math.round(input.baseLapTimeMs * 1.02); }
/** Phase-clock time a run needs before its LAST timed lap starts (out lap + earlier push laps). */
export function timeToLastFlyingStart(input: Pick<QualifyingInput, "baseLapTimeMs">, pushLaps: number) {
    const lap = planningLapMs(input);
    return Math.round(lap * OUT_LAP_PERMILLE / 1000) + (pushLaps - 1) * lap;
}
/** Most push laps that still start before the chequered flag (0 when no timed lap is possible). */
export function maxPushLaps(state: QualifyingState) {
    const remaining = phaseFormat(state).durationMs - state.phaseElapsedMs;
    for (let laps = MAX_PUSH_LAPS; laps >= 1; laps--) if (timeToLastFlyingStart(state.input, laps) < remaining) return laps;
    return 0;
}
export function isRunPlan(value: unknown): value is RunPlan {
    const p = value as RunPlan;
    return !!p && QUALIFYING_COMPOUNDS.includes(p.compound) && Number.isSafeInteger(p.pushLaps) && p.pushLaps >= 1 && p.pushLaps <= MAX_PUSH_LAPS;
}

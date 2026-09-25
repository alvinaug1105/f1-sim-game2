/**
 * Practice simulation model (version 1). Pure and deterministic: no React, Prisma, browser APIs, wall clock or locale.
 * Reuses the shared tyre and weather primitives; Race simulation (v7) is untouched.
 */
import type { TyreCompound, TyreConfiguration, TyreState } from "../race/tyres/model";
import type { WeatherConfiguration, WeatherState } from "../race/weather/model";
export const PRACTICE_VERSION = 1;
export type PracticeSessionType = "PRACTICE_1" | "PRACTICE_2" | "PRACTICE_3";
/** Five understandable setup dimensions, each a normalised 0–100 value. */
export const SETUP_DIMENSIONS = ["AERO", "MECHANICAL", "RIDE", "BRAKE", "TYRE"] as const;
export type SetupDimension = typeof SETUP_DIMENSIONS[number];
export type Setup = Readonly<Record<SetupDimension, number>>;
export const NEUTRAL_SETUP: Setup = { AERO: 50, MECHANICAL: 50, RIDE: 50, BRAKE: 50, TYRE: 50 };
export const PACE_EMPHASES = ["CONSERVATIVE", "BALANCED", "PERFORMANCE"] as const;
export type PaceEmphasis = typeof PACE_EMPHASES[number];
export const PRACTICE_COMPOUNDS: readonly TyreCompound[] = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];
export type PracticeLocation = "GARAGE" | "OUT_LAP" | "FLYING" | "IN_LAP";
export type PracticeController = "PLAYER" | "AI";
/** −2 too low · −1 slightly low · 0 good · +1 slightly high · +2 too high (relative to what suits the car). */
export type FeedbackLevel = -2 | -1 | 0 | 1 | 2;
export interface RunPlan { readonly compound: TyreCompound; readonly targetLaps: number; readonly pace: PaceEmphasis }
/** Weekend preparation for one driver; carries across P1 → P2 → P3. Values in permille unless noted. */
export interface Preparation {
    readonly setup: Setup;
    readonly setupRevision: number;
    readonly confidence: number;
    readonly acclimatisation: number;
    readonly tyreKnowledge: Readonly<Record<TyreCompound, number>>;
    readonly feedback: Readonly<Record<SetupDimension, FeedbackLevel>> | null;
    readonly feedbackReliability: number;
    /** Setup revision the feedback was gathered on (stale once the setup changes). */
    readonly feedbackRevision: number;
    readonly representativeLaps: number;
}
export interface PracticeRun {
    readonly number: number;
    readonly plan: RunPlan;
    readonly timedLaps: number;
    readonly bestLapMs: number | null;
    readonly callIn: boolean;
    readonly startedAtMs: number;
    readonly endedAtMs: number | null;
}
export interface PracticeEntrantInput {
    readonly entrantId: string;
    readonly driverId: string;
    readonly teamId: string;
    readonly controller: PracticeController;
    readonly driver: { readonly pace: number; readonly consistency: number };
    readonly car: { readonly performance: number };
    /** Hidden: the setup that suits this driver/car at this circuit this weekend. Never sent to the browser. */
    readonly ideal: Setup;
}
export interface PracticeInput {
    readonly version: 1;
    readonly sessionType: PracticeSessionType;
    readonly seed: number;
    readonly durationMs: number;
    readonly stepMs: number;
    readonly weatherTickMs: number;
    readonly baseLapTimeMs: number;
    readonly tyres: TyreConfiguration;
    /** Frozen at session start. Only the current state and the approximate forecast are ever shown to the player. */
    readonly weather: WeatherConfiguration;
    readonly entrants: readonly PracticeEntrantInput[];
}
export interface PracticeEntrantState {
    readonly entrantId: string;
    readonly location: PracticeLocation;
    /** Unwrapped laps driven (integer at the start/finish line); map progress only. */
    readonly distance: number;
    readonly lapElapsedMs: number;
    readonly lapTimeMs: number;
    readonly tyre: TyreState | null;
    readonly run: PracticeRun | null;
    readonly runs: readonly PracticeRun[];
    readonly readyAtMs: number;
    readonly lapsCompleted: number;
    readonly timedLaps: number;
    readonly lastLapMs: number | null;
    readonly bestLapMs: number | null;
    readonly bestLapCompound: TyreCompound | null;
    readonly commandRevision: number;
    readonly preparation: Preparation;
}
export interface PracticeState {
    readonly practiceVersion: 1;
    readonly input: PracticeInput;
    readonly rngState: number;
    readonly elapsedMs: number;
    readonly status: "RUNNING" | "FINISHED";
    readonly weather: WeatherState;
    readonly weatherTick: number;
    /** Track rubbering-in, 0–1000. */
    readonly evolution: number;
    /** Auto manager also drives the player's cars (Simulate Session / Simulate Remainder). */
    readonly autoPlayer: boolean;
    readonly entrants: readonly PracticeEntrantState[];
}
export const PRACTICE_STEP_MS = 30_000;
export const PRACTICE_WEATHER_TICK_MS = 90_000;
/** Default session length by type (data-driven per session; the weekend model carries no durations yet). */
export const PRACTICE_DURATION_MS: Readonly<Record<PracticeSessionType, number>> = { PRACTICE_1: 3_600_000, PRACTICE_2: 3_600_000, PRACTICE_3: 3_600_000 };
export const SETUP_WORK_MS = 120_000;
export const GARAGE_TURNAROUND_MS = 60_000;
export const MAX_RUN_LAPS = 15;
export const OUT_LAP_PERMILLE = 1250;
export const IN_LAP_PERMILLE = 1200;
export const PACE_EFFECT: Readonly<Record<PaceEmphasis, { lapMs: number; wearPermille: number }>> = {
    CONSERVATIVE: { lapMs: 700, wearPermille: 750 }, BALANCED: { lapMs: 0, wearPermille: 1000 }, PERFORMANCE: { lapMs: -350, wearPermille: 1300 },
};
/** Lap-time cost of each dimension being fully (100 points) away from what suits the car. */
const SETUP_WEIGHT_MS: Readonly<Record<SetupDimension, number>> = { AERO: 2000, MECHANICAL: 1400, RIDE: 900, BRAKE: 600, TYRE: 1100 };
export function isSetup(value: unknown): value is Setup {
    return !!value && typeof value === "object" && SETUP_DIMENSIONS.every(d => Number.isSafeInteger((value as Record<string, unknown>)[d]) && (value as Record<string, number>)[d] >= 0 && (value as Record<string, number>)[d] <= 100);
}
export function waterBand(weather: WeatherState) { return weather.trackWater < 100 ? 0 : weather.trackWater < 350 ? 1 : 2; }
/** What suits the car in the CURRENT conditions: a wet track wants more downforce and a softer ride. */
export function effectiveIdeal(ideal: Setup, weather: WeatherState): Setup {
    const band = waterBand(weather);
    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    return band === 0 ? ideal : { ...ideal, AERO: clamp(ideal.AERO + band * 6), RIDE: clamp(ideal.RIDE - band * 5) };
}
export function setupPenaltyMs(setup: Setup, ideal: Setup) {
    return Math.round(SETUP_DIMENSIONS.reduce((sum, d) => sum + SETUP_WEIGHT_MS[d] * ((setup[d] - ideal[d]) / 100) ** 2, 0));
}
export function initialPreparation(): Preparation {
    return { setup: NEUTRAL_SETUP, setupRevision: 0, confidence: 0, acclimatisation: 0, tyreKnowledge: { SOFT: 0, MEDIUM: 0, HARD: 0, INTERMEDIATE: 0, WET: 0 }, feedback: null, feedbackReliability: 0, feedbackRevision: -1, representativeLaps: 0 };
}
/** Suitability of a compound for the current track water: 2 suitable, 1 marginal, 0 poor. */
export function compoundFit(compound: TyreCompound, weather: WeatherState) {
    const band = waterBand(weather);
    if (compound === "INTERMEDIATE") return band === 1 ? 2 : band === 2 ? 1 : 0;
    if (compound === "WET") return band === 2 ? 2 : band === 1 ? 1 : 0;
    return band === 0 ? 2 : band === 1 ? 1 : 0;
}
/** Diminishing gains: each representative lap closes part of the remaining gap. */
export function learn(value: number, ratePermille: number) { return Math.min(1000, value + Math.max(1, Math.round((1000 - value) * ratePermille / 1000))); }
export const ACCLIMATISATION_RATE = 50;
export const TYRE_KNOWLEDGE_RATE: readonly number[] = [12, 40, 80]; // by compoundFit
/** A setup change is untested: confidence drops with the size of the change. */
export function confidenceAfterChange(confidence: number, from: Setup, to: Setup) {
    const change = SETUP_DIMENSIONS.reduce((sum, d) => sum + Math.abs(to[d] - from[d]), 0);
    return Math.max(0, confidence - change * 5);
}
/** Evidence from one completed run raises confidence; longer runs and a settled driver give more. */
export function confidenceAfterRun(confidence: number, timedLaps: number, acclimatisation: number) {
    const evidence = Math.min(6, timedLaps) / 6 * (500 + acclimatisation / 2) / 1000;
    return Math.min(1000, confidence + Math.round((1000 - confidence) * evidence * .45));
}
/** Feedback reliability grows with representative laps in the run and with familiarity. */
export function feedbackReliability(timedLaps: number, acclimatisation: number) { return Math.min(1000, timedLaps * 110 + Math.round(acclimatisation * .35)); }
export function feedbackLevel(reading: number): FeedbackLevel { return reading <= -16 ? -2 : reading <= -6 ? -1 : reading < 6 ? 0 : reading < 16 ? 1 : 2; }
/** Rough length of one representative lap in the current state — for planning only, never for timing. */
export function planningLapMs(state: PracticeState) { return Math.round(state.input.baseLapTimeMs * 1.03); }
export function runDurationMs(state: PracticeState, targetLaps: number) {
    return Math.round(planningLapMs(state) * (targetLaps + (OUT_LAP_PERMILLE + IN_LAP_PERMILLE) / 1000));
}
/** Longest plan that still fits the remaining session time (0 when no run fits). */
export function maxRunLaps(state: PracticeState) {
    for (let laps = MAX_RUN_LAPS; laps >= 1; laps--) if (state.elapsedMs + runDurationMs(state, laps) <= state.input.durationMs) return laps;
    return 0;
}

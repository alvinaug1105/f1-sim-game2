/**
 * Practice application layer: builds Career-snapshotted session input, enforces ownership and staleness, and ties
 * session completion to the weekend lifecycle. Every path — manual steps, Next Relevant Event, Simulate Remainder,
 * Simulate Session, Simulate All Remaining Practice — runs the same deterministic engine step.
 */
import { createSeededRandom } from "../../simulation/core/random";
import {
    callIn, changeSetup, createPractice, enableAutoPlayer, PracticeRuleError, runPracticeToEnd, sendOut, stepPractice, weatherTicks,
} from "../../simulation/practice/engine";
import {
    PRACTICE_DURATION_MS, PRACTICE_STEP_MS, PRACTICE_VERSION, PRACTICE_WEATHER_TICK_MS, SETUP_DIMENSIONS,
    type PracticeInput, type PracticeSessionType, type PracticeState, type Preparation, type RunPlan, type Setup,
} from "../../simulation/practice/model";
import { weatherTyreConfiguration } from "../../simulation/race/tyres/profiles";
import { ProgressionError, isPractice, transitionSession, type CareerProgress } from "../../game/domain/progression";
import { PracticeError, type CareerPracticeData, type CareerPracticeRepository, type PracticeChange } from "../../game/domain/practice-repository";
import { developmentBaseLapTimeMs, developmentPerformance } from "../race/development-profiles";
import { raceWeatherSeed, scenarioWeather } from "../race/weather-scenarios";
export type PracticeCommand =
    | { kind: "send"; entrantId: string; revision: number; plan: RunPlan }
    | { kind: "callIn"; entrantId: string; revision: number }
    | { kind: "setup"; entrantId: string; revision: number; setup: Setup };
const circuitKey = (data: CareerPracticeData) => data.circuit.sourceCircuitId ?? "custom";
/** Hidden setup target for one driver this weekend: stable identity only (never a name), never shown to the player. */
export function hiddenIdeal(careerId: string, weekendId: string, driverId: string, circuit: string): Setup {
    const rng = createSeededRandom(raceWeatherSeed([careerId, weekendId, driverId, circuit, "setup"]));
    return Object.fromEntries(SETUP_DIMENSIONS.map(d => [d, 25 + Math.floor(rng.next() * 51)])) as Setup;
}
/** Session input from the Career snapshot. Seeds come from stable identity, so the same session always replays. */
export function practiceInput(data: CareerPracticeData, newId: () => string): { input: PracticeInput; entrantDrivers: Record<string, string> } {
    const careerId = data.progress.career.id, ticks = weatherTicks({ durationMs: PRACTICE_DURATION_MS[data.sessionType], weatherTickMs: PRACTICE_WEATHER_TICK_MS });
    const entrants = data.roster.map((row, index) => {
        const existing = data.preparations.find(p => p.driverId === row.driverId);
        return {
            entrantId: newId(), driverId: row.driverId, teamId: row.teamId,
            controller: row.teamId === data.progress.career.playerTeamId ? "PLAYER" as const : "AI" as const,
            ...developmentPerformance(index, row.teamOrder),
            ideal: existing?.ideal ?? hiddenIdeal(careerId, data.weekendId, row.driverId, circuitKey(data)),
        };
    });
    if (!entrants.length) throw new PracticeError("INVALID_INPUT");
    const input: PracticeInput = {
        version: PRACTICE_VERSION, sessionType: data.sessionType, seed: raceWeatherSeed([careerId, data.eventId, data.sessionId, "practice"]),
        durationMs: PRACTICE_DURATION_MS[data.sessionType], stepMs: PRACTICE_STEP_MS, weatherTickMs: PRACTICE_WEATHER_TICK_MS,
        baseLapTimeMs: developmentBaseLapTimeMs(data.circuit.lengthMeters), tyres: weatherTyreConfiguration(),
        // Each session gets its own deterministic weather story (dry, showers, wet…), seeded by stable identity.
        weather: scenarioWeather(raceWeatherSeed([careerId, data.eventId, circuitKey(data), data.sessionType]), ticks),
        entrants,
    };
    return { input, entrantDrivers: Object.fromEntries(entrants.map(e => [e.entrantId, e.driverId])) };
}
function rule<T>(work: () => T): T {
    try { return work(); } catch (cause) {
        if (cause instanceof PracticeRuleError) throw new PracticeError(cause.code, { cause });
        if (cause instanceof ProgressionError) throw new PracticeError("INVALID_ACTION", { cause });
        if (cause instanceof PracticeError) throw cause;
        throw new PracticeError("INVALID_INPUT", { cause });
    }
}
function session(data: CareerPracticeData) {
    return data.progress.events.find(e => e.id === data.eventId)!.weekend!.sessions.find(s => s.id === data.sessionId)!;
}
/** A finished session completes its weekend session exactly once, in the same transaction that finished it. */
function withCompletion(data: CareerPracticeData, state: PracticeState, progress: CareerProgress): PracticeChange {
    return state.status === "FINISHED" ? { state, progress: transitionSession(progress, data.eventId, data.sessionId, "completeDevelopment") } : { state, progress };
}
function running(data: CareerPracticeData, expectedElapsedMs?: number) {
    if (!data.state || data.state.status !== "RUNNING" || session(data).status !== "IN_PROGRESS") throw new PracticeError("INVALID_ACTION");
    if (expectedElapsedMs !== undefined && data.state.elapsedMs !== expectedElapsedMs) throw new PracticeError("STALE");
    return data.state;
}
function start(data: CareerPracticeData, auto: boolean): PracticeChange {
    if (data.state) throw new PracticeError("INVALID_ACTION");
    const progress = transitionSession(data.progress, data.eventId, data.sessionId, "start");
    const { input, entrantDrivers } = practiceInput(data, () => crypto.randomUUID());
    const preparations: Record<string, Preparation> = Object.fromEntries(input.entrants.flatMap(e => { const p = data.preparations.find(x => x.driverId === e.driverId); return p ? [[e.entrantId, p.preparation]] : []; }));
    let state = createPractice(input, preparations);
    if (auto) state = runPracticeToEnd(enableAutoPlayer(state));
    return { ...withCompletion({ ...data, state }, state, progress), entrantDrivers };
}
export function startPracticeSession(repository: CareerPracticeRepository, careerId: string, eventId: string, sessionId: string) {
    return repository.changePractice(careerId, eventId, sessionId, data => rule(() => start(data, false)));
}
/** One authoritative step (Next / playback). `expectedElapsedMs` rejects stale or duplicate requests. */
export function advancePracticeSession(repository: CareerPracticeRepository, careerId: string, eventId: string, sessionId: string, expectedElapsedMs: number) {
    return repository.changePractice(careerId, eventId, sessionId, data => rule(() => {
        const state = stepPractice(running(data, expectedElapsedMs));
        return withCompletion(data, state, data.progress);
    }));
}
/** Player commands target only the Career team's own cars; AI entrants are never commandable. */
export function practiceCommand(repository: CareerPracticeRepository, careerId: string, eventId: string, sessionId: string, expectedElapsedMs: number, command: PracticeCommand) {
    return repository.changePractice(careerId, eventId, sessionId, data => rule(() => {
        const state = running(data, expectedElapsedMs);
        const source = state.input.entrants.find(e => e.entrantId === command.entrantId);
        if (!source || source.controller !== "PLAYER" || source.teamId !== data.progress.career.playerTeamId || state.autoPlayer) throw new PracticeError("INVALID_ACTION");
        const next = command.kind === "send" ? sendOut(state, command.entrantId, command.revision, command.plan)
            : command.kind === "callIn" ? callIn(state, command.entrantId, command.revision)
                : changeSetup(state, command.entrantId, command.revision, command.setup);
        return { state: next, progress: data.progress };
    }));
}
/** Continues from the exact saved state with the auto manager driving the player's cars, to the flag. */
export function simulatePracticeRemainder(repository: CareerPracticeRepository, careerId: string, eventId: string, sessionId: string, expectedElapsedMs?: number) {
    return repository.changePractice(careerId, eventId, sessionId, data => rule(() => {
        const state = runPracticeToEnd(enableAutoPlayer(running(data, expectedElapsedMs)));
        return withCompletion(data, state, data.progress);
    }));
}
/** Simulate Session: starts (if needed) and auto-manages the whole session through the same mechanics. */
export function simulatePracticeSession(repository: CareerPracticeRepository, careerId: string, eventId: string, sessionId: string) {
    return repository.changePractice(careerId, eventId, sessionId, data => rule(() => {
        if (!data.state) return start(data, true);
        return withCompletion(data, runPracticeToEnd(enableAutoPlayer(running(data))), data.progress);
    }));
}
/** Simulates every remaining Practice session of the current weekend in order (each its own transaction). */
export async function simulateRemainingPractice(repository: CareerPracticeRepository, progressOf: () => Promise<CareerProgress | null>, careerId: string, eventId: string) {
    let simulated = 0;
    for (;;) {
        const progress = await progressOf();
        const weekend = progress?.events.find(e => e.id === eventId)?.weekend;
        if (!weekend || weekend.status !== "ACTIVE") throw new PracticeError("NOT_FOUND");
        const next = [...weekend.sessions].sort((a, b) => a.order - b.order).find(s => isPractice(s.type) && (s.status === "AVAILABLE" || s.status === "IN_PROGRESS"));
        if (!next) break;
        await simulatePracticeSession(repository, careerId, eventId, next.id);
        simulated++;
        if (simulated > 3) throw new PracticeError("INVALID_ACTION");
    }
    if (!simulated) throw new PracticeError("INVALID_ACTION");
    return simulated;
}
export type { PracticeSessionType };

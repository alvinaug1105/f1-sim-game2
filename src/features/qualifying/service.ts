/**
 * Qualifying application layer: builds Career-snapshotted input (incl. Practice carry-over), enforces ownership and
 * staleness, and ties session completion to the weekend lifecycle. Every path — manual steps, Next Relevant Event,
 * Continue, Simulate Remainder, Simulate Qualifying — runs the same deterministic engine.
 */
import {
    advanceQualifying, callIn, continuePhase, createQualifying, enableAutoPlayer, QualifyingRuleError, runQualifyingToEnd, sendOut,
} from "../../simulation/qualifying/engine";
import {
    QUALIFYING_STEP_MS, QUALIFYING_VERSION, QUALIFYING_WEATHER_TICK_MS, qualifyingFormat, qualifyingWeatherTicks,
    type QualifyingInput, type QualifyingPhase, type QualifyingPreparation, type QualifyingState, type RunPlan,
} from "../../simulation/qualifying/model";
import { NEUTRAL_SETUP } from "../../simulation/practice/model";
import { weatherTyreConfiguration } from "../../simulation/race/tyres/profiles";
import { ProgressionError, transitionSession, type CareerProgress } from "../../game/domain/progression";
import { QualifyingError, type CareerQualifyingData, type CareerQualifyingRepository, type QualifyingChange } from "../../game/domain/qualifying-repository";
import { developmentBaseLapTimeMs, entrantPerformance } from "../race/development-profiles";
import { raceWeatherSeed, scenarioWeather } from "../race/weather-scenarios";
import { hiddenIdeal } from "../practice/service";
export type QualifyingCommand =
    | { kind: "send"; entrantId: string; revision: number; plan: RunPlan }
    | { kind: "callIn"; entrantId: string; revision: number };
const circuitKey = (data: CareerQualifyingData) => data.circuit.sourceCircuitId ?? "custom";
/**
 * Practice carry-over for one driver. Without Practice preparation (old Careers, skipped Practice) the car runs a
 * neutral setup with no acclimatisation/knowledge, against the same stable hidden target Practice would have used.
 */
function preparationFor(data: CareerQualifyingData, driverId: string): QualifyingPreparation {
    const record = data.preparations.find(p => p.driverId === driverId);
    if (record) {
        const p = record.preparation;
        return { setup: p.setup, ideal: record.ideal, confidence: p.confidence, acclimatisation: p.acclimatisation, tyreKnowledge: p.tyreKnowledge };
    }
    return { setup: NEUTRAL_SETUP, ideal: hiddenIdeal(data.progress.career.id, data.weekendId, driverId, circuitKey(data)), confidence: 0, acclimatisation: 0,
        tyreKnowledge: { SOFT: 0, MEDIUM: 0, HARD: 0, INTERMEDIATE: 0, WET: 0 } };
}
/** Session input from the Career snapshot. Seeds come from stable identity, so the same session always replays. */
export function qualifyingInput(data: CareerQualifyingData, newId: () => string): QualifyingInput {
    if (!data.roster.length) throw new QualifyingError("INVALID_INPUT");
    // Grand Prix Qualifying keeps its exact Phase-14 identity labels; Sprint Qualifying has its own seed and weather.
    const careerId = data.progress.career.id, kind = data.kind ?? "QUALIFYING", format = qualifyingFormat(data.roster.length, kind);
    const [seedLabel, weatherLabel] = kind === "SPRINT_QUALIFYING" ? ["sprint-qualifying", "SPRINT_QUALIFYING"] : ["qualifying", "QUALIFYING"];
    return {
        version: QUALIFYING_VERSION, seed: raceWeatherSeed([careerId, data.eventId, data.sessionId, seedLabel]),
        stepMs: QUALIFYING_STEP_MS, weatherTickMs: QUALIFYING_WEATHER_TICK_MS, baseLapTimeMs: developmentBaseLapTimeMs(data.circuit.lengthMeters),
        format, tyres: weatherTyreConfiguration(),
        weather: scenarioWeather(raceWeatherSeed([careerId, data.eventId, circuitKey(data), weatherLabel]), qualifyingWeatherTicks(format, QUALIFYING_WEATHER_TICK_MS)),
        entrants: data.roster.map((row, index) => {
            const practiceRank = data.practiceOrder.indexOf(row.driverId);
            return {
                entrantId: newId(), driverId: row.driverId, teamId: row.teamId,
                controller: row.teamId === data.progress.career.playerTeamId ? "PLAYER" as const : "AI" as const,
                // Same performance source as Practice and Race: snapshotted balance, else the legacy profile.
                ...entrantPerformance(row, index),
                preparation: preparationFor(data, row.driverId),
                fallbackRank: practiceRank >= 0 ? practiceRank + 1 : data.practiceOrder.length + index + 1,
            };
        }),
    };
}
function rule<T>(work: () => T): T {
    try { return work(); } catch (cause) {
        if (cause instanceof QualifyingRuleError) throw new QualifyingError(cause.code, { cause });
        if (cause instanceof ProgressionError) throw new QualifyingError("INVALID_ACTION", { cause });
        if (cause instanceof QualifyingError) throw cause;
        throw new QualifyingError("INVALID_INPUT", { cause });
    }
}
function session(data: CareerQualifyingData) {
    return data.progress.events.find(e => e.id === data.eventId)!.weekend!.sessions.find(s => s.id === data.sessionId)!;
}
/** Legacy save: the pre-Phase-14 placeholder left Qualifying IN_PROGRESS without a simulation. */
export function isLegacyQualifying(data: CareerQualifyingData) { return !data.state && session(data).status === "IN_PROGRESS"; }
/** A finished Qualifying completes its weekend session exactly once, in the same transaction (the Race unlocks). */
function withCompletion(data: CareerQualifyingData, state: QualifyingState, progress: CareerProgress): QualifyingChange {
    return state.status === "FINISHED" ? { state, progress: transitionSession(progress, data.eventId, data.sessionId, "completeDevelopment") } : { state, progress };
}
function running(data: CareerQualifyingData, expectedSessionElapsedMs?: number) {
    if (!data.state || data.state.status !== "RUNNING" || session(data).status !== "IN_PROGRESS") throw new QualifyingError("INVALID_ACTION");
    if (expectedSessionElapsedMs !== undefined && data.state.sessionElapsedMs !== expectedSessionElapsedMs) throw new QualifyingError("STALE");
    return data.state;
}
function start(data: CareerQualifyingData, auto: boolean): QualifyingChange {
    if (data.state) throw new QualifyingError("INVALID_ACTION");
    // AVAILABLE → start the weekend session. A legacy IN_PROGRESS placeholder has no recorded running, so the real
    // session is created from its normal beginning (deterministic, nothing invented) and the session stays IN_PROGRESS.
    const progress = isLegacyQualifying(data) ? data.progress : transitionSession(data.progress, data.eventId, data.sessionId, "start");
    let state = createQualifying(qualifyingInput(data, () => crypto.randomUUID()));
    if (auto) state = runQualifyingToEnd(enableAutoPlayer(state));
    return withCompletion(data, state, progress);
}
/**
 * Manage Qualifying: start (or resume). Idempotent — a repeated or concurrent request for a session that is already
 * running returns it unchanged, so neither a double click nor a legacy bootstrap can create a second simulation.
 */
export function startQualifyingSession(repository: CareerQualifyingRepository, careerId: string, eventId: string) {
    return repository.changeQualifying(careerId, eventId, data => rule(() =>
        data.state?.status === "RUNNING" && session(data).status === "IN_PROGRESS" ? { state: data.state, progress: data.progress } : start(data, false)));
}
/** One authoritative step (Next / playback). `expectedSessionElapsedMs` rejects stale or duplicate requests. */
export function advanceQualifyingSession(repository: CareerQualifyingRepository, careerId: string, eventId: string, expectedSessionElapsedMs: number) {
    return repository.changeQualifying(careerId, eventId, data => rule(() => {
        const state = running(data, expectedSessionElapsedMs);
        if (state.phaseStatus === "COMPLETE" && !state.autoPlayer) throw new QualifyingError("PHASE_COMPLETE");
        return withCompletion(data, advanceQualifying(state), data.progress);
    }));
}
/** Continue to Q2/Q3 after a completed phase (processes the break). Exactly one of two duplicate requests wins. */
export function continueQualifyingPhase(repository: CareerQualifyingRepository, careerId: string, eventId: string, expectedSessionElapsedMs: number, expectedPhase: QualifyingPhase) {
    return repository.changeQualifying(careerId, eventId, data => rule(() => ({ state: continuePhase(running(data, expectedSessionElapsedMs), expectedPhase), progress: data.progress })));
}
/** Player commands target only the Career team's own, non-eliminated cars; AI entrants are never commandable. */
export function qualifyingCommand(repository: CareerQualifyingRepository, careerId: string, eventId: string, expectedSessionElapsedMs: number, command: QualifyingCommand) {
    return repository.changeQualifying(careerId, eventId, data => rule(() => {
        const state = running(data, expectedSessionElapsedMs);
        const source = state.input.entrants.find(e => e.entrantId === command.entrantId);
        if (!source || source.controller !== "PLAYER" || source.teamId !== data.progress.career.playerTeamId || state.autoPlayer) throw new QualifyingError("INVALID_ACTION");
        const next = command.kind === "send" ? sendOut(state, command.entrantId, command.revision, command.plan) : callIn(state, command.entrantId, command.revision);
        return { state: next, progress: data.progress };
    }));
}
/** From the exact saved state, the auto manager takes over the player's cars and finishes every remaining phase. */
export function simulateQualifyingRemainder(repository: CareerQualifyingRepository, careerId: string, eventId: string, expectedSessionElapsedMs?: number) {
    return repository.changeQualifying(careerId, eventId, data => rule(() => {
        if (isLegacyQualifying(data)) {
            if (expectedSessionElapsedMs !== undefined && expectedSessionElapsedMs !== 0) throw new QualifyingError("STALE");
            return start(data, true);
        }
        return withCompletion(data, runQualifyingToEnd(enableAutoPlayer(running(data, expectedSessionElapsedMs))), data.progress);
    }));
}
/** Simulate Qualifying: starts (if needed) and auto-manages the whole session through the same mechanics. */
export function simulateQualifyingSession(repository: CareerQualifyingRepository, careerId: string, eventId: string) {
    return repository.changeQualifying(careerId, eventId, data => rule(() =>
        data.state ? withCompletion(data, runQualifyingToEnd(enableAutoPlayer(running(data))), data.progress) : start(data, true)));
}

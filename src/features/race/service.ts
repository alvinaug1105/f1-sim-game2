import { defaultIncidentConfiguration, defaultReliability } from "../../simulation/race/incidents/model";
import { developmentWeather } from "../../simulation/race/weather/model";
import { weatherTyreConfiguration } from "../../simulation/race/tyres/profiles";
import { defaultCommandConfiguration, PACE_MODES, FUEL_MODES, ERS_MODES, type PaceMode, type FuelMode, type ErsMode } from "../../simulation/race/commands/model";
import { defaultPitConfiguration } from "../../simulation/race/pits/profiles";
import { requestPitStop } from "../../simulation/race/pits/model";
import type { StrategyController } from "../../simulation/race/pits/types";
import {
  circuitInteractionConfiguration,
  defaultInteractionConfiguration,
  developmentDriverInteraction,
} from "../../simulation/race/traffic/profiles";
import { aiDryStartingCompound, defaultAiStrategyConfiguration, strategyPreference } from "../../simulation/race/pits/ai-strategy";
import {
  defaultTyreConfiguration,
  startingTyre,
} from "../../simulation/race/tyres/profiles";
import {
  isTyreCompound,
  type TyreCompound,
} from "../../simulation/race/tyres/model";
import {
  RaceError,
  type CareerRaceRepository,
} from "../../game/domain/race-repository";
import { transitionSession } from "../../game/domain/progression";
import {
  advanceRace,
  createRace,
  isSupportedSimulationVersion,
} from "../../simulation/race/engine";
import { developmentRaceInput, developmentCommandFuelKg } from "./development-profiles";
import type { RaceSimulationState } from "../../simulation/race/types";
import { careerRaceWeather, aiStartingCompound } from "./weather-scenarios";
export function startCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  requestedSeed?: number,
  tyreChoices?: Readonly<Record<string, TyreCompound>>,
  withTraffic = false,
  withPits = false,
  withCommands = false,
  withWeather = false,
  withIncidents = false,
  autoPlayer = false,
) {
  // An explicit seed (tests, development tooling) keeps the legacy development weather so historical fixtures stay
  // reproducible. Career play (no explicit seed) freezes a weather scenario seeded by stable Career/event/circuit identity.
  const seed = requestedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0];
  return repository.changeRace(careerId, eventId, (data) => {
    if (data.state) throw new RaceError("STALE");
    const event = data.progress.events.find((e) => e.id === eventId)!;
    const session = event.weekend!.sessions.find(
      (s) => s.id === data.sessionId,
    )!;
    if (
      event.status !== "CURRENT" ||
      event.weekend!.status !== "ACTIVE" ||
      data.progress.career.status !== "ACTIVE" ||
      !["AVAILABLE", "IN_PROGRESS"].includes(session.status)
    )
      throw new RaceError("INVALID_ACTION");
    const progress =
      session.status === "AVAILABLE"
        ? transitionSession(data.progress, eventId, session.id, "start")
        : data.progress;
    try {
      const snapshot = developmentRaceInput(data, seed, () =>
        crypto.randomUUID(),
      );
      if (tyreChoices) {
        if (
          Object.keys(tyreChoices).some(
            (id) => !data.roster.some((e) => e.driverId === id),
          ) ||
          Object.values(tyreChoices).some((c) => !isTyreCompound(c))
        )
          throw new RaceError("INVALID_INPUT");
        // Career Races (v7): the player chooses only for their own drivers; rival starting tyres are never player input.
        if (withIncidents && Object.keys(tyreChoices).some((id) => data.roster.find((e) => e.driverId === id)!.teamId !== data.progress.career.playerTeamId))
          throw new RaceError("INVALID_ACTION");
      }
      const weather = withWeather
        ? requestedSeed === undefined
          ? careerRaceWeather(data.progress.career.id, eventId, data.circuit.sourceCircuitId ?? "custom", snapshot.input.totalLaps, data.kind)
          : developmentWeather(seed, snapshot.input.totalLaps)
        : undefined;
      // AI teams pick starting tyres from current public grid conditions, never from player input or future weather.
      // Career Races (v7) also give each AI car its own stable strategic character: on a dry grid a strong soft
      // preference starts on the soft (never the hard). Wet or damp grids keep the current-conditions choice.
      const startingCompound = (driverId: string, teamId: string, gridPosition: number) => {
        // Auto-managed player cars (Simulate) start like any AI car: from current public conditions and character.
        if (!(withIncidents && weather && (autoPlayer || teamId !== data.progress.career.playerTeamId))) return tyreChoices?.[driverId] ?? "MEDIUM";
        const compound = aiStartingCompound(weather.initial);
        return compound === "MEDIUM" ? aiDryStartingCompound(strategyPreference(seed, gridPosition)) : compound;
      };
      const input = tyreChoices
        ? {
            ...snapshot.input,
            tyres: withWeather ? weatherTyreConfiguration() : defaultTyreConfiguration(),
            entrants: snapshot.input.entrants.map((e) => ({
              ...e,
              startingTyre: startingTyre(startingCompound(e.driverId, e.teamId, e.gridPosition)),
            })),
          }
        : snapshot.input;
      return {
        state: createRace(
          withTraffic
            ? {
                ...input,
                ...(withIncidents ? { incidents: defaultIncidentConfiguration() } : {}),
                ...(weather ? { weather } : {}),
                ...(withCommands ? { commands: defaultCommandConfiguration(), initialFuelKg: developmentCommandFuelKg(input.initialFuelKg) } : {}),
                // Career Races (v7) freeze the AI pit strategy and the Career circuit's Race interaction identity
                // (neutral defaults when the Career predates it). Older Race versions keep their historical inputs.
                ...(withPits ? { pits: withIncidents ? { ...defaultPitConfiguration(), strategy: defaultAiStrategyConfiguration() } : defaultPitConfiguration() } : {}),
                interaction: withIncidents ? circuitInteractionConfiguration(data.circuit.raceProfile) : defaultInteractionConfiguration(),
                entrants: input.entrants.map((e) => ({
                  ...e,
                  ...(withIncidents ? { reliability: defaultReliability() } : {}),
                  ...(withPits
                    ? {
                        strategyController: (e.teamId ===
                        data.progress.career.playerTeamId && !autoPlayer
                          ? "PLAYER"
                          : "DEVELOPMENT_AI") as StrategyController,
                      }
                    : {}),
                  interaction: developmentDriverInteraction(),
                })),
              }
            : input,
        ),
        labels: snapshot.labels,
        progress,
      };
    } catch (cause) {
      if (cause instanceof RaceError) throw cause; // e.g. rival starting tyres are an ownership error, not bad input
      throw new RaceError("INVALID_INPUT", { cause });
    }
  });
}
export function advanceCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  expectedLap: number,
  count: 1 | 5 | "finish",
) {
  if (![1, 5, "finish"].includes(count)) throw new RaceError("INVALID_ACTION");
  return repository.changeRace(careerId, eventId, (data) => {
    if (!data.state || data.state.status !== "RUNNING")
      throw new RaceError("INVALID_ACTION");
    if (!isSupportedSimulationVersion(data.state.simulationVersion))
      throw new RaceError("UNSUPPORTED_VERSION");
    if (data.state.lap !== expectedLap) throw new RaceError("STALE");
    const event = data.progress.events.find((e) => e.id === eventId)!;
    const session = event.weekend!.sessions.find(
      (s) => s.id === data.sessionId,
    )!;
    if (
      session.status !== "IN_PROGRESS" ||
      event.status !== "CURRENT" ||
      data.progress.career.status !== "ACTIVE"
    )
      throw new RaceError("INVALID_ACTION");
    const state = advanceRace(
      data.state,
      count === "finish" ? data.state.input.totalLaps : count,
    );
    const progress =
      state.status === "FINISHED"
        ? transitionSession(
            data.progress,
            eventId,
            data.sessionId,
            "completeDevelopment",
          )
        : data.progress;
    return { state, labels: data.labels, progress };
  });
}

/** Version-2 compatibility entry point for tyre-only races. New browser races use v5 below. */
export function startTyreCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  choices: Readonly<Record<string, TyreCompound>> = {},
  seed?: number,
) {
  return startCareerRace(repository, careerId, eventId, seed, choices);
}

/** Version-3 compatibility entry point; no pit state is added to these races. */
export function startTrafficCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  choices: Readonly<Record<string, TyreCompound>> = {},
  seed?: number,
) {
  return startCareerRace(repository, careerId, eventId, seed, choices, true);
}

/** Version-4 compatibility starts snapshot v4 pit mechanics and temporary non-player strategy policy. */
export function startPitCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  choices: Readonly<Record<string, TyreCompound>> = {},
  seed?: number,
) {
  return startCareerRace(
    repository,
    careerId,
    eventId,
    seed,
    choices,
    true,
    true,
  );
}
export function changeCareerPitRequest(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  entrantId: string,
  expectedLap: number,
  expectedRevision: number,
  compound: TyreCompound | null,
) {
  if (
    !Number.isSafeInteger(expectedLap) ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedLap < 0 ||
    expectedRevision < 0 ||
    (compound !== null && !isTyreCompound(compound))
  )
    throw new RaceError("INVALID_INPUT");
  return repository.changeRace(careerId, eventId, (data) => {
    const state = data.state;
    if (
      !state ||
      ![4, 5, 6, 7].includes(state.simulationVersion) ||
      state.status !== "RUNNING" ||
      data.progress.career.status !== "ACTIVE"
    )
      throw new RaceError("INVALID_ACTION");
    const event = data.progress.events.find((e) => e.id === eventId)!;
    const session = event.weekend!.sessions.find(
      (s) => s.id === data.sessionId,
    )!;
    if (event.status !== "CURRENT" || session.status !== "IN_PROGRESS")
      throw new RaceError("INVALID_ACTION");
    const entrant = state.entrants.find((e) => e.entrantId === entrantId);
    const source = state.input.entrants.find((e) => e.entrantId === entrantId);
    if (
      !entrant?.pit || entrant.incident?.status === "RETIRED" ||
      source?.strategyController !== "PLAYER" ||
      source.teamId !== data.progress.career.playerTeamId
    )
      throw new RaceError("INVALID_ACTION");
    if (
      state.lap !== expectedLap ||
      entrant.pit.commandRevision !== expectedRevision
    )
      throw new RaceError("STALE");
    if (state.lap >= state.input.totalLaps - 1)
      throw new RaceError("INVALID_ACTION");
    if (compound && !state.input.tyres?.profiles[compound]) throw new RaceError("INVALID_INPUT");
    return {
      state: requestPitStop(state, entrantId, compound),
      labels: data.labels,
      progress: data.progress,
    };
  });
}

export function startCommandCareerRace(repository: CareerRaceRepository, careerId: string, eventId: string, choices: Readonly<Record<string, TyreCompound>> = {}, seed?: number) {
  return startCareerRace(repository, careerId, eventId, seed, choices, true, true, true);
}
type CommandIntent = { kind: "paceMode"; mode: PaceMode } | { kind: "fuelMode"; mode: FuelMode } | { kind: "ersMode"; mode: ErsMode };
function setCommand(repository: CareerRaceRepository, careerId: string, eventId: string, entrantId: string, lap: number, revision: number, intent: CommandIntent) {
  const modes: readonly string[] = intent.kind === "paceMode" ? PACE_MODES : intent.kind === "fuelMode" ? FUEL_MODES : ERS_MODES;
  if (!modes.includes(intent.mode) || !Number.isSafeInteger(lap) || lap < 0 || !Number.isSafeInteger(revision) || revision < 0) throw new RaceError("INVALID_INPUT");
  return repository.changeRace(careerId, eventId, data => {
    const s = data.state, event = data.progress.events.find(e => e.id === eventId);
    const e = s?.entrants.find(e => e.entrantId === entrantId), source = s?.input.entrants.find(e => e.entrantId === entrantId);
    if (!s || ![5,6,7].includes(s.simulationVersion) || s.status !== "RUNNING" || data.progress.career.status !== "ACTIVE" || event?.status !== "CURRENT" || event.weekend?.sessions.find(x => x.id === data.sessionId)?.status !== "IN_PROGRESS" || !e?.commands || e.incident?.status === "RETIRED" || source?.strategyController !== "PLAYER" || source.teamId !== data.progress.career.playerTeamId) throw new RaceError("INVALID_ACTION");
    if (s.lap !== lap || e.commands.commandRevision !== revision) throw new RaceError("STALE");
    return { state: { ...s, entrants: s.entrants.map(x => x.entrantId !== entrantId ? x : { ...x, commands: { ...x.commands!, [intent.kind]: intent.mode, commandRevision: revision + 1 } }) }, labels: data.labels, progress: data.progress };
  });
}
export function setDriverPaceMode(r: CareerRaceRepository, c: string, ev: string, e: string, lap: number, revision: number, mode: PaceMode) { return setCommand(r,c,ev,e,lap,revision,{kind:"paceMode",mode}); }
export function setDriverFuelMode(r: CareerRaceRepository, c: string, ev: string, e: string, lap: number, revision: number, mode: FuelMode) { return setCommand(r,c,ev,e,lap,revision,{kind:"fuelMode",mode}); }
export function setDriverErsMode(r: CareerRaceRepository, c: string, ev: string, e: string, lap: number, revision: number, mode: ErsMode) { return setCommand(r,c,ev,e,lap,revision,{kind:"ersMode",mode}); }

export function startWeatherCareerRace(repository: CareerRaceRepository, careerId: string, eventId: string, choices: Readonly<Record<string, TyreCompound>> = {}, seed?: number) {
 return startCareerRace(repository,careerId,eventId,seed,choices,true,true,true,true);
}

export function startIncidentCareerRace(repository: CareerRaceRepository, careerId: string, eventId: string, choices: Readonly<Record<string, TyreCompound>> = {}, seed?: number) {
 return startCareerRace(repository,careerId,eventId,seed,choices,true,true,true,true,true);
}

/**
 * Simulate (e.g. Simulate Sprint): the real v7 Race from a clean start with BOTH player cars auto-managed by the same
 * legal AI mechanics (commands, pit strategy, starting tyres), then run to the flag. No fake classification.
 */
export async function simulateCareerRace(repository: CareerRaceRepository, careerId: string, eventId: string, seed?: number) {
  await startCareerRace(repository, careerId, eventId, seed, {}, true, true, true, true, true, true);
  const data = await repository.getRace(careerId, eventId);
  if (!data?.state) throw new RaceError("NOT_FOUND");
  return advanceCareerRace(repository, careerId, eventId, data.state.lap, "finish");
}
/** Hands the player's cars to the fair AI controller (current information only; pending pit requests are kept). */
export function autoManagePlayerCars(state: RaceSimulationState): RaceSimulationState {
  return { ...state, input: { ...state.input, entrants: state.input.entrants.map((e) => e.strategyController === "PLAYER" ? { ...e, strategyController: "DEVELOPMENT_AI" as StrategyController } : e) } };
}
/**
 * Simulate Remainder / Finish: from the exact persisted checkpoint, both player cars become auto-managed for the rest
 * of the session (so they can still pit for weather), and the same v7 engine runs to the flag.
 */
export function simulateCareerRaceRemainder(repository: CareerRaceRepository, careerId: string, eventId: string, expectedLap?: number) {
  return repository.changeRace(careerId, eventId, (data) => {
    if (!data.state || data.state.status !== "RUNNING" || data.state.simulationVersion !== 7) throw new RaceError("INVALID_ACTION");
    if (expectedLap !== undefined && data.state.lap !== expectedLap) throw new RaceError("STALE");
    const event = data.progress.events.find((e) => e.id === eventId)!;
    const session = event.weekend!.sessions.find((s) => s.id === data.sessionId)!;
    if (session.status !== "IN_PROGRESS" || event.status !== "CURRENT" || data.progress.career.status !== "ACTIVE") throw new RaceError("INVALID_ACTION");
    const state = advanceRace(autoManagePlayerCars(data.state), data.state.input.totalLaps);
    return { state, labels: data.labels, progress: transitionSession(data.progress, eventId, data.sessionId, "completeDevelopment") };
  });
}

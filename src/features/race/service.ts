import { ENERGY_POLICIES, type EnergyPolicy } from '../../simulation/race/assistance/model';
import { progressionForCircuit, progressionBForCircuit, progressionCForCircuit, progressionDForCircuit, progressionEForCircuit } from '../../data/seed/circuit-progression';
import { hasAssistance, type ProgressionRevision } from '../../simulation/race/progression/revision';
import { defaultRacecraftConfiguration } from "../../simulation/race/traffic/racecraft";
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
import { aiDryStartingCompound, aiWetStartingCompound, defaultAiStrategyConfiguration, publicWeather, strategyPreference } from "../../simulation/race/pits/ai-strategy";
import { v8dTuningBundle } from "./v8d-tuning";
import { v8eTuningBundle } from "./v8e-tuning";
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
/** The v8D bundle with the incident configuration it has always frozen (accepted defaults + the circuit's pit section). */
function withSection<T extends { readonly pitTiming: { readonly pitTrackSectionMs: number } }>(b: T) {
  return { ...b, incidents: { ...defaultIncidentConfiguration(), pitTrackSectionMs: b.pitTiming.pitTrackSectionMs } };
}
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
  /** Progression revision to freeze: true = 1 (v8A), 2 = v8B, 3 = v8C, 4 = v8D, 5 = v8E (production). */
  withProgression: boolean | Exclude<ProgressionRevision, 1> = false,
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
          ? careerRaceWeather(data.progress.career.id, eventId, data.circuit.sourceCircuitId ?? "custom", snapshot.input.totalLaps, data.kind, data.circuit.climateProfile)
          : developmentWeather(seed, snapshot.input.totalLaps)
        : undefined;
      // The progression revision is chosen explicitly and frozen; a saved Race is never upgraded. Revision 3+ snapshots
      // the regulation of THIS session (Grand Prix or Sprint), never inferred from the circuit.
      const progression = withTraffic && withProgression
        ? withProgression === 5 ? progressionEForCircuit(data.circuit.sourceCircuitId, data.kind ?? 'RACE')
          : withProgression === 4 ? progressionDForCircuit(data.circuit.sourceCircuitId, data.kind ?? 'RACE')
          : withProgression === 3 ? progressionCForCircuit(data.circuit.sourceCircuitId, data.kind ?? 'RACE')
          : withProgression === 2 ? progressionBForCircuit(data.circuit.sourceCircuitId)
          : progressionForCircuit(data.circuit.sourceCircuitId)
        : undefined;
      // Revisions 4 (v8D) and 5 (v8E) each freeze ONE coherent tuning bundle; revisions 1–3 keep their accepted
      // configurations exactly. A bundle's incident configuration carries the circuit's pit track section.
      const v8d = progression && withProgression === 5
        ? v8eTuningBundle(progression, snapshot.input.circuit.baseLapTimeMs, !!withWeather, data.circuit.raceProfile)
        : progression && withProgression === 4 ? withSection(v8dTuningBundle(progression, snapshot.input.circuit.baseLapTimeMs, !!withWeather, data.circuit.raceProfile)) : null;
      // AI teams pick starting tyres from current public grid conditions, never from player input or future weather.
      // Career Races (v7) also give each AI car its own stable strategic character: on a dry grid a strong soft
      // preference starts on the soft (never the hard). Wet or damp grids keep the current-conditions choice.
      const startingCompound = (driverId: string, teamId: string, gridPosition: number) => {
        // Auto-managed player cars (Simulate) start like any AI car: from current public conditions and character.
        if (!(withIncidents && weather && (autoPlayer || teamId !== data.progress.career.playerTeamId))) return tyreChoices?.[driverId] ?? "MEDIUM";
        const compound = aiStartingCompound(weather.initial), preference = strategyPreference(seed, gridPosition);
        if (compound === "MEDIUM") return aiDryStartingCompound(preference);
        // v8D: on a wet grid the car's own wet-compound trait may choose between two sensible wet tyres (current grid
        // conditions only). Earlier revisions keep the established current-conditions choice.
        return v8d ? aiWetStartingCompound(compound, weather.initial, v8d.tyres, publicWeather(weather), v8d.strategy, preference) : compound;
      };
      const input = tyreChoices
        ? {
            ...snapshot.input,
            tyres: v8d ? v8d.tyres : withWeather ? weatherTyreConfiguration() : defaultTyreConfiguration(),
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
                // v8D: the incident model's pit track section is the circuit's own (SC/VSC reduced stops).
                ...(withIncidents ? { incidents: v8d ? v8d.incidents : defaultIncidentConfiguration() } : {}),
                ...(progression ? { progression } : {}),
                ...(weather ? { weather } : {}),
                // Career Races (v7) also freeze the racecraft tuning (close-racing pressure, selective AI aggression).
                ...(withCommands ? { commands: withIncidents ? { ...defaultCommandConfiguration(), racecraft: v8d ? v8d.racecraft : defaultRacecraftConfiguration() } : defaultCommandConfiguration(), initialFuelKg: developmentCommandFuelKg(input.initialFuelKg) } : {}),
                // Career Races (v7) freeze the AI pit strategy and the Career circuit's Race interaction identity
                // (neutral defaults when the Career predates it). Older Race versions keep their historical inputs.
                // v8D: circuit-derived green pit-lane loss and the v8D strategy (wet character); earlier revisions: 19.5 s.
                ...(withPits ? { pits: withIncidents ? v8d ? { ...defaultPitConfiguration(), pitLaneLossMs: v8d.pitTiming.pitLaneLossMs, strategy: v8d.strategy } : { ...defaultPitConfiguration(), strategy: defaultAiStrategyConfiguration() } : defaultPitConfiguration() } : {}),
                // v8D / v8E: legacy DRS is inert in the revision-4/5 snapshot (2026: Active Aero / Overtake Mode / Boost).
                interaction: withIncidents ? v8d ? v8d.interaction : circuitInteractionConfiguration(data.circuit.raceProfile) : defaultInteractionConfiguration(),
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
      ![4, 5, 6, 7, 8].includes(state.simulationVersion) ||
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
    if (state.simulationVersion === 8 && state.progression?.cars[entrantId]?.compound) throw new RaceError('INVALID_ACTION');
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
type CommandIntent = { kind: "paceMode"; mode: PaceMode } | { kind: "fuelMode"; mode: FuelMode } | { kind: "ersMode"; mode: ErsMode } | { kind:"energyPolicy";mode:EnergyPolicy };
function setCommand(repository: CareerRaceRepository, careerId: string, eventId: string, entrantId: string, lap: number, revision: number, intent: CommandIntent) {
  const modes: readonly string[] = intent.kind === "paceMode" ? PACE_MODES : intent.kind === "fuelMode" ? FUEL_MODES : intent.kind==="energyPolicy"?ENERGY_POLICIES:ERS_MODES;
  if (!modes.includes(intent.mode) || !Number.isSafeInteger(lap) || lap < 0 || !Number.isSafeInteger(revision) || revision < 0) throw new RaceError("INVALID_INPUT");
  return repository.changeRace(careerId, eventId, data => {
    const s = data.state, event = data.progress.events.find(e => e.id === eventId);
    const e = s?.entrants.find(e => e.entrantId === entrantId), source = s?.input.entrants.find(e => e.entrantId === entrantId);
    if (!s || ![5,6,7,8].includes(s.simulationVersion) || s.status !== "RUNNING" || data.progress.career.status !== "ACTIVE" || event?.status !== "CURRENT" || event.weekend?.sessions.find(x => x.id === data.sessionId)?.status !== "IN_PROGRESS" || !e?.commands || e.incident?.status === "RETIRED" || source?.strategyController !== "PLAYER" || source.teamId !== data.progress.career.playerTeamId) throw new RaceError("INVALID_ACTION");
    // Revisions 2 and 3 use the v8 assistance controls; legacy ERS stays a revision-1 / pre-v8 control.
    if((intent.kind==='energyPolicy'&&!hasAssistance(s.input.progression))||(intent.kind==='ersMode'&&hasAssistance(s.input.progression)))throw new RaceError('INVALID_ACTION');
    if (s.lap !== lap || e.commands.commandRevision !== revision) throw new RaceError("STALE");
    return { state: { ...s,...(intent.kind==='energyPolicy'?{progression:{...s.progression!,cars:{...s.progression!.cars,[entrantId]:{...s.progression!.cars[entrantId],assistance:{...s.progression!.cars[entrantId].assistance!,policy:intent.mode}}}}}:{}), entrants: s.entrants.map(x => x.entrantId !== entrantId ? x : { ...x, commands: { ...x.commands!,...(intent.kind==='energyPolicy'?{}:{[intent.kind]:intent.mode}), commandRevision: revision + 1 } }) }, labels: data.labels, progress: data.progress };
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
    if (!data.state || data.state.status !== "RUNNING" || ![7,8].includes(data.state.simulationVersion)) throw new RaceError("INVALID_ACTION");
    if (expectedLap !== undefined && data.state.lap !== expectedLap) throw new RaceError("STALE");
    const event = data.progress.events.find((e) => e.id === eventId)!;
    const session = event.weekend!.sessions.find((s) => s.id === data.sessionId)!;
    if (session.status !== "IN_PROGRESS" || event.status !== "CURRENT" || data.progress.career.status !== "ACTIVE") throw new RaceError("INVALID_ACTION");
    const state = advanceRace(autoManagePlayerCars(data.state), data.state.input.totalLaps);
    return { state, labels: data.labels, progress: transitionSession(data.progress, eventId, data.sessionId, "completeDevelopment") };
  });
}

/** Production creation entry point: new Race / Sprint sessions freeze v8 progression revision 5 (v8E) — the v8C
 * regulation and energy plus the v8E tuning bundle. Explicit historical helpers remain for fixtures and compatibility
 * tooling (revisions 4, 3 and 2 below, revision 1 / v7 through `startCareerRace`); an existing Race is never upgraded. */
export function startProgressionCareerRace(repository: CareerRaceRepository, careerId: string, eventId: string, choices: Readonly<Record<string, TyreCompound>> = {}, seed?: number) {
  return startCareerRace(repository,careerId,eventId,seed,choices,true,true,true,true,true,false,5);
}
/** Historical (accepted v8D) revision-4 creation, for compatibility fixtures and tests only — never production. It
 * freezes the accepted v8D bundle exactly (tyres, strategy, racecraft incl. the late window, pit timing, DRS-inert
 * interaction). */
export function startRevision4CareerRace(repository: CareerRaceRepository, careerId: string, eventId: string, choices: Readonly<Record<string, TyreCompound>> = {}, seed?: number) {
  return startCareerRace(repository,careerId,eventId,seed,choices,true,true,true,true,true,false,4);
}
/** Historical (accepted v8C) revision-3 creation, for compatibility fixtures and tests only — never production. It
 * freezes the accepted v8C configuration exactly (tyres, 19.5 s pit loss, strategy, racecraft, incidents). */
export function startRevision3CareerRace(repository: CareerRaceRepository, careerId: string, eventId: string, choices: Readonly<Record<string, TyreCompound>> = {}, seed?: number) {
  return startCareerRace(repository,careerId,eventId,seed,choices,true,true,true,true,true,false,3);
}
/** Historical (accepted v8B) revision-2 creation, for compatibility fixtures and tests only — never production. */
export function startRevision2CareerRace(repository: CareerRaceRepository, careerId: string, eventId: string, choices: Readonly<Record<string, TyreCompound>> = {}, seed?: number) {
  return startCareerRace(repository,careerId,eventId,seed,choices,true,true,true,true,true,false,2);
}
export async function simulateProgressionCareerRace(repository: CareerRaceRepository, careerId: string, eventId: string, seed?: number) {
  await startCareerRace(repository,careerId,eventId,seed,{},true,true,true,true,true,true,5);
  const data=await repository.getRace(careerId,eventId);
  if(!data?.state) throw new RaceError('NOT_FOUND');
  return advanceCareerRace(repository,careerId,eventId,data.state.lap,'finish');
}

export function setDriverEnergyPolicy(r:CareerRaceRepository,c:string,ev:string,e:string,lap:number,revision:number,mode:EnergyPolicy) { return setCommand(r,c,ev,e,lap,revision,{kind:'energyPolicy',mode}); }

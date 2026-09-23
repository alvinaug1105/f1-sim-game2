import { advanceIncidentLap } from "./incidents/engine";
import { validateIncidentConfiguration, validateReliability, initialIncidentRace, initialEntrantIncident } from "./incidents/model";
import { advanceWeather, validateWeatherConfiguration, advanceWeatherTyre, waterPenaltyMs } from "./weather/model";
import { initialCommands, validateCommandConfiguration, commandLapEffects } from "./commands/model";
import { chooseAiCommands } from "./commands/policy";
import {
  initialPitState,
  committedStops,
  completePitLap,
  validatePitControllers,
} from "./pits/model";
import { validatePitConfiguration } from "./pits/profiles";
import {
  validateInteraction,
  validateDriverInteraction,
  initialTrackState,
  orderedClassification,
  resolveTraffic,
} from "./traffic/model";
import {
  validateTyreConfiguration,
  validateTyreState,
  getTyreProfile,
  tyreContributions,
  advanceTyre,
  type TyreState,
  type TyreCompoundProfile,
} from "./tyres/model";
import { createSeededRandom, type RandomSource } from "../core/random";
import type {
  RaceSimulationInput,
  RaceSimulationState,
  RaceEntrantState,
  RaceResult,
  RaceParameters,
  RaceCircuitProfile,
  DriverPerformanceProfile,
  CarPerformanceProfile,
} from "./types";
export const SIMULATION_VERSION = 7;
export function isSupportedSimulationVersion(version: number) {
  return version === 7 || version === 1 || version === 2 || version === 3 || version === 4 || version === 5 || version === 6;
}
/** Versioned Phase 5 free-air tuning. Penalties are relative to a 100-rated baseline. */
export const DEFAULT_RACE_PARAMETERS: RaceParameters = Object.freeze({
  carPerformanceRangeMs: 3000,
  driverPerformanceRangeMs: 1500,
  minVariationMs: 30,
  maxVariationMs: 350,
  gridOffsetMs: 180,
});
function bounded(n: number, min: number, max: number, integer = false) {
  if (
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isSafeInteger(n))
  )
    throw new RangeError("Invalid race simulation numeric input");
}
function validateProfiles(
  driver: DriverPerformanceProfile,
  car: CarPerformanceProfile,
  circuit: RaceCircuitProfile,
  parameters: RaceParameters,
  fuel: number,
) {
  for (const n of [driver.pace, driver.consistency, car.performance])
    bounded(n, 0, 100);
  bounded(circuit.baseLapTimeMs, 1000, 600000, true);
  bounded(circuit.fuelEffectMsPerKg, 0, 100);
  bounded(fuel, 0, 1000);
  bounded(parameters.carPerformanceRangeMs, 0, 10000, true);
  bounded(parameters.driverPerformanceRangeMs, 0, 10000, true);
  bounded(parameters.minVariationMs, 0, 500, true);
  bounded(parameters.maxVariationMs, parameters.minVariationMs, 500, true);
  bounded(parameters.gridOffsetMs, 0, 10000, true);
}
export function validateRaceInput(input: RaceSimulationInput) {
  if (input.incidents) { validateIncidentConfiguration(input.incidents); if (!input.weather) throw new RangeError("Incidents require weather"); for (const e of input.entrants) { if (!e.reliability) throw new RangeError("Missing reliability"); validateReliability(e.reliability); } }
  if (input.weather) {
    validateWeatherConfiguration(input.weather,input.totalLaps);
    if (!input.commands || !input.tyres?.profiles.INTERMEDIATE || !input.tyres?.profiles.WET) throw new RangeError("Weather requires complete v6 profiles");
  }
  if (!input.weather && input.entrants.some(e => e.startingTyre && ["INTERMEDIATE","WET"].includes(e.startingTyre.compound))) throw new RangeError("Wet tyres require v6");
  if (input.commands) {
    validateCommandConfiguration(input.commands);
    if (!input.pits) throw new RangeError("Commands require pit model");
  }
  if (input.pits) {
    validatePitConfiguration(input.pits);
    validatePitControllers(input);
    if (!input.interaction || !input.tyres)
      throw new RangeError("Pit model requires tyres and traffic");
  } else if (input.entrants.some((e) => e.strategyController))
    throw new RangeError("Unexpected strategy controller");
  if (input.interaction) {
    validateInteraction(input.interaction);
    if (!input.tyres) throw new RangeError("Traffic requires tyres");
  }
  if (input.tyres) validateTyreConfiguration(input.tyres);
  bounded(input.seed, 0, 0xffffffff, true);
  bounded(input.totalLaps, 1, 1000, true);
  bounded(input.initialFuelKg, 0, 1000);
  bounded(input.fuelBurnPerLapKg, 0, 20);
  if (
    Math.abs(
      input.initialFuelKg * 1000 - Math.round(input.initialFuelKg * 1000),
    ) > 1e-8 ||
    Math.abs(
      input.fuelBurnPerLapKg * 1000 - Math.round(input.fuelBurnPerLapKg * 1000),
    ) > 1e-8
  )
    throw new RangeError("Fuel precision is one gram");
  bounded(input.entrants.length, 1, 100, true);
  const ids = new Set<string>(),
    drivers = new Set<string>(),
    grids = new Set<number>();
  for (const e of input.entrants) {
    if (input.interaction) {
      if (!e.interaction)
        throw new RangeError("Missing driver interaction profile");
      validateDriverInteraction(e.interaction);
    } else if (e.interaction)
      throw new RangeError("Unexpected interaction profile");
    if (input.tyres) {
      if (!e.startingTyre)
        throw new RangeError("Starting tyre is required for version 2");
      validateTyreState(e.startingTyre);
      if (e.startingTyre.ageLaps + input.totalLaps > 100000)
        throw new RangeError("Tyre age exceeds supported race length");
    } else if (e.startingTyre)
      throw new RangeError("Tyre state requires tyre configuration");
    if (
      ![e.entrantId, e.driverId, e.teamId].every(
        (id) => typeof id === "string" && id.trim() === id && id.length > 0,
      ) ||
      ids.has(e.entrantId) ||
      drivers.has(e.driverId) ||
      grids.has(e.gridPosition)
    )
      throw new RangeError("Race identities and grid must be unique");
    ids.add(e.entrantId);
    drivers.add(e.driverId);
    grids.add(e.gridPosition);
    bounded(e.gridPosition, 1, input.entrants.length, true);
    validateProfiles(
      e.driver,
      e.car,
      input.circuit,
      input.parameters,
      input.initialFuelKg,
    );
  }
}
/** Triangular zero-centred variation: two independent uniform draws; bounded [-1,1). */
export function triangularVariation(random: RandomSource): number {
  const a = random.next(),
    b = random.next();
  bounded(a, 0, 1);
  bounded(b, 0, 1);
  if (a === 1 || b === 1)
    throw new RangeError("RandomSource must return values below one");
  return a + b - 1;
}
export function calculateLapTime(
  input: {
    driver: DriverPerformanceProfile;
    car: CarPerformanceProfile;
    circuit: RaceCircuitProfile;
    parameters: RaceParameters;
    fuelMassKg: number;
    tyre?: { state: TyreState; profile: TyreCompoundProfile };
  },
  random: RandomSource,
) {
  const { driver, car, circuit, parameters, fuelMassKg } = input;
  validateProfiles(driver, car, circuit, parameters, fuelMassKg);
  const tyreEffects = input.tyre
    ? tyreContributions(input.tyre.state, input.tyre.profile)
    : { tyreCompoundMs: 0, tyreWearMs: 0, tyreTemperatureMs: 0 };
  const baseMs = circuit.baseLapTimeMs;
  const carEffectMs = Math.round(
    ((100 - car.performance) / 100) * parameters.carPerformanceRangeMs,
  );
  const driverEffectMs = Math.round(
    ((100 - driver.pace) / 100) * parameters.driverPerformanceRangeMs,
  );
  const fuelEffectMs = Math.round(fuelMassKg * circuit.fuelEffectMsPerKg);
  const amplitude =
    parameters.minVariationMs +
    ((100 - driver.consistency) / 100) *
      (parameters.maxVariationMs - parameters.minVariationMs);
  const variationMs = Math.round(triangularVariation(random) * amplitude);
  return {
    lapTimeMs: Math.max(
      1,
      baseMs +
        carEffectMs +
        driverEffectMs +
        fuelEffectMs +
        variationMs +
        tyreEffects.tyreCompoundMs +
        tyreEffects.tyreWearMs +
        tyreEffects.tyreTemperatureMs,
    ),
    ...tyreEffects,
    baseMs,
    carEffectMs,
    driverEffectMs,
    fuelEffectMs,
    variationMs,
  };
}
/** Gaps are null across lap counts; this engine advances all entrants together. */
export function classify(
  entrants: readonly RaceEntrantState[],
): readonly RaceEntrantState[] {
  const ordered = [...entrants].sort(
    (a, b) =>
      b.completedLaps - a.completedLaps ||
      a.elapsedTimeMs - b.elapsedTimeMs ||
      (a.entrantId < b.entrantId ? -1 : a.entrantId > b.entrantId ? 1 : 0),
  );
  return ordered.map((e, i) => ({
    ...e,
    position: i + 1,
    gapToLeaderMs:
      e.completedLaps === ordered[0].completedLaps
        ? e.elapsedTimeMs - ordered[0].elapsedTimeMs
        : null,
    intervalToAheadMs:
      i === 0
        ? 0
        : e.completedLaps === ordered[i - 1].completedLaps
          ? e.elapsedTimeMs - ordered[i - 1].elapsedTimeMs
          : null,
  }));
}
export function createRace(input: RaceSimulationInput): RaceSimulationState {
  validateRaceInput(input);
  const snapshot = structuredClone(input);
  return {
    ...(snapshot.weather ? { weather: structuredClone(snapshot.weather.initial) } : {}),
    ...(input.incidents ? { incidents: initialIncidentRace(input.seed) } : {}),
    simulationVersion: input.incidents ? 7 : input.weather ? 6 : input.commands ? 5 : input.pits
      ? 4
      : input.interaction
        ? 3
        : input.tyres
          ? 2
          : 1,
    input: snapshot,
    rngState: input.seed,
    lap: 0,
    status: "RUNNING",
    entrants: (input.interaction
      ? (entries: RaceEntrantState[]) =>
          orderedClassification(
            entries.sort((a, b) => a.position - b.position),
            input,
          )
      : classify)(
      snapshot.entrants.map((e) => ({
        ...(input.incidents ? { incident: initialEntrantIncident() } : {}),
        ...(snapshot.tyres
          ? {
              stint: {
                number: 1,
                startedAtLap: 0,
                tyre: structuredClone(e.startingTyre!),
              },
            }
          : {}),
        ...(snapshot.interaction ? { track: initialTrackState() } : {}),
        ...(snapshot.pits ? { pit: initialPitState(e.startingTyre!) } : {}),
        ...(snapshot.commands ? { commands: initialCommands(snapshot.commands) } : {}),
        entrantId: e.entrantId,
        completedLaps: 0,
        elapsedTimeMs: (e.gridPosition - 1) * input.parameters.gridOffsetMs,
        lastLapTimeMs: null,
        bestLapTimeMs: null,
        fuelMassKg: input.initialFuelKg,
        position: e.gridPosition,
        gapToLeaderMs: 0,
        intervalToAheadMs: 0,
      })),
    ),
  };
}
export function advanceRaceLap(
  state: RaceSimulationState,
): RaceSimulationState {
  if (state.simulationVersion === 7) return advanceIncidentLap(state);
  if (state.simulationVersion >= 3 !== Boolean(state.input.interaction))
    throw new RangeError("Interaction version mismatch");
  if ((state.simulationVersion >= 4) !== Boolean(state.input.pits))
    throw new RangeError("Pit version mismatch");
  if (!isSupportedSimulationVersion(state.simulationVersion))
    throw new RangeError("Unsupported simulation version");
  if (state.simulationVersion >= 2 && !state.input.tyres)
    throw new RangeError("Version 2 requires saved tyre configuration");
  if (state.simulationVersion === 1 && state.input.tyres)
    throw new RangeError("Version 1 cannot acquire tyres");
  if (state.status !== "RUNNING" || state.lap >= state.input.totalLaps)
    throw new RangeError("Race has already finished");
  if ((state.simulationVersion >= 5) !== Boolean(state.input.commands)) throw new RangeError("Command version mismatch");
  if (state.simulationVersion >= 5) state = chooseAiCommands(state);
  if ((state.simulationVersion === 6) !== Boolean(state.input.weather) || Boolean(state.input.weather) !== Boolean(state.weather)) throw new RangeError("Weather version mismatch");
  const stops = state.simulationVersion >= 4 ? committedStops(state) : new Map();
  const nextWeather = state.input.weather ? advanceWeather(state.weather!,state.input.weather,state.lap+1) : undefined;
  const trafficInput = nextWeather?.drsState === "DRS_DISABLED_WET" ? {...state.input, interaction:{...state.input.interaction!,drsZoneCount:0}} : state.input;
  bounded(state.lap, 0, state.input.totalLaps - 1, true);
  const random = createSeededRandom(state.rngState),
    lap = state.lap + 1;
  const current = new Map(state.entrants.map((e) => [e.entrantId, e]));
  // Draw order is fixed by grid, never by a changing classification or input array order.
  const entrants = [...state.input.entrants]
    .sort((a, b) => a.gridPosition - b.gridPosition)
    .map((e) => {
      const old = current.get(e.entrantId);
      if (!old || old.completedLaps !== state.lap)
        throw new RangeError("Inconsistent entrant lap state");
      if (state.simulationVersion >= 2 && !old.stint)
        throw new RangeError("Missing persisted stint state");
      const effects = state.input.commands ? commandLapEffects(old, state.input.fuelBurnPerLapKg, state.input.commands, stops.has(e.entrantId)) : null;
      const pace = state.input.commands?.pace[old.commands!.paceMode];
      const result = calculateLapTime(
        {
          ...e,
          circuit: state.input.circuit,
          parameters: state.input.parameters,
          fuelMassKg: old.fuelMassKg,
          ...(state.simulationVersion >= 2
            ? {
                tyre: {
                  state: old.stint!.tyre,
                  profile: getTyreProfile(
                    state.input.tyres!,
                    old.stint!.tyre.compound,
                  ),
                },
              }
            : {}),
        },
        random,
      );
      if (nextWeather) result.lapTimeMs += waterPenaltyMs(old.stint!.tyre.compound,nextWeather.trackWater,state.input.weather!);
      const tyreConfig = pace ? { ...state.input.tyres!, tyreWearMultiplierPermille: Math.round(state.input.tyres!.tyreWearMultiplierPermille * pace.tyreWearMultiplierPermille / 1000), tyreEnergyMultiplierPermille: Math.round(state.input.tyres!.tyreEnergyMultiplierPermille * pace.tyreEnergyMultiplierPermille / 1000) } : state.input.tyres!;
      if (effects) result.lapTimeMs = Math.max(1, result.lapTimeMs + effects.deltaMs);
      return {
        ...old,
        ...(effects ? { commands: effects.commands } : {}),
        ...(state.simulationVersion >= 2
          ? {
              stint: {
                ...old.stint!,
                tyre: nextWeather ? advanceWeatherTyre(old.stint!.tyre,tyreConfig,nextWeather,state.input.weather!) : advanceTyre(old.stint!.tyre,tyreConfig),
              },
            }
          : {}),
        completedLaps: lap,
        elapsedTimeMs: old.elapsedTimeMs + result.lapTimeMs,
        lastLapTimeMs: result.lapTimeMs,
        bestLapTimeMs: Math.min(
          old.bestLapTimeMs ?? result.lapTimeMs,
          result.lapTimeMs,
        ),
        fuelMassKg: effects ? effects.fuelMassKg :
          Math.max(
            0,
            Math.round(state.input.initialFuelKg * 1000) -
              lap * Math.round(state.input.fuelBurnPerLapKg * 1000),
          ) / 1000,
      };
    });
  let classified: readonly RaceEntrantState[];
  if (state.simulationVersion >= 4) {
    const committed = stops;
    const previousOnTrack = [...state.entrants]
      .sort((a, b) => a.position - b.position)
      .filter((e) => !committed.has(e.entrantId))
      .map((e, i) => ({ ...e, position: i + 1 }));
    const potentialOnTrack = entrants.filter(
      (e) => !committed.has(e.entrantId),
    );
    const onTrack = resolveTraffic(
      previousOnTrack,
      potentialOnTrack,
      trafficInput,
      lap,
      random,
    ).entrants;
    classified = completePitLap(state, entrants, onTrack, committed, random);
  } else
    classified =
      state.simulationVersion === 3
        ? resolveTraffic(state.entrants, entrants, state.input, lap, random)
            .entrants
        : classify(entrants);
  return {
    ...state,
    ...(nextWeather ? { weather: nextWeather } : {}),
    lap,
    rngState: random.getState(),
    status: lap === state.input.totalLaps ? "FINISHED" : "RUNNING",
    entrants: classified,
  };
}
export function advanceRace(
  state: RaceSimulationState,
  laps: number,
): RaceSimulationState {
  bounded(laps, 1, 1000, true);
  let next = state;
  for (let i = 0; i < laps && next.status !== "FINISHED"; i++)
    next = advanceRaceLap(next);
  return next;
}
export function raceResult(state: RaceSimulationState): readonly RaceResult[] {
  if (state.status !== "FINISHED")
    throw new RangeError("Race result requires a finished race");
  return state.entrants.map((e) => {
    const source = state.input.entrants.find(
      (s) => s.entrantId === e.entrantId,
    )!;
    return {
      ...(e.incident ? { status: e.incident.status, completedLaps: e.completedLaps } : {}),
      position: e.position,
      entrantId: e.entrantId,
      driverId: source.driverId,
      teamId: source.teamId,
      totalTimeMs: e.elapsedTimeMs,
      bestLapTimeMs: e.bestLapTimeMs!,
    };
  });
}
export function simulateRace(input: RaceSimulationInput) {
  const state = advanceRace(createRace(input), input.totalLaps);
  return { state, result: raceResult(state) };
}

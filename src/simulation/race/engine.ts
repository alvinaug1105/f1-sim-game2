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
export const SIMULATION_VERSION = 1;
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
  },
  random: RandomSource,
) {
  const { driver, car, circuit, parameters, fuelMassKg } = input;
  validateProfiles(driver, car, circuit, parameters, fuelMassKg);
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
      baseMs + carEffectMs + driverEffectMs + fuelEffectMs + variationMs,
    ),
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
    simulationVersion: SIMULATION_VERSION,
    input: snapshot,
    rngState: input.seed,
    lap: 0,
    status: "RUNNING",
    entrants: classify(
      snapshot.entrants.map((e) => ({
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
  if (state.simulationVersion !== SIMULATION_VERSION)
    throw new RangeError("Unsupported simulation version");
  if (state.status !== "RUNNING" || state.lap >= state.input.totalLaps)
    throw new RangeError("Race has already finished");
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
      const result = calculateLapTime(
        {
          ...e,
          circuit: state.input.circuit,
          parameters: state.input.parameters,
          fuelMassKg: old.fuelMassKg,
        },
        random,
      );
      return {
        ...old,
        completedLaps: lap,
        elapsedTimeMs: old.elapsedTimeMs + result.lapTimeMs,
        lastLapTimeMs: result.lapTimeMs,
        bestLapTimeMs: Math.min(
          old.bestLapTimeMs ?? result.lapTimeMs,
          result.lapTimeMs,
        ),
        fuelMassKg:
          Math.max(
            0,
            Math.round(state.input.initialFuelKg * 1000) -
              lap * Math.round(state.input.fuelBurnPerLapKg * 1000),
          ) / 1000,
      };
    });
  return {
    ...state,
    lap,
    rngState: random.getState(),
    status: lap === state.input.totalLaps ? "FINISHED" : "RUNNING",
    entrants: classify(entrants),
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

import type { CareerRaceData } from "../../game/domain/race-repository";
import { DEFAULT_RACE_PARAMETERS } from "../../simulation/race/engine";
import type { RaceSimulationInput } from "../../simulation/race/types";
/** Temporary development performance, based on roster order and team entry order, never names or special IDs. Shared by Race and Practice. */
export function developmentPerformance(index: number, teamOrder: number) {
  return {
    driver: { pace: 92 - (index % 6) * 1.5, consistency: 88 + (index % 4) * 2 },
    car: { performance: 92 - ((teamOrder - 1) % 8) * 2 },
  };
}
/** Development base lap time from circuit length (Race and Practice share it). */
export function developmentBaseLapTimeMs(lengthMeters: number) {
  return Math.round((lengthMeters / 60) * 1000);
}
/** Temporary version-1 profiles, based on roster order, never names or special IDs. */
export function developmentRaceInput(
  data: CareerRaceData,
  seed: number,
  newId: () => string,
) {
  const totalLaps = data.circuit.defaultLapCount;
  const fuelBurnPerLapKg =
    Math.round((data.circuit.lengthMeters / 1000) * 0.3 * 1000) / 1000;
  const initialFuelKg = Math.round(fuelBurnPerLapKg * totalLaps * 1000) / 1000;
  const input: RaceSimulationInput = {
    seed,
    totalLaps,
    initialFuelKg,
    fuelBurnPerLapKg,
    parameters: { ...DEFAULT_RACE_PARAMETERS },
    circuit: {
      baseLapTimeMs: developmentBaseLapTimeMs(data.circuit.lengthMeters),
      fuelEffectMsPerKg: 30,
    },
    entrants: data.roster.map((row, index) => ({
      entrantId: newId(),
      driverId: row.driverId,
      teamId: row.teamId,
      gridPosition: index + 1,
      ...developmentPerformance(index, row.teamOrder),
    })),
  };
  return {
    input,
    labels: input.entrants.map((entrant, index) => ({
      entrantId: entrant.entrantId,
      driverName: data.roster[index].driverName,
      teamName: data.roster[index].teamName,
    })),
  };
}

/** v5 creation-only reserve; total initial fuel is then frozen in RaceSimulationInput. */
export function developmentCommandFuelKg(baselineKg: number) {
  const reservePermille = 50, minimumReserveGrams = 2000;
  return (Math.round(baselineKg * 1000) + Math.max(minimumReserveGrams, Math.round(baselineKg * reservePermille))) / 1000;
}

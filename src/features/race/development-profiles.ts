import type { CareerRaceData, RosterBalance } from "../../game/domain/race-repository";
import { DEFAULT_RACE_PARAMETERS } from "../../simulation/race/engine";
import type { RaceSimulationInput } from "../../simulation/race/types";
/** Temporary development performance, based on roster order and team entry order, never names or special IDs. Shared by Race and Practice. */
export function developmentPerformance(index: number, teamOrder: number) {
  return {
    driver: { pace: 92 - (index % 6) * 1.5, consistency: 88 + (index % 4) * 2 },
    car: { performance: 92 - ((teamOrder - 1) % 8) * 2 },
  };
}
/**
 * Entrant performance for a new session. Careers created since Content Expansion Pass A carry snapshotted balance
 * data (development values from the source season entries); older Careers have none and keep the exact legacy
 * profile above, so their sessions are unchanged. Never derived from names.
 */
export function entrantPerformance(row: { readonly balance?: RosterBalance | null; readonly teamOrder: number }, index: number) {
  return row.balance
    ? { driver: { pace: row.balance.pace, consistency: row.balance.consistency }, car: { performance: row.balance.carPerformance } }
    : developmentPerformance(index, row.teamOrder);
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
  // A completed real Qualifying sets the grid when it covers exactly this roster; otherwise the legacy roster order.
  const grid =
    data.grid &&
    data.grid.length === data.roster.length &&
    data.roster.every((row) => data.grid!.includes(row.driverId))
      ? data.grid
      : null;
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
    // Performance keeps each driver's roster index (legacy profile); only the starting order comes from Qualifying.
    entrants: data.roster
      .map((row, index) => ({
        entrantId: newId(),
        driverId: row.driverId,
        teamId: row.teamId,
        gridPosition: grid ? grid.indexOf(row.driverId) + 1 : index + 1,
        ...entrantPerformance(row, index),
      }))
      .sort((a, b) => a.gridPosition - b.gridPosition),
  };
  const rosterOf = (driverId: string) => data.roster.find((row) => row.driverId === driverId)!;
  return {
    input,
    labels: input.entrants.map((entrant) => ({
      entrantId: entrant.entrantId,
      driverName: rosterOf(entrant.driverId).driverName,
      teamName: rosterOf(entrant.driverId).teamName,
    })),
  };
}

/** v5 creation-only reserve; total initial fuel is then frozen in RaceSimulationInput. */
export function developmentCommandFuelKg(baselineKg: number) {
  const reservePermille = 50, minimumReserveGrams = 2000;
  return (Math.round(baselineKg * 1000) + Math.max(minimumReserveGrams, Math.round(baselineKg * reservePermille))) / 1000;
}

import type { RaceEntrantState, RaceSimulationState } from "../types";
export const PACE_MODES = ["CONSERVE", "LIGHT", "STANDARD", "PUSH", "ATTACK"] as const;
export const FUEL_MODES = ["CONSERVE", "BALANCED", "PUSH"] as const;
export const ERS_MODES = ["HARVEST", "NEUTRAL", "DEPLOY", "OVERTAKE"] as const;
export type PaceMode = typeof PACE_MODES[number];
export type FuelMode = typeof FUEL_MODES[number];
export type ErsMode = typeof ERS_MODES[number];
export interface CommandState { paceMode: PaceMode; fuelMode: FuelMode; ersMode: ErsMode; ersCharge: number; commandRevision: number }
export interface CommandConfiguration {
  version: 1;
  pace: Record<PaceMode, { lapTimeDeltaMs: number; tyreWearMultiplierPermille: number; tyreEnergyMultiplierPermille: number }>;
  fuel: Record<FuelMode, { lapTimeDeltaMs: number; burnMultiplierPermille: number }>;
  ers: Record<ErsMode, { lapTimeDeltaMs: number; recoveryPermille: number; consumption: number }>;
  capacity: number; initialCharge: number; baseRecovery: number;
  ersHarvestFactorPermille: number; ersDeploymentEffectivenessPermille: number;
  exhaustionPenaltyMs: number;
  ai: { lowCharge: number; battleGapMs: number; highWear: number; lateLaps: number; surplusGrams: number };
}
/** Provisional version-one tuning, copied into every v5 race. */
export function defaultCommandConfiguration(): CommandConfiguration {
  return {
    version: 1,
    pace: {
      CONSERVE: { lapTimeDeltaMs: 650, tyreWearMultiplierPermille: 650, tyreEnergyMultiplierPermille: 650 },
      LIGHT: { lapTimeDeltaMs: 300, tyreWearMultiplierPermille: 820, tyreEnergyMultiplierPermille: 820 },
      STANDARD: { lapTimeDeltaMs: 0, tyreWearMultiplierPermille: 1000, tyreEnergyMultiplierPermille: 1000 },
      PUSH: { lapTimeDeltaMs: -300, tyreWearMultiplierPermille: 1250, tyreEnergyMultiplierPermille: 1250 },
      ATTACK: { lapTimeDeltaMs: -550, tyreWearMultiplierPermille: 1550, tyreEnergyMultiplierPermille: 1550 },
    },
    fuel: { CONSERVE: { lapTimeDeltaMs: 450, burnMultiplierPermille: 850 }, BALANCED: { lapTimeDeltaMs: 0, burnMultiplierPermille: 1000 }, PUSH: { lapTimeDeltaMs: -250, burnMultiplierPermille: 1150 } },
    ers: { HARVEST: { lapTimeDeltaMs: 400, recoveryPermille: 2000, consumption: 0 }, NEUTRAL: { lapTimeDeltaMs: 0, recoveryPermille: 1000, consumption: 60 }, DEPLOY: { lapTimeDeltaMs: -450, recoveryPermille: 1000, consumption: 180 }, OVERTAKE: { lapTimeDeltaMs: -850, recoveryPermille: 1000, consumption: 300 } },
    capacity: 1000, initialCharge: 700, baseRecovery: 60,
    ersHarvestFactorPermille: 1000, ersDeploymentEffectivenessPermille: 1000,
    exhaustionPenaltyMs: 120000,
    ai: { lowCharge: 250, battleGapMs: 1500, highWear: 700, lateLaps: 10, surplusGrams: 3000 },
  };
}
function integer(n: number, lo: number, hi: number) { if (!Number.isSafeInteger(n) || n < lo || n > hi) throw new RangeError("Invalid command numeric state"); }
export function validateCommandConfiguration(c: CommandConfiguration) {
  if (c.version !== 1) throw new RangeError("Unsupported command profile");
  for (const m of PACE_MODES) { const p = c.pace[m]; integer(p.lapTimeDeltaMs, -5000, 5000); integer(p.tyreWearMultiplierPermille, 250, 3000); integer(p.tyreEnergyMultiplierPermille, 250, 3000); }
  for (const m of FUEL_MODES) { integer(c.fuel[m].lapTimeDeltaMs, -5000, 5000); integer(c.fuel[m].burnMultiplierPermille, 100, 3000); }
  for (const m of ERS_MODES) { const e = c.ers[m]; integer(e.lapTimeDeltaMs, -5000, 5000); integer(e.recoveryPermille, 0, 3000); integer(e.consumption, 0, 1000); }
  integer(c.capacity, 1, 1000); integer(c.initialCharge, 0, c.capacity); integer(c.baseRecovery, 0, 1000);
  integer(c.ersHarvestFactorPermille, 0, 3000); integer(c.ersDeploymentEffectivenessPermille, 0, 3000); integer(c.exhaustionPenaltyMs, 60000, 600000);
  integer(c.ai.lowCharge, 0, c.capacity); integer(c.ai.battleGapMs, 0, 10000); integer(c.ai.highWear, 0, 1000); integer(c.ai.lateLaps, 1, 1000); integer(c.ai.surplusGrams, 0, 100000);
}
export function validateCommandState(s: CommandState, c: CommandConfiguration) {
  if (!PACE_MODES.includes(s.paceMode) || !FUEL_MODES.includes(s.fuelMode) || !ERS_MODES.includes(s.ersMode)) throw new RangeError("Invalid command mode");
  integer(s.ersCharge, 0, c.capacity); integer(s.commandRevision, 0, 2147483646);
}
export function initialCommands(c: CommandConfiguration): CommandState { return { paceMode: "STANDARD", fuelMode: "BALANCED", ersMode: "NEUTRAL", ersCharge: c.initialCharge, commandRevision: 0 }; }
export function fuelBurnGrams(baseKg: number, mode: FuelMode, c: CommandConfiguration) { return Math.round(Math.round(baseKg * 1000) * c.fuel[mode].burnMultiplierPermille / 1000); }
export function projectedFuelGrams(s: RaceSimulationState, e: RaceEntrantState, mode = e.commands!.fuelMode) { return Math.round(e.fuelMassKg * 1000) - fuelBurnGrams(s.input.fuelBurnPerLapKg, mode, s.input.commands!) * (s.input.totalLaps - s.lap); }
/** Energy recovered this lap becomes available next lap; empty deployment earns no free boost. */
export function commandLapEffects(e: RaceEntrantState, baseKg: number, c: CommandConfiguration, pitLap: boolean) {
  const s = e.commands!; validateCommandState(s, c);
  const burn = fuelBurnGrams(baseKg, s.fuelMode, c), fuel = Math.round(e.fuelMassKg * 1000);
  const profile = c.ers[s.ersMode];
  // Pit-route laps recover normally but suppress deployment/pace effect (saved mode remains).
  const used = pitLap ? 0 : Math.min(s.ersCharge, profile.consumption);
  const recovery = Math.round(c.baseRecovery * profile.recoveryPermille * c.ersHarvestFactorPermille / 1000000);
  const ersMs = pitLap ? 0 : profile.lapTimeDeltaMs >= 0 ? profile.lapTimeDeltaMs : Math.round(profile.lapTimeDeltaMs * (profile.consumption ? used / profile.consumption : 0) * c.ersDeploymentEffectivenessPermille / 1000);
  return {
    deltaMs: c.pace[s.paceMode].lapTimeDeltaMs + c.fuel[s.fuelMode].lapTimeDeltaMs + ersMs + (fuel < burn ? c.exhaustionPenaltyMs : 0),
    fuelMassKg: Math.max(0, fuel - burn) / 1000,
    commands: { ...s, ersCharge: Math.max(0, Math.min(c.capacity, s.ersCharge - used + recovery)) },
  };
}

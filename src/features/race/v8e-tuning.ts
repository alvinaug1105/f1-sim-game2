/**
 * Race v8E production tuning bundle (progression revision 5). One coherent set of snapshotted configuration frozen into
 * each NEW revision-5 Race / Sprint; the engine only reads the Race's own snapshots, never a revision number:
 *
 * - tyres: v8D cliff thresholds kept; v8E pre-cliff degradation shape;
 * - AI pit strategy: v8E weather / dry strategy character;
 * - racecraft: attack cadence (cooldown + re-arm + per-lap cap, scaled by the circuit's overtaking difficulty), held-
 *   following drop-back, no late-Race window; a SPRINT session also freezes the Sprint tactical AI policy;
 * - interaction: the circuit's traffic identity with legacy DRS inert (as v8D);
 * - pit timing: circuit-derived (the v8D formula, unchanged);
 * - incidents: v8E Safety Car compression / duration, with the circuit's pit track section.
 *
 * Weather, regulation and energy are the existing ones. Revisions 1–4 never receive any of this.
 * All numbers are GAME TUNING (see docs/race-v8e-final-tuning.md).
 */
import type { ProgressionConfiguration } from "../../simulation/race/progression/model";
import { hasV8eSemantics } from "../../simulation/race/progression/revision";
import { v8eTyreConfiguration, v8eWeatherTyreConfiguration } from "../../simulation/race/tyres/profiles";
import { v8eAiStrategyConfiguration, type AiStrategyConfiguration } from "../../simulation/race/pits/ai-strategy";
import { v8eRacecraftConfiguration, v8eSprintRacecraftConfiguration, type RacecraftConfiguration } from "../../simulation/race/traffic/racecraft";
import { circuitPitTiming, type CircuitPitTiming } from "../../simulation/race/pits/circuit-timing";
import { v8dCircuitInteractionConfiguration, type CircuitRaceProfile } from "../../simulation/race/traffic/profiles";
import { v8eIncidentConfiguration, type IncidentConfiguration } from "../../simulation/race/incidents/model";
import type { TyreConfiguration } from "../../simulation/race/tyres/model";
import type { InteractionConfiguration } from "../../simulation/race/traffic/model";

export interface V8eTuningBundle {
  readonly tyres: TyreConfiguration;
  readonly strategy: AiStrategyConfiguration;
  readonly racecraft: RacecraftConfiguration;
  readonly pitTiming: CircuitPitTiming;
  readonly interaction: InteractionConfiguration;
  readonly incidents: IncidentConfiguration;
}
export function v8eTuningBundle(progression: ProgressionConfiguration, baseLapTimeMs: number, weather: boolean, raceProfile?: CircuitRaceProfile | null): V8eTuningBundle {
  if (!hasV8eSemantics(progression)) throw new RangeError("v8E tuning requires progression revision 5");
  const pitTiming = circuitPitTiming(progression.pit, baseLapTimeMs);
  return {
    tyres: weather ? v8eWeatherTyreConfiguration() : v8eTyreConfiguration(),
    strategy: v8eAiStrategyConfiguration(),
    // The session is already frozen in the progression snapshot (its regulation), never inferred from the circuit.
    racecraft: progression.regulation?.session === "SPRINT" ? v8eSprintRacecraftConfiguration() : v8eRacecraftConfiguration(),
    pitTiming,
    interaction: v8dCircuitInteractionConfiguration(raceProfile),
    incidents: v8eIncidentConfiguration(pitTiming.pitTrackSectionMs),
  };
}

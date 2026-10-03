/**
 * Race v8D production tuning bundle (progression revision 4). One coherent set of snapshotted configuration frozen into
 * each NEW revision-4 Race / Sprint, instead of scattered revision checks:
 *
 * - tyres: the v8D cliff calibration (weather Races include explicit intermediate / full-wet curves);
 * - AI pit strategy: the accepted strategy plus the wet-weather character (weather risk, intermediate vs full wet);
 * - racecraft: the accepted racecraft plus the late-Race attack window;
 * - pit timing: derived from the circuit's authoritative progression pit anchors and base lap, feeding BOTH the pit
 *   lane loss and the incident model's pit track section (SC/VSC reduced stops).
 *
 * Weather, regulation, energy and every other system are the existing ones. Revisions 1–3 never receive any of this.
 * All numbers are GAME TUNING (see docs/race-v8d-tuning.md).
 */
import type { ProgressionConfiguration } from "../../simulation/race/progression/model";
import { hasV8dTuning } from "../../simulation/race/progression/revision";
import { v8dTyreConfiguration, v8dWeatherTyreConfiguration } from "../../simulation/race/tyres/profiles";
import { v8dAiStrategyConfiguration, type AiStrategyConfiguration } from "../../simulation/race/pits/ai-strategy";
import { v8dRacecraftConfiguration, type RacecraftConfiguration } from "../../simulation/race/traffic/racecraft";
import { circuitPitTiming, type CircuitPitTiming } from "../../simulation/race/pits/circuit-timing";
import type { TyreConfiguration } from "../../simulation/race/tyres/model";

export interface V8dTuningBundle {
  readonly tyres: TyreConfiguration;
  readonly strategy: AiStrategyConfiguration;
  readonly racecraft: RacecraftConfiguration;
  readonly pitTiming: CircuitPitTiming;
}
export function v8dTuningBundle(progression: ProgressionConfiguration, baseLapTimeMs: number, weather: boolean): V8dTuningBundle {
  if (!hasV8dTuning(progression)) throw new RangeError("v8D tuning requires progression revision 4");
  return {
    tyres: weather ? v8dWeatherTyreConfiguration() : v8dTyreConfiguration(),
    strategy: v8dAiStrategyConfiguration(),
    racecraft: v8dRacecraftConfiguration(),
    pitTiming: circuitPitTiming(progression.pit, baseLapTimeMs),
  };
}

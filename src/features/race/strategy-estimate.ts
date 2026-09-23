import { effectivePitLaneLoss } from "../../simulation/race/incidents/model";
import { advanceWeatherTyre } from "../../simulation/race/weather/model";
import type {
  RaceSimulationState,
  RaceEntrantState,
} from "../../simulation/race/types";
/** Presentation-only estimate: laps to the current compound's cliff, not a pit command. */
export function estimatePitWindow(
  state: RaceSimulationState,
  e: RaceEntrantState,
) {
  const tyre = e.stint!.tyre,
    c = state.input.tyres!,
    p = c.profiles[tyre.compound],
    pit = state.input.pits!;
  const laneLoss = state.incidents ? effectivePitLaneLoss(state) : pit.pitLaneLossMs;
  const wearPerLap = state.weather && state.input.weather ? Math.max(1, advanceWeatherTyre({...tyre, wearPermille: 0}, {...c, tyreWearMultiplierPermille: Math.round(c.tyreWearMultiplierPermille * state.input.commands!.pace[e.commands!.paceMode].tyreWearMultiplierPermille / 1000)}, state.weather, state.input.weather).wearPermille) : Math.max(
    1,
    Math.round(
      (p.baseWearPerLapPermille * Math.round(c.tyreWearMultiplierPermille * (state.input.commands && e.commands ? state.input.commands.pace[e.commands.paceMode].tyreWearMultiplierPermille : 1000) / 1000)) / 1000,
    ),
  );
  return {
    lapsToCliff: Math.max(
      0,
      Math.ceil((p.cliffWear - tyre.wearPermille) / wearPerLap),
    ),
    minimumLossMs:
      laneLoss + pit.stationaryBaseMs - pit.stationaryVariationMs,
    maximumLossMs:
      laneLoss + pit.stationaryBaseMs + pit.stationaryVariationMs,
  };
}

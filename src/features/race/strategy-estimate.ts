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
  const wearPerLap = Math.max(
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
      pit.pitLaneLossMs + pit.stationaryBaseMs - pit.stationaryVariationMs,
    maximumLossMs:
      pit.pitLaneLossMs + pit.stationaryBaseMs + pit.stationaryVariationMs,
  };
}

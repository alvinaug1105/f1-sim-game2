import { effectivePitLaneLoss } from "../../simulation/race/incidents/model";
import { PACE_MODES, type PaceMode } from "../../simulation/race/commands/model";
import { advanceWeatherTyre } from "../../simulation/race/weather/model";
import type {
  RaceSimulationState,
  RaceEntrantState,
} from "../../simulation/race/types";
/**
 * Presentation-only estimate: laps to the current compound's cliff (at the car's CURRENT pace mode, plus the range over
 * every pace mode, since tyre life depends on how hard the car is driven), the pit loss, and an estimated rejoin
 * region from CURRENT public timing gaps only. Never a pit command or a prediction of future events.
 */
export function estimatePitWindow(
  state: RaceSimulationState,
  e: RaceEntrantState,
) {
  const at = (paceMode: PaceMode) => lapsToCliffAt(state, { ...e, commands: e.commands ? { ...e.commands, paceMode } : e.commands });
  const current = lapsToCliffAt(state, e);
  const range = state.input.commands && e.commands ? PACE_MODES.map(at) : [current];
  const pit = state.input.pits!, laneLoss = state.incidents ? effectivePitLaneLoss(state) : pit.pitLaneLossMs;
  const minimumLossMs = laneLoss + pit.stationaryBaseMs - pit.stationaryVariationMs, maximumLossMs = laneLoss + pit.stationaryBaseMs + pit.stationaryVariationMs;
  return {
    lapsToCliff: current,
    lapsToCliffMin: Math.min(...range),
    lapsToCliffMax: Math.max(...range),
    paceMode: e.commands?.paceMode ?? null,
    minimumLossMs,
    maximumLossMs,
    rejoin: estimateRejoin(state, e, minimumLossMs, maximumLossMs),
  };
}
/**
 * Estimated rejoin region if the car stopped now: its current gap to the leader plus the pit loss, placed among the
 * other running cars' CURRENT gaps (same information the timing tower shows). Null for a lapped / unclassified car.
 */
export function estimateRejoin(state: RaceSimulationState, e: RaceEntrantState, minimumLossMs: number, maximumLossMs: number): { best: number; worst: number } | null {
  if (e.gapToLeaderMs === null) return null;
  const others = state.entrants.filter(x => x.entrantId !== e.entrantId && x.incident?.status !== "RETIRED" && x.incident?.status !== "FINISHED" && x.gapToLeaderMs !== null && x.completedLaps >= e.completedLaps - 1);
  const place = (lossMs: number) => 1 + others.filter(x => x.gapToLeaderMs! <= e.gapToLeaderMs! + lossMs).length;
  return { best: place(minimumLossMs), worst: place(maximumLossMs) };
}
function lapsToCliffAt(state: RaceSimulationState, e: RaceEntrantState) {
  const tyre = e.stint!.tyre,
    c = state.input.tyres!,
    p = c.profiles[tyre.compound];
  const wearPerLap = state.weather && state.input.weather ? Math.max(1, advanceWeatherTyre({...tyre, wearPermille: 0}, {...c, tyreWearMultiplierPermille: Math.round(c.tyreWearMultiplierPermille * state.input.commands!.pace[e.commands!.paceMode].tyreWearMultiplierPermille / 1000)}, state.weather, state.input.weather).wearPermille) : Math.max(
    1,
    Math.round(
      (p.baseWearPerLapPermille * Math.round(c.tyreWearMultiplierPermille * (state.input.commands && e.commands ? state.input.commands.pace[e.commands.paceMode].tyreWearMultiplierPermille : 1000) / 1000)) / 1000,
    ),
  );
  return Math.max(0, Math.ceil((p.cliffWear - tyre.wearPermille) / wearPerLap));
}

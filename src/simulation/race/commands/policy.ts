import type { RaceSimulationState } from "../types";
import { projectedFuelGrams } from "./model";
/** Choices only; identical resource mechanics apply to every entrant. No RNG. */
export function chooseAiCommands(state: RaceSimulationState): RaceSimulationState {
  const c = state.input.commands!;
  return { ...state, entrants: state.entrants.map(e => {
    if (state.input.entrants.find(x => x.entrantId === e.entrantId)!.strategyController !== "DEVELOPMENT_AI") return e;
    const ahead = e.position > 1 && e.intervalToAheadMs !== null && e.intervalToAheadMs <= c.ai.battleGapMs;
    const behind = state.entrants.find(x => x.position === e.position + 1);
    const defending = behind?.intervalToAheadMs != null && behind.intervalToAheadMs <= c.ai.battleGapMs;
    const fuel = projectedFuelGrams(state, e, "BALANCED");
    return { ...e, commands: { ...e.commands!,
      paceMode: e.stint!.tyre.wearPermille >= c.ai.highWear ? "LIGHT" : ahead || defending ? "PUSH" : "STANDARD",
      fuelMode: fuel < 0 ? "CONSERVE" : state.input.totalLaps - state.lap <= c.ai.lateLaps && fuel > c.ai.surplusGrams ? "PUSH" : "BALANCED",
      ersMode: e.commands!.ersCharge < c.ai.lowCharge ? "HARVEST" : ahead ? "OVERTAKE" : defending ? "DEPLOY" : "NEUTRAL",
    } };
  }) };
}

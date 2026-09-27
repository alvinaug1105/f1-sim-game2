import type { RaceEntrantState, RaceSimulationState } from "../types";
import type { RacecraftConfiguration } from "../traffic/racecraft";
import { commandPaceMs, projectedFuelGrams, type CommandConfiguration, type CommandState } from "./model";
/**
 * Racecraft AI roles (new Career Races). A car in a train attacks only with a genuine basis — it was held back last
 * lap, or it has a clearly fresher tyre on the car ahead — and spends OVERTAKE only with the charge to do so. A car
 * under direct threat from such an attacker defends with DEPLOY. Everyone else runs its normal race (no mirroring of
 * maximum aggression). Reads only Race state; identical mechanics for every car; no RNG; no names or identity.
 */
function racecraftModes(state: RaceSimulationState, e: RaceEntrantState, r: RacecraftConfiguration, c: CommandConfiguration): Pick<CommandState, "paceMode" | "ersMode"> {
  const lowCharge = c.ai.lowCharge;
  const byPosition = (p: number) => state.entrants.find((x) => x.position === p);
  // A car recently passed does not answer the passer with an all-out counter-attack on the "held" basis alone (the
  // passer had the better pace); a clearly fresher tyre remains a genuine basis.
  const justPassedBy = (car: RaceEntrantState, ahead: RaceEntrantState) =>
    (state.incidents?.events ?? []).some((ev) => ev.type === "OVERTAKE" && state.lap - ev.lap < r.aiCounterAttackCooldownLaps && ev.entrantIds[0] === ahead.entrantId && ev.entrantIds[1] === car.entrantId);
  // Being held back is a genuine pace edge only when the car was NOT already on attack commands (otherwise the
  // commands themselves created the closing speed): attacks come in short, charge-limited bursts.
  const heldOnMerit = (car: RaceEntrantState) =>
    (car.track?.trafficLossMs ?? 0) >= r.aiHeldEdgeMs && car.commands?.paceMode !== "PUSH" && car.commands?.ersMode !== "OVERTAKE";
  const tyreEdge = (car: RaceEntrantState, ahead: RaceEntrantState) =>
    !!car.stint && !!ahead.stint && car.stint.tyre.compound === ahead.stint.tyre.compound && ahead.stint.tyre.ageLaps - car.stint.tyre.ageLaps >= r.aiTyreAgeEdgeLaps;
  const hasEdge = (car: RaceEntrantState, ahead: RaceEntrantState | undefined) =>
    !!ahead && car.intervalToAheadMs !== null && car.intervalToAheadMs <= r.aiAttackGapMs &&
    (tyreEdge(car, ahead) || (heldOnMerit(car) && !justPassedBy(car, ahead)));
  const ahead = byPosition(e.position - 1), behind = byPosition(e.position + 1);
  const attacking = hasEdge(e, ahead);
  // A genuine closing threat also comes from the car behind running attack commands (ATTACK / PUSH / DEPLOY /
  // OVERTAKE worth at least aiThreatEdgeMs of lap time with the charge it actually has) — read from Race state for
  // whichever car is behind, never from who drives it.
  const closingThreat = (car: RaceEntrantState) => r.aiThreatEdgeMs !== undefined && !!car.commands && -commandPaceMs(car.commands, c) >= r.aiThreatEdgeMs;
  const threatened = !!behind && behind.intervalToAheadMs !== null && behind.intervalToAheadMs <= r.aiDefendGapMs && (hasEdge(behind, e) || closingThreat(behind));
  const charge = e.commands!.ersCharge;
  // Heavy harvesting (a slow lap) is for clear air: in a fight, a low battery holds NEUTRAL instead.
  const pressed = !!behind && behind.intervalToAheadMs !== null && behind.intervalToAheadMs <= r.aiDefendGapMs;
  const low = pressed ? "NEUTRAL" : "HARVEST";
  if (attacking) return { paceMode: "PUSH", ersMode: charge >= r.aiOvertakeCharge ? "OVERTAKE" : charge >= lowCharge ? "DEPLOY" : "NEUTRAL" };
  if (threatened) return { paceMode: "PUSH", ersMode: charge >= lowCharge ? "DEPLOY" : "NEUTRAL" };
  return { paceMode: "STANDARD", ersMode: charge < lowCharge ? low : "NEUTRAL" };
}
/** Choices only; identical resource mechanics apply to every entrant. No RNG. */
export function chooseAiCommands(state: RaceSimulationState): RaceSimulationState {
  const c = state.input.commands!;
  return { ...state, entrants: state.entrants.map(e => {
    if (state.input.entrants.find(x => x.entrantId === e.entrantId)!.strategyController !== "DEVELOPMENT_AI") return e;
    const fuel = projectedFuelGrams(state, e, "BALANCED");
    const fuelMode = fuel < 0 ? "CONSERVE" : state.input.totalLaps - state.lap <= c.ai.lateLaps && fuel > c.ai.surplusGrams ? "PUSH" : "BALANCED";
    if (c.racecraft) {
      const modes = racecraftModes(state, e, c.racecraft, c);
      return { ...e, commands: { ...e.commands!, fuelMode, ersMode: modes.ersMode, paceMode: e.stint!.tyre.wearPermille >= c.ai.highWear ? "LIGHT" : modes.paceMode } };
    }
    const ahead = e.position > 1 && e.intervalToAheadMs !== null && e.intervalToAheadMs <= c.ai.battleGapMs;
    const behind = state.entrants.find(x => x.position === e.position + 1);
    const defending = behind?.intervalToAheadMs != null && behind.intervalToAheadMs <= c.ai.battleGapMs;
    return { ...e, commands: { ...e.commands!,
      paceMode: e.stint!.tyre.wearPermille >= c.ai.highWear ? "LIGHT" : ahead || defending ? "PUSH" : "STANDARD",
      fuelMode,
      ersMode: e.commands!.ersCharge < c.ai.lowCharge ? "HARVEST" : ahead ? "OVERTAKE" : defending ? "DEPLOY" : "NEUTRAL",
    } };
  }) };
}

import type { RaceEntrantState, RaceSimulationInput } from "../types";
import {
  advanceTyre,
  tyreContributions,
  TYRE_COMPOUNDS,
  type TyreState,
  type TyreCompound,
} from "../tyres/model";
/** Temporary deterministic policy; invokes the same pit mechanics as manual commands.
 * Estimate only tyre contributions, without traffic prediction or strategic bonuses.
 */
export function developmentPitChoice(
  entrant: RaceEntrantState,
  input: RaceSimulationInput,
  lap: number,
): TyreCompound | null {
  const p = input.pits!,
    tyres = input.tyres!;
  const current = entrant.stint!.tyre;
  const remaining = input.totalLaps - lap - 1; // request commits after next completed lap
  if (
    remaining < 1 ||
    current.wearPermille < p.aiWearThresholdPermille ||
    lap - entrant.stint!.startedAtLap < p.aiMinimumStintLaps
  )
    return null;
  function cost(start: TyreState) {
    let t = start,
      total = 0;
    for (let n = 0; n < remaining; n++) {
      const x = tyreContributions(t, tyres.profiles[t.compound]);
      total += x.tyreCompoundMs + x.tyreWearMs + x.tyreTemperatureMs;
      t = advanceTyre(t, tyres);
    }
    return total;
  }
  const oldCost = cost(advanceTyre(current, tyres));
  const options = TYRE_COMPOUNDS.map((compound) => ({
    compound,
    cost: cost({
      compound,
      ageLaps: 0,
      wearPermille: 0,
      temperatureMilliC: p.newTyreTemperatureMilliC,
    }),
  }));
  options.sort(
    (a, b) =>
      a.cost - b.cost ||
      TYRE_COMPOUNDS.indexOf(a.compound) - TYRE_COMPOUNDS.indexOf(b.compound),
  );
  return oldCost - options[0].cost > p.pitLaneLossMs + p.stationaryBaseMs
    ? options[0].compound
    : null;
}

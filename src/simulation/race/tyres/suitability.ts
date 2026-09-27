/**
 * Current-condition tyre suitability: the single source of truth for "which tyre family suits the track now".
 *
 * Each family is represented by its fastest compound on a fresh tyre at the temperature it settles at in the CURRENT
 * conditions, and is scored with the Race engine's own lap-time terms: compound grip, temperature penalty and the
 * water penalty. Only current conditions are read (track water, track temperature) — never the weather timeline,
 * a forecast or RNG. Runs on the server; the browser receives only the qualitative result.
 */
import { getTyreProfile, tyreContributions, WEATHER_TYRE_COMPOUNDS, type TyreCompound, type TyreConfiguration } from "./model";
import { waterPenaltyMs, weatherTyreTargetMilliC, type WeatherConfiguration, type WeatherState } from "../weather/model";
import { TYRE_FAMILIES, tyreFamily, type Suitability, type TyreFamily, type TyreFamilyAssessment } from "./family";
export { TYRE_FAMILIES, tyreFamily, type Suitability, type TyreFamily, type TyreFamilyAssessment };
/**
 * A family within this much of the fastest family is SUITABLE (both are fine near a crossover); the gap is also the
 * hysteresis for crossover alerts, so it is centred on the real performance crossover. Beyond MARGINAL_MS it is POOR.
 */
export const SUITABLE_MS = 250;
export const MARGINAL_MS = 1500;
/** Representative current-condition lap-time cost (ms) of one compound: fresh, at its settled temperature. */
export function currentCompoundCostMs(compound: TyreCompound, weather: Pick<WeatherState, "trackWater" | "trackTemperatureMilliC">, tyres: TyreConfiguration, w: Pick<WeatherConfiguration, "waterProfiles" | "circuit">) {
  const c = tyreContributions({ compound, ageLaps: 0, wearPermille: 0, temperatureMilliC: weatherTyreTargetMilliC(compound, weather, w) }, getTyreProfile(tyres, compound));
  return c.tyreCompoundMs + c.tyreWearMs + c.tyreTemperatureMs + waterPenaltyMs(compound, weather.trackWater, w);
}
/** Cost of each family (its fastest available compound) in the current conditions. */
export function familyCostsMs(weather: Pick<WeatherState, "trackWater" | "trackTemperatureMilliC">, tyres: TyreConfiguration, w: Pick<WeatherConfiguration, "waterProfiles" | "circuit">) {
  const costs: Partial<Record<TyreFamily, number>> = {};
  for (const compound of WEATHER_TYRE_COMPOUNDS) {
    if (!tyres.profiles[compound] || !w.waterProfiles[compound]) continue;
    const family = tyreFamily(compound), cost = currentCompoundCostMs(compound, weather, tyres, w);
    costs[family] = Math.min(costs[family] ?? Infinity, cost);
  }
  return costs;
}
/** Fastest family now, and each family's qualitative level against it. Ties resolve DRY → INTERMEDIATE → WET. */
export function assessTyreFamilies(weather: Pick<WeatherState, "trackWater" | "trackTemperatureMilliC">, tyres: TyreConfiguration, w: Pick<WeatherConfiguration, "waterProfiles" | "circuit">): TyreFamilyAssessment | null {
  const costs = familyCostsMs(weather, tyres, w), known = TYRE_FAMILIES.filter(f => costs[f] !== undefined);
  if (known.length < TYRE_FAMILIES.length) return null;
  const best = known.reduce((a, b) => costs[b]! < costs[a]! ? b : a);
  const level = (f: TyreFamily): Suitability => { const gap = costs[f]! - costs[best]!; return gap <= SUITABLE_MS ? "SUITABLE" : gap <= MARGINAL_MS ? "MARGINAL" : "POOR"; };
  return { best, levels: { DRY: level("DRY"), INTERMEDIATE: level("INTERMEDIATE"), WET: level("WET") } };
}

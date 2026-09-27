/**
 * Race forecast wording from the PUBLIC forecast windows and the CURRENT rain only (presentation; no truth timeline).
 * A dry grid is never told "rain easing": windows that bring no meaningful rain are only worth mentioning while it is
 * raining (then they mean the rain is easing). Meaningful rain reads "expected" when even the low end of the window
 * is rain, otherwise "possible".
 */
import type { ForecastWindow } from "../../simulation/race/weather/model";
/** Rain intensity (‰) from which a window is worth announcing as rain. Presentation threshold only. */
export const MEANINGFUL_RAIN = 200;
export type ForecastLabel = "weather.expected" | "weather.possible" | "weather.easing";
export interface ForecastItem { readonly label: ForecastLabel; readonly window: ForecastWindow }
export function forecastItems(windows: readonly ForecastWindow[] | null | undefined, currentRainfall: number): ForecastItem[] {
    const raining = currentRainfall >= MEANINGFUL_RAIN;
    return (windows ?? []).flatMap((window): ForecastItem[] => {
        if (window.rainfallMax < MEANINGFUL_RAIN) return raining ? [{ label: "weather.easing", window }] : [];
        if (raining && window.rainfallMax < currentRainfall) return [{ label: "weather.easing", window }];
        return [{ label: window.rainfallMin >= MEANINGFUL_RAIN ? "weather.expected" : "weather.possible", window }];
    });
}
/** Message when nothing meaningful is forecast: no rain on a dry track, otherwise no change. */
export function quietForecastKey(currentRainfall: number) { return currentRainfall >= MEANINGFUL_RAIN ? "prep.noRain" as const : "weather.noRain" as const; }

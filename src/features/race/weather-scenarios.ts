/**
 * Deterministic Race-weather scenarios (input generation only; the v7 weather engine is unchanged).
 *
 * Career play derives a weather seed from stable identity (Career, event, circuit), picks one of several weather
 * stories from it, and freezes the resulting configuration into the Race input when the Race starts. The same identity
 * always produces the same timeline and forecast; a started Race keeps its persisted configuration forever.
 * No Math.random, wall-clock time, locale or React state.
 */
import { createSeededRandom } from "../../simulation/core/random";
import { developmentWeather, type WeatherConfiguration, type WeatherSegment, type WeatherState } from "../../simulation/race/weather/model";
import type { TyreCompound } from "../../simulation/race/tyres/model";
export const WEATHER_SCENARIOS = ["DRY", "MOSTLY_DRY", "LIGHT_INTERMITTENT", "MIXED", "LATE_SHOWER", "WET"] as const;
export type WeatherScenario = typeof WEATHER_SCENARIOS[number];
/** Relative frequency (out of 100): not every race rains. */
const WEIGHTS: Readonly<Record<WeatherScenario, number>> = { DRY: 32, MOSTLY_DRY: 18, LIGHT_INTERMITTENT: 14, MIXED: 14, LATE_SHOWER: 12, WET: 10 };
/** FNV-1a (32-bit) over stable identity strings. */
export function raceWeatherSeed(parts: readonly string[]) {
    let hash = 0x811c9dc5;
    for (const char of parts.join("␟")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
    return hash >>> 0;
}
export function scenarioFor(seed: number): WeatherScenario {
    let roll = seed % 100;
    for (const scenario of WEATHER_SCENARIOS) { roll -= WEIGHTS[scenario]; if (roll < 0) return scenario; }
    return "DRY";
}
/** Rain segments as (fraction of race distance, rainfall) pairs; the first segment always starts on lap 1. */
function story(scenario: WeatherScenario, next: () => number): readonly (readonly [number, number])[] {
    const jitter = (spread: number) => (next() - .5) * spread, amount = (base: number, spread: number) => Math.round(base + jitter(spread));
    switch (scenario) {
        case "DRY": return [[0, 0]];
        case "MOSTLY_DRY": { const at = .38 + jitter(.2); return [[0, 0], [at, amount(230, 80)], [at + .06 + jitter(.03), 0]]; }
        case "LIGHT_INTERMITTENT": { const a = .15 + jitter(.1), b = .5 + jitter(.12); return [[0, 0], [a, amount(380, 120)], [a + .1, 0], [b, amount(420, 120)], [b + .1, 0]]; }
        case "LATE_SHOWER": { const at = .68 + jitter(.12); return [[0, 0], [at, amount(640, 160)], [at + .12, amount(180, 80)]]; }
        case "WET": return [[0, amount(760, 120)], [.35 + jitter(.1), amount(920, 80)], [.7 + jitter(.1), amount(480, 140)]];
        case "MIXED": return [];
    }
}
/** The configuration a Race will freeze at start. MIXED reuses the established development weather story. */
export function scenarioWeather(seed: number, totalLaps: number, scenario: WeatherScenario = scenarioFor(seed)): WeatherConfiguration {
    const base = developmentWeather(seed, totalLaps);
    if (scenario === "MIXED") return base;
    const rng = createSeededRandom((seed ^ 0x5eed7a11) >>> 0), next = () => rng.next();
    const air = 18000 + Math.round(next() * 12) * 1000; // 18–30 °C, whole degrees
    const timeline: WeatherSegment[] = [];
    for (const [fraction, rainfall] of story(scenario, next)) {
        const startLap = Math.max(1, Math.min(totalLaps, Math.round(1 + fraction * (totalLaps - 1))));
        if (timeline.length && startLap <= timeline[timeline.length - 1].startLap) continue;
        timeline.push({ startLap, rainfall: Math.max(0, Math.min(1000, rainfall)), airTemperatureMilliC: rainfall > 0 ? air - 4000 : air });
    }
    // Forecast windows: approximate arrival and intensity ranges around the truth, as in the development weather.
    const { lapUncertainty, intensityUncertainty } = base.forecastAccuracy;
    const forecast = timeline.map(s => {
        const error = Math.floor(next() * 3) - 1;
        return { arrivalMinLap: Math.max(1, s.startLap + error - lapUncertainty), arrivalMaxLap: Math.max(1, s.startLap + error + lapUncertainty), rainfallMin: Math.max(0, s.rainfall - intensityUncertainty), rainfallMax: Math.min(1000, s.rainfall + intensityUncertainty) };
    });
    const first = timeline[0], wetStart = first.rainfall >= 500;
    const initial: WeatherState = {
        rainfallIntensity: first.rainfall, airTemperatureMilliC: first.airTemperatureMilliC,
        trackTemperatureMilliC: first.airTemperatureMilliC + (first.rainfall > 0 ? 2000 : 10000),
        trackWater: wetStart ? 450 : 0, drsState: wetStart ? "DRS_DISABLED_WET" : "DRS_ENABLED",
    };
    return { ...base, timeline, forecast, initial };
}
/** Weather a Career Race will use: seeded only by stable identity, so the pre-Race screen can show its public forecast. */
export function careerRaceWeather(careerId: string, eventId: string, circuitKey: string, totalLaps: number, kind: "RACE" | "SPRINT" = "RACE") {
    // The Grand Prix keeps its original identity seed; the Sprint of the same weekend has its own weather.
    return scenarioWeather(raceWeatherSeed(kind === "SPRINT" ? [careerId, eventId, circuitKey, "SPRINT"] : [careerId, eventId, circuitKey]), totalLaps);
}
/** AI starting tyre from CURRENT public conditions only (same information the player sees on the grid). */
export function aiStartingCompound(initial: WeatherState): TyreCompound {
    return initial.trackWater >= 350 ? "WET" : initial.trackWater >= 100 || initial.rainfallIntensity >= 500 ? "INTERMEDIATE" : "MEDIUM";
}

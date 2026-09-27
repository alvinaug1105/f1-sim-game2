import type { RaceSimulationState } from '../../src/simulation/race/types';
import { advanceRaceLap } from '../../src/simulation/race/engine';
import { developmentWeather } from '../../src/simulation/race/weather/model';
import { assessTyreFamilies, familyCostsMs, tyreFamily } from '../../src/simulation/race/tyres/suitability';
import { strategyPreference } from '../../src/simulation/race/pits/ai-strategy';
import type { TyreCompound } from '../../src/simulation/race/tyres/model';
import { assess, strategyRace } from './race-dynamics';

export function weatherScenario(segments: [number, number][], water = 0) {
  const base = developmentWeather(42, 58);
  return { ...base, initial: { ...base.initial, trackWater: water, rainfallIntensity: segments[0][1] },
    timeline: segments.map(([startLap, rainfall]) => ({ startLap, rainfall, airTemperatureMilliC: rainfall ? 19000 : 24000 })),
    forecast: segments.map(([lap, rain]) => ({ arrivalMinLap: Math.max(1, lap - 2), arrivalMaxLap: lap + 2, rainfallMin: Math.max(0, rain - 150), rainfallMax: Math.min(1000, rain + 150) })) };
}
export function weatherField(seed: number, segments: [number, number][], water = 0, compound: TyreCompound = 'MEDIUM'): RaceSimulationState {
  const s = strategyRace(20, seed, weatherScenario(segments, water), true);
  return { ...s, entrants: s.entrants.map(e => ({ ...e, stint: { ...e.stint!, tyre: { ...e.stint!.tyre, compound } }, pit: { ...e.pit!, stints: e.pit!.stints.map(x => ({ ...x, startingTyre: { ...x.startingTyre, compound } })) } })) };
}
export function sampleWeather(seed: number, segments: [number, number][], water = 0, compound: TyreCompound = 'MEDIUM', laps = 28) {
  let s = weatherField(seed, segments, water, compound);
  const rows = [];
  for (let n = 0; n < laps; n++) {
    const a = assessTyreFamilies(s.weather!, s.input.tyres!, s.input.weather!)!;
    const costs = familyCostsMs(s.weather!, s.input.tyres!, s.input.weather!);
    const cars = s.entrants.map(e => ({ id: e.entrantId, family: tyreFamily(e.stint!.tyre.compound), deficitMs: costs[tyreFamily(e.stint!.tyre.compound)]! - costs[a.best]!, decision: assess(s, e, strategyPreference(seed, s.input.entrants.find(x => x.entrantId === e.entrantId)!.gridPosition)) }));
    rows.push({ lap: s.lap, water: s.weather!.trackWater, best: a.best, dry: cars.filter(e => e.family === 'DRY').length, inter: cars.filter(e => e.family === 'INTERMEDIATE').length, wet: cars.filter(e => e.family === 'WET').length, noWindow: cars.filter(e => e.decision.reason === 'NO_WINDOW').length, cars });
    s = advanceRaceLap(s);
  }
  return { seed, rows, switches: s.entrants.map(e => ({ id: e.entrantId, stops: e.pit!.stops.map(p => ({ lap: p.lap, from: p.oldCompound, to: p.newCompound })) })) };
}

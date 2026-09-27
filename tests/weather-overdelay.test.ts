import { describe, expect, it } from 'vitest';
import { advanceRace, advanceRaceLap } from '../src/simulation/race/engine';
import { assessTyreFamilies, familyCostsMs } from '../src/simulation/race/tyres/suitability';
import { assess, NEUTRAL } from './helpers/race-dynamics';
import { sampleWeather, weatherField } from './helpers/weather-overdelay';
import { neutralise } from './helpers/incidents';

function stranded() {
  let s = weatherField(202, [[1, 0], [5, 1000]]);
  s = { ...s, input: { ...s.input, entrants: s.input.entrants.map(e => ({ ...e, strategyController: 'PLAYER' as const })) } };
  s = advanceRace(s, 12);
  return { ...s, entrants: s.entrants.map(e => ({ ...e, stint: { ...e.stint!, startedAtLap: 7, tyre: { ...e.stint!.tyre, compound: 'INTERMEDIATE' as const, ageLaps: 5, wearPermille: 50 } } })) };
}
const late = { ...NEUTRAL, stopBias: 1 };

describe('current-condition weather recovery', () => {
  it('NO_WINDOW cannot strand a POOR intermediate in sustained maximum water', () => {
    const s = stranded(), costs = familyCostsMs(s.weather!, s.input.tyres!, s.input.weather!);
    expect(s.weather!.trackWater).toBe(1000);
    expect(costs.INTERMEDIATE! - costs.WET!).toBeGreaterThan(2500);
    const legacy = { ...s, input: { ...s.input, pits: { ...s.input.pits!, strategy: { ...s.input.pits!.strategy!, weatherGateMs: undefined, weatherGateSpreadMs: undefined } } } };
    expect(assess(legacy, legacy.entrants[0], late)).toMatchObject({ reason: 'NO_WINDOW', compound: null });
    expect(assess(s, s.entrants[0], late)).toMatchObject({ reason: 'WEATHER', compound: 'WET' });
    expect(assess(JSON.parse(JSON.stringify(s)), s.entrants[0], late)).toEqual(assess(s, s.entrants[0], late));
  });
  it('one remaining lap does not repay the stop; final-lap requests are rejected', () => {
    const s = stranded();
    for (const lap of [s.input.totalLaps - 2, s.input.totalLaps - 1]) {
      const at = { ...s, lap };
      expect(assess(at, at.entrants[0], late).compound).toBeNull();
    }
  });
  it('only profitable POOR-family recovery bypasses strategy minimum stint, including SC/VSC', () => {
    const s = stranded(), e = { ...s.entrants[0], stint: { ...s.entrants[0].stint!, startedAtLap: s.lap } };
    for (const state of [s, neutralise(s, 'VSC'), neutralise(s, 'SAFETY_CAR')]) expect(assess(state, e, late).compound).toBe('WET');
    const suitable = { ...e, stint: { ...e.stint, tyre: { ...e.stint.tyre, compound: 'WET' as const } } };
    expect(assess(s, suitable, late)).toMatchObject({ reason: 'NO_WINDOW', compound: null });
  });
  it('dry → inter also recovers without a useful forecast horizon', () => {
    const s = stranded();
    const state = { ...s, weather: { ...s.weather!, trackWater: 450 }, input: { ...s.input, weather: { ...s.input.weather!, strategy: { ...s.input.weather!.strategy, horizonLaps: 1 } } } };
    const e = { ...s.entrants[0], stint: { ...s.entrants[0].stint!, tyre: { ...s.entrants[0].stint!.tyre, compound: 'MEDIUM' as const } } };
    expect(assessTyreFamilies(state.weather, state.input.tyres!, state.input.weather!)!.best).toBe('INTERMEDIATE');
    expect(assess(state, e, late).compound).toBe('INTERMEDIATE');
  });
  it('0/5/10/12/15% water with rain forecast later never sends the field onto inters', () => {
    for (const water of [0, 50, 100, 120, 150]) {
      const s = weatherField(202, [[1, 0], [8, 1000]], water);
      const at = { ...s, lap: 4 };
      expect(assessTyreFamilies(at.weather!, at.input.tyres!, at.input.weather!)!.best).toBe('DRY');
      for (const stopBias of [-1, 0, 1]) expect(['INTERMEDIATE', 'WET']).not.toContain(assess(at, at.entrants[0], { ...NEUTRAL, stopBias }).compound);
    }
  });
  it.each([101, 202, 303])('rapid rain seed %s: a POOR family is acted on within two laps and no late intermediate tail', seed => {
    const run = sampleWeather(seed, [[1, 0], [5, 1000]]);
    for (const row of run.rows.filter(r => r.lap < 25)) {
      for (const car of row.cars.filter(c => c.deficitMs > 1500)) {
        expect(car.decision.compound, `lap ${row.lap} ${car.id}`).not.toBeNull();
        const later = run.rows[row.lap + 2];
        expect(later.cars.find(c => c.id === car.id)!.family).toBe(later.best);
      }
    }
    expect(run.rows[16].inter).toBe(0);
    expect(Math.max(...run.switches.flatMap(e => e.stops.filter(p => p.to === 'WET').map(p => p.lap)))).toBeLessThanOrEqual(12);
  });
  it('sustained maximum water recovers on the next legal stop even from a brand-new intermediate stint', () => {
    const run = sampleWeather(202, [[1, 1000]], 1000, 'INTERMEDIATE', 14);
    expect(run.rows[0].cars.every(c => c.decision.compound === 'WET')).toBe(true);
    expect(run.rows.slice(1).every(r => r.wet === 20)).toBe(true);
    expect(run.switches.every(e => e.stops[0].lap === 1)).toBe(true);
  });
  it('forecast truth is irrelevant; repeated and JSON-resumed races agree', () => {
    const s = stranded(), copy = structuredClone(s);
    const blind = { ...s, input: { ...s.input, weather: { ...s.input.weather!, timeline: [{ startLap: 1, rainfall: 0, airTemperatureMilliC: 30000 }] } } };
    expect(assess(blind, blind.entrants[0], late)).toEqual(assess(s, s.entrants[0], late));
    expect(s).toEqual(copy);
    const race = weatherField(202, [[1, 0], [5, 1000]]), checkpoint = advanceRace(race, 10);
    expect(advanceRace(JSON.parse(JSON.stringify(checkpoint)), 18)).toEqual(advanceRace(race, 28));
    expect(advanceRaceLap(checkpoint)).toEqual(advanceRaceLap(structuredClone(checkpoint)));
  });
});

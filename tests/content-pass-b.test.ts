import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { developmentContent as source } from '../src/data/seed/content-development';
import before from './fixtures/content-before-pass-b.json';
import { CIRCUIT_CLIMATE_PROFILES } from '../src/game/domain/content';
import { validateContentDataset, type ContentDataset } from '../src/game/domain/content-dataset';
import { climateWeather, scenarioWeather, scenarioFor, CLIMATE_WEIGHTS, careerRaceWeather } from '../src/features/race/weather-scenarios';
import { careerGrid } from './helpers/grid';
import { circuitLayouts, fallbackLayout, layoutForCircuit } from '../src/data/seed/circuit-layouts';
import { normalizeCircuitPoints, projectCoordinates, prepareCircuitPath } from '../src/game/domain/circuit-geometry';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
describe('original 2026 calendar and stable content', () => {
  it('has exactly 24 chronological rounds, correct stable venue mapping and six explicit Sprints', () => {
    expect(() => validateContentDataset(source)).not.toThrow();
    expect(source.events.map(e => e.round)).toEqual(Array.from({ length: 24 }, (_, n) => n + 1));
    expect(source.events.map(e => e.circuitId)).toEqual([300,302,301,303,308,309,310,304,311,312,305,306,313,314,315,316,317,307,318,319,320,321,322,323].map(id));
    expect(source.events.filter(e => e.weekendFormat === 'SPRINT').map(e => e.round)).toEqual([2,6,7,11,14,18]);
    expect(new Set(source.events.map(e => e.id)).size).toBe(24);
    expect(new Set(source.events.map(e => e.circuitId)).size).toBe(24);
    for (let i = 1; i < 24; i++) expect(source.events[i].startDate > source.events[i - 1].endDate).toBe(true);
    expect(source.events[23]).toMatchObject({ name: 'Abu Dhabi Grand Prix', endDate: '2026-12-06' });
    expect(JSON.stringify(source.events)).not.toMatch(/sepang/i);
  });
  it('retains all former source identities and the entire Pass A grid/balance', () => {
    for (const key of ['teams','drivers','driverEntries'] as const) expect(source[key]).toEqual(before[key]);
    for (const entry of before.teamEntries) expect(source.teamEntries.find(candidate => candidate.id === entry.id)).toMatchObject(entry);
    for (const c of before.circuits) expect(source.circuits.find(x => x.id === c.id)).toMatchObject({ id: c.id, key: c.key, name: c.name, overtakingDifficulty: c.overtakingDifficulty, dirtyAirSensitivityPermille: c.dirtyAirSensitivityPermille, drsEffectivenessPermille: c.drsEffectivenessPermille });
    for (const e of before.events) expect(source.events.find(x => x.id === e.id)).toMatchObject({ name: e.name, circuitId: e.circuitId });
    expect(source.circuits.slice(0, 2).map(c => [c.lengthMeters,c.defaultLapCount])).toEqual([[5278,58],[5807,53]]);
    expect(source.circuits[7].lengthMeters).toBe(4927);
  });
  it('all active circuits have a typed climate, interaction profile, real detailed geometry and plausible GP distance', () => {
    for (const c of source.circuits) {
      expect(CIRCUIT_CLIMATE_PROFILES).toContain(c.climateProfile);
      expect(c.overtakingDifficulty).toBeGreaterThanOrEqual(0);
      expect(c.dirtyAirSensitivityPermille).toBeGreaterThan(0);
      expect(c.drsEffectivenessPermille).toBeGreaterThan(0);
      expect(c.lengthMeters * c.defaultLapCount).toBeGreaterThan(260000);
      expect(c.lengthMeters * c.defaultLapCount).toBeLessThan(315000);
      const layout = layoutForCircuit(c.id);
      expect(layout).not.toBe(fallbackLayout);
      expect(layout.metadata?.source).toMatch(/^https:/);
      expect(layout.metadata?.revision).toMatch(/^[a-f0-9]{40}$/);
      expect(layout.closed).toBe(true);
      expect(layout.points.length).toBeGreaterThanOrEqual(80);
      expect(new Set(layout.points.map(p => `${p.x},${p.y}`)).size).toBe(layout.points.length);
      const raw: number[][] = JSON.parse(readFileSync(`src/data/seed/geometry/${layout.id}.json`, 'utf8')).features[0].geometry.coordinates;
      const ring = raw[0][0] === raw.at(-1)![0] && raw[0][1] === raw.at(-1)![1] ? raw.slice(0,-1) : raw;
      const area = ring.reduce((sum, a, i) => { const b=ring[(i+1)%ring.length]; return sum+a[0]*b[1]-b[0]*a[1]; },0);
      const reverse = layout.direction !== 'FIGURE_EIGHT' && (area > 0) !== (layout.direction === 'COUNTER_CLOCKWISE');
      const ordered = reverse ? [ring[0],...ring.slice(1).reverse()] : raw;
      expect(normalizeCircuitPoints(projectCoordinates(ordered),layout.metadata!.rotationDegrees)).toEqual(layout.points);
      expect(prepareCircuitPath(layout).sample(0)).toEqual(prepareCircuitPath(layout).sample(1));
    }
    expect(Object.keys(circuitLayouts)).toHaveLength(24);
    expect(() => validateContentDataset({ ...source, circuits: [{ ...source.circuits[0], climateProfile: 'UNKNOWN' }, ...source.circuits.slice(1)] } as unknown as ContentDataset)).toThrow('climate');
  });
  it('old 8-round snapshots and their provenance stay unchanged; new worlds have 24 climates', async () => {
    const old = await careerGrid('team-aurora', before as ContentDataset), saved = structuredClone(old.world);
    const fresh = await careerGrid('team-aurora');
    expect(old.world).toEqual(saved);
    expect(old.world.events).toHaveLength(8);
    expect(old.world.circuits.every(c => c.climateProfile === null)).toBe(true);
    expect(old.career.sourceGameDatabaseVersion).toBe('1.0.0');
    expect(fresh.world.events).toHaveLength(24);
    expect(fresh.career.sourceGameDatabaseVersion).toBe('1.2.0');
    for (const c of fresh.world.circuits) expect(c.climateProfile).toBe(source.circuits.find(x => x.id === c.sourceCircuitId)!.climateProfile);
  });
});
describe('climate changes occurrence only', () => {
  it('NULL/absent reproduces the exact accepted scenario selection and generated weather', () => {
    const old = ['DRY','MOSTLY_DRY','LIGHT_INTERMITTENT','MIXED','LATE_SHOWER','WET'] as const, cutoffs = [32,50,64,78,90,100];
    for (let seed = 0; seed < 300; seed++) {
      expect(scenarioFor(seed, null)).toBe(old[cutoffs.findIndex(n => seed % 100 < n)]);
      expect(climateWeather(seed, 58, null)).toEqual(scenarioWeather(seed,58));
      expect(climateWeather(seed, 58)).toEqual(scenarioWeather(seed,58));
    }
  });
  it('profiles change only story weights, preserve stories/forecast physics and determinism', () => {
    for (const profile of CIRCUIT_CLIMATE_PROFILES) {
      expect(Object.values(CLIMATE_WEIGHTS[profile]).reduce((a,b)=>a+b,0)).toBe(100);
      for (const seed of [1,45,67,82,96]) {
        expect(climateWeather(seed,58,profile)).toEqual(scenarioWeather(seed,58,scenarioFor(seed,profile)));
        expect(careerRaceWeather('career','event','circuit',58,'RACE',profile)).toEqual(careerRaceWeather('career','event','circuit',58,'RACE',profile));
      }
    }
    expect(CIRCUIT_CLIMATE_PROFILES.map(p => Array.from({length:100},(_,s)=>scenarioFor(s,p)).filter(x=>x!=='DRY').length)).toEqual([6,22,35,52,58]);
  });
});

import { practiceWorld } from './helpers/practice';
import { practiceInput } from '../src/features/practice/service';
import { qualifyingInput } from '../src/features/qualifying/service';
import { raceWeatherSeed } from '../src/features/race/weather-scenarios';
import { qualifyingWeatherTicks, QUALIFYING_WEATHER_TICK_MS } from '../src/simulation/qualifying/model';
import { weatherTicks } from '../src/simulation/practice/engine';
import { raceRepository } from './helpers/grid';
import { startIncidentCareerRace } from '../src/features/race/service';
import { projectRaceView } from '../src/features/race/projection';
it('all session-generation paths consume climate while preserving their identity seeds and forecast projection', async () => {
  const world=await practiceWorld(), base=(await world.repo.getPractice(world.careerId,world.eventId,world.sessions[0].id))!;
  for(const climateProfile of ['ARID','HUMID',null] as const) {
    const data={...base,circuit:{...base.circuit,climateProfile}}, built=practiceInput(data,()=> 'entrant').input;
    expect(built.weather).toEqual(climateWeather(raceWeatherSeed([world.careerId,data.eventId,'custom',data.sessionType]),weatherTicks(built),climateProfile));
    for(const kind of ['QUALIFYING','SPRINT_QUALIFYING'] as const) {
      const q=qualifyingInput({...data,kind,state:null,practiceOrder:[]},()=> 'entrant');
      expect(q.weather).toEqual(climateWeather(raceWeatherSeed([world.careerId,data.eventId,'custom',kind]),qualifyingWeatherTicks(q.format,QUALIFYING_WEATHER_TICK_MS),climateProfile));
    }
  }
  const grid=await careerGrid('team-aurora');
  for(const kind of ['RACE','SPRINT'] as const) {
    const m=raceRepository(grid,null,{kind,eventIndex:kind==='SPRINT'?1:0}), data=m.get(), prep=projectRaceView(data).preparation!;
    await startIncidentCareerRace(m.repository,grid.career.id,m.eventId,{});
    const weather=m.get().state!.input.weather!;
    expect(weather).toEqual(careerRaceWeather(grid.career.id,data.eventId,data.circuit.sourceCircuitId!,m.get().state!.input.totalLaps,kind,data.circuit.climateProfile));
    expect(prep.conditions).toEqual(weather.initial);
  }
});

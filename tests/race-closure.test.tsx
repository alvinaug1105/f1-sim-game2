/**
 * Race Gameplay Milestone 2 closure: fuel starvation (no roadblock, warnings, NSE, public-safe events), Pace/Fuel
 * command labels.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/provider';
import { translate } from '../src/i18n/catalog';
import { createRace, advanceRaceLap } from '../src/simulation/race/engine';
import { assessCheckpoint, initialAttention, type AttentionMemory } from '../src/features/race/viewer/attention';
import { raceFeed } from '../src/features/race/viewer/race-view';
import { DriverPanel } from '../src/features/race/viewer/driver-panel';
import { timingRows } from '../src/features/race/viewer/model';
import { racecraftInput, carModes } from './helpers/racecraft';
import { pub, viewerData, view } from './helpers/viewer';
import type { RaceSimulationInput, RaceSimulationState } from '../src/simulation/race/types';

/** Six cars 0.3 s apart; the leader (grid slot 0) is given `fuelKg` after lap 3. */
function starvedLeader(flag: boolean | undefined, seed = 3, fuelKg = 0.5) {
    const i = racecraftInput({ count: 6, seed, laps: 14, gapMs: 300, paceMs: [0, -200, -100, -150, -50, -250], drs: true });
    const racecraft = { ...i.commands!.racecraft! };
    if (flag === undefined) delete (racecraft as { fuelStarvationRetirement?: boolean }).fuelStarvationRetirement; else racecraft.fuelStarvationRetirement = flag;
    const input: RaceSimulationInput = { ...i, commands: { ...i.commands!, racecraft } };
    let s = createRace(input);
    for (let k = 0; k < 3; k++) s = advanceRaceLap(s);
    s = { ...s, entrants: s.entrants.map(e => e.entrantId === input.entrants[0].entrantId ? { ...e, fuelMassKg: fuelKg } : e) };
    const laps: RaceSimulationState[] = [];
    for (let k = 0; k < 6; k++) { s = advanceRaceLap(s); laps.push(s); }
    return { input, laps, starved: input.entrants[0].entrantId };
}
const healthy = (s: RaceSimulationState, starved: string) => s.entrants.filter(e => e.entrantId !== starved && e.incident!.status === 'RUNNING');

describe('fuel starvation: a car out of fuel never roadblocks the field', () => {
    it('the stricken car pulls off on the lap it runs dry; the healthy cars keep racing at normal pace', () => {
        const { laps, starved } = starvedLeader(true);
        const first = laps[0], car = first.entrants.find(e => e.entrantId === starved)!;
        expect(car.incident!.status).toBe('RETIRED');
        expect(car.incident!.retiredLap).toBe(first.lap);
        expect(first.incidents!.events.filter(e => e.lap === first.lap && e.type === 'RETIREMENT')).toEqual([expect.objectContaining({ entrantIds: [starved], kind: 'FUEL_STARVATION' })]);
        expect(car.position).toBe(6);                                                            // classified behind every running car
        for (const s of laps) {
            const run = healthy(s, starved).sort((a, b) => a.position - b.position);
            expect(run.map(e => e.position)).toEqual(run.map((_, n) => n + 1));                // valid, unique order
            for (const e of run) {
                expect(e.lastLapTimeMs!).toBeLessThan(110_000);                                  // nobody inherits the ~3:30 lap
                if (e.position > 1 && e.intervalToAheadMs !== null) expect(e.intervalToAheadMs).toBeGreaterThanOrEqual(80);
            }
            // No queue at the physical minimum behind a slow car.
            expect(run.filter(e => e.intervalToAheadMs === 80).length).toBeLessThan(3);
        }
        // Clearing a stricken car is not an overtake: no pass events (and so no misleading cause) involve it.
        expect(laps.at(-1)!.incidents!.events.filter(e => e.lap >= first.lap && e.type === 'OVERTAKE' && e.entrantIds.includes(starved))).toEqual([]);
    });
    it('before the repair (and in Races frozen without it) the starved car kept circulating as a roadblock', () => {
        for (const flag of [false, undefined]) {
            const { laps, starved } = starvedLeader(flag);
            expect(laps[0].entrants.find(e => e.entrantId === starved)!.incident!.status).toBe('RUNNING');
            expect(laps[0].entrants.filter(e => e.intervalToAheadMs === 80 || e.intervalToAheadMs === 84).length + laps[0].entrants.filter(e => (e.lastLapTimeMs ?? 0) > 200_000).length).toBeGreaterThan(2);
        }
    });
    it('is deterministic (same state → same result) and survives persist/reload', () => {
        expect(starvedLeader(true).laps).toEqual(starvedLeader(true).laps);
        const { input } = starvedLeader(true);
        let a = createRace(input), b = createRace(input);
        const drain = (s: RaceSimulationState) => s.lap === 3 ? { ...s, entrants: s.entrants.map(e => e.entrantId === input.entrants[0].entrantId ? { ...e, fuelMassKg: 0.5 } : e) } : s;
        while (a.status === 'RUNNING') { a = advanceRaceLap(drain(a)); b = JSON.parse(JSON.stringify(advanceRaceLap(drain(JSON.parse(JSON.stringify(b)))))); }
        expect(b).toEqual(JSON.parse(JSON.stringify(a)));
        expect(a.entrants.filter(e => e.incident!.status === 'FINISHED')).toHaveLength(5);    // the rest of the field finishes normally
    });
});

describe('player fuel depletion: projected → critical → out of fuel, each announced once', () => {
    const i = racecraftInput({ count: 4, seed: 5, laps: 30, gapMs: 1500 });
    const team = i.entrants[0].teamId, me = i.entrants[0].entrantId;
    it('escalates and stops playback at each stage, never repeating a stage', () => {
        let s = createRace(i);
        for (let k = 0; k < 3; k++) s = advanceRaceLap(s);
        let memory: AttentionMemory = initialAttention(pub(s, team), team);
        s = carModes({ ...s, entrants: s.entrants.map(e => e.entrantId === me ? { ...e, fuelMassKg: 10 } : e) }, { fuelMode: 'PUSH' }, 0);
        const kinds: string[][] = [];
        while (s.status === 'RUNNING' && kinds.length < 8) {
            s = advanceRaceLap(s);
            const r = assessCheckpoint(memory, pub(s, team), team); memory = r.memory;
            kinds.push(r.items.filter(x => x.entrantId === me && x.reason === 'FUEL').map(x => x.kind));
        }
        const flat = kinds.flat();
        expect(flat.filter(k => k === 'FUEL')).toHaveLength(1);
        expect(flat.filter(k => k === 'FUEL_CRITICAL')).toHaveLength(1);
        expect(flat.filter(k => k === 'FUEL_OUT')).toHaveLength(1);
        expect(flat.indexOf('FUEL_CRITICAL')).toBeGreaterThan(flat.indexOf('FUEL'));
        expect(flat.indexOf('FUEL_OUT')).toBeGreaterThan(flat.indexOf('FUEL_CRITICAL'));
        // The player's own retirement is explicit about fuel in the feed; the car is classified as retired.
        const feed = raceFeed(pub(s, team), team).filter(f => f.category === 'RETIREMENT');
        expect(feed[0].event!.kind).toBe('FUEL_STARVATION');
        expect(translate('en', 'viewer.attention.FUEL_OUT', { driver: 'OCO' })).toBe('OCO is out of fuel and has stopped');
    });
    it('the driver panel shows the critical line only for the player car when fuel runs out within a few laps', () => {
        const d = viewerData(), s = d.state!, id = s.entrants[0].entrantId;
        const low = { ...s, lap: 5, entrants: s.entrants.map(e => e.entrantId === id ? { ...e, fuelMassKg: 4, commands: { ...e.commands!, fuelMode: 'PUSH' as const } } : e) };
        const v = view({ ...d, state: low }), rows = timingRows(v);
        const html = renderToStaticMarkup(<I18nProvider><DriverPanel data={v} row={rows.find(r => r.id === id)!} rows={rows} busy={false} send={() => {}}/></I18nProvider>);
        expect(html).toContain('Fuel critical: about 2 laps left in this mode');
        // Not once the car has stopped.
        const out = view({ ...d, state: { ...low, entrants: low.entrants.map(e => e.entrantId === id ? { ...e, completedLaps: 5, incident: { ...e.incident!, status: 'RETIRED' as const, retiredLap: 5, retirementOrder: 1 } } : e) } });
        const html2 = renderToStaticMarkup(<I18nProvider><DriverPanel data={out} row={timingRows(out).find(r => r.id === id)!} busy={false} send={() => {}}/></I18nProvider>);
        expect(html2).not.toContain('Fuel critical');
    });
});

describe('AI (rival) fuel depletion: same mechanics, no fuel leak', () => {
    it('a rival that runs dry pulls off too; the browser sees "stopped on track", never its fuel', () => {
        const i = racecraftInput({ count: 4, seed: 7, laps: 20, gapMs: 600, ai: true });
        const player = { ...i, entrants: i.entrants.map((e, n) => n < 2 ? { ...e, strategyController: 'PLAYER' as const } : e) };
        const team = player.entrants[0].teamId, rival = player.entrants[2].entrantId;
        let s = createRace(player);
        for (let k = 0; k < 3; k++) s = advanceRaceLap(s);
        s = { ...s, entrants: s.entrants.map(e => e.entrantId === rival ? { ...e, fuelMassKg: 0.4 } : e) };
        const before = pub(s, team);
        expect(before.entrants.find(e => e.entrantId === rival)!.fuelMassKg).toBeNull();          // hidden before the failure
        s = advanceRaceLap(s);
        expect(s.entrants.find(e => e.entrantId === rival)!.incident!.status).toBe('RETIRED');
        const view = pub(s, team), event = view.incidents!.events.find(e => e.type === 'RETIREMENT')!;
        expect(event.kind).toBe('STOPPED');
        expect(JSON.stringify(view)).not.toContain('FUEL_STARVATION');
        expect(view.entrants.find(e => e.entrantId === rival)!.fuelMassKg).toBeNull();
        expect(translate('en', 'incident.STOPPED')).toBe('Stopped on track');
        // The player's attention does not announce a rival's retirement as a fuel event.
        const r = assessCheckpoint(initialAttention(before, team), view, team);
        expect(r.items.some(x => x.kind === 'FUEL_OUT')).toBe(false);
    });
});

describe('Pace vs Fuel command labels', () => {
    it.each(['en', 'zh-TW'] as const)('%s: fuel modes never share a label with a pace mode', locale => {
        const pace = (['CONSERVE', 'LIGHT', 'STANDARD', 'PUSH', 'ATTACK'] as const).map(m => translate(locale, `command.${m}`));
        const fuel = (['CONSERVE', 'BALANCED', 'PUSH'] as const).map(m => translate(locale, `command.fuel.${m}`));
        for (const f of fuel) expect(pace).not.toContain(f);
        expect(new Set(fuel).size).toBe(3);
    });
    it('the driver panel renders Lean / Balanced / Rich for fuel and Push for pace', () => {
        const d = view(viewerData()), rows = timingRows(d);
        const html = renderToStaticMarkup(<I18nProvider><DriverPanel data={d} row={rows[0]} rows={rows} busy={false} send={() => {}}/></I18nProvider>);
        const fuelGroup = html.match(/aria-label="Fuel"[\s\S]*?<\/div>/)?.[0] ?? '';
        expect(fuelGroup).toContain('Lean'); expect(fuelGroup).toContain('Rich'); expect(fuelGroup).not.toContain('>Push<');
        const paceGroup = html.match(/aria-label="Pace"[\s\S]*?<\/div>/)?.[0] ?? '';
        expect(paceGroup).toContain('Push');
    });
});

import { strategyRace, assess, NEUTRAL } from './helpers/race-dynamics';
import { developmentWeather, type WeatherConfiguration } from '../src/simulation/race/weather/model';
import { assessTyreFamilies, tyreFamily } from '../src/simulation/race/tyres/suitability';
import { forecastItems, quietForecastKey } from '../src/features/race/forecast-copy';
import type { TyreCompound } from '../src/simulation/race/tyres/model';

/** Weather whose public forecast brackets each segment (±2 laps, ±150 intensity), as the game's generator does. */
function scenario(segs: [number, number][], water = 0): WeatherConfiguration {
    const base = developmentWeather(42, 58);
    const timeline = segs.map(([startLap, rainfall]) => ({ startLap, rainfall, airTemperatureMilliC: rainfall ? 19000 : 24000 }));
    const forecast = timeline.map(x => ({ arrivalMinLap: Math.max(1, x.startLap - 2), arrivalMaxLap: x.startLap + 2, rainfallMin: Math.max(0, x.rainfall - 150), rainfallMax: Math.min(1000, x.rainfall + 150) }));
    return { ...base, timeline, forecast, initial: { ...base.initial, trackWater: water, rainfallIntensity: segs[0][1], drsState: water >= base.drsDisableWater ? 'DRS_DISABLED_WET' : 'DRS_ENABLED' } };
}
interface Lap { lap: number; water: number; best: string; levels: Record<string, string>; families: Record<string, string> }
/** 20 AI cars through a weather scenario; `legacy` strips the closure repair's weather gate (the Beta behaviour). */
function weatherRun(segs: [number, number][], laps: number, seed: number, opts: { water?: number; start?: TyreCompound; legacy?: boolean } = {}) {
    let s = strategyRace(20, seed, scenario(segs, opts.water), true);
    if (opts.legacy) { const { weatherGateMs: _a, weatherGateSpreadMs: _b, ...old } = s.input.pits!.strategy!; void _a; void _b; s = { ...s, input: { ...s.input, pits: { ...s.input.pits!, strategy: old } } }; }
    if (opts.start) s = { ...s, entrants: s.entrants.map(e => ({ ...e, stint: { ...e.stint!, tyre: { ...e.stint!.tyre, compound: opts.start! } }, pit: { ...e.pit!, stints: e.pit!.stints.map(x => ({ ...x, startingTyre: { ...x.startingTyre, compound: opts.start! } })) } })) };
    const out: Lap[] = [];
    for (let n = 0; n < laps; n++) {
        s = advanceRaceLap(s);
        const a = assessTyreFamilies(s.weather!, s.input.tyres!, s.input.weather!)!;
        out.push({ lap: s.lap, water: s.weather!.trackWater, best: a.best, levels: a.levels, families: Object.fromEntries(s.entrants.map(e => [e.entrantId, tyreFamily(e.stint!.tyre.compound)])) });
    }
    return out;
}
const count = (l: Lap, f: string) => Object.values(l.families).filter(x => x === f).length;
/** Lap each car first changed to `to`. */
const switches = (laps: Lap[], to: string) => { const out: Record<string, Lap> = {}; for (const l of laps) for (const [id, f] of Object.entries(l.families)) if (f === to && !out[id]) out[id] = l; return Object.values(out); };

describe('AI weather strategy: current tyre suitability gates family switches', () => {
    const lowWater: [number, number][] = [[1, 0], [6, 300], [22, 900]];         // rain forecast, water creeps 0 → ~80 %
    it('regression: rain forecast but 0–10 % water — no field-wide switch to inters while slicks are clearly fastest', () => {
        for (const seed of [101, 202, 303]) {
            const laps = weatherRun(lowWater, 22, seed);
            for (const l of laps.filter(x => x.best === 'DRY' && x.levels.INTERMEDIATE !== 'SUITABLE')) expect(count(l, 'INTERMEDIATE'), `lap ${l.lap} water ${l.water}`).toBe(0);
            // The Beta behaviour (gate absent): the whole field dived onto inters at a few % water.
            const legacy = weatherRun(lowWater, 22, seed, { legacy: true });
            expect(Math.max(...legacy.filter(x => x.best === 'DRY' && x.water <= 120).map(x => count(x, 'INTERMEDIATE')))).toBeGreaterThanOrEqual(15);
        }
    });
    it('gradual dry → inter: the field moves around the real crossover, not on one lap', () => {
        const laps = weatherRun([[1, 0], [5, 420], [34, 0]], 20, 101), moved = switches(laps, 'INTERMEDIATE');
        expect(moved).toHaveLength(20);
        expect(new Set(moved.map(l => l.lap)).size).toBeGreaterThanOrEqual(2);
        for (const l of moved) { expect(l.water).toBeGreaterThanOrEqual(200); expect(l.water).toBeLessThanOrEqual(400); }
    });
    it('inter → wet: nobody fits full wets while they are still poor for the conditions', () => {
        const laps = weatherRun([[1, 450]], 20, 202, { water: 450, start: 'INTERMEDIATE' }), moved = switches(laps, 'WET');
        expect(moved.length).toBeGreaterThan(10);
        for (const l of moved) expect(l.levels.WET).not.toBe('POOR');
    });
    it('drying wet → inter → dry: switches follow the real performance order with a spread, and nobody is stranded', () => {
        const laps = weatherRun([[1, 700], [8, 0]], 26, 303, { water: 1000, start: 'WET' });
        const inter = switches(laps, 'INTERMEDIATE'), dry = switches(laps, 'DRY');
        expect(inter).toHaveLength(20); expect(dry).toHaveLength(20);
        expect(new Set(inter.map(l => l.lap)).size).toBeGreaterThanOrEqual(2);
        for (const l of inter) expect(l.levels.INTERMEDIATE).not.toBe('POOR');
        for (const l of dry) expect(l.levels.DRY).not.toBe('POOR');
        expect(count(laps.at(-1)!, 'DRY')).toBe(20);
    });
    it('uses current conditions and the public forecast only: a changed future truth timeline changes no decision now', () => {
        let s = strategyRace(4, 7, scenario(lowWater), true);
        for (let n = 0; n < 10; n++) s = advanceRaceLap(s);
        const other = { ...s, input: { ...s.input, weather: { ...s.input.weather!, timeline: [{ startLap: 1, rainfall: 0, airTemperatureMilliC: 24000 }, { startLap: 11, rainfall: 1000, airTemperatureMilliC: 15000 }] } } };
        for (const e of s.entrants) expect(assess(other, other.entrants.find(x => x.entrantId === e.entrantId)!, NEUTRAL)).toEqual(assess(s, e, NEUTRAL));
    });
});

describe('Race forecast copy', () => {
    const w = (from: number, to: number, min: number, max: number) => ({ arrivalMinLap: from, arrivalMaxLap: to, rainfallMin: min, rainfallMax: max });
    it('a dry grid never reads "Rain easing"; the next meaningful rain window is announced', () => {
        const items = forecastItems([w(1, 4, 0, 150), w(7, 11, 150, 450), w(20, 24, 300, 600)], 0);
        expect(items.map(i => [i.label, i.window.arrivalMinLap])).toEqual([['weather.possible', 7], ['weather.expected', 20]]);
        expect(translate('en', items[0].label)).toBe('Rain possible');
        expect(forecastItems([w(1, 4, 0, 150)], 0)).toEqual([]);
        expect(translate('en', quietForecastKey(0))).toBe('No rain expected');
        expect(translate('zh-TW', quietForecastKey(0))).not.toBe('weather.noRain');
    });
    it('while it rains, a lighter window reads as easing', () => {
        expect(forecastItems([w(5, 9, 0, 150), w(12, 16, 300, 500)], 700).map(i => i.label)).toEqual(['weather.easing', 'weather.easing']);
        expect(forecastItems([w(5, 9, 600, 900)], 400).map(i => i.label)).toEqual(['weather.expected']);
    });
});

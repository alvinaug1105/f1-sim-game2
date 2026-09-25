import React, { type ReactElement, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/provider';
import { timingRows } from '../src/features/race/viewer/model';
import { TimingTower } from '../src/features/race/viewer/timing-tower';
import { PlayerSwitch } from '../src/features/race/viewer/player-switch';
import { DriverPanel } from '../src/features/race/viewer/driver-panel';
import { PlaybackBar } from '../src/features/race/viewer/playback-bar';
import { PlaybackController } from '../src/features/race/viewer/playback';
import { commandInfo, type ViewerIntent } from '../src/features/race/viewer/intents';
import { driverFlags, tyreSuitability, ersOutlook } from '../src/features/race/viewer/race-view';
import { scenarioWeather, scenarioFor, raceWeatherSeed, careerRaceWeather, aiStartingCompound, WEATHER_SCENARIOS } from '../src/features/race/weather-scenarios';
import { startIncidentCareerRace } from '../src/features/race/service';
import { validateWeatherConfiguration } from '../src/simulation/race/weather/model';
import { advanceRace, advanceRaceLap, createRace } from '../src/simulation/race/engine';
import { formatRaceTime } from '../src/i18n/race-time';
import { viewerData } from './helpers/viewer';
import { incidentInput } from './helpers/incidents';
import type { CareerRaceData, CareerRaceRepository } from '../src/game/domain/race-repository';
import type { RaceSimulationState } from '../src/simulation/race/types';
type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
/** Walks a rendered element tree (host elements only) — lets us call real handlers without a DOM. */
function walk(node: ReactNode, visit: (e: Element) => void) {
    if (Array.isArray(node)) { node.forEach(n => walk(n, visit)); return; }
    if (!node || typeof node !== 'object' || !('props' in node)) return;
    const e = node as Element; visit(e); walk(e.props.children, visit);
}
/** Renders `component(props)` inside the i18n provider and hands the returned tree to `inspect`. */
function probe<P>(component: (props: P) => ReactNode, props: P, inspect: (tree: ReactNode) => void) {
    function Probe() { const tree = component(props); inspect(tree); return <>{tree}</>; }
    return renderToStaticMarkup(<I18nProvider><Probe/></I18nProvider>);
}
const at = (d: CareerRaceData, laps: number): CareerRaceData => ({ ...d, state: advanceRace(d.state!, laps) });
describe('timing tower: whole-row selection', () => {
    it('every row selects its entrant from anywhere, with exactly one interactive control per row', () => {
        const d = at(viewerData(6), 3), rows = timingRows(d), picked: string[] = [], viaButton: string[] = [];
        probe(TimingTower, { state: d.state!, rows, selected: rows[0].id, onSelect: (id: string) => picked.push(id), interval: false, onInterval: () => {} }, tree => walk(tree, e => {
            if (e.type !== 'tr' || !e.props['data-entrant']) return;
            (e.props.onClick as () => void)();
            let buttons = 0;
            walk(e.props.children, c => { if (c.type === 'button') { buttons++; (c.props.onClick as () => void)(); viaButton.push(String(e.props['data-entrant'])); } });
            expect(buttons).toBe(1);
        }));
        expect(picked.filter((_, i) => i % 2 === 0)).toEqual(rows.map(r => r.id));   // row click (mouse, any cell)
        expect(viaButton).toEqual(rows.map(r => r.id));                              // the row's keyboard control
    });
    it('player rows carry compact flags (BOX when a pit is requested); AI rows never expose AI intentions', () => {
        const d = at(viewerData(4), 3), s = d.state!;
        const boxed: CareerRaceData = { ...d, state: { ...s, entrants: s.entrants.map((e, i) => i === 1 || i === 3 ? { ...e, pit: { ...e.pit!, pendingCompound: 'HARD' as const } } : e) } };
        const rows = timingRows(boxed);
        const html = renderToStaticMarkup(<I18nProvider><TimingTower state={boxed.state!} rows={rows} selected={rows[0].id} onSelect={() => {}} interval={false} onInterval={() => {}}/></I18nProvider>);
        const row = (id: string) => html.match(new RegExp(`<tr[^>]*data-entrant="${id}"[\\s\\S]*?</tr>`))![0];
        expect(row(rows[1].id)).toContain('flag-BOX'); expect(rows[1].player).toBe(true);
        expect(row(rows[3].id)).not.toContain('flag-BOX'); expect(rows[3].player).toBe(false);
    });
});
describe('command safety and two-driver awareness', () => {
    it('confirmation identity always comes from the command itself, never the current selection', async () => {
        const intent: ViewerIntent = { kind: 'pit', entrantId: 'car-b', revision: 0, compound: 'SOFT' };
        expect(commandInfo(intent)).toEqual({ entrantId: 'car-b', kind: 'pit', value: 'SOFT' });
        expect(commandInfo({ kind: 'paceMode', entrantId: 'car-a', revision: 1, mode: 'PUSH' })).toEqual({ entrantId: 'car-a', kind: 'paceMode', value: 'PUSH' });
        expect(commandInfo({ kind: 'advance' })).toBeNull();
        const d = viewerData(), c = new PlaybackController(d.state!, d.progress.career.playerTeamId, async s => advanceRaceLap(s));
        await c.command(async s => s, commandInfo(intent));
        expect(c.getSnapshot().confirmation).toEqual({ entrantId: 'car-b', kind: 'pit', value: 'SOFT' });
        c.play(); expect(c.getSnapshot().confirmation).toBeNull(); c.pause();
    });
    it('the confirmation line names the targeted driver', () => {
        const d = viewerData(), rows = timingRows(d), c = new PlaybackController(d.state!, d.progress.career.playerTeamId, async s => s);
        const playback = { ...c.getSnapshot(), reason: 'COMMAND' as const, confirmation: { entrantId: rows[1].id, kind: 'pit' as const, value: 'SOFT' } };
        const html = renderToStaticMarkup(<I18nProvider><PlaybackBar controller={c} playback={playback} rows={rows} reduceMotion={false} onReduceMotion={() => {}}/></I18nProvider>);
        expect(html).toContain(`${rows[1].abbreviation} — Pit requested: Soft`);
        expect(html).toContain('class="race-status-line"');
    });
    it("a driver panel can only send commands for its own driver", () => {
        const d = at(viewerData(), 2), rows = timingRows(d), sent: ViewerIntent[] = [];
        probe(DriverPanel, { data: d, row: rows[1], rows, busy: false, send: (i: ViewerIntent) => sent.push(i) }, tree => walk(tree, e => {
            if (e.type === 'button' && typeof e.props.onClick === 'function') (e.props.onClick as () => void)();       // pit box / cancel
            if (typeof e.props.onPick === 'function') for (const mode of e.props.modes as string[]) (e.props.onPick as (m: string) => void)(mode); // pace / fuel / ERS
        }));
        expect(sent.length).toBeGreaterThan(5);
        expect(new Set(sent.map(i => 'entrantId' in i ? i.entrantId : null))).toEqual(new Set([rows[1].id]));
    });
    it('the non-selected player tab shows decision flags, including a pending pit request', () => {
        const d = at(viewerData(4), 5), s = d.state!, p = s.input.tyres!.profiles[s.entrants[1].stint!.tyre.compound];
        const state: RaceSimulationState = { ...s, entrants: s.entrants.map((e, i) => i === 1 ? { ...e, pit: { ...e.pit!, pendingCompound: 'HARD' as const }, stint: { ...e.stint!, tyre: { ...e.stint!.tyre, wearPermille: p.cliffWear } } } : e) };
        const data = { ...d, state }, rows = timingRows(data);
        expect(driverFlags(rows[1], rows, state)).toEqual(expect.arrayContaining(['BOX', 'TYRE_CRITICAL']));
        const html = renderToStaticMarkup(<I18nProvider><PlayerSwitch state={state} rows={rows} selected={rows[0].id} onSelect={() => {}} attentionId={rows[1].id}/></I18nProvider>);
        const tab = html.match(/<button[^>]*title="Driver 2"[\s\S]*?<\/button>/)![0];
        for (const flag of ['flag-BOX', 'flag-TYRE_CRITICAL', 'flag-ATTENTION']) expect(tab).toContain(flag);
        expect(tab).toContain('Pit requested');   // screen-reader text, not colour alone
    });
});
describe('live timing and decision feedback', () => {
    it('last and best lap come straight from authoritative entrant timing', () => {
        const d = at(viewerData(), 4), rows = timingRows(d), e = rows[0].entrant;
        const html = renderToStaticMarkup(<I18nProvider><DriverPanel data={d} row={rows[0]} rows={rows} busy={false} send={() => {}}/></I18nProvider>);
        expect(html).toContain(formatRaceTime(e.lastLapTimeMs!, 'en')); expect(html).toContain(formatRaceTime(e.bestLapTimeMs!, 'en'));
        const tower = renderToStaticMarkup(<I18nProvider><TimingTower state={d.state!} rows={rows} selected={rows[0].id} onSelect={() => {}} interval={false} onInterval={() => {}}/></I18nProvider>);
        for (const r of rows) expect(tower).toContain(formatRaceTime(r.entrant.lastLapTimeMs!, 'en'));
    });
    it('tyre suitability reads only the current track water, never the weather timeline', () => {
        const weather = { rainfallIntensity: 0, airTemperatureMilliC: 20000, trackTemperatureMilliC: 30000, trackWater: 0, drsState: 'DRS_ENABLED' as const };
        expect(tyreSuitability('MEDIUM', weather)!.level).toBe('SUITABLE');
        expect(tyreSuitability('INTERMEDIATE', weather)!.level).toBe('POOR');
        expect(tyreSuitability('MEDIUM', { ...weather, trackWater: 200 })!.level).toBe('MARGINAL');
        expect(tyreSuitability('INTERMEDIATE', { ...weather, trackWater: 200 })!.level).toBe('SUITABLE');
        expect(tyreSuitability('WET', { ...weather, trackWater: 600 })!.level).toBe('SUITABLE');
        expect(tyreSuitability('SOFT', { ...weather, trackWater: 600 })!.level).toBe('POOR');
        expect(tyreSuitability('SOFT', undefined)).toBeNull();
        // The function's only weather input is the current state; a changed future timeline cannot reach it.
        expect(tyreSuitability.length).toBe(2);
    });
    it('ERS outlook is a rounded management estimate for the current mode', () => {
        const s = createRace(incidentInput(2)), e = s.entrants[0];
        const mode = (ersMode: 'HARVEST' | 'NEUTRAL' | 'DEPLOY') => ersOutlook(s, { ...e, commands: { ...e.commands!, ersMode } });
        expect(mode('HARVEST')).toEqual({ kind: 'CHARGING' }); expect(mode('NEUTRAL')).toEqual({ kind: 'SUSTAINABLE' });
        expect(mode('DEPLOY')).toEqual({ kind: 'LAPS', laps: expect.any(Number) });
    });
});
describe('deterministic weather variety', () => {
    it('same seed and event give an identical frozen timeline and forecast', () => {
        expect(careerRaceWeather('career-1', 'event-1', 'albert-park', 58)).toEqual(careerRaceWeather('career-1', 'event-1', 'albert-park', 58));
        expect(raceWeatherSeed(['a', 'b'])).toBe(raceWeatherSeed(['a', 'b'])); expect(raceWeatherSeed(['a', 'b'])).not.toBe(raceWeatherSeed(['ab', '']));
    });
    it('different events produce different stories, including dry and wet ones', () => {
        const scenarios = Array.from({ length: 60 }, (_, i) => scenarioFor(raceWeatherSeed(['career-1', `event-${i}`, 'suzuka'])));
        expect(new Set(scenarios).size).toBeGreaterThanOrEqual(4);
        expect(scenarios).toContain('DRY'); expect(scenarios).toEqual(expect.arrayContaining(['DRY']));
        expect(scenarios.some(s => s === 'WET' || s === 'MIXED')).toBe(true);
    });
    it.each(WEATHER_SCENARIOS)('%s scenario is a valid v7 weather configuration and simulates deterministically', scenario => {
        for (const laps of [5, 20, 58]) {
            const c = scenarioWeather(12345, laps, scenario);
            expect(() => validateWeatherConfiguration(c, laps)).not.toThrow();
            const input = incidentInput(4, 7, laps), run = () => advanceRace(createRace({ ...input, weather: c }), laps);
            expect(run()).toEqual(run()); expect(run().simulationVersion).toBe(7);
        }
    });
    it('fixtures: a dry race never rains, a wet race starts wet', () => {
        const dry = scenarioWeather(1, 58, 'DRY'), wet = scenarioWeather(1, 58, 'WET');
        expect(dry.timeline.every(s => s.rainfall === 0)).toBe(true); expect(dry.initial.trackWater).toBe(0);
        expect(wet.timeline.every(s => s.rainfall > 0)).toBe(true); expect(wet.initial.trackWater).toBeGreaterThanOrEqual(350);
        expect(aiStartingCompound(dry.initial)).toBe('MEDIUM'); expect(aiStartingCompound(wet.initial)).toBe('WET');
    });
});
describe('starting-tyre ownership (Career Race start)', () => {
    function preStart() {
        const base = viewerData(4), team = base.progress.career.playerTeamId;
        const roster = base.state!.input.entrants.map((e, i) => ({ driverId: e.driverId, teamId: e.teamId, driverName: `Driver ${i + 1}`, teamName: `Team ${i}`, teamOrder: Math.floor(i / 2) + 1, carNumber: i + 1 }));
        const event = { ...base.progress.events[0], weekend: { id: 'weekend', careerId: 'career', careerEventId: 'event', status: 'ACTIVE', sessions: [{ id: 'session', careerId: 'career', careerRaceWeekendId: 'weekend', type: 'RACE', order: 1, status: 'IN_PROGRESS', startedAtCareerDate: null, completedAtCareerDate: null }] } };
        let data = { ...base, state: null, roster, labels: [], progress: { ...base.progress, events: [event] } } as unknown as CareerRaceData;
        const repository: CareerRaceRepository = { getRace: async () => structuredClone(data), changeRace: async (_c, _e, change) => { data = { ...data, ...change(structuredClone(data)) }; } };
        return { repository, get: () => data, team, roster };
    }
    it('the player sets their own drivers; rival starting tyres cannot be player input', async () => {
        const m = preStart(), mine = m.roster.filter(r => r.teamId === m.team), rival = m.roster.find(r => r.teamId !== m.team)!;
        await expect(startIncidentCareerRace(m.repository, 'career', 'event', { [rival.driverId]: 'SOFT' }, 42)).rejects.toMatchObject({ code: 'INVALID_ACTION' });
        expect(m.get().state).toBeNull();
        await startIncidentCareerRace(m.repository, 'career', 'event', { [mine[0].driverId]: 'SOFT', [mine[1].driverId]: 'HARD' });
        const s = m.get().state!, byDriver = (id: string) => s.entrants[s.input.entrants.findIndex(e => e.driverId === id)].stint!.tyre.compound;
        expect([byDriver(mine[0].driverId), byDriver(mine[1].driverId)]).toEqual(['SOFT', 'HARD']);
        // AI chose from the public grid conditions of the frozen, identity-seeded weather.
        expect(s.input.weather).toEqual(careerRaceWeather('career', 'event', m.get().circuit.sourceCircuitId!, s.input.totalLaps));
        expect(byDriver(rival.driverId)).toBe(aiStartingCompound(s.input.weather!.initial));
    });
    it('an explicit simulation seed keeps the legacy development weather (reproducible fixtures)', async () => {
        const m = preStart(); vi.spyOn(crypto, 'getRandomValues');
        await startIncidentCareerRace(m.repository, 'career', 'event', {}, 42);
        expect(m.get().state!.input.seed).toBe(42); expect(m.get().state!.weather!.trackWater).toBe(0);
        vi.restoreAllMocks();
    });
});

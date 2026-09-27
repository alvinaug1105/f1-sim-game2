// @vitest-environment happy-dom
/**
 * Post-Beta Race Experience: the overtake feed, Next Strategic Event triggers (adjacent rivals, field tyre waves,
 * suitability crossover), the multi-tab stale notice, the Qualifying forecast wording and Sprint SQ3 late runs.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n/provider';
import { translate, type Locale } from '../src/i18n/catalog';
import { raceFeed } from '../src/features/race/viewer/race-view';
import { EventFeed } from '../src/features/race/viewer/event-feed';
import { assessCheckpoint, initialAttention, WAVE_COOLDOWN_LAPS, type AttentionMemory } from '../src/features/race/viewer/attention';
import { advanceRace } from '../src/simulation/race/engine';
import { quietRace } from './helpers/incidents';
import { pub, viewerView } from './helpers/viewer';
import { continuePhase, createQualifying, stepQualifying } from '../src/simulation/qualifying/engine';
import { QUALIFYING_STEP_MS, QUALIFYING_WEATHER_TICK_MS, phaseFormat, qualifyingFormat, qualifyingWeatherTicks, type QualifyingInput, type QualifyingState } from '../src/simulation/qualifying/model';
import { NEUTRAL_SETUP } from '../src/simulation/practice/model';
import { weatherTyreConfiguration } from '../src/simulation/race/tyres/profiles';
import { scenarioWeather } from '../src/features/race/weather-scenarios';
import { developmentContent as source } from '../src/data/seed/content-development';
import { qualifyingForecast } from '../src/features/qualifying/view-model';
import { forecastText } from '../src/features/qualifying/labels';
import type { RaceEvent } from '../src/simulation/race/incidents/model';
import type { RaceSimulationState } from '../src/simulation/race/types';
import type { TyreCompound } from '../src/simulation/race/tyres/model';

const checkpoint = vi.fn(), advance = vi.fn();
vi.mock('../src/features/race/viewer/actions', () => ({ viewerAction: (...a: unknown[]) => advance(...a), raceCheckpointAction: (...a: unknown[]) => checkpoint(...a), sprintRemainderAction: vi.fn() }));
const { RaceOperations } = await import('../src/features/race/viewer/operations');

describe('overtake feed', () => {
    const pass = (sequence: number, lap: number, by: string, on: string, cause: RaceEvent['cause']): RaceEvent => ({ sequence, lap, type: 'OVERTAKE', entrantIds: [by, on], kind: null, severity: null, timeLossMs: 0, cause });
    function staged() {
        const d = viewerView(4), s = d.state!, team = d.progress.career.playerTeamId;
        const [me, mate, ai1, ai2] = s.entrants.map(e => e.entrantId);
        const events = [pass(1, 3, me, ai1, 'DRS'), pass(2, 4, ai1, mate, 'TYRE'), pass(3, 5, ai2, ai1, 'PACE')];
        void mate;
        return { d: { ...d, state: { ...s, lap: 6, incidents: { ...s.incidents!, events } } }, team, me, ai1, ai2 };
    }
    it('shows player gains and losses with a safe cause, and never a pass between two rivals', () => {
        const { d, team } = staged(), feed = raceFeed(d.state, team);
        expect(feed.map(f => [f.category, f.lap, f.important, f.player])).toEqual([['OVERTAKE', 4, true, true], ['OVERTAKE', 3, true, true]]);
        const html = renderToStaticMarkup(<I18nProvider><EventFeed data={d}/></I18nProvider>);
        expect(html).toContain('Place gained'); expect(html).toContain('DRS');
        expect(html).toContain('Place lost'); expect(html).toContain('Tyre advantage');
        expect(html).toContain('Driver 1 passed Driver 3'); expect(html).toContain('Driver 3 passed Driver 2');
        expect(html).not.toContain('Driver 4 passed');
        // Only the public result and cause: no odds, ratings or hidden pace.
        expect(html).not.toMatch(/probab|permille|potential|%/i);
    });
    it.each(['en', 'zh-TW'] as const)('has complete %s copy for every cause', locale => {
        for (const cause of ['TYRE', 'ERS', 'DRS', 'PACE', 'NONE'] as const) expect(translate(locale, `viewer.overtakeCause.${cause}`)).not.toContain('viewer.');
        for (const key of ['viewer.overtake.gained', 'viewer.overtake.lost', 'viewer.cat.OVERTAKE', 'incident.OVERTAKE'] as const) expect(translate(locale, key)).not.toBe(key);
        expect(translate(locale, 'viewer.overtake.detail', { by: 'A', on: 'B' })).toMatch(/A.*B/);
    });
});

describe('Next Strategic Event: public tyre facts', () => {
    // 8 cars; player cars (team 0) are pit-entrant-0 / -1. Order: r2, P0, r4, r6, r3, P1, r5, r7.
    const base = advanceRace(quietRace(8), 9), team = base.input.entrants[0].teamId, id = (n: number) => `pit-entrant-${n}`;
    const ORDER = [2, 0, 4, 6, 3, 1, 5, 7].map(id);
    interface Stage { lap: number; order?: readonly string[]; stops?: Record<string, number>; tyre?: Record<string, TyreCompound>; water?: number }
    function stage({ lap, order = ORDER, stops = {}, tyre = {}, water = 0 }: Stage): RaceSimulationState {
        return {
            ...base, lap, weather: { ...base.weather!, trackWater: water },
            entrants: order.map((eid, i) => {
                const e = base.entrants.find(x => x.entrantId === eid)!, n = stops[eid] ?? 0;
                return { ...e, position: i + 1, intervalToAheadMs: i === 0 ? null : 3000, gapToLeaderMs: i === 0 ? null : 3000 * i,
                    stint: { ...e.stint!, tyre: { ...e.stint!.tyre, compound: tyre[eid] ?? e.stint!.tyre.compound } },
                    pit: { ...e.pit!, stops: Array.from({ length: n }, (_, k) => ({ number: k + 1, lap: lap - 1, oldCompound: 'MEDIUM' as const, newCompound: tyre[eid] ?? 'HARD', pitLaneLossMs: 20000, stationaryTimeMs: 2500, totalLossMs: 22500 })) } };
            }),
        };
    }
    function run(stages: Stage[]) {
        let memory: AttentionMemory = initialAttention(pub(stage(stages[0]), team), team);
        return stages.slice(1).map(x => { const r = assessCheckpoint(memory, pub(stage(x), team), team); memory = r.memory; return r.items.map(i => `${i.kind}${i.entrantId ? `:${i.entrantId}` : ''}`); });
    }
    const rival = (items: string[]) => items.filter(i => /RIVAL|WAVE|CROSSOVER/.test(i));
    it('the rival directly ahead pitting pauses once for that player car (same tyre family)', () => {
        const back = [0, 4, 6, 3, 1, 5, 7, 2].map(id);
        expect(run([{ lap: 10 }, { lap: 11, order: back, stops: { [id(2)]: 1 }, tyre: { [id(2)]: 'HARD' } }, { lap: 12, order: back, stops: { [id(2)]: 1 }, tyre: { [id(2)]: 'HARD' } }]).map(rival))
            .toEqual([[`RIVAL_PIT_AHEAD:${id(0)}`], []]);
    });
    it('the rival directly behind switching tyre family is announced as a tyre change', () => {
        expect(run([{ lap: 10 }, { lap: 11, stops: { [id(4)]: 1 }, tyre: { [id(4)]: 'INTERMEDIATE' } }]).map(rival)).toEqual([[`RIVAL_TYRE_BEHIND:${id(0)}`]]);
    });
    it('a distant rival pitting never pauses playback', () => {
        expect(run([{ lap: 10 }, { lap: 11, stops: { [id(6)]: 1 }, tyre: { [id(6)]: 'HARD' } }]).map(rival)).toEqual([[]]);
    });
    it('a field tyre wave (≥30% of running cars switch family within two laps) pauses once', () => {
        const inters = (ids: number[]) => Object.fromEntries(ids.map(n => [id(n), 'INTERMEDIATE' as TyreCompound]));
        const stops = (ids: number[]) => Object.fromEntries(ids.map(n => [id(n), 1]));
        const laps = run([
            { lap: 10 },
            { lap: 11, tyre: inters([6, 7]), stops: stops([6, 7]) },                    // 2 of 8: not yet a wave
            { lap: 12, tyre: inters([6, 7, 3]), stops: stops([6, 7, 3]) },             // 3 of 8 within two laps → wave
            { lap: 13, tyre: inters([6, 7, 3, 5]), stops: stops([6, 7, 3, 5]) },       // the same wave continuing: silent
            { lap: 14, tyre: inters([6, 7, 3, 5, 2]), stops: stops([6, 7, 3, 5, 2]) },
        ]);
        expect(laps.map(l => l.filter(i => i === 'TYRE_WAVE').length)).toEqual([0, 1, 0, 0]);
        expect(WAVE_COOLDOWN_LAPS).toBeGreaterThan(2);
    });
    // Crossovers follow the Race tyre model (≈267‰ slick→inter, ≈719‰ inter→wet at the default circuit), not display bands.
    const both = (compound: TyreCompound) => ({ [id(0)]: compound, [id(1)]: compound });
    const crossovers = (stages: Stage[]) => run(stages).map(l => l.filter(i => i.startsWith('TYRE_CROSSOVER')).length);
    it('slicks: no alert while slicks are still fastest; one alert once inters are genuinely faster; no flicker; re-arms after drying', () => {
        expect(crossovers([{ lap: 10 }, { lap: 11, water: 150 }, { lap: 12, water: 250 }, { lap: 13, water: 275 }, { lap: 14, water: 310 }, { lap: 15, water: 290 }, { lap: 16, water: 320 }, { lap: 17, water: 280 }, { lap: 18, water: 150 }, { lap: 19, water: 320 }]))
            .toEqual([0, 0, 0, 2, 0, 0, 0, 0, 2]);
    });
    it('regression: inters at ~350‰ (inters clearly faster than wets) never get a "switch to wets" alert', () => {
        const inter = both('INTERMEDIATE');
        expect(crossovers([{ lap: 10, water: 300, tyre: inter }, { lap: 11, water: 350, tyre: inter }, { lap: 12, water: 360, tyre: inter }, { lap: 13, water: 340, tyre: inter }, { lap: 14, water: 500, tyre: inter }, { lap: 15, water: 700, tyre: inter }])).toEqual([0, 0, 0, 0, 0]);
    });
    it('inters → wets alerts near the real crossover, and wets → inters when drying', () => {
        const inter = both('INTERMEDIATE'), wet = both('WET');
        expect(crossovers([{ lap: 10, water: 650, tyre: inter }, { lap: 11, water: 710, tyre: inter }, { lap: 12, water: 760, tyre: inter }, { lap: 13, water: 740, tyre: inter }, { lap: 14, water: 780, tyre: inter }])).toEqual([0, 2, 0, 0]);
        expect(crossovers([{ lap: 10, water: 900, tyre: wet }, { lap: 11, water: 720, tyre: wet }, { lap: 12, water: 640, tyre: wet }, { lap: 13, water: 600, tyre: wet }])).toEqual([0, 2, 0]);
    });
    it('reads only public facts: rival wear and hidden strategy never affect the result', () => {
        const a = stage({ lap: 11, stops: { [id(4)]: 1 }, tyre: { [id(4)]: 'HARD' } });
        const b = { ...a, entrants: a.entrants.map(e => ({ ...e, stint: { ...e.stint!, tyre: { ...e.stint!.tyre, wearPermille: 900 } } })) };
        const m = initialAttention(pub(stage({ lap: 10 }), team), team);
        expect(assessCheckpoint(m, pub(b, team), team).items.filter(i => i.reason === 'RIVAL')).toEqual(assessCheckpoint(m, pub(a, team), team).items.filter(i => i.reason === 'RIVAL'));
    });
});

describe('multi-tab stale notice', () => {
    let root: Root | null = null, host: HTMLDivElement | null = null;
    afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; checkpoint.mockReset(); advance.mockReset(); });
    async function mount() {
        host = document.createElement('div'); document.body.append(host); root = createRoot(host);
        await act(async () => root!.render(<I18nProvider><RaceOperations initialData={viewerView(4)}/></I18nProvider>));
        return host;
    }
    it('a returning tab whose saved Race has moved on shows the notice and a refresh action', async () => {
        checkpoint.mockResolvedValue({ lap: 3, status: 'RUNNING' });
        const el = await mount();
        expect(el.querySelector('.race-stale')).toBeNull();
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        const notice = el.querySelector('.race-stale');
        expect(notice?.getAttribute('role')).toBe('alert');
        expect(notice?.textContent).toContain('Race advanced in another tab or device. Refresh to load the latest checkpoint.');
        expect(notice?.querySelector('button')?.textContent).toBe('Refresh');
        expect(advance).not.toHaveBeenCalled();
    });
    it('no notice when the saved checkpoint matches this tab', async () => {
        checkpoint.mockResolvedValue({ lap: 0, status: 'RUNNING' });
        const el = await mount();
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(checkpoint).toHaveBeenCalled();
        expect(el.querySelector('.race-stale')).toBeNull();
    });
    it('a STALE answer from the server shows the same notice instead of a generic error', async () => {
        advance.mockResolvedValue({ data: null, error: 'STALE' });
        const el = await mount();
        await act(async () => { (el.querySelector('.play-toggle') as HTMLButtonElement).click(); });
        await act(async () => { await new Promise(r => setTimeout(r, 3000)); });
        expect(advance).toHaveBeenCalled();
        expect(el.querySelector('.race-stale')?.textContent).toContain('Race advanced in another tab or device.');
        expect(el.querySelector('.attention-error')).toBeNull();
    }, 10_000);
    it.each(['en', 'zh-TW'] as const)('%s copy exists', locale => {
        expect(translate(locale, 'viewer.stale')).not.toBe('viewer.stale'); expect(translate(locale, 'viewer.refresh')).not.toBe('viewer.refresh');
    });
});

const PREP = { setup: NEUTRAL_SETUP, ideal: { AERO: 55, MECHANICAL: 45, RIDE: 50, BRAKE: 52, TYRE: 48 }, confidence: 500, acclimatisation: 600, tyreKnowledge: { SOFT: 500, MEDIUM: 500, HARD: 300, INTERMEDIATE: 100, WET: 100 } };
function qualifyingInput(seed: number, kind: 'QUALIFYING' | 'SPRINT_QUALIFYING', baseLapTimeMs = 86_667): QualifyingInput {
    const format = qualifyingFormat(22, kind);
    return { version: 1, seed, stepMs: QUALIFYING_STEP_MS, weatherTickMs: QUALIFYING_WEATHER_TICK_MS, baseLapTimeMs, format, tyres: weatherTyreConfiguration(),
        weather: scenarioWeather(seed, qualifyingWeatherTicks(format, QUALIFYING_WEATHER_TICK_MS), 'DRY'),
        entrants: source.driverEntries.slice(0, 22).map((d, i) => ({ entrantId: `e${i}`, driverId: d.driverId, teamId: d.teamId, controller: 'AI' as const,
            driver: { pace: d.pace!, consistency: d.consistency! }, car: { performance: source.teamEntries.find(t => t.teamId === d.teamId)!.carPerformance! }, preparation: PREP, fallbackRank: i + 1 })) };
}
describe('Qualifying forecast wording (phase + countdown)', () => {
    // SQ2, one minute in: the session clock started 12 min (SQ1) + 7 min (break) + 1 min ago = weather tick 14 at 19:30.
    const base = createQualifying(qualifyingInput(5, 'SPRINT_QUALIFYING'));
    const window = (from: number, to: number, min = 300, max = 600) => ({ arrivalMinLap: from, arrivalMaxLap: to, rainfallMin: min, rainfallMax: max });
    const state: QualifyingState = { ...base, phase: 'Q2', phaseElapsedMs: 60_000, sessionElapsedMs: 1_170_000, weatherTick: 14,
        input: { ...base.input, weather: { ...base.input.weather, forecast: [window(1, 1, 0, 0), window(14, 18), window(22, 26), window(40, 42)] } } };
    it('maps public windows onto the current and later phases; windows after the session are dropped', () => {
        expect(qualifyingForecast(state)).toEqual([
            { from: { phase: 'Q2', remainingMs: 540_000 }, to: { phase: 'Q2', remainingMs: 180_000 }, rainfallMin: 300, rainfallMax: 600 },
            { from: { phase: 'Q3', remainingMs: null }, to: { phase: 'Q3', remainingMs: 360_000 }, rainfallMin: 300, rainfallMax: 600 },
        ]);
        expect(qualifyingForecast({ ...state, status: 'FINISHED' })).toEqual([]);
    });
    const text = (locale: Locale, i: number, kind: 'SPRINT_QUALIFYING' | 'QUALIFYING' = 'SPRINT_QUALIFYING') => forecastText(qualifyingForecast(state)[i], kind, (k, v) => translate(locale, k, v),
        ms => `${Math.floor(ms / 60_000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`, n => `${n / 10}%`);
    it('English: "Rain likely during SQ2 (~9:00–3:00 remaining)" and the break before a later phase', () => {
        expect(text('en', 0)).toBe('Rain likely during SQ2 (~9:00–3:00 remaining): rain 30%–60%');
        expect(text('en', 1)).toBe('Rain likely from the break before SQ3 to SQ3 ~6:00 remaining: rain 30%–60%');
        expect(text('en', 0, 'QUALIFYING')).toContain('during Q2');
    });
    it('light windows read as possible light rain on a dry track, and as easing only while heavier rain is falling', () => {
        const light = { ...qualifyingForecast(state)[0], rainfallMin: 0, rainfallMax: 150 }, t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('en', k, v);
        const clock = (ms: number) => `${ms / 60_000}:00`, pct = (n: number) => `${n / 10}%`;
        expect(forecastText(light, 'SPRINT_QUALIFYING', t, clock, pct, 0)).toMatch(/^Light rain possible during SQ2/);
        expect(forecastText(light, 'SPRINT_QUALIFYING', t, clock, pct, 500)).toMatch(/^Rain easing during SQ2/);
        expect(translate('zh-TW', 'qualifying.forecast.light')).not.toBe('qualifying.forecast.light');
    });
    it('Traditional Chinese uses the same phase and countdown reference', () => {
        expect(text('zh-TW', 0)).toBe('可能降雨：SQ2（剩餘約 9:00–3:00）；降雨 30%–60%');
        expect(text('zh-TW', 1)).toContain('SQ3 開始前的休息時段');
        expect(text('zh-TW', 1)).toContain('SQ3 剩餘約 6:00');
    });
});

describe('Sprint SQ3 late runs', () => {
    function finish(s: QualifyingState, onComplete: (s: QualifyingState) => void) {
        for (let n = 0; n < 3000 && s.status !== 'FINISHED'; n++) { if (s.phaseStatus === 'COMPLETE') { onComplete(s); s = continuePhase(s, s.phase); } else s = stepQualifying(s); }
        onComplete(s); return s;
    }
    it('SQ3 ends on its climax: most final laps land in the last 90 s; SQ1/SQ2 still give every car a time', () => {
        let late = 0, cars = 0;
        for (const seed of [3, 17, 29, 41]) for (const lap of [76_000, 101_000]) finish(createQualifying(qualifyingInput(seed, 'SPRINT_QUALIFYING', lap)), s => {
            if (s.phaseStatus !== 'COMPLETE') return;
            const d = phaseFormat(s).durationMs, running = s.entrants.filter(e => e.eliminatedIn === null || e.eliminatedIn === s.phase);
            for (const e of running) expect(e.best[s.phase], `${s.phase} ${e.entrantId}`).not.toBeNull();
            if (s.phase === 'Q3') for (const e of running) { cars++; if (d - e.best.Q3!.setAtMs <= 90_000) late++; }
        });
        expect(late / cars).toBeGreaterThan(0.6);
    });
    it('the SQ3 release is scheduled back from the flag; Grand Prix Q3 keeps its early staggered release', () => {
        const reach = (kind: 'QUALIFYING' | 'SPRINT_QUALIFYING') => { let s = createQualifying(qualifyingInput(11, kind));
            for (let n = 0; n < 3000 && s.phase !== 'Q3'; n++) s = s.phaseStatus === 'COMPLETE' ? continuePhase(s, s.phase) : stepQualifying(s);
            return s.entrants.filter(e => e.eliminatedIn === null).map(e => e.releaseAtMs); };
        for (const r of reach('QUALIFYING')) { expect(r).toBeGreaterThanOrEqual(30_000); expect(r).toBeLessThanOrEqual(130_000); }
        for (const r of reach('SPRINT_QUALIFYING')) expect(r).toBeGreaterThan(150_000);
    });
});

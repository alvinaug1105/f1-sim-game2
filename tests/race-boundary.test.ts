/**
 * Race / Sprint information boundary: the browser receives only the server's public projection. These tests
 * serialise the complete browser payloads (page data and every server-action result) and assert that hidden
 * simulation state is absent — by key and by value, not merely by TypeScript type.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { projectRaceState, projectRaceView } from '../src/features/race/projection';
import { startIncidentCareerRace, advanceCareerRace, simulateCareerRace } from '../src/features/race/service';
import { estimatePitWindow } from '../src/features/race/strategy-estimate';
import { careerRaceWeather, scenarioWeather } from '../src/features/race/weather-scenarios';
import { scheduledLaps } from '../src/features/race/development-profiles';
import { forecastAt } from '../src/simulation/race/weather/model';
import { projectedFuelGrams } from '../src/simulation/race/commands/model';
import { createRace, advanceRace } from '../src/simulation/race/engine';
import { careerGrid, raceRepository } from './helpers/grid';
import { incidentInput, neutralise } from './helpers/incidents';
import type { CareerRaceRepository } from '../src/game/domain/race-repository';
import type { RaceSimulationState } from '../src/simulation/race/types';

let repo: CareerRaceRepository;
vi.mock('../src/features/career/server', () => ({ getRaceRepository: () => repo }));
const { viewerAction, sprintRemainderAction } = await import('../src/features/race/viewer/actions');

/** Hidden authoritative material: RNG, weather truth and model tuning, AI strategy, reliability, incident model, hidden ratings. */
const FORBIDDEN_KEYS = [
    'seed', 'rngState', 'timeline', 'rainfall', 'forecastAccuracy', 'waterProfiles', 'drainagePerLap', 'dryingPerLap', 'accumulationPermille',
    'strategy', 'windowOpenPermille', 'stopPointPermille', 'preferenceSpreadPermille', 'undercutBonusPermille', 'crossoverSpreadPermille', 'forceStopPermille',
    'stopBias', 'undercut', 'trafficSensitivity', 'compound' + 'Preference', 'aiWearThresholdPermille', 'aiMinimumStintLaps', 'ai', 'strategyController',
    'reliability', 'mechanicalPenaltyMs', 'baseMechanicalPpm', 'scMajorPermille', 'vscMinorPermille', 'vscRetirementPermille', 'remainingLaps', 'startedLap',
    'potentialLapTimeMs', 'dirtyAirMs', 'trafficLossMs', 'drsBenefitMs', 'attempted', 'passed',
    'driver', 'car', 'pace', 'consistency', 'carPerformance', 'balance', 'overtaking', 'defending', 'parameters', 'fuelBurnPerLapKg', 'initialFuelKg',
];
function keysOf(value: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(value)) value.forEach(v => keysOf(v, out));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); keysOf(v, out); }
    return out;
}
function expectPublic(payload: unknown, s?: RaceSimulationState) {
    const json = JSON.stringify(payload), keys = keysOf(JSON.parse(json));
    expect(FORBIDDEN_KEYS.filter(k => keys.has(k))).toEqual([]);
    if (s) {
        // The authoritative RNG values never appear as numbers either.
        for (const n of [s.input.seed, s.rngState, s.incidents?.rngState].filter((x): x is number => x !== undefined && Math.abs(x) > 999))
            expect(json).not.toMatch(new RegExp(`(^|[^0-9])${n}([^0-9]|$)`));
    }
    return json;
}
async function liveGrandPrix(kind: 'RACE' | 'SPRINT' = 'RACE', eventIndex = kind === 'SPRINT' ? 1 : 0) {
    const g = await careerGrid('team-mclaren'), m = raceRepository(g, null, { kind, eventIndex });
    await startIncidentCareerRace(m.repository, g.career.id, m.eventId, {});
    await advanceCareerRace(m.repository, g.career.id, m.eventId, 0, 5);
    return { g, m };
}
beforeEach(() => vi.clearAllMocks());

describe('Race view projection', () => {
    it('a live Grand Prix view carries no RNG, weather truth, AI strategy, reliability, incident model or hidden ratings', async () => {
        const { g, m } = await liveGrandPrix(), data = m.get(), s = data.state!;
        expect(s.input.seed).toBeGreaterThan(0); expect(s.input.weather!.timeline.length).toBeGreaterThan(0); expect(s.input.pits!.strategy).toBeDefined();
        const view = projectRaceView(data);
        expect(view.visibility).toBe('PUBLIC'); expect(view.state!.visibility).toBe('PUBLIC');
        expectPublic(view, s);
        // Rivals: public timing, compound and age only. Player cars: their own resources and server-derived insight.
        const mine = new Set(s.input.entrants.filter(e => e.teamId === g.playerTeamId).map(e => e.entrantId));
        for (const e of view.state!.entrants) {
            if (mine.has(e.entrantId)) {
                expect(e.commands).toBeDefined(); expect(e.insight).toBeDefined(); expect(e.fuelMassKg).not.toBeNull();
                expect(e.stint!.tyre.wearPermille).not.toBeNull(); expect(e.pit!.commandRevision).not.toBeNull();
            } else {
                expect(e.commands).toBeUndefined(); expect(e.insight).toBeUndefined(); expect(e.fuelMassKg).toBeNull();
                expect(e.stint!.tyre).toMatchObject({ wearPermille: null, temperatureMilliC: null });
                expect(e.pit!).toMatchObject({ pendingCompound: null, commandRevision: null });
                for (const stint of e.pit!.stints) expect(stint.startingTyre.wearPermille).toBeNull();
            }
            expect(typeof e.stint!.tyre.compound).toBe('string'); expect(typeof e.stint!.tyre.ageLaps).toBe('number');
        }
        // The player's figures are exactly what the authoritative models compute (they used to run in the browser).
        for (const id of mine) {
            const auth = s.entrants.find(e => e.entrantId === id)!, pub = view.state!.entrants.find(e => e.entrantId === id)!;
            expect(pub.insight!.projectedFuelGrams).toBe(projectedFuelGrams(s, auth));
            expect(pub.insight!.pitEstimate).toEqual(estimatePitWindow(s, auth));
        }
        // Projection is read-only and deterministic.
        const before = structuredClone(data);
        expect(projectRaceView(data)).toEqual(view); expect(data).toEqual(before);
    });
    it('negative control: the same check rejects the raw authoritative payload the page used to send', async () => {
        const { m } = await liveGrandPrix(), data = m.get();
        expect(() => expectPublic(data, data.state!)).toThrow();
        const keys = keysOf(data);
        for (const k of ['seed', 'rngState', 'timeline', 'reliability', 'strategy', 'remainingLaps']) expect(keys.has(k)).toBe(true);
    });
    it('states that differ only in hidden data project to the identical view', () => {
        const s = advanceRace(createRace({ ...incidentInput(4), weather: scenarioWeather(7, 58, 'MIXED') }), 6), team = s.input.entrants[0].teamId;
        const hidden: RaceSimulationState = {
            ...s, rngState: s.rngState + 1,
            input: { ...s.input, seed: s.input.seed + 99, weather: { ...s.input.weather!, timeline: [{ startLap: 1, rainfall: 0, airTemperatureMilliC: 20000 }, { startLap: 7, rainfall: 1000, airTemperatureMilliC: 15000 }] },
                pits: s.input.pits && { ...s.input.pits, aiWearThresholdPermille: s.input.pits.aiWearThresholdPermille + 1 },
                entrants: s.input.entrants.map(e => ({ ...e, reliability: e.reliability && { ...e.reliability }, driver: { pace: 1, consistency: 1 } })) },
            incidents: { ...s.incidents!, rngState: s.incidents!.rngState + 5 },
            entrants: s.entrants.map((e, i) => i >= 2 ? { ...e, fuelMassKg: e.fuelMassKg + 3, commands: e.commands && { ...e.commands, paceMode: 'PUSH' as const }, incident: e.incident && { ...e.incident, mechanicalPenaltyMs: 900 } } : e),
        };
        expect(projectRaceState(hidden, team)).toEqual(projectRaceState(s, team));
    });
    it('weather: the server keeps the exact timeline; the view has current conditions and the approximate forecast only', () => {
        const config = scenarioWeather(7, 58, 'MIXED'), s = createRace({ ...incidentInput(4), weather: config }), team = s.input.entrants[0].teamId;
        expect(config.timeline.length).toBeGreaterThan(1);
        for (const lap of [0, 5, 20]) {
            const at = lap ? advanceRace(s, lap) : s, view = projectRaceState(at, team);
            expect(view.weather).toEqual(at.weather);
            expect(view.forecast).toEqual(forecastAt(config, lap + 1));
            // Windows are ranges with uncertainty — never a truth segment (start lap + exact rainfall).
            for (const f of view.forecast!) { expect(f.arrivalMaxLap).toBeGreaterThanOrEqual(f.arrivalMinLap); expect(Object.keys(f).sort()).toEqual(['arrivalMaxLap', 'arrivalMinLap', 'rainfallMax', 'rainfallMin']); }
            expect(JSON.stringify(view)).not.toContain('timeline');
        }
        expect(projectRaceState(s, team).forecast!.length).toBeGreaterThan(0);   // still useful for strategy
        expect(projectRaceState(advanceRace(s, 1000), team).forecast).toEqual([]);
    });
    it('Race Control: current mode and announced events only — never the Safety Car / VSC schedule', () => {
        const s = advanceRace(createRace(incidentInput(4)), 5), team = s.input.entrants[0].teamId;
        const sc = projectRaceState(neutralise(s, 'SAFETY_CAR', 3), team);
        expect(sc.incidents).toEqual({ mode: 'SAFETY_CAR', drsDelay: s.incidents!.drsDelay, endingThisLap: false, events: s.incidents!.events });
        expect(projectRaceState(neutralise(s, 'SAFETY_CAR', 2), team)).toEqual(sc);   // the remaining duration is not observable
        expect(projectRaceState(neutralise(s, 'VSC', 1), team).incidents!.endingThisLap).toBe(true);   // announced on the last lap
        expectPublic(sc);
    });
    it('the preparation view carries grid conditions, the public forecast and names only', async () => {
        const g = await careerGrid('team-mclaren'), m = raceRepository(g, null, { kind: 'SPRINT', eventIndex: 1 }), data = m.get();
        const view = projectRaceView(data), laps = scheduledLaps(data);
        const truth = careerRaceWeather(g.career.id, data.eventId, data.circuit.sourceCircuitId!, laps, 'SPRINT');
        expect(view.state).toBeNull();
        expect(view.preparation).toMatchObject({ laps, conditions: truth.initial, forecast: forecastAt(truth, 1).slice(1) });
        expect(view.preparation!.mine.map(r => r.driverId).sort()).toEqual(data.roster.filter(r => r.teamId === g.playerTeamId).map(r => r.driverId).sort());
        expectPublic(view);
    });
});
describe('server actions return only the public projection', () => {
    it('advance and every player command for BOTH player cars (pace, fuel, ERS, pit + compound, cancel) stay server-authoritative', async () => {
        const { g, m } = await liveGrandPrix(); repo = m.repository;
        const players = m.get().state!.input.entrants.filter(e => e.teamId === g.playerTeamId).map(e => e.entrantId);
        expect(players).toHaveLength(2);
        let lap = m.get().state!.lap;
        for (const id of players) {
            const rev = () => m.get().state!.entrants.find(e => e.entrantId === id)!;
            for (const intent of [
                { kind: 'paceMode' as const, entrantId: id, revision: rev().commands!.commandRevision, mode: 'ATTACK' as const },
                { kind: 'fuelMode' as const, entrantId: id, revision: rev().commands!.commandRevision + 1, mode: 'CONSERVE' as const },
                { kind: 'ersMode' as const, entrantId: id, revision: rev().commands!.commandRevision + 2, mode: 'DEPLOY' as const },
            ]) {
                const r = await viewerAction(g.career.id, m.eventId, lap, intent, 'RACE');
                expect(r.error).toBeNull(); expectPublic(r.data, m.get().state!);
            }
            const view = (await viewerAction(g.career.id, m.eventId, lap, { kind: 'pit', entrantId: id, revision: rev().pit!.commandRevision, compound: 'HARD' }, 'RACE')).data!;
            expect(view.state!.entrants.find(e => e.entrantId === id)).toMatchObject({ commands: { paceMode: 'ATTACK', fuelMode: 'CONSERVE', ersMode: 'DEPLOY' }, pit: { pendingCompound: 'HARD' } });
            expect(rev().commands).toMatchObject({ paceMode: 'ATTACK', fuelMode: 'CONSERVE', ersMode: 'DEPLOY' });   // persisted on the server
            const cancelled = (await viewerAction(g.career.id, m.eventId, lap, { kind: 'pit', entrantId: id, revision: rev().pit!.commandRevision, compound: null }, 'RACE')).data!;
            expect(cancelled.state!.entrants.find(e => e.entrantId === id)!.pit!.pendingCompound).toBeNull();
        }
        // Stale protection is unchanged: a wrong revision or a wrong expected lap is refused and nothing is returned.
        expect(await viewerAction(g.career.id, m.eventId, lap, { kind: 'paceMode', entrantId: players[0], revision: 0, mode: 'PUSH' }, 'RACE')).toEqual({ data: null, error: 'STALE' });
        expect((await viewerAction(g.career.id, m.eventId, lap + 3, { kind: 'advance' }, 'RACE')).data).toBeNull();
        // An AI car can never be commanded.
        const ai = m.get().state!.input.entrants.find(e => e.teamId !== g.playerTeamId)!.entrantId;
        expect((await viewerAction(g.career.id, m.eventId, lap, { kind: 'paceMode', entrantId: ai, revision: 0, mode: 'PUSH' }, 'RACE')).data).toBeNull();
        const advanced = await viewerAction(g.career.id, m.eventId, lap, { kind: 'advance' }, 'RACE');
        lap += 1; expect(advanced.data!.state!.lap).toBe(lap); expectPublic(advanced.data, m.get().state!);
    });
    it('each action returns exactly the projection of the persisted authoritative Race (reload shows the same)', async () => {
        const { g, m } = await liveGrandPrix(); repo = m.repository;
        const id = m.get().state!.input.entrants.find(e => e.teamId === g.playerTeamId)!.entrantId;
        const rev = m.get().state!.entrants.find(e => e.entrantId === id)!.commands!.commandRevision;
        const commanded = await viewerAction(g.career.id, m.eventId, 5, { kind: 'paceMode', entrantId: id, revision: rev, mode: 'PUSH' }, 'RACE');
        expect(commanded.data).toEqual(projectRaceView(m.get()));
        const advanced = await viewerAction(g.career.id, m.eventId, 5, { kind: 'advance' }, 'RACE');
        expect(advanced.data).toEqual(projectRaceView(await m.repository.getRace(g.career.id, m.eventId) as NonNullable<Awaited<ReturnType<typeof m.repository.getRace>>>));
    });
    it('Sprint: Simulate Remainder returns the public result; Simulate Sprint needs no hidden state', async () => {
        const { g, m } = await liveGrandPrix('SPRINT'); repo = m.repository;
        const r = await sprintRemainderAction(g.career.id, m.eventId, m.get().state!.lap);
        expect(r.error).toBeNull(); expect(r.data!.kind).toBe('SPRINT'); expect(r.data!.state!.status).toBe('FINISHED');
        expectPublic(r.data, m.get().state!);
        const fresh = await careerGrid('team-aurora'), s2 = raceRepository(fresh, null, { kind: 'SPRINT', eventIndex: 1 });
        expectPublic(projectRaceView(s2.get()));   // the pre-start page
        await simulateCareerRace(s2.repository, fresh.career.id, s2.eventId);
        expectPublic(projectRaceView(s2.get()), s2.get().state!);
    });
});

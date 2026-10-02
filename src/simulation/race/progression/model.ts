import { validateCommandState, type CommandState } from '../commands/model';
import type { RaceEntrantState, RaceSimulationState } from '../types';
/** One microlap = 1 / 1,000,000 lap. Integer total distance is canonical (track.progressMicrolaps). */
export const LAP_UNITS = 1_000_000;
export type SegmentKind = 'STRAIGHT' | 'FAST' | 'MEDIUM' | 'SLOW' | 'PIT_ENTRY' | 'PIT_LANE' | 'PIT_EXIT';
export type ZoneKind = 'PASSING' | 'DIRTY_AIR' | 'ASSISTANCE' | 'BRAKING' | 'BLUE_FLAG';
export interface LocalSegment { id: string; kind: SegmentKind; start: number; end: number }
export interface InteractionZone { id: string; kind: ZoneKind; start: number; end: number }
export interface ProgressionConfiguration {
    version: 1;
    resolution: typeof LAP_UNITS;
    segments: readonly LocalSegment[];
    zones: readonly InteractionZone[];
    pit: { entry: number; service: number; exit: number; segments: readonly LocalSegment[] };
    lapping: { thresholdMs: number; resistancePermille: number; passingCostMs: number; failedCostMs: number };
}
/** Hidden current-lap integration state, not a browser payload. All future-affecting integers are persisted. */
export interface CarProgression {
    remainder: number;
    launchDelayMs: number;
    lapStartedAtMs: number;
    freeLapMs: number;
    expectedLapMs: number;
    commandMs: number;
    variationMs: number;
    lapCommands: CommandState | null;
    delayMs: number;
    attemptedLap: number;
    passedByLap: number;
    lappedAheadId: string | null;
    passingId: string | null;
    lappingPass: boolean;
    completedLappingPasses: number;
    route: 'TRACK' | 'ENTRY' | 'LANE' | 'SERVICE' | 'EXIT';
    pitEntryLap: number | null;
    compound: import('../tyres/model').TyreCompound | null;
    stationaryMs: number;
    pitLossMs: number;
}
export interface ProgressionState {
    elapsedTimeMs: number;
    cars: Readonly<Record<string, CarProgression>>;
}
export function localProgress(total: number) { return total % LAP_UNITS; }
export function segmentAt(c: ProgressionConfiguration, total: number, route: CarProgression['route'] = 'TRACK') {
    const p = localProgress(total);
    const segments = route === 'TRACK' ? c.segments : c.pit.segments;
    return segments.find(s => p >= s.start && p < s.end) ?? c.segments.find(s => p >= s.start && p < s.end)!;
}
export function zonesAt(c: ProgressionConfiguration, total: number) {
    const p = localProgress(total);
    return c.zones.filter(z => z.start <= z.end ? p >= z.start && p < z.end : p >= z.start || p < z.end);
}
/** Physical distance forward around the circuit, independent of classification / number of completed race laps. */
export function forwardDistance(from: number, to: number) { return (localProgress(to) - localProgress(from) + LAP_UNITS) % LAP_UNITS; }
export function physicalAhead(entrants: readonly RaceEntrantState[], car: RaceEntrantState, cars?: ProgressionState['cars']) {
    return entrants.filter(e => e.entrantId !== car.entrantId && e.incident?.status === 'RUNNING' && (forwardDistance(car.track!.progressMicrolaps,e.track!.progressMicrolaps)>0 || e.position<car.position) && (!cars || cars[e.entrantId].route === 'TRACK'))
        .map(e => ({ entrant: e, distance: forwardDistance(car.track!.progressMicrolaps, e.track!.progressMicrolaps) }))
        .sort((a, b) => a.distance - b.distance || a.entrant.entrantId.localeCompare(b.entrant.entrantId))[0] ?? null;
}
export function physicalBehind(entrants: readonly RaceEntrantState[], car: RaceEntrantState, cars?: ProgressionState['cars']) {
    return entrants.filter(e => e.entrantId !== car.entrantId && e.incident?.status === 'RUNNING' && (!cars || cars[e.entrantId].route === 'TRACK'))
        .map(e => ({ entrant: e, distance: forwardDistance(e.track!.progressMicrolaps,car.track!.progressMicrolaps) }))
        .sort((a,b)=>a.distance-b.distance || a.entrant.position-b.entrant.position)[0] ?? null;
}
export function initialCarProgression(gridPosition: number, gridOffsetMs: number): CarProgression {
    return { remainder: 0, launchDelayMs: (gridPosition - 1) * gridOffsetMs, lapStartedAtMs: 0, freeLapMs: 0, expectedLapMs: 0, commandMs: 0, variationMs: 0, lapCommands: null, delayMs: 0, attemptedLap: -1, passedByLap: -1, lappedAheadId: null, passingId: null, lappingPass: false, completedLappingPasses: 0, route: 'TRACK', pitEntryLap: null, compound: null, stationaryMs: 0, pitLossMs: 0 };
}
function integer(n: number, lo: number, hi: number) { if (!Number.isSafeInteger(n) || n < lo || n > hi) throw new RangeError('Invalid v8 progression integer'); }
export function validateProgressionConfiguration(c: ProgressionConfiguration) {
    if (!c || c.version !== 1 || c.resolution !== LAP_UNITS || !Array.isArray(c.segments) || !c.segments.length || !Array.isArray(c.zones)) throw new RangeError('Missing v8 circuit progression');
    let end = 0;
    const ids = new Set<string>();
    for (const s of c.segments) {
        if (!s.id || ids.has(s.id) || !['STRAIGHT','FAST','MEDIUM','SLOW'].includes(s.kind) || s.start !== end) throw new RangeError('Invalid ordered v8 segments');
        integer(s.end, s.start + 1, LAP_UNITS); ids.add(s.id); end = s.end;
    }
    if (end !== LAP_UNITS) throw new RangeError('Segments must cover exactly one lap');
    for (const z of c.zones) {
        if (!z.id || ids.has(z.id) || !['PASSING','DIRTY_AIR','ASSISTANCE','BRAKING','BLUE_FLAG'].includes(z.kind)) throw new RangeError('Invalid v8 zone');
        integer(z.start, 0, LAP_UNITS - 1); integer(z.end, 1, LAP_UNITS); if (z.start === z.end) throw new RangeError('Empty v8 zone'); ids.add(z.id);
    }
    integer(c.pit.entry, 1, LAP_UNITS - 2); integer(c.pit.service, c.pit.entry + 1, LAP_UNITS - 1); integer(c.pit.exit, 1, c.pit.entry - 1);
    if (c.pit.segments.length !== 4 || c.pit.segments[0].kind !== 'PIT_ENTRY' || c.pit.segments[1].kind !== 'PIT_LANE' || c.pit.segments[2].kind !== 'PIT_LANE' || c.pit.segments[3].kind !== 'PIT_EXIT') throw new RangeError('Invalid pit route');
    for (const [i, s] of c.pit.segments.entries()) {
        integer(s.start, 0, LAP_UNITS - 1); integer(s.end, s.start + 1, LAP_UNITS);
        if (s.start !== (i === 0 ? c.pit.entry : i === 3 ? 0 : c.pit.segments[i-1].end) || (i === 2 && s.end !== LAP_UNITS) || (i === 3 && s.end !== c.pit.exit)) throw new RangeError('Invalid pit bounds');
    }
    if (c.pit.segments[1].end !== c.pit.service) throw new RangeError('Invalid pit service position');
    integer(c.lapping.thresholdMs, 1, 10000); integer(c.lapping.resistancePermille, 0, 1000); integer(c.lapping.passingCostMs, 1, 2000); integer(c.lapping.failedCostMs, 1, 2000);
}
export function validateProgressionState(s: RaceSimulationState) {
    validateProgressionConfiguration(s.input.progression!);
    const p = s.progression;
    if (s.simulationVersion !== 8 || !p || !p.cars || Object.keys(p.cars).length !== s.entrants.length) throw new RangeError('Missing v8 progression state');
    integer(p.elapsedTimeMs, 0, 2_147_483_647);
    for (const e of s.entrants) {
        const c = p.cars[e.entrantId]; if (!c || !e.track) throw new RangeError('Missing v8 car progression');
        integer(e.track.progressMicrolaps, 0, s.input.totalLaps * LAP_UNITS);
        if (e.completedLaps !== Math.floor(e.track.progressMicrolaps / LAP_UNITS)) throw new RangeError('Contradictory v8 lap distance');
        integer(c.remainder, 0, 999); integer(c.launchDelayMs, 0, 1_000_000); integer(c.lapStartedAtMs, 0, p.elapsedTimeMs);
        integer(c.freeLapMs, 0, 1_000_000); integer(c.expectedLapMs, 0, 1_000_000); integer(c.commandMs, -15000, 15000); integer(c.variationMs, -500, 500);
        if (c.lapCommands !== null) validateCommandState(c.lapCommands,s.input.commands!);
        if (c.freeLapMs>0 && c.lapCommands===null) throw new RangeError('Missing v8 lap commands');
        integer(c.delayMs, 0, 1_000_000); integer(c.attemptedLap, -1, s.lap); integer(c.passedByLap, -1, s.lap);
        integer(c.completedLappingPasses,0,100000);
        if (typeof c.lappingPass !== 'boolean' || (c.passingId !== null && !p.cars[c.passingId])) throw new RangeError('Invalid v8 pass context');
        if (c.lappedAheadId !== null && !p.cars[c.lappedAheadId]) throw new RangeError('Invalid lapped target');
        if (!['TRACK','ENTRY','LANE','SERVICE','EXIT'].includes(c.route)) throw new RangeError('Invalid v8 pit phase');
        integer(c.stationaryMs, 0, 60000); integer(c.pitLossMs, 0, 1_000_000);
        if (c.route !== 'TRACK' && (c.pitEntryLap === null || !c.compound || !s.input.tyres?.profiles[c.compound])) throw new RangeError('Missing v8 pit commitment');
        if (c.pitEntryLap !== null) integer(c.pitEntryLap, 0, s.input.totalLaps - 1);
    }
}
/** Classification is total race distance; local neighbour order is a separate circular query. */
export function classifyProgress(entrants: readonly RaceEntrantState[], baseLapMs: number, finished = false): RaceEntrantState[] {
    const active = entrants.filter(e => e.incident!.status !== 'RETIRED').sort((a,b) => finished
        ? b.completedLaps - a.completedLaps || a.elapsedTimeMs - b.elapsedTimeMs || a.entrantId.localeCompare(b.entrantId)
        : b.track!.progressMicrolaps - a.track!.progressMicrolaps || a.position - b.position || a.entrantId.localeCompare(b.entrantId));
    const retired = entrants.filter(e => e.incident!.status === 'RETIRED').sort((a,b) => b.track!.progressMicrolaps - a.track!.progressMicrolaps || a.incident!.retirementOrder! - b.incident!.retirementOrder!);
    return [...active, ...retired].map((e,i) => {
        const leader = active[0], ahead = active[i-1];
        const gap = (a: RaceEntrantState) => finished ? e.elapsedTimeMs - a.elapsedTimeMs : Math.round((a.track!.progressMicrolaps - e.track!.progressMicrolaps) * baseLapMs / LAP_UNITS);
        return { ...e, position: i+1, gapToLeaderMs: e.incident!.status === 'RETIRED' || !leader || (finished ? e.completedLaps !== leader.completedLaps : leader.track!.progressMicrolaps-e.track!.progressMicrolaps>=LAP_UNITS) ? null : Math.max(0,gap(leader)), intervalToAheadMs: e.incident!.status === 'RETIRED' ? null : i === 0 ? 0 : ahead && (finished ? e.completedLaps === ahead.completedLaps : ahead.track!.progressMicrolaps-e.track!.progressMicrolaps<LAP_UNITS) ? Math.max(0,gap(ahead)) : null };
    });
}

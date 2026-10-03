import { fallbackLayout } from './circuit-layouts';
import { prepareCircuitPath } from '../../game/domain/circuit-geometry';
import type { CircuitMapLayout } from '../../game/domain/circuit-layout';
import { LAP_UNITS, type ProgressionConfiguration, type LocalSegment, type InteractionZone, type SegmentKind } from '../../simulation/race/progression/model';
import { circuitSegmentKinds, fallbackSegmentKinds, lapLineShift, SEGMENT_COUNT } from './circuit-race-metadata';
import { circuitPitLanes, type CircuitPitLane } from './circuit-pit-lanes';
import { raceRegulationForSession, type RegulatedSession } from '../../simulation/race/regulations/tyres';
/**
 * Race progression content. Authoritative metadata is explicit normalised data (circuit-race-metadata.ts and the
 * progress anchors of circuit-pit-lanes.ts): it is NOT derived from the drawn x/y geometry at run time, so correcting or
 * re-styling a map can never retune the Race. Zones are coarse management abstractions, not FIA assistance zones.
 * Each new Race freezes the catalogue it was created with.
 */
const KIND: Readonly<Record<string, SegmentKind>> = { S: 'STRAIGHT', F: 'FAST', M: 'MEDIUM', L: 'SLOW' };
const CODE: Readonly<Record<string, string>> = { STRAIGHT: 'S', FAST: 'F', MEDIUM: 'M', SLOW: 'L' };
/** The original geometric classification (kept for the development fallback and to document how the frozen data was made). */
export function segmentKindsForLayout(layout: CircuitMapLayout) {
    const path = prepareCircuitPath(layout);
    return Array.from({ length: SEGMENT_COUNT }, (_, i) => {
        const p = (i + .5) / SEGMENT_COUNT, a = path.sample(p - .012), b = path.sample(p), c = path.sample(p + .012);
        const before = Math.atan2(b.y-a.y,b.x-a.x), after = Math.atan2(c.y-b.y,c.x-b.x);
        const bend = Math.abs(Math.atan2(Math.sin(after-before),Math.cos(after-before)));
        return CODE[bend < .12 ? 'STRAIGHT' : bend < .4 ? 'FAST' : bend < .9 ? 'MEDIUM' : 'SLOW'];
    }).join('');
}
/** Revision-1 (v8A) configuration from frozen segment kinds; its coarse pit route is historical v8A content. */
export function progressionFromKinds(kinds: string): ProgressionConfiguration {
    if (kinds.length !== SEGMENT_COUNT || [...kinds].some(k => !KIND[k])) throw new RangeError('Invalid segment kinds');
    const segments: LocalSegment[] = [...kinds].map((k, i) => ({ id: `section-${i}`, kind: KIND[k], start: Math.floor(i*LAP_UNITS/SEGMENT_COUNT), end: Math.floor((i+1)*LAP_UNITS/SEGMENT_COUNT) }));
    const zones: InteractionZone[] = segments.flatMap((s,i) => [
        { id: `air-${i}`, kind: 'DIRTY_AIR' as const, start: s.start, end: s.end },
        { id: `blue-${i}`, kind: 'BLUE_FLAG' as const, start: s.start, end: s.end },
        ...(s.kind === 'STRAIGHT' || s.kind === 'FAST' ? [{ id: `pass-${i}`, kind: 'PASSING' as const, start: s.start, end: s.end }, { id: `assist-${i}`, kind: 'ASSISTANCE' as const, start: s.start, end: s.end }] : [{ id: `brake-${i}`, kind: 'BRAKING' as const, start: s.start, end: s.end }]),
    ]);
    return { version: 1, resolution: LAP_UNITS, segments, zones,
        // Historical v8A coarse pit route (frozen v8A content; revision 2 uses authored per-circuit anchors instead).
        pit: { entry: 920000, service: 970000, exit: 40000, segments: [
            { id: 'pit-entry', kind: 'PIT_ENTRY', start: 920000, end: 940000 },
            { id: 'pit-lane-in', kind: 'PIT_LANE', start: 940000, end: 970000 },
            { id: 'pit-lane-out', kind: 'PIT_LANE', start: 970000, end: LAP_UNITS },
            { id: 'pit-exit', kind: 'PIT_EXIT', start: 0, end: 40000 },
        ] }, lapping: { thresholdMs: 1500, resistancePermille: 100, passingCostMs: 120, failedCostMs: 160 } };
}
export function progressionForLayout(layout: CircuitMapLayout): ProgressionConfiguration { return progressionFromKinds(segmentKindsForLayout(layout)); }
export const circuitProgression: Readonly<Record<string, ProgressionConfiguration>> = Object.fromEntries(Object.entries(circuitSegmentKinds).map(([id, kinds]) => [id, progressionFromKinds(kinds)]));
export const fallbackProgression = progressionFromKinds(fallbackSegmentKinds);
export function progressionForCircuit(sourceCircuitId?: string | null) { return sourceCircuitId ? circuitProgression[sourceCircuitId] ?? fallbackProgression : fallbackProgression; }

/** Electrical assistance window: the longest contiguous straight/fast run of the SOURCE kinds (unchanged v8B rule). */
function assistanceFor(kinds: string, shift: number): NonNullable<ProgressionConfiguration['assistance']> {
    const runs: {start:number;end:number}[] = [];
    for (const s of progressionFromKinds(kinds).segments.filter(s => s.kind === 'STRAIGHT' || s.kind === 'FAST')) { const last = runs.at(-1); if (last?.end === s.start) last.end = s.end; else runs.push({ start: s.start, end: s.end }); }
    const run = [...runs].sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start)[0] ?? { start: 0, end: 15625 };
    // A lap-line shift moves the same physical window by a whole number of segments (it must not wrap the lap line).
    const offset = shift * LAP_UNITS / SEGMENT_COUNT, start = (run.start - offset + LAP_UNITS) % LAP_UNITS, end = start + run.end - run.start, detection = (run.start - 5000 - offset + 2 * LAP_UNITS) % LAP_UNITS;
    if (end > LAP_UNITS) throw new RangeError('Assistance window would wrap the lap line');
    return { capacity:1000000, initialCharge:700000, detection, deploymentStart:start, deploymentEnd:end, thresholdMs:1000, maxWater:350, straightDeltaMs:0, boostDeltaMs:400, overtakeDeltaMs:600,
        deploymentPerSecond:{RECHARGE:0,BALANCED:2000,BOOST:8000}, recoveryPerSecond:{RECHARGE:5000,BALANCED:1500,BOOST:500}, overtakePerSecond:10000 };
}
const rotate = (kinds: string, shift: number) => kinds.slice(shift) + kinds.slice(0, shift);
/** Authoritative pit progress anchors only — the drawn lane is presentation content (circuit-pit-lanes.ts). */
function pitFor(l: Pick<CircuitPitLane, 'entry' | 'laneStart' | 'service' | 'exit'>): ProgressionConfiguration['pit'] {
    return { entry: l.entry, service: l.service, exit: l.exit, segments: [
        { id: 'pit-entry', kind: 'PIT_ENTRY', start: l.entry, end: l.laneStart },
        { id: 'pit-lane-in', kind: 'PIT_LANE', start: l.laneStart, end: l.service },
        { id: 'pit-lane-out', kind: 'PIT_LANE', start: l.service, end: LAP_UNITS },
        { id: 'pit-exit', kind: 'PIT_EXIT', start: 0, end: l.exit },
    ] };
}
/** Revision-2 (v8B) configuration: frozen kinds (rotated by any lap-line shift), authored pit anchors, assistance window. */
export function progressionBFromMetadata(kinds: string, pit: Pick<CircuitPitLane, 'entry' | 'laneStart' | 'service' | 'exit'>, shift = 0): ProgressionConfiguration {
    if (!Number.isSafeInteger(shift) || shift < 0 || shift >= SEGMENT_COUNT) throw new RangeError('Invalid lap-line shift');
    return { ...progressionFromKinds(rotate(kinds, shift)), version: 2, pit: pitFor(pit), assistance: assistanceFor(kinds, shift) };
}
export const circuitProgressionB: Readonly<Record<string,ProgressionConfiguration>> = Object.fromEntries(Object.entries(circuitSegmentKinds).map(([id, kinds]) => {
    const pit = circuitPitLanes[id];
    if (!pit) throw new RangeError(`Production circuit ${id} has no authored pit lane`);
    return [id, progressionBFromMetadata(kinds, pit, lapLineShift(id))];
}));
/**
 * DEVELOPMENT FALLBACK ONLY (custom / unknown circuits, tests): the schematic layout with a coarse pit route. No
 * production circuit uses it — every one of the 24 has authored anchors above.
 */
export const fallbackProgressionB = progressionBFromMetadata(fallbackSegmentKinds, { entry: 920000, laneStart: 940000, service: 970000, exit: 40000 });
export function progressionBForCircuit(id?:string|null) { return id ? circuitProgressionB[id] ?? fallbackProgressionB : fallbackProgressionB; }
/** Development/test helper: revision-2 content for an arbitrary layout (coarse fallback pit anchors, never production). */
export function progressionBForLayout(layout: CircuitMapLayout = fallbackLayout): ProgressionConfiguration {
    return progressionBFromMetadata(segmentKindsForLayout(layout), { entry: 920000, laneStart: 940000, service: 970000, exit: 40000 });
}
/**
 * Revision-3 (v8C) energy: the same store, deployment and Overtake envelope as v8B, with recovery by DISTANCE
 * travelled while not deploying instead of by time. Per-millilap rates equal the v8B per-second rates over a
 * representative 90 s green lap (RECHARGE 5000/s → 450, BALANCED 1500/s → 135), so a green lap keeps its v8B budget
 * while SC/VSC, pit-lane and slow running no longer multiply recovery. BOOST recovers nothing: it is a pure depletion
 * mode with no non-zero equilibrium. (Exact values are v8D tuning.)
 */
export function v8cEnergy(a: NonNullable<ProgressionConfiguration['assistance']>): NonNullable<ProgressionConfiguration['assistance']> {
    return { ...a, recoveryPerSecond: { RECHARGE: 0, BALANCED: 0, BOOST: 0 }, recoveryPerMillilap: { RECHARGE: 450, BALANCED: 135, BOOST: 0 } };
}
/** Revision-3 (v8C) configuration: revision-2 circuit content, v8C energy and the session's frozen regulation. */
export function progressionCFrom(b: ProgressionConfiguration, session: RegulatedSession): ProgressionConfiguration {
    if (b.version !== 2) throw new RangeError('v8C derives from v8B circuit content');
    return { ...b, version: 3, assistance: v8cEnergy(b.assistance!), regulation: raceRegulationForSession(session) };
}
export function progressionCForCircuit(id: string | null | undefined, session: RegulatedSession) { return progressionCFrom(progressionBForCircuit(id), session); }

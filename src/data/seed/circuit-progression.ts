import { circuitLayouts, fallbackLayout, layoutForCircuit } from './circuit-layouts';
import { prepareCircuitPath } from '../../game/domain/circuit-geometry';
import type { CircuitMapLayout } from '../../game/domain/circuit-layout';
import { LAP_UNITS, type ProgressionConfiguration, type LocalSegment, type InteractionZone } from '../../simulation/race/progression/model';
/**
 * Foundation segment catalogue derived from the existing distance-normalised racing-direction geometry. This is
 * content preparation, not simulator circuit-name branching. It can be replaced/overridden by authored database
 * segments later; each new Race freezes the chosen catalogue. Zones are coarse management abstractions, not FIA
 * assistance zones or a new assistance rule. Uniform distance sampling avoids source-vertex-density bias.
 */
export function progressionForLayout(layout: CircuitMapLayout): ProgressionConfiguration {
    const path = prepareCircuitPath(layout), count = 64;
    const segments: LocalSegment[] = Array.from({ length: count }, (_, i) => {
        const p = (i + .5) / count, a = path.sample(p - .012), b = path.sample(p), c = path.sample(p + .012);
        const before = Math.atan2(b.y-a.y,b.x-a.x), after = Math.atan2(c.y-b.y,c.x-b.x);
        const bend = Math.abs(Math.atan2(Math.sin(after-before),Math.cos(after-before)));
        return { id: `section-${i}`, kind: bend < .12 ? 'STRAIGHT' : bend < .4 ? 'FAST' : bend < .9 ? 'MEDIUM' : 'SLOW', start: Math.floor(i*LAP_UNITS/count), end: Math.floor((i+1)*LAP_UNITS/count) };
    });
    const zones: InteractionZone[] = segments.flatMap((s,i) => [
        { id: `air-${i}`, kind: 'DIRTY_AIR' as const, start: s.start, end: s.end },
        { id: `blue-${i}`, kind: 'BLUE_FLAG' as const, start: s.start, end: s.end },
        ...(s.kind === 'STRAIGHT' || s.kind === 'FAST' ? [{ id: `pass-${i}`, kind: 'PASSING' as const, start: s.start, end: s.end }, { id: `assist-${i}`, kind: 'ASSISTANCE' as const, start: s.start, end: s.end }] : [{ id: `brake-${i}`, kind: 'BRAKING' as const, start: s.start, end: s.end }]),
    ]);
    return { version: 1, resolution: LAP_UNITS, segments, zones,
        // Coarse pit route aligned to the existing start/finish; no claim of surveyed pit-lane geometry.
        pit: { entry: 920000, service: 970000, exit: 40000, segments: [
            { id: 'pit-entry', kind: 'PIT_ENTRY', start: 920000, end: 940000 },
            { id: 'pit-lane-in', kind: 'PIT_LANE', start: 940000, end: 970000 },
            { id: 'pit-lane-out', kind: 'PIT_LANE', start: 970000, end: LAP_UNITS },
            { id: 'pit-exit', kind: 'PIT_EXIT', start: 0, end: 40000 },
        ] }, lapping: { thresholdMs: 1500, resistancePermille: 100, passingCostMs: 120, failedCostMs: 160 } };
}
export const circuitProgression: Readonly<Record<string, ProgressionConfiguration>> = Object.fromEntries(Object.entries(circuitLayouts).map(([id, layout]) => [id, progressionForLayout(layout)]));
export const fallbackProgression = progressionForLayout(fallbackLayout);
export function progressionForCircuit(sourceCircuitId?: string | null) { return sourceCircuitId ? circuitProgression[sourceCircuitId] ?? progressionForLayout(layoutForCircuit(sourceCircuitId)) : fallbackProgression; }

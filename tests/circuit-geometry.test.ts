/**
 * Race v8B circuit fidelity: permanent validation of the 24 production circuits — main-track geometry, authored pit
 * lanes (authoritative progress anchors + presentation routes), the separation between presentation geometry and
 * frozen Race metadata, and phone map orientation. See docs/circuit-geometry-sources.md for the FIA sources.
 */
import { describe, expect, it } from 'vitest';
import { circuitLayouts, sourceCircuitLayouts } from '../src/data/seed/circuit-layouts';
import { circuitPitLanes, drawnPitLane } from '../src/data/seed/circuit-pit-lanes';
import { circuitSegmentKinds, lapLineShift, SEGMENT_COUNT } from '../src/data/seed/circuit-race-metadata';
import { circuitProgression, circuitProgressionB, progressionForLayout, progressionBFromMetadata, progressionBForCircuit, segmentKindsForLayout } from '../src/data/seed/circuit-progression';
import { compactRotation, orientLayout, prepareCircuitPath, rotateMapPoints, validLayout } from '../src/game/domain/circuit-geometry';
import { PIT_LANE_UNIT, racePitRoute, samplePitRoute, validatePitLaneShape, type PitRouteGeometry } from '../src/game/domain/pit-geometry';
import { validateProgressionConfiguration, LAP_UNITS } from '../src/simulation/race/progression/model';
import { raceMapCanvas, COMPACT_MAP_MAX_HEIGHT } from '../src/features/race/viewer/track-map';
import type { CircuitMapLayout, MapPoint } from '../src/game/domain/circuit-layout';

const ids = Object.keys(circuitLayouts);
const SUZUKA = '00000000-0000-4000-8000-000000000301', MONZA = '00000000-0000-4000-8000-000000000315';
/** Densely sampled main racing line in the layout frame. */
function mainLine(layout: CircuitMapLayout) { const path = prepareCircuitPath(layout); return Array.from({ length: 4000 }, (_, i) => path.sample(i / 4000)); }
const nearest = (line: readonly MapPoint[], p: MapPoint) => Math.min(...line.map(q => Math.hypot(q.x - p.x, q.y - p.y)));

describe('production catalogue', () => {
    it('has exactly the 24 production circuits, Suzuka keeping its stable ID', () => {
        expect(ids).toHaveLength(24);
        expect(circuitLayouts[SUZUKA].id).toBe('suzuka');
        for (const map of [circuitPitLanes, circuitSegmentKinds, circuitProgression, circuitProgressionB]) expect(Object.keys(map).sort()).toEqual([...ids].sort());
    });
    it.each(ids)('%s: closed, finite, normalised main track with a valid lap line', id => {
        const layout = circuitLayouts[id];
        expect(validLayout(layout)).toBe(true); expect(layout.closed).toBe(true); expect(layout.points.length).toBeGreaterThan(50);
        expect(layout.metadata?.realGeometry).toBe(true);
        expect(layout.startFinishProgress).toBe(lapLineShift(id) / SEGMENT_COUNT);
        // Presentation geometry is the source geometry, only re-anchored.
        expect(layout.points).toEqual(sourceCircuitLayouts[id].points);
    });
});

describe('authored pit lanes (no generic production route)', () => {
    it.each(ids)('%s: authoritative anchors are authored, ordered and frozen into revision-2 content without x/y', id => {
        const lane = circuitPitLanes[id], config = circuitProgressionB[id];
        validatePitLaneShape(lane);
        expect(lane.entry).toBeLessThan(lane.laneStart); expect(lane.laneStart).toBeLessThan(lane.service); expect(lane.service).toBeLessThan(LAP_UNITS);
        expect(lane.exit).toBeGreaterThan(0); expect(lane.exit).toBeLessThan(lane.entry);
        expect(lane.reference.year).toBeGreaterThanOrEqual(2025); expect(lane.reference.document).toMatch(/^FIA /);
        validateProgressionConfiguration(config);
        expect(config.version).toBe(2); expect(config.pit.geometry).toBeUndefined();
        expect(config.pit).toMatchObject({ entry: lane.entry, service: lane.service, exit: lane.exit });
        expect(config.pit.segments.map(s => [s.start, s.end])).toEqual([[lane.entry, lane.laneStart], [lane.laneStart, lane.service], [lane.service, LAP_UNITS], [0, lane.exit]]);
    });
    it('no production circuit uses the former generic route, and the lanes are individually authored', () => {
        const generic = ids.filter(id => circuitPitLanes[id].entry === 920000 && circuitPitLanes[id].exit === 40000);
        expect(generic).toEqual([]);
        expect(new Set(ids.map(id => `${circuitPitLanes[id].entry}/${circuitPitLanes[id].exit}`)).size).toBeGreaterThanOrEqual(22);
        expect(new Set(ids.map(id => JSON.stringify(circuitPitLanes[id].route))).size).toBe(24);
        expect(ids.filter(id => circuitPitLanes[id].side === 'LEFT').length).toBeGreaterThanOrEqual(6);
        expect(ids.filter(id => circuitPitLanes[id].side === 'RIGHT').length).toBeGreaterThanOrEqual(6);
    });
    it.each(ids)('%s: the drawn lane leaves and rejoins the racing line, stays distinct from it, on its side, with no teleport', id => {
        const layout = circuitLayouts[id], shape = circuitPitLanes[id], lane = drawnPitLane(id)!, path = prepareCircuitPath(layout), line = mainLine(layout);
        const pts = lane.points;
        for (const [i, p] of pts.entries()) { expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true); if (i) expect(p.progress).toBeGreaterThan(pts[i - 1].progress); }
        expect(pts[0].progress).toBe(shape.entry); expect(pts.at(-1)!.progress).toBe(LAP_UNITS + shape.exit);
        // Joins: exactly on the racing line at the authored entry and exit.
        const at = (progress: number) => path.sample(progress / LAP_UNITS);
        expect(Math.hypot(pts[0].x - at(shape.entry).x, pts[0].y - at(shape.entry).y)).toBeLessThan(1e-9);
        expect(Math.hypot(pts.at(-1)!.x - at(shape.exit).x, pts.at(-1)!.y - at(shape.exit).y)).toBeLessThan(1e-9);
        // No teleport / shortcut jump between consecutive drawn points.
        for (let i = 1; i < pts.length; i++) expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)).toBeLessThan(.03);
        // Garage (service) point exists on the drawn lane and is visibly off the racing line.
        expect(pts.some(p => p.progress === lane.service)).toBe(true);
        expect(nearest(line, samplePitRoute(lane, lane.service))).toBeGreaterThan(.5 * PIT_LANE_UNIT);
        // Full-lane sections (followed, offset ≥ .9 lane units) are distinct from the main line and on the authored side.
        const sign = shape.side === 'RIGHT' ? 1 : -1;
        for (let k = 0; k < shape.route.length - 1; k++) {
            const a = shape.route[k], b = shape.route[k + 1];
            if (a.chord || a.offset < .9 || b.offset < .9) continue;
            for (const p of pts.filter(p => p.progress > a.progress && p.progress < b.progress)) {
                expect(nearest(line, p)).toBeGreaterThan(.5 * PIT_LANE_UNIT);
                const base = at(p.progress), ahead = at(p.progress + 1500), tx = ahead.x - base.x, ty = ahead.y - base.y;
                expect(Math.sign(tx * (p.y - base.y) - ty * (p.x - base.x))).toBe(sign); // y down: right-hand side is a positive cross product
            }
        }
    });
    it('Miami (V8B-MED-001): the full lane is clearly separate from the racing line, with its anchors unchanged', () => {
        const MIAMI = '00000000-0000-4000-8000-000000000309', shape = circuitPitLanes[MIAMI], lane = drawnPitLane(MIAMI)!, line = mainLine(circuitLayouts[MIAMI]);
        // Timing anchors are untouched by the presentation repair.
        expect([shape.entry, shape.laneStart, shape.service, shape.exit, shape.garage]).toEqual([915000, 945000, 990000, 68000, 990000]);
        // Every full-lane point (lane start → last followed knot, across the lap line) keeps the 0.5-unit clearance (threshold not relaxed)…
        const full = shape.route.filter(k => k.offset >= .9), from = full[0].progress, to = full.at(-1)!.progress;
        const lanePoints = lane.points.filter(p => p.progress >= from && p.progress <= to);
        expect(lanePoints.length).toBeGreaterThan(10);
        for (const p of lanePoints) expect(nearest(line, p)).toBeGreaterThan(.5 * PIT_LANE_UNIT);
        // …and, as presented, it sits well clear (no cusp toward T1): at least 0.8 lane units everywhere on that section.
        expect(Math.min(...lanePoints.map(p => nearest(line, p)))).toBeGreaterThan(.8 * PIT_LANE_UNIT);
    });
    it('re-parameterises the drawn lane by any Race\'s own frozen anchors, pausing exactly on the drawn garage', () => {
        const lane = drawnPitLane(SUZUKA)!;
        for (const anchors of [{ entry: circuitPitLanes[SUZUKA].entry, service: circuitPitLanes[SUZUKA].service, exit: circuitPitLanes[SUZUKA].exit }, { entry: 920000, service: 970000, exit: 40000 }]) {
            const route: PitRouteGeometry = racePitRoute(lane, anchors);
            expect(route.points[0].progress).toBe(anchors.entry); expect(route.points.at(-1)!.progress).toBe(LAP_UNITS + anchors.exit);
            expect(route.points.some(p => p.progress === anchors.service)).toBe(true);
            for (let i = 1; i < route.points.length; i++) expect(route.points[i].progress).toBeGreaterThan(route.points[i - 1].progress);
            const garage = samplePitRoute(lane, lane.service), paused = samplePitRoute(route, anchors.service);
            expect(paused.x).toBeCloseTo(garage.x, 12); expect(paused.y).toBeCloseTo(garage.y, 12);
        }
    });
});

describe('presentation geometry never retunes the Race', () => {
    it('revision 1 (v8A) content is exactly the historical geometric derivation from the source layouts', () => {
        for (const id of ids) {
            expect(circuitSegmentKinds[id]).toBe(segmentKindsForLayout(sourceCircuitLayouts[id]));
            expect(circuitProgression[id]).toEqual(progressionForLayout(sourceCircuitLayouts[id]));
        }
    });
    it('revision 2 is built from explicit metadata only (kinds, lap-line shift, authored anchors)', () => {
        for (const id of ids) expect(progressionBForCircuit(id)).toEqual(progressionBFromMetadata(circuitSegmentKinds[id], circuitPitLanes[id], lapLineShift(id)));
    });
    it('unshifted circuits keep revision-1 zones; a lap-line shift rotates whole segments so every zone stays on the same track', () => {
        for (const id of ids) {
            const shift = lapLineShift(id), b = circuitProgressionB[id], a = circuitProgression[id];
            const rotated = (i: number) => a.segments[(i + shift) % SEGMENT_COUNT].kind;
            expect(b.segments.map(s => s.kind)).toEqual(b.segments.map((_, i) => rotated(i)));
            if (!shift) { expect(b.segments).toEqual(a.segments); expect(b.zones).toEqual(a.zones); }
            // Assistance window: the same physical stretch (source progress), without wrapping the lap line.
            const offset = shift * LAP_UNITS / SEGMENT_COUNT, unshifted = progressionBFromMetadata(circuitSegmentKinds[id], circuitPitLanes[id]).assistance!;
            expect((b.assistance!.deploymentStart + offset) % LAP_UNITS).toBe(unshifted.deploymentStart);
            expect(b.assistance!.deploymentEnd - b.assistance!.deploymentStart).toBe(unshifted.deploymentEnd - unshifted.deploymentStart);
            expect(b.assistance!.deploymentEnd).toBeLessThanOrEqual(LAP_UNITS);
        }
        expect(ids.filter(id => lapLineShift(id)).map(id => circuitLayouts[id].id).sort()).toEqual(['monaco', 'silverstone']);
    });
});

describe('map orientation and fitting', () => {
    it('presentation rotation is rigid: every pairwise distance keeps its ratio (no stretch)', () => {
        const layout = circuitLayouts[MONZA], o = orientLayout(layout, compactRotation(layout.points));
        const d = (p: MapPoint, q: MapPoint) => Math.hypot(p.x - q.x, p.y - q.y), n = layout.points.length;
        const ratio = d(o.layout.points[0], o.layout.points[n >> 1]) / d(layout.points[0], layout.points[n >> 1]);
        for (const [i, j] of [[1, 7], [3, n - 2], [n >> 2, (3 * n) >> 2]]) expect(d(o.layout.points[i], o.layout.points[j]) / d(layout.points[i], layout.points[j])).toBeCloseTo(ratio, 9);
        expect(validLayout(o.layout)).toBe(true);
        expect(rotateMapPoints([{ x: .5, y: .5 }], 37)[0]).toEqual({ x: .5, y: .5 });
    });
    it('phone maps turn only strip-like circuits, by at most ±90°, and Monza is no longer a ~150 px strip at 390 px', () => {
        for (const id of ids) {
            const layout = circuitLayouts[id], lane = drawnPitLane(id)!.points, degrees = compactRotation([...layout.points, ...lane]);
            expect(Math.abs(degrees)).toBeLessThanOrEqual(90);
            const xs = [...layout.points, ...lane].map(p => p.x), ys = [...layout.points, ...lane].map(p => p.y);
            if ((Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs)) >= .6) expect(degrees).toBe(0);
        }
        const monza = circuitLayouts[MONZA], lane = drawnPitLane(MONZA)!.points, o = orientLayout(monza, compactRotation([...monza.points, ...lane]));
        const before = raceMapCanvas(monza, false, lane), after = raceMapCanvas(o.layout, true, o.transform(lane));
        expect(before.height * .356).toBeLessThan(160);
        expect(after.height * .356).toBeGreaterThan(400);
        expect(after.height).toBeLessThanOrEqual(COMPACT_MAP_MAX_HEIGHT);
    });
    it('desktop canvas fits main track and pit lane together with the same padding', () => {
        for (const id of ids) { const c = raceMapCanvas(circuitLayouts[id], false, drawnPitLane(id)!.points); expect(c.width).toBe(1000); expect(c.padding).toBe(16); expect(c.height).toBeGreaterThanOrEqual(340); expect(c.height).toBeLessThanOrEqual(760); }
    });
});

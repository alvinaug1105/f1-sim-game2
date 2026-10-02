// @vitest-environment happy-dom
/**
 * Race v8B playback continuity: a responsive re-orientation (phone breakpoint) is presentation-only. While a checkpoint
 * is animating, changing orientation / projection keeps the SAME live progress, re-projects it onto the new geometry
 * (track and pit route), keeps animating from there and never remounts the markers. Numeric checks only.
 */
import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '../src/i18n/provider';
import { TrackMap, raceMapCanvas, type MapRow } from '../src/features/race/viewer/track-map';
import { timingRows } from '../src/features/race/viewer/model';
import { raceBubbleScale } from '../src/features/race/viewer/marker-packs';
import { raceMapPadding } from '../src/features/race/viewer/race-map-style';
import { projectRaceView } from '../src/features/race/projection';
import { createRace } from '../src/simulation/race/engine';
import { progressionBForCircuit } from '../src/data/seed/circuit-progression';
import { circuitLayouts } from '../src/data/seed/circuit-layouts';
import { circuitPitLanes, drawnPitLane } from '../src/data/seed/circuit-pit-lanes';
import { circuitProjection, compactRotation, orientLayout, prepareCircuitPath } from '../src/game/domain/circuit-geometry';
import { racePitRoute, samplePitRoute, type PitRouteGeometry } from '../src/game/domain/pit-geometry';
import type { CircuitMapLayout } from '../src/game/domain/circuit-layout';
import { viewerData } from './helpers/viewer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const MONZA = '00000000-0000-4000-8000-000000000315';

/** A controllable frame clock shared by requestAnimationFrame and performance.now (one clock, as in a browser). */
let now = 1000, queue = new Map<number, FrameRequestCallback>(), nextId = 1;
function step(frames: number, ms = 50) {
    for (let i = 0; i < frames; i++) { now += ms; const due = [...queue.values()]; queue = new Map(); act(() => due.forEach(cb => cb(now))); }
}
let root: Root | null = null, host: HTMLDivElement | null = null;
beforeEach(() => {
    now = 1000; queue = new Map();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { const id = nextId++; queue.set(id, cb); return id; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { queue.delete(id); });
    if (!('ResizeObserver' in globalThis)) vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Monza Race (revision 2, frozen pit anchors) and its desktop / phone presentations, as RaceOperations derives them. */
function monza() {
    const d = viewerData(22), state = createRace({ ...d.state!.input, progression: progressionBForCircuit(MONZA) });
    const view = projectRaceView({ ...d, circuit: { ...d.circuit, sourceCircuitId: MONZA }, state });
    const layout = circuitLayouts[MONZA], route = racePitRoute(drawnPitLane(MONZA)!, view.state!.input.pitAnchors!);
    const degrees = compactRotation([...layout.points, ...route.points]), oriented = orientLayout(layout, degrees);
    return {
        rows: timingRows(view), degrees, laneStart: circuitPitLanes[MONZA].laneStart, service: route.service,
        desktop: { layout, pitRoute: route, compact: false },
        phone: { layout: oriented.layout, pitRoute: { ...route, points: oriented.transform(route.points) } as PitRouteGeometry, compact: true },
    };
}
type Presentation = { layout: CircuitMapLayout; pitRoute: PitRouteGeometry; compact: boolean };
function render(p: Presentation, rows: readonly MapRow[], checkpoint: number, selected: string) {
    act(() => root!.render(<I18nProvider initialLocale="en"><TrackMap key={MONZA} layout={p.layout} rows={rows} selected={selected} onSelect={() => {}} speed={1} reduceMotion={false} motion="playing" checkpoint={checkpoint} raceViewer authoritative pitRoute={p.pitRoute} compact={p.compact}/></I18nProvider>));
}
/** What TrackMap must draw for live progress `p` under presentation `pres` (screen scale 1 in this DOM). */
function expected(pres: Presentation, progress: number, route: 'TRACK' | 'LANE') {
    const canvas = raceMapCanvas(pres.layout, pres.compact, pres.pitRoute.points, raceMapPadding(raceBubbleScale(1, 1000)));
    const project = circuitProjection([...pres.layout.points, ...pres.pitRoute.points], canvas.width, canvas.height, canvas.padding);
    return project(route === 'TRACK' ? prepareCircuitPath(pres.layout).sample(progress) : samplePitRoute(pres.pitRoute, (progress % 1) * 1e6));
}
const car = (id: string) => host!.querySelector<SVGGElement>(`[data-car="${id}"]`)!;
const live = (id: string) => Number(car(id).dataset.visualProgress);
const drawn = (id: string) => car(id).getAttribute('transform')!.match(/translate\(([-\d.e]+) ([-\d.e]+)\)/)!.slice(1).map(Number);

describe('responsive re-orientation during playback keeps live progress (motion state ≠ presentation geometry)', () => {
    it('TRACK and PIT cars re-project their current live progress, keep animating from it and are not remounted', () => {
        const m = monza(); expect(m.degrees).not.toBe(0); // Monza rotates on phone-width maps.
        const pitId = m.rows[0].id, trackId = m.rows[5].id;
        // Checkpoint 1 → 2: the field advances 0.9 lap; car 0 is in the pit lane (observed LANE trace before service).
        const at = (n: number, cp: number): MapRow => {
            const r = m.rows[n];
            if (n === 0) { const a = 3 + m.laneStart / 1e6 + .001, b = 3 + (m.service - 2000) / 1e6;
                return { ...r, progress: cp === 1 ? a : b, route: 'LANE', pitting: true, routeHistory: cp === 1 ? [{ atMs: 0, total: a * 1e6, route: 'LANE' }] : [{ atMs: 0, total: a * 1e6, route: 'LANE' }, { atMs: 1000, total: b * 1e6, route: 'LANE' }] }; }
            return { ...r, progress: 2.1 + n * .01 + (cp === 1 ? 0 : .9), route: 'TRACK', routeHistory: undefined };
        };
        const cp1 = m.rows.map((_, n) => at(n, 1)), cp2 = m.rows.map((_, n) => at(n, 2));
        render(m.desktop, cp1, 1, trackId);
        render(m.desktop, cp2, 2, trackId);
        step(20); // 1 s of a 2.4 s checkpoint: mid-interpolation.
        const nodes = { pit: car(pitId), track: car(trackId) };
        const before = { pit: live(pitId), track: live(trackId) };
        expect(before.track).toBeGreaterThan(cp1[5].progress); expect(before.track).toBeLessThan(cp2[5].progress);
        expect(before.pit).toBeGreaterThan(cp1[0].progress); expect(before.pit).toBeLessThan(cp2[0].progress);
        expect(car(pitId).dataset.visualRoute).toBe('LANE');

        // Cross the phone breakpoint: new orientation, projection, canvas and pit-route x/y; selection changes too.
        render(m.phone, cp2, 2, pitId);
        // Same DOM nodes (no remount), same live progress, re-projected onto the new geometry before any further frame.
        expect(car(pitId)).toBe(nodes.pit); expect(car(trackId)).toBe(nodes.track);
        expect(live(trackId)).toBe(before.track); expect(live(pitId)).toBe(before.pit);
        const t = expected(m.phone, before.track, 'TRACK'), p = expected(m.phone, before.pit, 'LANE');
        expect(drawn(trackId)[0]).toBeCloseTo(t.x, 6); expect(drawn(trackId)[1]).toBeCloseTo(t.y, 6);
        expect(drawn(pitId)[0]).toBeCloseTo(p.x, 6); expect(drawn(pitId)[1]).toBeCloseTo(p.y, 6);
        expect(car(pitId).dataset.visualRoute).toBe('LANE'); // still on the pit route, never drawn on the main track

        // Playback continues monotonically from P (no restart, no snap to the checkpoint end, no pause until next lap).
        let previous = { pit: before.pit, track: before.track };
        for (let i = 0; i < 8; i++) {
            step(1);
            expect(live(trackId)).toBeGreaterThan(previous.track); expect(live(trackId)).toBeLessThan(cp2[5].progress);
            expect(live(pitId)).toBeGreaterThanOrEqual(previous.pit); expect(car(pitId).dataset.visualRoute).toBe('LANE');
            const e = expected(m.phone, live(trackId), 'TRACK');
            expect(drawn(trackId)[0]).toBeCloseTo(e.x, 6); expect(drawn(trackId)[1]).toBeCloseTo(e.y, 6);
            previous = { pit: live(pitId), track: live(trackId) };
        }
        // And back across the breakpoint (phone → desktop), then on to the checkpoint end.
        const back = live(trackId);
        render(m.desktop, cp2, 2, trackId);
        expect(live(trackId)).toBe(back);
        const d = expected(m.desktop, back, 'TRACK');
        expect(drawn(trackId)[0]).toBeCloseTo(d.x, 6); expect(drawn(trackId)[1]).toBeCloseTo(d.y, 6);
        step(40);
        expect(live(trackId)).toBe(cp2[5].progress); expect(live(pitId)).toBe(cp2[0].progress);
    });
    it('selecting another driver alone never moves any marker', () => {
        const m = monza(), rows = m.rows.map((r, n) => ({ ...r, progress: 2.1 + n * .01, route: 'TRACK' as const, routeHistory: undefined }));
        render(m.phone, rows, 3, rows[0].id); step(2);
        const before = new Map(rows.map(r => [r.id, car(r.id).getAttribute('transform')]));
        render(m.phone, rows, 3, rows[7].id); step(2);
        for (const r of rows) expect(car(r.id).getAttribute('transform')).toBe(before.get(r.id));
    });
});

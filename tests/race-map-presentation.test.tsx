/**
 * Race v8B map presentation contracts (display only; no simulation state is touched):
 * - markers sit on their authoritative route sample (no normal-offset fan-out, no tether, overlap allowed);
 * - circular bubbles are preserved; draw order carries priority (selected > player > field);
 * - main track and pit lane are separate routes, and nearby branches of a circuit never repel each other;
 * - every server-rendered geometry number is canonical, so server and browser print the same attribute strings.
 * Structural / numeric checks only — no pixel snapshots.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/provider';
import { TrackMap, raceMapCanvas, type MapRow } from '../src/features/race/viewer/track-map';
import { timingRows } from '../src/features/race/viewer/model';
import { RACE_BUBBLE, raceBubbleScale } from '../src/features/race/viewer/marker-packs';
import { anchorRaceMarker, raceDrawOrder, raceMapPadding, raceTrackStyle, svgNumber, svgPath } from '../src/features/race/viewer/race-map-style';
import { projectRaceView } from '../src/features/race/projection';
import { createRace } from '../src/simulation/race/engine';
import { progressionBForCircuit } from '../src/data/seed/circuit-progression';
import { circuitLayouts } from '../src/data/seed/circuit-layouts';
import { circuitProjection, prepareCircuitPath } from '../src/game/domain/circuit-geometry';
import { samplePitRoute, racePitRoute, type PitRouteGeometry } from '../src/game/domain/pit-geometry';
import { drawnPitLane } from '../src/data/seed/circuit-pit-lanes';
import type { CircuitMapLayout } from '../src/game/domain/circuit-layout';
import { viewerData } from './helpers/viewer';

const SUZUKA = '00000000-0000-4000-8000-000000000301';
function suzukaRace() {
    const d = viewerData(22), state = createRace({ ...d.state!.input, progression: progressionBForCircuit(SUZUKA) });
    const labels = d.labels.map((l, n) => ({ ...l, abbreviation: `C${String(n + 1).padStart(2, '0')}` }));
    const view = projectRaceView({ ...d, labels, circuit: { ...d.circuit, sourceCircuitId: SUZUKA }, state });
    return { rows: timingRows(view), pitRoute: racePitRoute(drawnPitLane(SUZUKA)!, view.state!.input.pitAnchors!) };
}
function render(layout: CircuitMapLayout, rows: readonly MapRow[], selected: string, pitRoute?: PitRouteGeometry, control = 'GREEN') {
    return renderToStaticMarkup(<I18nProvider initialLocale="en"><TrackMap layout={layout} rows={rows} selected={selected} onSelect={() => {}} speed={1} reduceMotion={false} raceViewer authoritative pitRoute={pitRoute} control={control}/></I18nProvider>);
}
/** The server render's geometry (screen scale 1): same canvas, padding and projection as TrackMap. */
function serverGeometry(layout: CircuitMapLayout, pitRoute?: PitRouteGeometry) {
    const packScale = raceBubbleScale(1, 1000), canvas = raceMapCanvas(layout, false, pitRoute?.points, raceMapPadding(packScale));
    const project = circuitProjection(pitRoute ? [...layout.points, ...pitRoute.points] : layout.points, canvas.width, canvas.height, canvas.padding);
    return { packScale, canvas, project, path: prepareCircuitPath(layout), style: raceTrackStyle(2 * RACE_BUBBLE.r * packScale) };
}
const transformOf = (html: string, id: string) => html.match(new RegExp(`<g data-car="${id}"[^>]*transform="translate\\(([-\\d.]+) ([-\\d.]+)\\)"`))!.slice(1).map(Number) as [number, number];
const canonical = (p: { x: number; y: number }) => [Number(svgNumber(p.x)), Number(svgNumber(p.y))];
const drawnOrder = (html: string) => [...html.matchAll(/<g data-car="([^"]+)"/g)].map(m => m[1]);

describe('canonical SVG numbers (V8B-LOW-001 hydration boundary)', () => {
    it('prints at most two decimals, never -0, and is invariant to last-ulp differences of the inputs', () => {
        expect(svgNumber(-0)).toBe('0'); expect(svgNumber(-0.001)).toBe('0'); expect(svgNumber(12.345678)).toBe('12.35'); expect(svgNumber(400)).toBe('400');
        // A last-ulp difference (as between server and browser Math.sin / Math.cos) prints the same string.
        for (const v of [123.456789, 0.1 + 0.2, 987.654321, -45.678912, 1 / 3 * 1000]) {
            const up = v + Math.abs(v) * Number.EPSILON, down = v - Math.abs(v) * Number.EPSILON;
            expect(svgNumber(up)).toBe(svgNumber(v)); expect(svgNumber(down)).toBe(svgNumber(v));
        }
        expect(svgPath([{ x: 1.004, y: 2.006 }, { x: 3, y: -0.0001 }], true)).toBe('M1,2.01 L3,0 Z');
    });
    it('server markup is identical for a layout perturbed by one ulp (what a different V8 build produces)', () => {
        const { rows, pitRoute } = suzukaRace(), layout = circuitLayouts[SUZUKA];
        const nudged: CircuitMapLayout = { ...layout, points: layout.points.map((p, i) => ({ x: Math.min(1, p.x * (1 + (i % 2 ? 1 : -1) * Number.EPSILON)), y: Math.min(1, p.y * (1 + (i % 3 ? -1 : 1) * Number.EPSILON)) })) };
        expect(render(nudged, rows, rows[0].id, pitRoute)).toBe(render(layout, rows, rows[0].id, pitRoute));
    });
    it('writes every geometry number of the Race map with at most two decimals', () => {
        const { rows, pitRoute } = suzukaRace(), html = render(circuitLayouts[SUZUKA], rows, rows[0].id, pitRoute);
        const attrs = [...html.matchAll(/ (?:d|transform|x|y|cx|cy|r|width|height|stroke-width)="([^"]*)"/g)].map(m => m[1]);
        expect(attrs.length).toBeGreaterThan(100);
        for (const a of attrs) for (const n of a.match(/-?\d*\.?\d+/g) ?? []) expect(n).toMatch(/^-?\d*(\.\d{1,2})?$/);
    });
});

describe('track-anchored Race markers (no fan-out, no tether, overlap allowed)', () => {
    const layout = circuitLayouts[SUZUKA];
    it.each([
        ['lap-1 pack (22 cars within 0.9 % of a lap)', .0004, 'GREEN'],
        ['Safety Car train', .0025, 'SAFETY_CAR'],
    ])('%s: every marker is exactly on its projected racing-line sample', (_name, gap, control) => {
        const { rows, pitRoute } = suzukaRace(), { project, path } = serverGeometry(layout, pitRoute);
        const pack = rows.map((r, n) => ({ ...r, progress: 1.12 - n * (gap as number), route: 'TRACK' as const }));
        const html = render(layout, pack, pack[5].id, pitRoute, control as string);
        for (const r of pack) expect(transformOf(html, r.id)).toEqual(canonical(project(path.sample(r.progress))));
        // Overlap is allowed: in the lap-1 pack at least one pair of bubbles overlaps instead of being pushed apart.
        if (control === 'GREEN') {
            const pts = pack.map(r => transformOf(html, r.id)), d = 2 * RACE_BUBBLE.r * raceBubbleScale(1, 1000);
            expect(pts.some((a, i) => pts.some((b, j) => j > i && Math.hypot(a[0] - b[0], a[1] - b[1]) < d))).toBe(true);
        }
        expect(html).not.toContain('track-anchor');
        expect(html).not.toMatch(/<line[^>]*data-car|class="[^"]*tether/);
        expect(html.match(/<circle class="driver-bubble"/g)).toHaveLength(22);
        expect(html).not.toContain('driver-badge'); expect(html).not.toMatch(/<rect[^>]*class="driver-/);
        expect(html).not.toMatch(/cluster/i);
        if (control === 'SAFETY_CAR') expect(html).toContain('data-control="SAFETY_CAR"');
    });
    it('the only lateral term (grid formation) is clamped inside the drawn track corridor', () => {
        const sample = { x: 100, y: 200, tangentX: .6, tangentY: .8 }, corridor = 10;
        expect(anchorRaceMarker(sample, 0, corridor)).toEqual({ x: 100, y: 200 });
        for (const lateral of [-500, -9, -3, 0, 3, 9, 500]) {
            const p = anchorRaceMarker(sample, lateral, corridor);
            expect(Math.hypot(p.x - sample.x, p.y - sample.y)).toBeLessThanOrEqual(corridor * .6 + 1e-9);
            // Displacement is purely along the normal (never along the route).
            expect((p.x - sample.x) * sample.tangentX + (p.y - sample.y) * sample.tangentY).toBeCloseTo(0, 9);
        }
        const style = raceTrackStyle(24);
        expect(style.corridor).toBeCloseTo(style.casing / 2);
        // Track proportions follow the bubble: a centred marker reads as on the circuit, and the pit lane is secondary.
        expect(style.casing).toBeLessThan(24); expect(style.surface).toBeLessThan(style.casing);
        expect(style.pitCasing).toBeLessThan(style.surface); expect(style.pitSurface).toBeLessThan(style.pitCasing);
    });
    it('nearby branches of a crossing circuit (Suzuka figure-of-eight) never repel each other', () => {
        const { rows, pitRoute } = suzukaRace(), { project, path } = serverGeometry(layout, pitRoute);
        // Find two route positions far apart in progress but close on screen (the crossover).
        let best = { a: 0, b: 0, d: Infinity };
        for (let i = 0; i < 400; i++) for (let j = 0; j < 400; j++) {
            const a = i / 400, b = j / 400, dp = Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
            if (dp < .2) continue;
            const pa = project(path.sample(a)), pb = project(path.sample(b)), d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
            if (d < best.d) best = { a, b, d };
        }
        expect(best.d).toBeLessThan(2 * RACE_BUBBLE.r);
        const placed = rows.map((r, n) => ({ ...r, progress: 3 + (n === 0 ? best.a : n === 1 ? best.b : n / 22), route: 'TRACK' as const }));
        const html = render(layout, placed, placed[2].id, pitRoute);
        for (const r of placed.slice(0, 2)) expect(transformOf(html, r.id)).toEqual(canonical(project(path.sample(r.progress))));
    });
    it('route separation: a pit-lane car is on the pit route sample, a track car at the same progress on the racing line', () => {
        const { rows, pitRoute } = suzukaRace(), { project, path } = serverGeometry(layout, pitRoute);
        const progress = 2 + pitRoute.service / 1e6 - .005;
        const placed = rows.map((r, n) => ({ ...r, progress: n < 2 ? progress : 2.3 + n / 50, route: n === 0 ? 'LANE' as const : 'TRACK' as const, pitting: n === 0 }));
        const html = render(layout, placed, placed[3].id, pitRoute), pit = transformOf(html, placed[0].id), track = transformOf(html, placed[1].id);
        expect(pit).toEqual(canonical(project(samplePitRoute(pitRoute, (progress % 1) * 1e6))));
        expect(track).toEqual(canonical(project(path.sample(progress))));
        expect(pit).not.toEqual(track);
    });
});

describe('priority by draw order (selected > player > field)', () => {
    const cars = [
        { id: 'a', position: 1, player: false }, { id: 'b', position: 2, player: true }, { id: 'c', position: 3, player: false },
        { id: 'd', position: 4, player: true }, { id: 'e', position: 5, player: false }, { id: 'r', position: 6, player: false, retired: true },
    ];
    it('draws retired first, then the field back-to-front, then the player cars, then the selected car last', () => {
        expect(raceDrawOrder(cars, 'c')).toEqual(['r', 'e', 'a', 'd', 'b', 'c']);
        expect(raceDrawOrder(cars, 'd')).toEqual(['r', 'e', 'c', 'a', 'b', 'd']);
        // Independent of input order.
        expect(raceDrawOrder([...cars].reverse(), 'c')).toEqual(raceDrawOrder(cars, 'c'));
    });
    it('the rendered map follows that order: the selected bubble is the last drawn, player bubbles just beneath it', () => {
        const { rows, pitRoute } = suzukaRace(), rival = rows.find(r => !r.player)!, players = rows.filter(r => r.player).map(r => r.id);
        const order = drawnOrder(render(circuitLayouts[SUZUKA], rows, rival.id, pitRoute));
        expect(order.at(-1)).toBe(rival.id);
        expect(new Set(order.slice(-1 - players.length, -1))).toEqual(new Set(players));
    });
});

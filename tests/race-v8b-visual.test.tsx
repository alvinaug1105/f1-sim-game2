/**
 * Race v8B visual correction: circular live-timing bubbles on the Race map and the three-column desktop Race layout.
 * Structural contracts only (no pixel-perfect styling).
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/provider';
import { TrackMap, raceMapCanvas } from '../src/features/race/viewer/track-map';
import { timingRows } from '../src/features/race/viewer/model';
import { RACE_BUBBLE, RACE_BUBBLE_PX, raceBubbleScale } from '../src/features/race/viewer/marker-packs';
import { projectRaceView } from '../src/features/race/projection';
import { createRace } from '../src/simulation/race/engine';
import { progressionBForCircuit } from '../src/data/seed/circuit-progression';
import { circuitLayouts } from '../src/data/seed/circuit-layouts';
import { circuitProjection } from '../src/game/domain/circuit-geometry';
import { samplePitRoute, racePitRoute } from '../src/game/domain/pit-geometry';
import { drawnPitLane } from '../src/data/seed/circuit-pit-lanes';
import { raceMapPadding, svgNumber } from '../src/features/race/viewer/race-map-style';
import { viewerData } from './helpers/viewer';

const suzuka = '00000000-0000-4000-8000-000000000301';
/** A 22-car revision-2 Race view at Suzuka (with pit geometry), as the Race page receives it. */
function raceView() {
    const d = viewerData(22), state = createRace({ ...d.state!.input, progression: progressionBForCircuit(suzuka) });
    // Three-letter abbreviations, as in Career content (the shared fixture uses D1…D22).
    const labels = d.labels.map((l, n) => ({ ...l, abbreviation: `C${String(n + 1).padStart(2, '0')}` }));
    return projectRaceView({ ...d, labels, circuit: { ...d.circuit, sourceCircuitId: suzuka }, state });
}
/** As the Race page does: the drawn catalogue lane, re-parameterised by the Race's own frozen anchors. */
const pitRoute = (view: ReturnType<typeof raceView>) => racePitRoute(drawnPitLane(suzuka)!, view.state!.input.pitAnchors!);
function render(rows: ReturnType<typeof timingRows>, selected: string, view: ReturnType<typeof raceView>) {
    return renderToStaticMarkup(<I18nProvider initialLocale="en"><TrackMap layout={circuitLayouts[suzuka]} rows={rows} selected={selected} onSelect={() => {}} speed={1} reduceMotion={false} raceViewer authoritative pitRoute={pitRoute(view)}/></I18nProvider>);
}
const carGroup = (html: string, id: string) => html.match(new RegExp(`<g data-car="${id}"[\\s\\S]*?</g></g>`))?.[0] ?? '';

describe('Race map markers: circular live-timing bubbles', () => {
    const view = raceView(), rows = timingRows(view);
    const player = rows.filter(r => r.player).map(r => r.id), rival = rows.find(r => !r.player)!;
    it('renders 22 circular markers, never the rectangular field badge', () => {
        const html = render(rows, player[0], view);
        expect(html.match(/data-car=/g)).toHaveLength(22);
        expect(html.match(/<circle class="driver-bubble"/g)).toHaveLength(22);
        expect(html).not.toContain('driver-badge');
        expect(html).not.toMatch(/<rect[^>]*class="driver-/);
    });
    it('puts the three-letter abbreviation inside its circle, centred, with readable contrast', () => {
        const html = render(rows, player[0], view), g = carGroup(html, rival.id);
        const circle = g.indexOf('class="driver-bubble"'), label = g.indexOf('class="bubble-label"');
        expect(circle).toBeGreaterThan(-1); expect(label).toBeGreaterThan(circle);            // drawn on top of the fill
        expect(g).toContain(`>${rival.abbreviation}</text>`);
        expect(g).toMatch(/class="bubble-label" text-anchor="middle" dominant-baseline="central"/);
        expect(rival.abbreviation).toHaveLength(3);
    });
    it('marks the selected car with a strong outer ring and the player cars with a white ring (not colour alone)', () => {
        const html = render(rows, rival.id, view);
        expect(carGroup(html, rival.id)).toContain('class="selected-ring"');
        expect(html.match(/class="selected-ring"/g)).toHaveLength(1);
        for (const id of player) expect(carGroup(html, id)).toContain('class="player-ring"');
        expect(carGroup(html, rival.id)).not.toContain('player-ring');
        // Selection and player status are also in the accessible name.
        expect(carGroup(html, player[0])).toContain('Your car');
        expect(carGroup(html, rival.id)).toContain('aria-pressed="true"');
    });
    it('shows a lapped car with a dashed border and its deficit in the accessible name, without a floating label', () => {
        const lapped = rows.map(r => r.id === rival.id ? { ...r, lapsDown: 1 } : r), g = carGroup(render(lapped, player[0], view), rival.id);
        expect(g).toMatch(/class="driver-bubble"[^>]*stroke-dasharray="2.6 2"/);
        expect(g).toContain('1 lap(s) down');
        expect(g).not.toContain('lapped-mark');
    });
    it('draws a compact start/finish line (no text label over bubbles) and a secondary pit lane with a garage tick', () => {
        const html = render(rows, player[0], view), sf = html.match(/<g class="start-finish compact"[\s\S]*?<\/g><\/g>/)?.[0] ?? '';
        expect(sf).toContain('<title>START / FINISH</title>'); expect(sf).not.toContain('<text');
        expect(html).toContain('class="pit-lane"'); expect(html).toContain('class="pit-garage"');
        expect(html).not.toContain('#e8c86b" stroke-width="4"');
        expect(html.match(/<circle class="driver-bubble"/g)).toHaveLength(22); expect(html).not.toContain('driver-badge');
    });
    it('keeps the same circular marker for a pitting car, placed on the pit route geometry', () => {
        const pitting = rows.map(r => r.id === rival.id ? { ...r, pitting: true, route: 'LANE' as const } : r), html = render(pitting, player[0], view), g = carGroup(html, rival.id);
        expect(g).toContain('class="driver-bubble"'); expect(g).toContain('class="pit-mark"');
        expect(html).toContain('class="pit-route"');
        // The initial transform comes from the pit route, not the racing line.
        // Server render: screen scale 1 ⇒ canvas padding from the 1000-unit bubble scale; numbers are canonical (0.01).
        const route = pitRoute(view), layout = circuitLayouts[suzuka], canvas = raceMapCanvas(layout, false, route.points, raceMapPadding(raceBubbleScale(1, 1000)));
        const project = circuitProjection([...layout.points, ...route.points], canvas.width, canvas.height, canvas.padding);
        const expected = project(samplePitRoute(route, (rival.progress % 1) * 1e6));
        const [x, y] = g.match(/transform="translate\(([-\d.]+) ([-\d.]+)\)"/)!.slice(1).map(Number);
        expect(x).toBe(Number(svgNumber(expected.x))); expect(y).toBe(Number(svgNumber(expected.y)));
    });
    it('holds a stable on-screen size: 26 px on desktop maps, 23 px tablet, 22 px phone; text stays ≥ 8 px', () => {
        const size = (mapPx: number) => 2 * RACE_BUBBLE.r * (mapPx / 1000) * raceBubbleScale(mapPx / 1000);
        expect(size(1400)).toBeCloseTo(RACE_BUBBLE_PX.desktop); expect(size(700)).toBeCloseTo(RACE_BUBBLE_PX.desktop);
        expect(size(500)).toBeCloseTo(RACE_BUBBLE_PX.compact); expect(size(356)).toBeCloseTo(RACE_BUBBLE_PX.small);
        for (const mapPx of [356, 500, 700, 1400]) expect(8.8 * (mapPx / 1000) * raceBubbleScale(mapPx / 1000)).toBeGreaterThanOrEqual(8);
        expect(raceBubbleScale(NaN)).toBeGreaterThan(0);
    });
});

describe('Race operations layout (CSS contract)', () => {
    // UIX-B: the live-session screens are styled by src/styles/live.css (the legacy Race stylesheet was retired).
    const css = readFileSync(new URL('../src/styles/live.css', import.meta.url), 'utf8');
    const block = (query: string) => { const start = css.indexOf(query); expect(start).toBeGreaterThanOrEqual(0); let depth = 0, i = css.indexOf('{', start); const open = i; for (; i < css.length; i++) { if (css[i] === '{') depth++; else if (css[i] === '}' && --depth === 0) break; } return css.slice(open, i); };
    it('desktop Race grid has three tracks: timing | map | driver panel', () => {
        const desktop = block('@media (min-width: 1221px)');
        const rule = desktop.match(/\.live-race \.live-grid \{[^}]*\}/)![0];
        expect(rule.match(/grid-template-columns:([^;]*);/)![1].trim().split(/\s+(?![^(]*\))/)).toHaveLength(3);
        expect(rule).toMatch(/"tower map switch"\s*"tower map panel"/);
    });
    it('the driver panel is never forced full-width under the map on desktop', () => {
        expect(css).not.toMatch(/\.live-area-panel \{[^}]*grid-column:\s*1\s*\/\s*-1/);
        expect(block('@media (min-width: 1221px)')).toContain('.live-area-panel');
    });
    it('narrow viewports show one pane at a time in a single column (no forced three columns)', () => {
        const narrow = block('@media (max-width: 820px)');
        expect(narrow).toMatch(/\.live-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/);
        expect(narrow).toContain('.live-panes');
        // Named desktop areas are dropped so no pane creates an implicit extra column.
        expect(narrow).toMatch(/\.live-grid > \* \{\s*grid-area: auto;/);
        expect(narrow).toMatch(/\.live-grid > \[data-pane\]:not\(\[data-pane="always"\]\) \{\s*display: none;/);
    });
});

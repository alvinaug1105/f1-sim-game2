import type { MapPoint } from '../../../game/domain/circuit-layout';
import { RACE_BUBBLE } from './marker-packs';
/**
 * Race-viewer map presentation rules (display only — nothing here reaches the Race simulation).
 *
 * 1. Canonical SVG numbers. Server (Node) and browser V8 builds can disagree in the last ulp of Math.sin / Math.cos,
 *    which the layout normalisation and presentation rotation use, so derived coordinates can differ in their final
 *    digits between SSR and hydration. Every geometry value written into server-rendered SVG goes through
 *    `svgNumber`: 0.01 viewBox units (far below a screen pixel at any map size), so both sides print the same string.
 * 2. Track-anchored markers. A Race marker is drawn exactly at its authoritative route sample (main track or pit lane).
 *    Overlap is allowed; nothing is pushed into empty map space; priority comes from draw order only.
 * 3. Proportions. Track, pit lane and start/finish are sized from the bubble diameter, so a marker on the centre line
 *    always reads as sitting on the circuit at every map size.
 */
export const SVG_PRECISION = 100;
export function svgNumber(value: number): string {
    const rounded = Math.round(value * SVG_PRECISION) / SVG_PRECISION;
    return Object.is(rounded, -0) || rounded === 0 ? '0' : String(rounded);
}
export const svgPoint = (p: MapPoint) => `${svgNumber(p.x)},${svgNumber(p.y)}`;
export function svgPath(points: readonly MapPoint[], closed = false) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${svgPoint(p)}`).join(' ') + (closed ? ' Z' : '');
}
/** Track and pit-lane stroke widths (viewBox units) from the rendered bubble diameter. */
export function raceTrackStyle(bubbleDiameter: number) {
    const casing = bubbleDiameter * .66, surface = bubbleDiameter * .46;
    return {
        casing, surface, edge: Math.max(1, bubbleDiameter * .045),
        pitCasing: bubbleDiameter * .3, pitSurface: bubbleDiameter * .16,
        startLength: casing * 1.25, startWidth: Math.max(4, bubbleDiameter * .22),
        /** Half-width of the drawn track corridor: no marker centre may sit further than this from its route sample. */
        corridor: casing / 2,
    };
}
/**
 * Rendered screen pixels per SVG unit. The map uses the default `preserveAspectRatio` (xMidYMid meet), so the browser
 * fits the viewBox with ONE uniform scale: the smaller of the width and height ratios. A tall (portrait) viewBox in a
 * height-capped box is therefore limited by height, not width. Returns null while the box has no size (not laid out).
 */
export function effectiveSvgScale(box: { width: number; height: number }, viewBox: { width: number; height: number }): number | null {
    const scale = Math.min(box.width / viewBox.width, box.height / viewBox.height);
    return Number.isFinite(scale) && scale > 0 ? scale : null;
}
/**
 * Next screen scale to keep. Ignores changes under 0.5 % (≈ 0.1 px of bubble): a bubble-size change can move the
 * canvas padding, and so the viewBox height, by a few units; this keeps that feedback from ever cycling on resize.
 */
export function nextScreenScale(previous: number, measured: number | null) {
    return measured === null || Math.abs(measured - previous) <= previous * .005 ? previous : measured;
}
/**
 * Canvas padding that keeps a selected bubble inside the canvas without clamping it off its route: the selected ring
 * (radius r + 5) plus half its 2.6-unit stroke, plus a small margin, at the current bubble scale.
 */
export function raceMapPadding(bubbleScale: number) { return Math.max(16, Math.ceil((RACE_BUBBLE.r + 7) * bubbleScale)); }
/**
 * Marker centre for a Race car: its projected route sample. The only lateral term is the lap-0 two-by-two grid
 * formation, clamped inside the track corridor; there is no collision displacement of any kind.
 */
export function anchorRaceMarker(sample: { x: number; y: number; tangentX: number; tangentY: number }, lateral: number, corridor: number): MapPoint {
    const l = Math.max(-corridor * .6, Math.min(corridor * .6, lateral));
    return { x: sample.x - sample.tangentY * l, y: sample.y + sample.tangentX * l };
}
export interface DrawCandidate { readonly id: string; readonly position: number; readonly player: boolean; readonly retired?: boolean }
/**
 * Bottom-to-top draw order for overlapping markers: retired, then the field from the back of the classification to the
 * front (so the leading car of a pack is readable), then the player's cars, then the selected car on top.
 */
export function raceDrawOrder(cars: readonly DrawCandidate[], selected: string): string[] {
    const rank = (c: DrawCandidate) => c.id === selected ? 3 : c.player ? 2 : c.retired ? 0 : 1;
    return [...cars].sort((a, b) => rank(a) - rank(b) || b.position - a.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(c => c.id);
}

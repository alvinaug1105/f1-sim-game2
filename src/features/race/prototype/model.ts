import type { CircuitMapLayout, MapPoint } from '../../../game/domain/circuit-layout';
import { prepareCircuitPath, wrapProgress } from '../../../game/domain/circuit-geometry';
import { samplePitRoute, type PitRouteGeometry } from '../../../game/domain/pit-geometry';
import type { MapRow } from '../viewer/track-map';
import type { TrackEnvironment } from '../viewer/track-environment';

export interface ReplayFrame { lap: number; rows: readonly MapRow[]; critical?: string }
export interface PrototypeReplay { visibility: 'PUBLIC'; frames: readonly ReplayFrame[]; cases: Readonly<Record<string, ReplayFrame>>; pitAnchors: { entry: number; service: number; exit: number } }
export interface SceneGeometry { layout: CircuitMapLayout; pit: PitRouteGeometry; environment: TrackEnvironment }
export interface WorldPoint { x: number; y: number; z: number }
export const WORLD_SCALE = 1000;
export const worldPoint = (p: MapPoint, height = 0): WorldPoint => ({ x: (p.x - .5) * WORLD_SCALE, y: height, z: (p.y - .5) * WORLD_SCALE });
export function prototypeEnabled(environment: string | undefined, flag: string | undefined) { return environment === 'development' && flag === '1'; }
/** Exact line-segment intersection, ignoring adjacent vertices and the closing seam. */
export function crossing(points: readonly MapPoint[]) {
    const cross = (a: MapPoint, b: MapPoint) => a.x * b.y - a.y * b.x;
    for (let i = 0; i < points.length; i++) for (let j = i + 2; j < points.length; j++) {
        if (i === 0 && j === points.length - 1) continue;
        const a = points[i], b = points[(i + 1) % points.length], c = points[j], d = points[(j + 1) % points.length];
        const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y }, q = { x: c.x - a.x, y: c.y - a.y };
        const denom = cross(r, s); if (Math.abs(denom) < 1e-12) continue;
        const t = cross(q, s) / denom, u = cross(q, r) / denom;
        if (t > 0 && t < 1 && u > 0 && u < 1) return { i, j, t, u, point: { x: a.x + r.x * t, y: a.y + r.y * t } };
    }
    return null;
}
/** Only vertical styling: never changes x/z, route length, vertex order or lap progression. Heights are NOT surveyed. */
export function crossingHeight(layout: CircuitMapLayout) {
    const hit = crossing(layout.points), path = prepareCircuitPath(layout);
    if (!hit) return () => .7;
    // Suzuka's long return straight is the later source segment. A 6-world-unit deck is deliberately schematic.
    let distance = 0;
    for (let i = 0; i < hit.j; i++) distance += Math.hypot(layout.points[(i + 1) % layout.points.length].x - layout.points[i].x, layout.points[(i + 1) % layout.points.length].y - layout.points[i].y);
    const a = layout.points[hit.j], b = layout.points[(hit.j + 1) % layout.points.length];
    const middle = (distance + Math.hypot(b.x - a.x, b.y - a.y) * hit.u) / path.totalLength;
    return (progress: number) => { const q = wrapProgress(progress + layout.startFinishProgress), delta = Math.min(Math.abs(q - middle), 1 - Math.abs(q - middle)); return .7 + 6 * Math.max(0, 1 - delta / .016) ** 2; };
}
const samplerCache = new WeakMap<SceneGeometry, (progress: number, route: MapRow['route']) => WorldPoint & { angle: number }>();
export function sampleCar(geometry: SceneGeometry, progress: number, route: MapRow['route'] = 'TRACK'): WorldPoint & { angle: number } {
    let sampler = samplerCache.get(geometry);
    if (!sampler) {
        const path = prepareCircuitPath(geometry.layout), height = crossingHeight(geometry.layout);
        sampler = (p, r = 'TRACK') => { const pit = r !== 'TRACK', sample = pit ? samplePitRoute(geometry.pit, wrapProgress(p) * 1e6) : path.sample(p); return { ...worldPoint(sample, pit ? 1 : height(p)), angle: Math.atan2(sample.tangentY, sample.tangentX) }; };
        samplerCache.set(geometry, sampler);
    }
    return sampler(progress, route);
}
export function insidePolygon(p: MapPoint, polygon: readonly MapPoint[]) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}
export function distanceToRoute(p: MapPoint, points: readonly MapPoint[]) {
    let distance = Infinity;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        distance = Math.min(distance, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
    return distance;
}
/** Deterministic decorative vegetation, confined to sourced woodland, away from road corridors. NOT surveyed trees. */
export function woodlandTrees(geometry: SceneGeometry, budget = 220) {
    const forests = geometry.environment.features.filter(f => f.kind === 'FOREST'), points: MapPoint[] = [];
    for (let y = 0; y < 55; y++) for (let x = 0; x < 65; x++) {
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        const p = { x: -.1 + x * .02 + (hash % 101) / 10100, y: -.05 + y * .02 + ((hash >>> 8) % 101) / 10100 };
        if (forests.some(f => insidePolygon(p, f.points)) && distanceToRoute(p, geometry.layout.points) > .017 && distanceToRoute(p, geometry.pit.points) > .014) points.push(p);
    }
    const step = Math.max(1, Math.ceil(points.length / budget)); return points.filter((_, i) => i % step === 0).slice(0, budget);
}
/** Track strip follows ORIGINAL vertices. Miter length is capped only on the road edge, never on its centre. */
export function roadStrip(points: readonly MapPoint[], width: number, height: (index: number) => number, closed = true) {
    const vertices: number[] = [], indices: number[] = [], count = points.length;
    for (let i = 0; i <= (closed ? count : count - 1); i++) {
        const index = i % count, p = points[index], prev = points[index === 0 ? closed ? count - 1 : 0 : index - 1], next = points[index === count - 1 ? closed ? 0 : count - 1 : index + 1];
        const dx = next.x - prev.x, dy = next.y - prev.y, length = Math.hypot(dx, dy) || 1;
        for (const sign of [-1, 1]) { const w = worldPoint(p, height(index)); vertices.push(w.x - dy / length * width / 2 * sign, w.y, w.z + dx / length * width / 2 * sign); }
        if (i > 0) { const a = (i - 1) * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    return { vertices, indices };
}
export function cappedPixelRatio(ratio: number, width: number) { return Math.min(width < 600 ? 1.25 : 1.5, Math.max(1, ratio || 1)); }

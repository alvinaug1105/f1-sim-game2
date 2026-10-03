import type { CircuitMapLayout, MapPoint } from './circuit-layout';
import { prepareCircuitPath } from './circuit-geometry';
export interface PitRoutePoint extends MapPoint { readonly progress: number }
/** Unwrapped microlap anchors from entry through start/finish to exit; coordinates are presentation content. */
export interface PitRouteGeometry { readonly points: readonly PitRoutePoint[]; readonly service: number }
/** A Race's frozen, authoritative pit anchors (microlaps; exit is after the lap line). Public, static information. */
export interface PitAnchors { readonly entry: number; readonly service: number; readonly exit: number }
/**
 * One authored knot of a drawn pit lane: unwrapped progress along the main track (entry … exit + 1,000,000), signed
 * lateral offset in lane units on the authored side (0 = on the racing line). `chord` draws a straight segment to the
 * next knot instead of following the track (entry/exit roads that cut across the inside of a corner).
 */
export interface PitKnot { readonly progress: number; readonly offset: number; readonly chord?: true }
export interface PitLaneShape {
    readonly side: 'LEFT' | 'RIGHT';
    readonly entry: number; readonly exit: number;
    /** Where the drawn lane shows the representative service (garage) position; unwrapped, may lie after the line. */
    readonly garage: number;
    readonly route: readonly PitKnot[];
}
/** Presentation lane separation in normalised map units: wider than true scale so the lane reads clearly beside the track. */
export const PIT_LANE_UNIT = 0.026;
const LAP = 1_000_000;
export function validatePitGeometry(g:PitRouteGeometry,entry:number,service:number,exit:number) {
    if(!g||!Array.isArray(g.points)||g.points.length<5||g.points[0].progress!==entry||g.points.at(-1)!.progress!==1000000+exit||g.service!==service||!g.points.some(p=>p.progress===service)) throw new RangeError('Invalid pit geometry bounds');
    for(const [i,p] of g.points.entries()) if(!Number.isSafeInteger(p.progress)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>2||Math.abs(p.y)>2||(i>0&&p.progress<=g.points[i-1].progress)) throw new RangeError('Invalid pit geometry point');
}
export function samplePitRoute(g:PitRouteGeometry,progress:number) {
    const points=g.points, p=progress<points[0].progress?progress+1000000:progress;
    let i=0;while(i<points.length-2&&points[i+1].progress<p)i++;
    const a=points[i],b=points[i+1],f=Math.max(0,Math.min(1,(p-a.progress)/(b.progress-a.progress))),length=Math.hypot(b.x-a.x,b.y-a.y);
    return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,tangentX:length?(b.x-a.x)/length:1,tangentY:length?(b.y-a.y)/length:0};
}
/** Authoring rules shared by the catalogue validation and tests. */
export function validatePitLaneShape(s: PitLaneShape) {
    const r = s.route, end = LAP + s.exit;
    if (!['LEFT','RIGHT'].includes(s.side) || !Number.isSafeInteger(s.entry) || !Number.isSafeInteger(s.exit) || s.entry <= 0 || s.entry >= LAP || s.exit <= 0 || s.exit >= s.entry) throw new RangeError('Invalid pit lane anchors');
    if (r.length < 3 || r[0].progress !== s.entry || r[0].offset !== 0 || r.at(-1)!.progress !== end || r.at(-1)!.offset !== 0 || r.at(-1)!.chord) throw new RangeError('Pit lane must leave and rejoin the racing line');
    for (const [i, k] of r.entries()) if (!Number.isSafeInteger(k.progress) || !Number.isFinite(k.offset) || Math.abs(k.offset) > 4 || (i > 0 && k.progress <= r[i-1].progress)) throw new RangeError('Invalid pit lane knot');
    if (!Number.isSafeInteger(s.garage) || s.garage <= s.entry || s.garage >= end) throw new RangeError('Invalid pit garage position');
}
const smooth = (t: number) => t * t * (3 - 2 * t);
/**
 * Builds the drawn lane in the layout's own normalised frame from authored knots. Presentation only: the Race never reads
 * it, and it never feeds pit-loss timing. Points carry presentation progress (unwrapped microlaps).
 */
export function buildPitLane(layout: CircuitMapLayout, shape: PitLaneShape): PitRouteGeometry {
    validatePitLaneShape(shape);
    const path = prepareCircuitPath(layout), sign = shape.side === 'RIGHT' ? 1 : -1;
    const at = (progress: number, offset: number) => {
        const p = progress / LAP, here = path.sample(p), a = path.sample(p - .0015), b = path.sample(p + .0015);
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
        // y grows downwards, so (-ty, tx) is the right-hand side of the racing direction.
        return { x: here.x - dy / length * offset * sign * PIT_LANE_UNIT, y: here.y + dx / length * offset * sign * PIT_LANE_UNIT };
    };
    const out: PitRoutePoint[] = [];
    const push = (progress: number, p: MapPoint) => { if (!out.length || progress > out.at(-1)!.progress) out.push({ progress, x: p.x, y: p.y }); };
    for (let i = 0; i < shape.route.length - 1; i++) {
        const k0 = shape.route[i], k1 = shape.route[i + 1], span = k1.progress - k0.progress;
        const steps = Math.max(2, Math.ceil(span / 2500));
        const a = at(k0.progress, k0.offset), b = at(k1.progress, k1.offset);
        for (let s = 0; s < steps; s++) {
            const progress = k0.progress + Math.round(span * s / steps);
            if (k0.chord) { const f = s / steps; push(progress, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }); }
            else push(progress, at(progress, k0.offset + (k1.offset - k0.offset) * smooth(s / steps)));
        }
    }
    push(shape.route.at(-1)!.progress, at(shape.route.at(-1)!.progress, 0));
    if (!out.some(p => p.progress === shape.garage)) {
        const g = samplePitRoute({ points: out, service: shape.garage }, shape.garage);
        out.splice(out.findIndex(p => p.progress > shape.garage), 0, { progress: shape.garage, x: g.x, y: g.y });
    }
    return { points: out, service: shape.garage };
}
/**
 * The drawn lane re-parameterised by a Race's own frozen authoritative anchors: entry → entry, service → the drawn
 * garage position, exit → exit. The bubble therefore pauses exactly on the drawn garage during SERVICE, whatever anchors
 * the Race was created with (including older candidate saves).
 */
export function racePitRoute(lane: PitRouteGeometry & { readonly points: readonly PitRoutePoint[] }, anchors: PitAnchors): PitRouteGeometry {
    const from = [lane.points[0].progress, lane.service, lane.points.at(-1)!.progress], to = [anchors.entry, anchors.service, LAP + anchors.exit];
    const map = (q: number) => { const i = q <= from[1] ? 0 : 1, f = (q - from[i]) / (from[i + 1] - from[i]); return Math.round(to[i] + f * (to[i + 1] - to[i])); };
    const points: PitRoutePoint[] = [];
    for (const p of lane.points) { const progress = p.progress === lane.service ? anchors.service : map(p.progress); if (!points.length || progress > points.at(-1)!.progress) points.push({ x: p.x, y: p.y, progress }); }
    return { points, service: anchors.service };
}

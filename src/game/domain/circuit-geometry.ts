import type { CircuitMapLayout, MapPoint } from './circuit-layout';
export function wrapProgress(value: number) { return Number.isFinite(value) ? ((value % 1) + 1) % 1 : 0; }
/** Local equirectangular projection; east right, north up. No axis-specific stretch. */
export function projectCoordinates(coordinates: readonly (readonly number[])[]): MapPoint[] {
    if (coordinates.length < 3 || coordinates.some(p => p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) throw new RangeError('Invalid geographic coordinates');
    const longitude = coordinates[0][0], latitude = coordinates.reduce((s, p) => s + p[1], 0) / coordinates.length;
    const cos = Math.cos(latitude * Math.PI / 180);
    return coordinates.map(p => ({ x: (p[0] - longitude) * cos, y: latitude - p[1] }));
}
/** Uniform fit, centred in a unit square. Rotation is around the origin before fitting. */
export function normalizeCircuitPoints(points: readonly MapPoint[], rotationDegrees = 0): MapPoint[] {
    if (points.length < 3 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)) || !Number.isFinite(rotationDegrees)) throw new RangeError('Invalid circuit points');
    const angle = rotationDegrees * Math.PI / 180;
    const rotated = points.map(p => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) }));
    const xs = rotated.map(p => p.x), ys = rotated.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys), width = Math.max(...xs) - minX, height = Math.max(...ys) - minY, size = Math.max(width, height);
    if (!size) throw new RangeError('Empty circuit length');
    const normalized = rotated.map(p => ({ x: (p.x - minX + (size - width) / 2) / size, y: (p.y - minY + (size - height) / 2) / size }));
    // Our closed-path representation supplies the closing segment itself.
    if (Math.hypot(normalized[0].x - normalized.at(-1)!.x, normalized[0].y - normalized.at(-1)!.y) < 1e-10) normalized.pop();
    return normalized;
}
export function validLayout(layout: CircuitMapLayout) {
    return layout.points.length >= 3 && layout.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) && Number.isFinite(layout.startFinishProgress) && layout.startFinishProgress >= 0 && layout.startFinishProgress <= 1;
}
/** Precompute lengths once. Sampling is O(log segments), even on a detailed real circuit. */
export function prepareCircuitPath(layout: CircuitMapLayout) {
    if (!validLayout(layout)) throw new RangeError('Invalid layout');
    const points = layout.points, cumulative = [0];
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const totalLength = cumulative.at(-1)!;
    if (!totalLength) throw new RangeError('Empty circuit length');
    return { totalLength, sample(progress: number) {
        const distance = wrapProgress(progress + layout.startFinishProgress) * totalLength;
        let lo = 0, hi = points.length - 1;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (cumulative[mid + 1] <= distance) lo = mid + 1; else hi = mid; }
        const a = points[lo], b = points[(lo + 1) % points.length], length = cumulative[lo + 1] - cumulative[lo];
        const f = length ? (distance - cumulative[lo]) / length : 0;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, tangentX: length ? (b.x - a.x) / length : 1, tangentY: length ? (b.y - a.y) / length : 0 };
    } };
}
/** Fit into the SVG using the SAME scale on both axes (preserve aspect ratio). */
export function circuitProjection(points: readonly MapPoint[], width = 1000, height = 650, padding = 65) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y), minX = Math.min(...xs), minY = Math.min(...ys);
    const extentX = Math.max(...xs) - minX, extentY = Math.max(...ys) - minY;
    const scale = Math.min((width - padding * 2) / (extentX || 1), (height - padding * 2) / (extentY || 1));
    return (p: MapPoint) => ({ x: (p.x - minX) * scale + (width - extentX * scale) / 2, y: (p.y - minY) * scale + (height - extentY * scale) / 2 });
}
const cache = new WeakMap<CircuitMapLayout, ReturnType<typeof prepareCircuitPath>>();
export function pointAtProgress(layout: CircuitMapLayout, progress: number) {
    let path = cache.get(layout);
    if (!path) { path = prepareCircuitPath(layout); cache.set(layout, path); }
    const { x, y } = path.sample(progress); return { x, y };
}

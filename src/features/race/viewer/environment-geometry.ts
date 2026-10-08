import type { MapPoint } from '../../../game/domain/circuit-layout';

/** WGS84 feature coordinates use the TRACK's frame, not their own bounding box. No authoritative data is mutated. */
export function geographicTrackFrame(coordinates: readonly (readonly number[])[], rotationDegrees: number) {
    const longitude = coordinates[0][0], latitude = coordinates.reduce((sum, p) => sum + p[1], 0) / coordinates.length;
    const cosLat = Math.cos(latitude * Math.PI / 180), angle = rotationDegrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const rotate = (p: readonly number[]) => { const x = (p[0] - longitude) * cosLat, y = latitude - p[1]; return { x: x * c - y * s, y: x * s + y * c }; };
    const track = coordinates.map(rotate), xs = track.map(p => p.x), ys = track.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY, size = Math.max(w, h);
    if (!size || !Number.isFinite(size)) throw new RangeError('Invalid geographic frame');
    return (p: readonly number[]): MapPoint => { const r = rotate(p); return { x: (r.x - minX + (size - w) / 2) / size, y: (r.y - minY + (size - h) / 2) / size }; };
}
export type EnvironmentDetail = 'LOW' | 'MEDIUM' | 'HIGH';
/** Detail depends on actual drawable dimensions, not merely the browser width. */
export function environmentDetail(width: number, height: number): EnvironmentDetail {
    return width >= 900 && height >= 440 ? 'HIGH' : width >= 520 && height >= 280 ? 'MEDIUM' : 'LOW';
}

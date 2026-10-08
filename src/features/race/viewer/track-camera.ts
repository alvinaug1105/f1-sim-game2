import type { MapPoint } from '../../../game/domain/circuit-layout';

/** Ephemeral presentation only. Coordinates are fractions of the fitted canvas, never race progress. */
export type CameraMode = 'overview' | 'focus' | 'manual';
export interface TrackCamera { mode: CameraMode; zoom: number; center: MapPoint }
export const overviewCamera = (): TrackCamera => ({ mode: 'overview', zoom: 1, center: { x: .5, y: .5 } });
export const MIN_ZOOM = 1, MAX_ZOOM = 4, FOCUS_ZOOM = 2.4;
export function boundCamera(camera: TrackCamera): TrackCamera {
    const zoom = Number.isFinite(camera.zoom) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom)) : 1;
    const half = .5 / zoom;
    const bound = (n: number) => Math.max(half, Math.min(1 - half, Number.isFinite(n) ? n : .5));
    return { mode: zoom === 1 ? 'overview' : camera.mode, zoom, center: { x: bound(camera.center.x), y: bound(camera.center.y) } };
}
export function zoomCamera(camera: TrackCamera, factor: number): TrackCamera {
    return boundCamera({ ...camera, mode: camera.mode === 'focus' ? 'focus' : 'manual', zoom: camera.zoom * factor });
}
export function panCamera(camera: TrackCamera, dx: number, dy: number): TrackCamera {
    return boundCamera({ ...camera, mode: 'manual', center: { x: camera.center.x + dx / camera.zoom, y: camera.center.y + dy / camera.zoom } });
}
export function focusCamera(camera: TrackCamera, point: MapPoint): TrackCamera {
    return boundCamera({ ...camera, mode: 'focus', center: point });
}
/** No aggressive automatic zoom. Only the focus centre follows the existing visual sample. */
export function settleCamera(current: TrackCamera, target: TrackCamera, deltaMs: number, reduced: boolean) {
    const weight = reduced ? 1 : 1 - Math.exp(-Math.max(1, Math.min(50, deltaMs)) / 95);
    const next = { mode: target.mode, zoom: current.zoom + (target.zoom - current.zoom) * weight,
        center: { x: current.center.x + (target.center.x - current.center.x) * weight, y: current.center.y + (target.center.y - current.center.y) * weight } };
    const pending = Math.abs(next.zoom - target.zoom) > .002 || Math.hypot(next.center.x - target.center.x, next.center.y - target.center.y) > .0002;
    return { camera: pending ? next : target, pending };
}
export function cameraPoint(point: MapPoint, camera: TrackCamera, width: number, height: number): MapPoint {
    return { x: width / 2 + (point.x - camera.center.x * width) * camera.zoom, y: height / 2 + (point.y - camera.center.y * height) * camera.zoom };
}

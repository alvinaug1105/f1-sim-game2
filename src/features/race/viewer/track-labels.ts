import type { MapPoint } from '../../../game/domain/circuit-layout';

export interface LabelAnchor extends MapPoint { id: string; selected: boolean; player: boolean; width: number }
interface Rect { x: number; y: number; width: number; height: number }
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
/** Move callouts only, NEVER anchors. Selected then own-car priority; quiet field dots retain accessible names. */
export function placeTrackLabels(anchors: readonly LabelAnchor[], width: number, height: number) {
    const result = new Map<string, MapPoint>(), occupied: Rect[] = [];
    const ordered = anchors.filter(a => a.selected || a.player).sort((a, b) => Number(b.selected) - Number(a.selected) || a.id.localeCompare(b.id));
    for (const a of ordered) {
        if (a.x < -12 || a.x > width + 12 || a.y < -12 || a.y > height + 12) continue;
        const candidates = [{ x: 14, y: -30 }, { x: -a.width - 14, y: -30 }, { x: 14, y: 14 }, { x: -a.width - 14, y: 14 }];
        const fit = candidates.find(p => {
            const r = { x: a.x + p.x, y: a.y + p.y, width: a.width, height: 24 };
            return r.x >= 3 && r.x + r.width <= width - 3 && r.y >= 3 && r.y + r.height <= height - 3 && !occupied.some(o => intersects(r, o));
        });
        if (!fit) continue; // Never cover the selected label just to force a second label into the map.
        occupied.push({ x: a.x + fit.x, y: a.y + fit.y, width: a.width, height: 24 }); result.set(a.id, fit);
    }
    return result;
}

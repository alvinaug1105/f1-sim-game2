/** Presentation only: deterministic map-label priority and collision placement. No engine, RNG, locale or React. */
export const LABEL_TIER = { SELECTED: 0, PLAYER: 1, BATTLE: 2, LEADER: 3, NEARBY: 4, FIELD: 5 } as const;
export type LabelTier = typeof LABEL_TIER[keyof typeof LABEL_TIER];
export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
export interface LabelRequest { id: string; tier: number; x: number; y: number }
/** Centre of a placed label. `forced` means no collision-free slot existed (only tiers that must stay visible). */
export interface PlacedLabel { x: number; y: number; slot: number; forced: boolean }
/** Label box per tier; FIELD cars are marker-only and never get a box. */
export const LABEL_SIZE: readonly { w: number; h: number }[] = [{ w: 76, h: 30 }, { w: 62, h: 26 }, { w: 54, h: 22 }, { w: 54, h: 22 }, { w: 50, h: 21 }];
const DIRECTIONS: readonly (readonly [number, number])[] = [[1, -1], [1, 1], [-1, -1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]];
const RADII = [22, 44, 70] as const;
export const LABEL_SLOTS = RADII.length * DIRECTIONS.length;
/** Tiers that stay visible even when every slot collides (selected + other player car). */
const PERSISTENT_TIER = LABEL_TIER.PLAYER;
const PAD = 3;
export function slotCentre(car: Point, slot: number, size: { w: number; h: number }): Point {
    const [ux, uy] = DIRECTIONS[slot % DIRECTIONS.length], r = RADII[Math.floor(slot / DIRECTIONS.length)];
    return { x: car.x + ux * (r + size.w / 2), y: car.y + uy * (r * .75 + size.h / 2) };
}
export function labelRect(centre: Point, size: { w: number; h: number }): Rect { return { x: centre.x - size.w / 2, y: centre.y - size.h / 2, w: size.w, h: size.h }; }
function overlapArea(a: Rect, b: Rect, pad = 0) {
    const w = Math.min(a.x + a.w + pad, b.x + b.w + pad) - Math.max(a.x - pad, b.x - pad), h = Math.min(a.y + a.h + pad, b.y + b.h + pad) - Math.max(a.y - pad, b.y - pad);
    return w > 0 && h > 0 ? w * h : 0;
}
function coversMarker(r: Rect, m: Point, radius: number) { return m.x > r.x - radius && m.x < r.x + r.w + radius && m.y > r.y - radius && m.y < r.y + r.h + radius; }
/**
 * Places labels in priority order (lower tier first, then request order). Each label tries its previous slot first
 * (hysteresis against flicker), then fixed slots around its own car. Low-priority labels are hidden when no free slot
 * exists; selected/player labels always receive the least-colliding slot. Markers are never hidden by this function.
 */
export function placeLabels(requests: readonly LabelRequest[], options: { bounds: Rect; reserved?: readonly Rect[]; markers: readonly Point[]; markerRadius?: number; previous?: ReadonlyMap<string, number> }) {
    const { bounds, reserved = [], markers, markerRadius = 10, previous } = options;
    const placed: Rect[] = [], result = new Map<string, PlacedLabel | null>();
    const ordered = requests.map((r, i) => ({ r, i })).sort((a, b) => a.r.tier - b.r.tier || a.i - b.i);
    for (const { r } of ordered) {
        if (r.tier >= LABEL_TIER.FIELD || !Number.isFinite(r.x) || !Number.isFinite(r.y)) { result.set(r.id, null); continue; }
        const size = LABEL_SIZE[r.tier], first = previous?.get(r.id);
        const order = first !== undefined && first >= 0 && first < LABEL_SLOTS ? [first, ...Array.from({ length: LABEL_SLOTS }, (_, i) => i).filter(i => i !== first)] : Array.from({ length: LABEL_SLOTS }, (_, i) => i);
        let chosen: PlacedLabel | null = null, fallback: { centre: Point; slot: number; penalty: number } | null = null;
        for (const slot of order) {
            const centre = slotCentre(r, slot, size), rect = labelRect(centre, size);
            const outside = rect.x < bounds.x || rect.y < bounds.y || rect.x + rect.w > bounds.x + bounds.w || rect.y + rect.h > bounds.y + bounds.h;
            const labelHits = placed.reduce((sum, p) => sum + overlapArea(rect, p, PAD), 0);
            const reservedHits = reserved.reduce((sum, p) => sum + overlapArea(rect, p, PAD), 0);
            const markerHits = markers.filter(m => coversMarker(rect, m, markerRadius)).length;
            if (!outside && !labelHits && !reservedHits && !markerHits) { chosen = { ...centre, slot, forced: false }; break; }
            if (r.tier <= PERSISTENT_TIER) {
                // Higher-priority labels are weighted so a forced player label never hides the selected label.
                const penalty = (outside ? 1e7 : 0) + labelHits * 40 + reservedHits * 20 + markerHits * 400 + slot;
                if (!fallback || penalty < fallback.penalty) fallback = { centre, slot, penalty };
            }
        }
        if (!chosen && fallback) {
            const c = { x: Math.min(bounds.x + bounds.w - size.w / 2, Math.max(bounds.x + size.w / 2, fallback.centre.x)), y: Math.min(bounds.y + bounds.h - size.h / 2, Math.max(bounds.y + size.h / 2, fallback.centre.y)) };
            chosen = { ...c, slot: fallback.slot, forced: true };
        }
        if (chosen) placed.push(labelRect(chosen, size));
        result.set(r.id, chosen);
    }
    return result;
}

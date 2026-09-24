/** Presentation only: deterministic map-label priority and collision placement. No engine, RNG, locale or React. */
export const LABEL_TIER = { SELECTED: 0, PLAYER: 1, BATTLE: 2, LEADER: 3, NEARBY: 4, FIELD: 5 } as const;
export type LabelTier = typeof LABEL_TIER[keyof typeof LABEL_TIER];
export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
/**
 * `ahead`: optional presentation-only lookahead, the car's next positions along the drawn path (nearest first, spaced
 * `LOOKAHEAD_STEP` SVG units apart). Used only to choose a replacement slot that stays clear of START / FINISH and the
 * map edge while the car keeps travelling; it never delays or overrides a current-frame hard conflict.
 */
export interface LabelRequest { id: string; tier: number; x: number; y: number; ahead?: readonly Point[] }
/** Per-label memory carried between frames. */
export interface SlotMemory {
    slot: number;
    /** Consecutive frames a car marker has obstructed the slot. */
    blocked: number;
    /** Remaining fresh-slot hold after a move: marker obstruction is not counted while it lasts. */
    hold?: number;
    /** Slot recently abandoned, and frames left during which returning to it is discouraged. */
    abandoned?: number | null;
    cooldown?: number;
}
/** Centre of a placed label. `forced` means no valid slot existed (only tiers that must stay visible). */
export interface PlacedLabel { x: number; y: number; slot: number; forced: boolean; blocked: number; memory: SlotMemory }
/**
 * Consecutive obstructed frames (~0.75 s at 60 fps) before a marker passing through a label box may move the label.
 * Frame-counted so placement stays deterministic for a given frame sequence.
 */
export const STICKY_FRAMES = 45;
/** Fresh-slot hold after any move (~0.5 s). Never overrides a hard conflict. */
export const HOLD_FRAMES = 30;
/** Frames (~1.5 s) during which a just-abandoned slot is penalised as a replacement. */
export const RETURN_COOLDOWN_FRAMES = 90;
/**
 * Lookahead samples and spacing (SVG units): 325 units, enough to cover a whole START / FINISH crossing. Samples are
 * denser than the small line box, and future checks use a wider margin so a barely-clear slot is not chosen.
 */
export const LOOKAHEAD_SAMPLES = 13;
export const LOOKAHEAD_STEP = 25;
const FUTURE_PAD = 8;
/** Clearance beyond this (SVG units) is "comfortable"; more space earns no extra score. */
const CLEARANCE_CAP = 60;
/** Label box per tier; FIELD cars are marker-only and never get a box. */
export const LABEL_SIZE: readonly { w: number; h: number }[] = [{ w: 76, h: 30 }, { w: 62, h: 26 }, { w: 54, h: 22 }, { w: 54, h: 22 }, { w: 50, h: 21 }];
const DIRECTIONS: readonly (readonly [number, number])[] = [[1, -1], [1, 1], [-1, -1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]];
const RADII = [22, 44, 70] as const;
export const LABEL_SLOTS = RADII.length * DIRECTIONS.length;
/** Tiers that stay visible even when every slot collides (selected + other player car). */
const PERSISTENT_TIER = LABEL_TIER.PLAYER;
const PAD = 3;
/** START / FINISH keep-out exactly as the map draws it: the text box below the line, and the line itself. */
export function startFinishReserve(start: Point, text: string): Rect[] {
    return [{ x: start.x - 40, y: start.y + 22, w: Math.max(60, text.length * 11) + 10, h: 24 }, { x: start.x - 16, y: start.y - 16, w: 32, h: 32 }];
}
/** Projected length of one lap of the drawn path (SVG units); `at` maps lap progress to an SVG point. */
export function pathLength(at: (progress: number) => Point, samples = 400) {
    let length = 0;
    for (let i = 0; i < samples; i++) { const a = at(i / samples), b = at((i + 1) / samples); length += Math.hypot(b.x - a.x, b.y - a.y); }
    return length || 1;
}
/**
 * Lookahead horizon multiplier for visual playback speed: faster playback covers more track per frame, so a replacement
 * slot must stay valid over a longer stretch. Presentation only.
 */
export function lookaheadScale(speed: number, seeking = false) { return seeking || speed >= 8 ? 2 : speed >= 4 ? 1.5 : 1; }
/** A car's upcoming positions along the drawn path, `LOOKAHEAD_STEP × scale` apart, keeping its current lane offset. */
export function lookahead(at: (progress: number) => Point, progress: number, lapLength: number, offset: Point = { x: 0, y: 0 }, scale = 1): Point[] {
    return Array.from({ length: LOOKAHEAD_SAMPLES }, (_, k) => { const q = at(progress + (k + 1) * LOOKAHEAD_STEP * scale / lapLength); return { x: q.x + offset.x, y: q.y + offset.y }; });
}
export function slotCentre(car: Point, slot: number, size: { w: number; h: number }): Point {
    const [ux, uy] = DIRECTIONS[slot % DIRECTIONS.length], r = RADII[Math.floor(slot / DIRECTIONS.length)];
    return { x: car.x + ux * (r + size.w / 2), y: car.y + uy * (r * .75 + size.h / 2) };
}
export function labelRect(centre: Point, size: { w: number; h: number }): Rect { return { x: centre.x - size.w / 2, y: centre.y - size.h / 2, w: size.w, h: size.h }; }
function overlapArea(a: Rect, b: Rect, pad = 0) {
    const w = Math.min(a.x + a.w + pad, b.x + b.w + pad) - Math.max(a.x - pad, b.x - pad), h = Math.min(a.y + a.h + pad, b.y + b.h + pad) - Math.max(a.y - pad, b.y - pad);
    return w > 0 && h > 0 ? w * h : 0;
}
/** Gap between two rects along the most separated axis; negative when they overlap. */
function separation(a: Rect, b: Rect) { return Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h)); }
function coversMarker(r: Rect, m: Point, radius: number) { return m.x > r.x - radius && m.x < r.x + r.w + radius && m.y > r.y - radius && m.y < r.y + r.h + radius; }
/**
 * Places labels in priority order (lower tier first, then request order), so a label only ever yields to labels of
 * higher or equal priority.
 *
 * Keeping a slot: a label keeps its previous slot while that slot is hard-valid (inside the map, clear of reserved
 * regions and of already-placed labels). Passing car markers are tolerated; only `STICKY_FRAMES` consecutive obstructed
 * frames (not counted during a fresh-slot hold) move it, and only to a marker-free slot.
 *
 * Replacing a slot: a hard conflict relocates immediately, but to the most stable candidate rather than the first
 * clean one. Candidates are scored by clearance from map edges, reserved regions and placed labels (so small relative
 * motion does not invalidate them next frame), by staying clear of reserved regions, the edge and higher-priority
 * labels at the lookahead positions (so one move covers a whole START / FINISH crossing), then by fewer covered markers, the inner
 * ring, staying on the same side of the car, and not returning to a slot abandoned within `RETURN_COOLDOWN_FRAMES`. Low-priority labels are hidden when
 * no marker-free valid slot exists; selected/player labels always receive a slot. Markers are never hidden.
 */
export function placeLabels(requests: readonly LabelRequest[], options: { bounds: Rect; reserved?: readonly Rect[]; markers: readonly Point[]; markerRadius?: number; previous?: ReadonlyMap<string, SlotMemory> }) {
    const { bounds, reserved = [], markers, markerRadius = 10, previous } = options;
    const placed: Rect[] = [], result = new Map<string, PlacedLabel | null>();
    /** Where each placed label will be at every lookahead sample (its slot around its own car's future positions). */
    const placedAhead: (readonly Rect[])[] = [];
    const ordered = requests.map((r, i) => ({ r, i })).sort((a, b) => a.r.tier - b.r.tier || a.i - b.i);
    for (const { r } of ordered) {
        if (r.tier >= LABEL_TIER.FIELD || !Number.isFinite(r.x) || !Number.isFinite(r.y)) { result.set(r.id, null); continue; }
        const size = LABEL_SIZE[r.tier], memory = previous?.get(r.id);
        const kept = memory && Number.isInteger(memory.slot) && memory.slot >= 0 && memory.slot < LABEL_SLOTS ? memory : undefined;
        const leaves = (rect: Rect) => rect.x < bounds.x || rect.y < bounds.y || rect.x + rect.w > bounds.x + bounds.w || rect.y + rect.h > bounds.y + bounds.h;
        const check = (slot: number) => {
            const centre = slotCentre(r, slot, size), rect = labelRect(centre, size);
            const outside = leaves(rect);
            const labelHits = placed.reduce((sum, p) => sum + overlapArea(rect, p, PAD), 0);
            const reservedHits = reserved.reduce((sum, p) => sum + overlapArea(rect, p, PAD), 0);
            const markerHits = markers.filter(m => coversMarker(rect, m, markerRadius)).length;
            const clearance = Math.min(CLEARANCE_CAP, rect.x - bounds.x, bounds.x + bounds.w - rect.x - rect.w, rect.y - bounds.y, bounds.y + bounds.h - rect.y - rect.h, ...reserved.map(q => separation(rect, q)), ...placed.map(q => separation(rect, q)));
            return { centre, outside, labelHits, reservedHits, markerHits, clearance, hard: !outside && !labelHits && !reservedHits };
        };
        const hold = kept?.hold ?? 0, cooldown = kept?.cooldown ?? 0, abandoned = cooldown > 0 ? kept?.abandoned ?? null : null;
        const [kx, ky] = kept ? DIRECTIONS[kept.slot % DIRECTIONS.length] : [0, 0];
        const ahead = r.ahead ?? [];
        /**
         * Swept safety ("survival"): how soon this slot, carried along the car's lookahead, would hit a reserved region,
         * the map edge or a higher-priority label's upcoming position. A slot that survives the whole lookahead costs
         * nothing; otherwise the earlier the first conflict, the higher the cost, plus a small cost per further conflict.
         */
        const future = (slot: number) => {
            let first = -1, hits = 0;
            ahead.forEach((car, k) => {
                const rect = labelRect(slotCentre(car, slot, size), size);
                const hit = leaves({ x: rect.x - FUTURE_PAD, y: rect.y - FUTURE_PAD, w: rect.w + FUTURE_PAD * 2, h: rect.h + FUTURE_PAD * 2 }) || reserved.some(q => overlapArea(rect, q, FUTURE_PAD)) || placedAhead.some((f, j) => overlapArea(rect, f[k] ?? placed[j], FUTURE_PAD));
                if (hit) { hits++; if (first < 0) first = k; }
            });
            return first < 0 ? 0 : (ahead.length - first) * 60 + (hits - 1) * 15;
        };
        const score = (slot: number, c: ReturnType<typeof check>) => {
            const [ux, uy] = DIRECTIONS[slot % DIRECTIONS.length];
            const turn = kept ? 1 - (ux * kx + uy * ky) / (Math.hypot(ux, uy) * Math.hypot(kx, ky)) : 0; // 0 same side … 2 opposite
            return c.clearance * 3 - c.markerHits * 200 - future(slot) - Math.floor(slot / DIRECTIONS.length) * 8 - turn * 12 - (slot === abandoned ? 90 : 0);
        };
        /** Best hard-valid replacement (optionally marker-free only); ties keep the lower slot index. */
        const best = (markerFree: boolean, exclude?: number) => {
            let top: { slot: number; c: ReturnType<typeof check>; value: number } | null = null;
            for (let slot = 0; slot < LABEL_SLOTS; slot++) {
                if (slot === exclude) continue;
                const c = check(slot);
                if (!c.hard || (markerFree && c.markerHits)) continue;
                const value = score(slot, c);
                if (!top || value > top.value) top = { slot, c, value };
            }
            return top;
        };
        const stay = (centre: Point, blocked: number, forced = false): PlacedLabel => ({ ...centre, slot: kept!.slot, forced, blocked, memory: { slot: kept!.slot, blocked, hold: Math.max(0, hold - 1), abandoned, cooldown: Math.max(0, cooldown - 1) } });
        const move = (centre: Point, slot: number, forced = false): PlacedLabel => kept && slot === kept.slot
            ? stay(centre, 0, forced)
            : { ...centre, slot, forced, blocked: 0, memory: { slot, blocked: 0, hold: kept ? HOLD_FRAMES : 0, abandoned: kept ? kept.slot : null, cooldown: kept ? RETURN_COOLDOWN_FRAMES : 0 } };
        let chosen: PlacedLabel | null = null;
        const current = kept ? check(kept.slot) : null;
        if (current?.hard) {
            // Hard-valid: keep it. Markers only count once the fresh-slot hold has expired.
            const blocked = current.markerHits && hold === 0 ? kept!.blocked + 1 : 0;
            if (blocked < STICKY_FRAMES) chosen = stay(current.centre, blocked);
            else {
                const alternative = best(true, kept!.slot);
                // Persistently obstructed but no marker-free alternative: stay rather than jump to an equally obstructed slot.
                chosen = alternative ? move(alternative.c.centre, alternative.slot) : stay(current.centre, blocked);
            }
        } else {
            // New label or a genuine conflict: relocate now, to the most stable valid slot.
            const replacement = best(r.tier > PERSISTENT_TIER);
            if (replacement) chosen = move(replacement.c.centre, replacement.slot);
            else if (r.tier <= PERSISTENT_TIER) {
                // No valid slot at all: least-colliding slot, weighted so a forced player label never hides the selected
                // label, and favouring the previous slot so forced labels do not hop between equally bad slots.
                let fallback: { centre: Point; slot: number; penalty: number } | null = null;
                for (let slot = 0; slot < LABEL_SLOTS; slot++) {
                    const c = check(slot);
                    const penalty = (c.outside ? 1e7 : 0) + c.labelHits * 40 + c.reservedHits * 20 + c.markerHits * 400 + (slot === kept?.slot ? 0 : 200) + slot;
                    if (!fallback || penalty < fallback.penalty) fallback = { centre: c.centre, slot, penalty };
                }
                const f = fallback!, clamped = { x: Math.min(bounds.x + bounds.w - size.w / 2, Math.max(bounds.x + size.w / 2, f.centre.x)), y: Math.min(bounds.y + bounds.h - size.h / 2, Math.max(bounds.y + size.h / 2, f.centre.y)) };
                chosen = move(clamped, f.slot, true);
            }
        }
        if (chosen) {
            placed.push(labelRect(chosen, size));
            // Forced/clamped labels have no reliable slot geometry ahead; they are treated as staying where they are.
            placedAhead.push(chosen.forced ? [] : ahead.map(car => labelRect(slotCentre(car, chosen!.slot, size), size)));
        }
        result.set(r.id, chosen);
    }
    return result;
}

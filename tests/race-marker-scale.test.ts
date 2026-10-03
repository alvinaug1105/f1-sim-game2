/**
 * V8A-MED-001: Race bubbles hold their on-screen size using the ACTUAL rendered SVG scale. The map uses the default
 * preserveAspectRatio (xMidYMid meet), so one uniform scale applies: min(width ratio, height ratio). A portrait viewBox
 * in a height-capped box (phone layout just below 600 px) is height-limited; sizing from width alone shrank bubbles to
 * ~15.8 px and labels to ~6 px. Pure math only; the browser layout is measured separately by the Builder and Codex.
 */
import { describe, it, expect } from 'vitest';
import { RACE_BUBBLE, RACE_BUBBLE_PX, raceBubbleScale } from '../src/features/race/viewer/marker-packs';
import { effectiveSvgScale, nextScreenScale, raceMapPadding } from '../src/features/race/viewer/race-map-style';
import { raceMapCanvas } from '../src/features/race/viewer/track-map';
import { circuitLayouts } from '../src/data/seed/circuit-layouts';
import { drawnPitLane } from '../src/data/seed/circuit-pit-lanes';

/** Rendered bubble diameter and label font size (px) for a given effective scale, as TrackMap draws them. */
const bubblePx = (scale: number) => 2 * RACE_BUBBLE.r * scale * raceBubbleScale(scale, 1000);
const labelPx = (scale: number) => 8.8 * scale * raceBubbleScale(scale, 1000);

describe('effective SVG display scale (uniform meet fit)', () => {
    it('CASE A — 599 px portrait map (550 × 460 box, 1000 × 1217 viewBox) is height-limited: scale ≈ 0.378, not 0.55', () => {
        const s = effectiveSvgScale({ width: 550, height: 460 }, { width: 1000, height: 1217 })!;
        expect(s).toBeCloseTo(460 / 1217, 6); expect(s).toBeLessThan(.55);
        // Intended compact size on screen, not the ~15.8 px the width-only scale produced…
        expect(bubblePx(s)).toBeGreaterThanOrEqual(RACE_BUBBLE_PX.small - .01);
        expect(bubblePx(s)).toBeLessThanOrEqual(RACE_BUBBLE_PX.compact + .01);
        expect(labelPx(s)).toBeGreaterThanOrEqual(8);
        // …which is what sizing from width alone, rendered at the real (height-limited) scale, gives.
        expect(2 * RACE_BUBBLE.r * s * raceBubbleScale(.55, 1000)).toBeCloseTo(15.8, 0);
    });
    it('CASE B — 601 px landscape map (308 × 147.8 box, 1000 × 480 viewBox): both ratios agree (≈ 0.308)', () => {
        const s = effectiveSvgScale({ width: 308, height: 147.8 }, { width: 1000, height: 480 })!;
        expect(s).toBeCloseTo(.308, 3);
        expect(bubblePx(s)).toBeCloseTo(RACE_BUBBLE_PX.small, 6); expect(labelPx(s)).toBeGreaterThanOrEqual(8);
    });
    it('no readability cliff across 600 px: A and B render the bubble within 1 px and the label within 0.5 px', () => {
        const a = effectiveSvgScale({ width: 550, height: 460 }, { width: 1000, height: 1217 })!, b = effectiveSvgScale({ width: 308, height: 147.8 }, { width: 1000, height: 480 })!;
        expect(Math.abs(bubblePx(a) - bubblePx(b))).toBeLessThanOrEqual(1);
        expect(Math.abs(labelPx(a) - labelPx(b))).toBeLessThanOrEqual(.5);
    });
    it('CASE C — wide desktop map (688 × 309.6 box, 1000 × 450 viewBox): unchanged 26 px desktop bubble', () => {
        const s = effectiveSvgScale({ width: 688, height: 309.6 }, { width: 1000, height: 450 })!;
        expect(s).toBeCloseTo(.688, 6); expect(bubblePx(s)).toBeCloseTo(RACE_BUBBLE_PX.desktop, 6);
    });
    it('CASE D — 390 px Monza portrait map (356 × 430.8 box, 1000 × 1210 viewBox): unchanged 22 px phone bubble', () => {
        const s = effectiveSvgScale({ width: 356, height: 430.8 }, { width: 1000, height: 1210 })!;
        expect(s).toBeCloseTo(.356, 3); expect(bubblePx(s)).toBeCloseTo(RACE_BUBBLE_PX.small, 1); expect(labelPx(s)).toBeGreaterThanOrEqual(8);
    });
    it('a width-limited box is unchanged from the former width-only rule; an unlaid-out box is ignored', () => {
        for (const [w, h] of [[700, 400], [1400, 560], [356, 155]]) expect(effectiveSvgScale({ width: w, height: h * 2 }, { width: 1000, height: 1000 * h / w })).toBeCloseTo(w / 1000, 9);
        expect(effectiveSvgScale({ width: 0, height: 0 }, { width: 1000, height: 600 })).toBeNull();
        expect(effectiveSvgScale({ width: NaN, height: 300 }, { width: 1000, height: 600 })).toBeNull();
        expect(nextScreenScale(.5, null)).toBe(.5);
    });
    it('bubble, label and rings scale together (one group transform): their ratios never change', () => {
        for (const s of [.3, .378, .55, .7, 1.4]) {
            const k = raceBubbleScale(s, 1000);
            expect((8.8 * k) / (2 * RACE_BUBBLE.r * k)).toBeCloseTo(8.8 / 24, 12);
            // The selected ring (r + 5 at stroke 2.6) always fits the canvas padding at the current scale.
            expect(raceMapPadding(k)).toBeGreaterThanOrEqual((RACE_BUBBLE.r + 5 + 1.3) * k);
        }
    });
});

describe('resize feedback settles (bubble size → padding → viewBox height → scale)', () => {
    /** One client measurement as the browser does it: width-filling SVG, height:auto capped by CSS max-height. */
    function settle(id: string, compact: boolean, boxWidth: number, maxHeight: number) {
        const lane = drawnPitLane(id)?.points ?? [];
        let scale = 1; const seen: number[] = [];
        for (let i = 0; i < 12; i++) {
            const canvas = raceMapCanvas(circuitLayouts[id], compact, lane, raceMapPadding(raceBubbleScale(scale, 1000)));
            const box = { width: boxWidth, height: Math.min(maxHeight, boxWidth * canvas.height / canvas.width) };
            const next = nextScreenScale(scale, effectiveSvgScale(box, canvas));
            seen.push(next);
            if (next === scale) return { scale, steps: i, seen };
            scale = next;
        }
        return { scale: NaN, steps: Infinity, seen };
    }
    it.each(Object.keys(circuitLayouts))('%s: converges in a few measurements, never cycles, and lands on its pixel target', id => {
        for (const [compact, w, maxH] of [[true, 565, 460], [true, 550, 460], [true, 356, 1290], [false, 323, 680], [false, 490, 680], [false, 688, 560]] as const) {
            const r = settle(id, compact, w, maxH);
            expect(r.steps).toBeLessThanOrEqual(4);
            const drawn = r.scale * 1000, target = drawn < RACE_BUBBLE_PX.smallBelowPx ? RACE_BUBBLE_PX.small : drawn < RACE_BUBBLE_PX.compactBelowPx ? RACE_BUBBLE_PX.compact : RACE_BUBBLE_PX.desktop;
            expect(bubblePx(r.scale)).toBeCloseTo(target, 6);
            expect(labelPx(r.scale)).toBeGreaterThanOrEqual(8);
        }
    });
    it('ignores sub-0.5 % re-measurements (no oscillation from a one-unit padding change), follows real resizes', () => {
        expect(nextScreenScale(.378, .3781)).toBe(.378);
        expect(nextScreenScale(.378, .3779)).toBe(.378);
        expect(nextScreenScale(.378, .55)).toBe(.55);
        expect(nextScreenScale(.55, .378)).toBe(.378);
    });
});

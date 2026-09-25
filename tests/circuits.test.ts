import { describe, expect, it } from "vitest";
import { circuitLayouts, fallbackLayout, layoutForCircuit } from "../src/data/seed/circuit-layouts";
import { circuitProjection, prepareCircuitPath, validLayout } from "../src/game/domain/circuit-geometry";
import { placeLabels, LABEL_TIER } from "../src/features/race/viewer/labels";
import { developmentContent as source } from "../src/data/seed/content-development";
import albertPark from "../src/data/seed/geometry/albert-park.json";
import marinaBay from "../src/data/seed/geometry/marina-bay.json";
/** Signed heading change (radians) over the first `metres` of a sampled lap: > 0 = turning left (SVG y points down). */
function firstCorner(layout: (typeof circuitLayouts)[string]) {
    const path = prepareCircuitPath(layout);
    let turn = 0, prev: number | null = null;
    for (let i = 0; i <= 200; i++) {
        const s = path.sample(i / 1000), heading = Math.atan2(-s.tangentY, s.tangentX);
        if (prev !== null) turn += ((heading - prev + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        prev = heading;
        if (Math.abs(turn) > Math.PI / 4) return turn > 0 ? "LEFT" : "RIGHT";
    }
    return "NONE";
}
describe("Content Expansion Pass A circuits", () => {
    it("has a real, versioned layout for all 8 supported source circuits, resolved by stable ID", () => {
        expect(source.circuits).toHaveLength(8);
        for (const c of source.circuits) {
            const layout = layoutForCircuit(c.id);
            expect(layout, c.key).not.toBe(fallbackLayout);
            expect(layout.metadata?.realGeometry).toBe(true);
            expect(layout.metadata?.source).toContain("394d8fbe70ef2c0b0c8d23ff7bee61fa09606055");
        }
        expect(new Set(Object.values(circuitLayouts).map(l => l.id)).size).toBe(8);
    });
    it.each(Object.values(circuitLayouts))("$id: normalized, non-empty bounds, valid START/FINISH, NaN-free sampling and map coordinates", layout => {
        expect(validLayout(layout)).toBe(true);
        const xs = layout.points.map(p => p.x), ys = layout.points.map(p => p.y);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(.2);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(.2);
        // Uniform fit: the longer side spans the whole unit square.
        expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeCloseTo(1, 9);
        expect(layout.startFinishProgress).toBe(0);
        const path = prepareCircuitPath(layout), project = circuitProjection(layout.points);
        let previous = project(path.sample(0));
        for (let i = 1; i <= 2000; i++) {
            const point = project(path.sample(i / 1000));
            expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
            expect(point.x).toBeGreaterThanOrEqual(0); expect(point.x).toBeLessThanOrEqual(1000);
            expect(point.y).toBeGreaterThanOrEqual(0); expect(point.y).toBeLessThanOrEqual(650);
            expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThan(40); // continuous route
            previous = point;
        }
        // The label engine receives valid coordinates for a 22-car field spread around the lap.
        const cars = Array.from({ length: 22 }, (_, i) => ({ id: `c${i}`, tier: i < 2 ? LABEL_TIER.PLAYER : LABEL_TIER.FIELD, ...project(path.sample(i / 22)) }));
        const placed = placeLabels(cars, { bounds: { x: 4, y: 4, w: 992, h: 642 }, markers: cars });
        for (const [, label] of placed) if (label) expect(Number.isFinite(label.x) && Number.isFinite(label.y)).toBe(true);
        expect(placed.get("c0") && placed.get("c1")).toBeTruthy(); // both player cars always labelled
    });
    it("moves every car in the real racing direction (first corner) — Marina Bay is reversed from its source order", () => {
        const expected: Record<string, string> = { "albert-park": "RIGHT", suzuka: "RIGHT", shanghai: "RIGHT", bahrain: "RIGHT", monaco: "RIGHT", silverstone: "RIGHT", "spa-francorchamps": "RIGHT", "marina-bay": "LEFT" };
        for (const layout of Object.values(circuitLayouts)) expect(firstCorner(layout), layout.id).toBe(expected[layout.id]);
        const marina = Object.values(circuitLayouts).find(l => l.id === "marina-bay")!;
        expect(marina.direction).toBe("COUNTER_CLOCKWISE");
        // Start point is kept; the source files themselves are committed unmodified.
        expect(marinaBay.features[0].geometry.coordinates).toHaveLength(116);
        expect(albertPark.features[0].geometry.coordinates.length).toBeGreaterThan(100);
    });
});

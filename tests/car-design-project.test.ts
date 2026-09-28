import { describe, expect, it } from "vitest";
import { CAR_PART_TYPES, CAR_PERFORMANCE_DIMENSIONS, PART_RELEVANCE, uniformCarStats, type CarPartDesign } from "../src/game/domain/car-development";
import { addCareerDays, careerDaysBetween, DESIGN_FOCUSES, DESIGN_PROGRAMMES, isDesignFocus, isDesignProgramme, PART_DURATION_DAYS, planCarPartDesign, projectProgress } from "../src/game/domain/car-design-project";

const base = (rating: number, partType: CarPartDesign["partType"] = "FRONT_WING"): CarPartDesign => ({ partType, version: 1, stats: uniformCarStats(rating) });
describe("Phase 17B deterministic part design", () => {
  it("validates exactly the supported choices and central baseline durations", () => {
    expect(DESIGN_FOCUSES).toHaveLength(6);
    expect(DESIGN_PROGRAMMES).toEqual(["STANDARD", "EXTENSIVE"]);
    expect(isDesignFocus("LOW_SPEED")).toBe(true);
    expect(isDesignFocus("ENGINE")).toBe(false);
    expect(isDesignProgramme("EXTENSIVE")).toBe(true);
    expect(isDesignProgramme("QUICK")).toBe(false);
    expect(CAR_PART_TYPES.map(type => PART_DURATION_DAYS[type])).toEqual([14, 14, 21, 18, 24, 16]);
    expect(() => planCarPartDesign(base(70), "ENGINE" as never, "STANDARD", "2026-03-01")).toThrow();
  });
  it("uses exclusive-start Career dates, including month and leap boundaries", () => {
    const standard = planCarPartDesign(base(70), "BALANCED", "STANDARD", "2026-03-01");
    const extensive = planCarPartDesign(base(70), "BALANCED", "EXTENSIVE", "2026-03-01");
    expect(standard.durationDays).toBe(14);
    expect(standard.completesAtCareerDate).toBe("2026-03-15");
    expect(extensive.durationDays).toBe(20);
    expect(extensive.completesAtCareerDate).toBe("2026-03-21");
    expect(addCareerDays("2028-02-27", 3)).toBe("2028-03-01");
    expect(careerDaysBetween("2028-02-27", "2028-03-01")).toBe(3);
    expect(projectProgress("2026-03-01", "2026-03-15", "2026-03-08")).toEqual({ daysElapsed: 7, daysTotal: 14, daysRemaining: 7, percent: 50 });
  });
  it("is deterministic, capped, nonnegative and bounded by Phase 17A relevance", () => {
    for (const type of CAR_PART_TYPES) for (const focus of DESIGN_FOCUSES) for (const programme of DESIGN_PROGRAMMES) {
      const input = base(83, type);
      const first = planCarPartDesign(input, focus, programme, "2026-03-01");
      expect(first).toEqual(planCarPartDesign(input, focus, programme, "2026-03-01"));
      for (const dimension of CAR_PERFORMANCE_DIMENSIONS) {
        expect(first.planned.stats[dimension]).toBeGreaterThanOrEqual(input.stats[dimension]);
        expect(first.planned.stats[dimension]).toBeLessThanOrEqual(100);
        if (PART_RELEVANCE[type][dimension] === 0) expect(first.deltas[dimension]).toBe(0);
      }
    }
  });
  it("concentrates a focus while reducing gains elsewhere", () => {
    const balanced = planCarPartDesign(base(60), "BALANCED", "STANDARD", "2026-03-01");
    const focused = planCarPartDesign(base(60), "LOW_SPEED", "STANDARD", "2026-03-01");
    expect(focused.deltas.lowSpeed).toBeGreaterThan(balanced.deltas.lowSpeed);
    expect(focused.deltas.mediumSpeed).toBeLessThan(balanced.deltas.mediumSpeed);
    expect(focused.deltas.dragReduction).toBe(0);
    const byDimension = { LOW_SPEED: "lowSpeed", MEDIUM_SPEED: "mediumSpeed", HIGH_SPEED: "highSpeed", DRAG_REDUCTION: "dragReduction", DRS_EFFICIENCY: "drsEfficiency" } as const;
    for (const type of CAR_PART_TYPES) for (const [choice, dimension] of Object.entries(byDimension) as [keyof typeof byDimension, typeof byDimension[keyof typeof byDimension]][]) {
      if (PART_RELEVANCE[type][dimension] === 0) continue;
      const normal = planCarPartDesign(base(70, type), "BALANCED", "STANDARD", "2026-03-01");
      const priority = planCarPartDesign(base(70, type), choice, "STANDARD", "2026-03-01");
      expect(priority.deltas[dimension]).toBeGreaterThan(normal.deltas[dimension]);
    }
  });
  it("rewards the longer programme and diminishes gains at high ratings without permanent targeted zero", () => {
    const standard = planCarPartDesign(base(70), "LOW_SPEED", "STANDARD", "2026-03-01");
    const extensive = planCarPartDesign(base(70), "LOW_SPEED", "EXTENSIVE", "2026-03-01");
    const high = planCarPartDesign(base(95), "LOW_SPEED", "STANDARD", "2026-03-01");
    expect(extensive.durationDays).toBeGreaterThan(standard.durationDays);
    expect(extensive.deltas.lowSpeed).toBeGreaterThan(standard.deltas.lowSpeed);
    expect(standard.deltas.lowSpeed).toBeGreaterThan(high.deltas.lowSpeed);
    expect(high.deltas.lowSpeed).toBeGreaterThan(0);
    expect(planCarPartDesign(base(100), "LOW_SPEED", "STANDARD", "2026-03-01").deltas.lowSpeed).toBe(0);
  });
});

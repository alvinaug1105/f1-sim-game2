import { describe, expect, it } from "vitest";
import { CAR_PART_TYPES, currentCarPerformance, uniformCarStats } from "../src/game/domain/car-development";
import { MANUFACTURING_DAYS_PER_UNIT, planManufacturing, rosterFittedDesigns } from "../src/game/domain/car-manufacturing";
import { projectProgress } from "../src/game/domain/car-design-project";

describe("physical car manufacturing rules", () => {
  it("uses one deterministic Career-time duration per part and quantity", () => {
    const days = [3, 3, 5, 4, 6, 4];
    for (const [index, partType] of CAR_PART_TYPES.entries()) {
      expect(MANUFACTURING_DAYS_PER_UNIT[partType]).toBe(days[index]);
      for (const quantity of [1, 2] as const) {
        const first = planManufacturing(partType, quantity, "2026-04-01");
        expect(first).toEqual(planManufacturing(partType, quantity, "2026-04-01"));
        expect(first.durationDays).toBe(days[index] * quantity);
      }
    }
    expect(planManufacturing("FRONT_WING", 2, "2026-04-01").completesAtCareerDate).toBe("2026-04-07");
    expect(() => planManufacturing("FRONT_WING", 3, "2026-04-01")).toThrow(RangeError);
    expect(() => planManufacturing("FRONT_WING", 0, "2026-04-01")).toThrow(RangeError);
    expect(projectProgress("2026-04-01", "2026-04-07", "2026-04-04")).toEqual({ daysElapsed: 3, daysTotal: 6, daysRemaining: 3, percent: 50 });
  });
  it("aggregates the six fitted designs independently by team car slot", () => {
    const all = CAR_PART_TYPES.flatMap(partType => (["CAR_1", "CAR_2"] as const).map(carSlot => ({
      careerTeamId: "team", carSlot, design: { partType, version: carSlot === "CAR_1" && partType === "FRONT_WING" ? 2 : 1,
        ...uniformCarStats(carSlot === "CAR_1" && partType === "FRONT_WING" ? 100 : 70) },
    })));
    const one = currentCarPerformance(rosterFittedDesigns(all, "team", "CAR_1"));
    const two = currentCarPerformance(rosterFittedDesigns(all, "team", "CAR_2"));
    expect(one?.stats.lowSpeed).toBeGreaterThan(two!.stats.lowSpeed);
    expect(one?.overall).toBeGreaterThan(two!.overall);
    expect(() => rosterFittedDesigns(all.slice(1), "team", "CAR_1")).toThrow(RangeError);
  });
});

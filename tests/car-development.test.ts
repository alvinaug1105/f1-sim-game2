import { describe, expect, it } from "vitest";
import {
  aggregateCarPerformance, CAR_PART_TYPES, CAR_PERFORMANCE_DIMENSIONS,
  currentCarPerformance, deriveOverallCarPerformance, legacyCarPerformance,
  PART_RELEVANCE, sourceCarStats, uniformCarStats, validateCarPartDesign,
  validateCarPerformanceStats, type CarPartDesign,
} from "../src/game/domain/car-development";
import { rosterBalance } from "../src/game/domain/race-repository";

const baseline = (rating = 50): CarPartDesign[] => CAR_PART_TYPES.map(partType => ({
  partType, version: 1, stats: uniformCarStats(rating),
}));

describe("Phase 17A management car model", () => {
  it("validates all five integer ratings and positive design versions", () => {
    for (const dimension of CAR_PERFORMANCE_DIMENSIONS) {
      for (const value of [0, 100]) expect(() => validateCarPerformanceStats({ ...uniformCarStats(50), [dimension]: value })).not.toThrow();
      for (const value of [-1, 101, 1.5, NaN, Infinity]) expect(() => validateCarPerformanceStats({ ...uniformCarStats(50), [dimension]: value })).toThrow();
    }
    expect(CAR_PART_TYPES).toHaveLength(6);
    expect(() => validateCarPartDesign({ ...baseline()[0], version: 0 })).toThrow();
    expect(() => validateCarPartDesign({ ...baseline()[0], partType: "ENGINE" as CarPartDesign["partType"] })).toThrow();
  });

  it("normalizes every relevance dimension and reconstructs equal baselines exactly", () => {
    for (const dimension of CAR_PERFORMANCE_DIMENSIONS) {
      expect(CAR_PART_TYPES.reduce((sum, type) => sum + PART_RELEVANCE[type][dimension], 0)).toBe(100);
      expect(CAR_PART_TYPES.filter(type => PART_RELEVANCE[type][dimension] > 0).length).toBeGreaterThan(1);
    }
    for (const rating of [0, 1, 37, 50, 87, 100]) {
      expect(aggregateCarPerformance(baseline(rating))).toEqual(uniformCarStats(rating));
      expect(deriveOverallCarPerformance(uniformCarStats(rating))).toBe(rating);
    }
  });

  it("aggregates deterministically regardless of input order, with simple nearest-integer rounding", () => {
    const parts = baseline();
    parts[0] = { ...parts[0], stats: uniformCarStats(51) };
    expect(aggregateCarPerformance(parts)).toEqual(aggregateCarPerformance([...parts].reverse()));
    expect(deriveOverallCarPerformance({ lowSpeed: 51, mediumSpeed: 50, highSpeed: 50, dragReduction: 50, drsEfficiency: 50 })).toBe(50);
    expect(deriveOverallCarPerformance({ lowSpeed: 51, mediumSpeed: 51, highSpeed: 51, dragReduction: 50, drsEfficiency: 50 })).toBe(51);
    expect(() => aggregateCarPerformance(parts.slice(1))).toThrow();
    expect(() => aggregateCarPerformance([...parts.slice(0, 5), parts[0]])).toThrow();
  });

  it.each(["FRONT_WING", "REAR_WING", "UNDERFLOOR", "SUSPENSION"] as const)("changes %s only where its matrix contributes", partType => {
    const parts = baseline();
    const index = parts.findIndex(part => part.partType === partType);
    parts[index] = { ...parts[index], stats: uniformCarStats(100) };
    const stats = aggregateCarPerformance(parts);
    for (const dimension of CAR_PERFORMANCE_DIMENSIONS) {
      expect(stats[dimension] > 50).toBe(PART_RELEVANCE[partType][dimension] > 0);
    }
  });

  it("uses source dimensions, scalar, then the accepted legacy fallback without altering old roster balance", () => {
    expect(sourceCarStats({ entryOrder: 1, carPerformance: 87, highSpeedPerformance: 91 })).toEqual({ ...uniformCarStats(87), highSpeed: 91 });
    expect(sourceCarStats({ entryOrder: 2, carPerformance: null })).toEqual(uniformCarStats(legacyCarPerformance(2)));
    expect(rosterBalance({ pace: 75, consistency: 80, teamEntry: { carPerformance: 87, partDesigns: [] } })?.carPerformance).toBe(87);
    expect(rosterBalance({ pace: 75, consistency: 80, teamEntry: { carPerformance: null, partDesigns: [] } })).toBeNull();
    const designs = baseline(80).map(part => ({ ...part.stats, partType: part.partType, version: part.version }));
    expect(currentCarPerformance(designs)?.overall).toBe(80);
    expect(rosterBalance({ pace: 75, consistency: 80, teamEntry: { carPerformance: 87, partDesigns: designs } })?.carPerformance).toBe(80);
  });
});

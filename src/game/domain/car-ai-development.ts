import { CAR_PART_TYPES, CAR_PERFORMANCE_DIMENSIONS, PART_RELEVANCE, type CarPartDesign, type CarPartType, type CarPerformanceStats } from "./car-development";
import { MAX_ACTIVE_DESIGN_PROJECTS, planCarPartDesign, type DesignFocus, type DesignProgramme } from "./car-design-project";

export const CAR_DEVELOPMENT_STYLES = ["BALANCED", "FIX_WEAKNESS", "BUILD_STRENGTH"] as const;
export type CarDevelopmentStyle = typeof CAR_DEVELOPMENT_STYLES[number];
const focuses: Record<keyof CarPerformanceStats, DesignFocus> = {
  lowSpeed: "LOW_SPEED", mediumSpeed: "MEDIUM_SPEED", highSpeed: "HIGH_SPEED",
  dragReduction: "DRAG_REDUCTION", drsEfficiency: "DRS_EFFICIENCY",
};
export interface AiDesignInput {
  readonly style: CarDevelopmentStyle;
  readonly initial: CarPerformanceStats;
  readonly current: CarPerformanceStats;
  readonly designs: readonly CarPartDesign[];
  readonly activeParts: readonly CarPartType[];
  readonly projectsStarted: number;
}
/** Stable ties: CAR_PART_TYPES, then CAR_PERFORMANCE_DIMENSIONS. No identity, RNG or wall clock input. */
export function planAiCarDesign(input: AiDesignInput): { partType: CarPartType; focus: DesignFocus; programme: DesignProgramme } | null {
  if (input.activeParts.length >= MAX_ACTIVE_DESIGN_PROJECTS) return null;
  const programme: DesignProgramme = input.style === "BUILD_STRENGTH" ? "EXTENSIVE"
    : input.style === "FIX_WEAKNESS" ? "STANDARD" : input.projectsStarted % 2 ? "EXTENSIVE" : "STANDARD";
  const candidates = CAR_PART_TYPES.filter(type => !input.activeParts.includes(type)).flatMap(partType => {
    const base = input.designs.filter(design => design.partType === partType).sort((a, b) => b.version - a.version)[0];
    return base ? [{ partType, base }] : [];
  });
  if (input.style === "BALANCED") {
    return candidates.map(({ partType, base }) => ({ partType, focus: "BALANCED" as const, programme,
      score: CAR_PERFORMANCE_DIMENSIONS.reduce((sum, dimension) => sum + (100 - base.stats[dimension]) * PART_RELEVANCE[partType][dimension], 0),
      useful: Object.values(planCarPartDesign(base, "BALANCED", programme, "2026-01-01").deltas).some(value => value > 0),
    })).filter(row => row.useful).sort((a, b) => b.score - a.score).map(({ partType, focus, programme }) => ({ partType, focus, programme }))[0] ?? null;
  }
  const dimensions = [...CAR_PERFORMANCE_DIMENSIONS].sort((a, b) => input.style === "FIX_WEAKNESS"
    ? input.current[a] - input.current[b] : input.initial[b] - input.initial[a]);
  for (const dimension of dimensions) {
    const focus = focuses[dimension];
    const best = candidates.map(({ partType, base }) => ({ partType, focus, programme,
      score: (100 - base.stats[dimension]) * PART_RELEVANCE[partType][dimension],
    })).filter(row => row.score > 0).sort((a, b) => b.score - a.score)[0];
    if (best) return { partType: best.partType, focus, programme };
  }
  return null;
}
export function isNonWorseDesign(candidate: CarPartDesign, current: CarPartDesign): boolean {
  return candidate.partType === current.partType && candidate.version > current.version &&
    CAR_PERFORMANCE_DIMENSIONS.every(dimension => candidate.stats[dimension] >= current.stats[dimension]);
}

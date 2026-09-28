import { CAR_PERFORMANCE_DIMENSIONS, CAR_PART_TYPES, PART_RELEVANCE, validateCarPartDesign, type CarPartDesign, type CarPartType, type CarPerformanceStats } from "./car-development";

export const MAX_ACTIVE_DESIGN_PROJECTS = 2;
export const DESIGN_FOCUSES = ["BALANCED", "LOW_SPEED", "MEDIUM_SPEED", "HIGH_SPEED", "DRAG_REDUCTION", "DRS_EFFICIENCY"] as const;
export type DesignFocus = typeof DESIGN_FOCUSES[number];
export const DESIGN_PROGRAMMES = ["STANDARD", "EXTENSIVE"] as const;
export type DesignProgramme = typeof DESIGN_PROGRAMMES[number];
export const PART_DURATION_DAYS: Readonly<Record<CarPartType, number>> = Object.freeze({
  FRONT_WING: 14, REAR_WING: 14, UNDERFLOOR: 21, SIDEPODS: 18, CHASSIS: 24, SUSPENSION: 16,
});
/** Game tuning, not an engineering calibration. Multipliers use 1000 as unity. */
export const PROGRAMME_CONFIG = Object.freeze({
  STANDARD: Object.freeze({ duration: 1000, gain: 1000 }),
  EXTENSIVE: Object.freeze({ duration: 1400, gain: 1250 }),
});
export const FOCUS_MULTIPLIERS = Object.freeze({ balanced: 1000, selected: 1600, other: 600 });
const FOCUS_DIMENSION: Readonly<Partial<Record<DesignFocus, keyof CarPerformanceStats>>> = Object.freeze({
  LOW_SPEED: "lowSpeed", MEDIUM_SPEED: "mediumSpeed", HIGH_SPEED: "highSpeed",
  DRAG_REDUCTION: "dragReduction", DRS_EFFICIENCY: "drsEfficiency",
});
export function isCarPartType(value: unknown): value is CarPartType { return typeof value === "string" && (CAR_PART_TYPES as readonly string[]).includes(value); }
export function isDesignFocus(value: unknown): value is DesignFocus { return typeof value === "string" && (DESIGN_FOCUSES as readonly string[]).includes(value); }
export function isDesignProgramme(value: unknown): value is DesignProgramme { return typeof value === "string" && (DESIGN_PROGRAMMES as readonly string[]).includes(value); }
export function addCareerDays(isoDate: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isSafeInteger(days) || days < 0) throw new RangeError("Invalid Career date or duration");
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) throw new RangeError("Invalid Career date");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function careerDaysBetween(start: string, end: string): number {
  addCareerDays(start, 0); addCareerDays(end, 0);
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000);
}
export interface DesignPlan {
  readonly base: CarPartDesign;
  readonly planned: CarPartDesign;
  readonly deltas: CarPerformanceStats;
  readonly focus: DesignFocus;
  readonly programme: DesignProgramme;
  readonly durationDays: number;
  readonly startedAtCareerDate: string;
  readonly completesAtCareerDate: string;
}
/** Completion is at start + duration days (exclusive start day), using UTC date arithmetic only. */
export function planCarPartDesign(base: CarPartDesign, focus: DesignFocus, programme: DesignProgramme, startDate: string): DesignPlan {
  validateCarPartDesign(base);
  if (!isDesignFocus(focus) || !isDesignProgramme(programme)) throw new RangeError("Invalid design choice");
  const config = PROGRAMME_CONFIG[programme];
  const durationDays = Math.ceil(PART_DURATION_DAYS[base.partType] * config.duration / 1000);
  const selected = FOCUS_DIMENSION[focus];
  const deltas = Object.fromEntries(CAR_PERFORMANCE_DIMENSIONS.map(dimension => {
    const current = base.stats[dimension];
    const relevance = PART_RELEVANCE[base.partType][dimension];
    if (current === 100 || relevance === 0) return [dimension, 0];
    const focusMultiplier = !selected ? FOCUS_MULTIPLIERS.balanced : selected === dimension ? FOCUS_MULTIPLIERS.selected : FOCUS_MULTIPLIERS.other;
    // Headroom × relevance × base coefficient 8/30 × two per-mille choices.
    const numerator = (100 - current) * relevance * 8 * config.gain * focusMultiplier;
    const denominator = 100 * 30 * 1000 * 1000;
    const rounded = Math.floor((numerator + denominator / 2) / denominator);
    const balancedNumerator = (100 - current) * relevance * 8 * config.gain * FOCUS_MULTIPLIERS.balanced;
    const balancedGain = Math.floor((balancedNumerator + denominator / 2) / denominator);
    // Integer rounding must not erase the selected stat's advantage while headroom remains.
    const gain = selected === dimension ? Math.max(1, rounded, balancedGain + 1) : rounded;
    return [dimension, Math.min(100 - current, gain)];
  })) as unknown as CarPerformanceStats;
  const stats = Object.fromEntries(CAR_PERFORMANCE_DIMENSIONS.map(dimension => [dimension, base.stats[dimension] + deltas[dimension]])) as unknown as CarPerformanceStats;
  return { base, planned: { partType: base.partType, version: base.version + 1, stats }, deltas, focus, programme, durationDays,
    startedAtCareerDate: startDate, completesAtCareerDate: addCareerDays(startDate, durationDays) };
}
export function projectProgress(start: string, completion: string, current: string) {
  const total = careerDaysBetween(start, completion);
  if (total <= 0) throw new RangeError("Invalid project dates");
  const elapsed = Math.max(0, Math.min(total, careerDaysBetween(start, current)));
  return { daysElapsed: elapsed, daysTotal: total, daysRemaining: total - elapsed, percent: Math.floor(elapsed * 100 / total) };
}

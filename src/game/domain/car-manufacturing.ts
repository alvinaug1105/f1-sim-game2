import { CAR_PART_TYPES, currentCarPerformance, type CarPartType, type StoredCarPartDesign } from "./car-development";
import { addCareerDays } from "./car-design-project";

export const CAR_SLOTS = ["CAR_1", "CAR_2"] as const;
export type CarSlot = typeof CAR_SLOTS[number];
/** Initial global management capacity; a later Facilities phase may replace this value. */
export const MAX_ACTIVE_MANUFACTURING_ORDERS = 2;
export const MANUFACTURING_DAYS_PER_UNIT: Readonly<Record<CarPartType, number>> = Object.freeze({
  FRONT_WING: 3, REAR_WING: 3, UNDERFLOOR: 5, SIDEPODS: 4, CHASSIS: 6, SUSPENSION: 4,
});
export function isCarSlot(value: unknown): value is CarSlot {
  return typeof value === "string" && (CAR_SLOTS as readonly string[]).includes(value);
}
export function planManufacturing(partType: CarPartType, quantity: number, careerDate: string) {
  if (!CAR_PART_TYPES.includes(partType) || !Number.isSafeInteger(quantity) || (quantity !== 1 && quantity !== 2))
    throw new RangeError("Invalid manufacturing choice");
  const durationDays = MANUFACTURING_DAYS_PER_UNIT[partType] * quantity;
  return { partType, quantity, durationDays, startedAtCareerDate: careerDate,
    completesAtCareerDate: addCareerDays(careerDate, durationDays) };
}
export interface FittedDesign {
  readonly careerTeamId: string;
  readonly carSlot: CarSlot;
  readonly design: StoredCarPartDesign;
}
/** A complete physical specification is required; no latest-design substitution is permitted. */
export function fittedPerformance(fitments: readonly FittedDesign[]) {
  return currentCarPerformance(fitments.map(fitment => fitment.design));
}
export function rosterFittedDesigns<T extends FittedDesign>(fitments: readonly T[], teamId: string, slot: CarSlot): StoredCarPartDesign[] {
  const parts = fitments.filter(fitment => fitment.careerTeamId === teamId && fitment.carSlot === slot).map(fitment => fitment.design);
  if (parts.length !== CAR_PART_TYPES.length) throw new RangeError("Incomplete fitted car specification");
  return parts;
}

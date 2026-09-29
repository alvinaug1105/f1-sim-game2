import type { CarPartDesign, CarPartType, CarPerformanceStats } from "./car-development";
import type { CarSlot } from "./car-manufacturing";

export type CarPhysicalErrorCode = "NOT_FOUND" | "UNAVAILABLE" | "LEGACY" | "INVALID_CHOICE" | "CAPACITY" |
  "DESIGN_ACTIVE" | "NO_UNIT" | "SESSION_IN_PROGRESS" | "STALE_PREVIEW" | "PERSISTENCE_FAILED";
export class CarPhysicalError extends Error {
  constructor(readonly code: CarPhysicalErrorCode, options?: ErrorOptions) { super(code, options); }
}
export interface PhysicalCarView {
  readonly slot: CarSlot;
  readonly driverName: string;
  readonly stats: CarPerformanceStats;
  readonly overall: number;
  readonly parts: readonly { partType: CarPartType; version: number; unitNumber: number }[];
}
export interface ManufacturingPlanView {
  readonly quantity: 1 | 2;
  readonly durationDays: number;
  readonly completesAtCareerDate: string;
}
export interface PhysicalDesignView {
  readonly id: string;
  readonly design: CarPartDesign;
  readonly availableUnits: number;
  readonly plans: readonly ManufacturingPlanView[];
}
export interface PhysicalOrderView {
  readonly id: string;
  readonly partType: CarPartType;
  readonly version: number;
  readonly quantity: number;
  readonly status: "ACTIVE" | "COMPLETED";
  readonly startedAtCareerDate: string;
  readonly completesAtCareerDate: string;
  readonly completedAtCareerDate: string | null;
}
export interface FitImpactView {
  readonly slot: CarSlot;
  readonly designId: string;
  readonly partType: CarPartType;
  readonly version: number;
  readonly before: CarPerformanceStats;
  readonly after: CarPerformanceStats;
  readonly beforeOverall: number;
  readonly afterOverall: number;
}
export interface PlayerPhysicalOverview {
  readonly cars: readonly PhysicalCarView[];
  readonly designs: readonly PhysicalDesignView[];
  readonly orders: readonly PhysicalOrderView[];
  readonly fitImpacts: readonly FitImpactView[];
}
export interface CarPhysicalRepository {
  startManufacturing(careerId: string, designId: string, quantity: number, expectedCompletionDate?: string): Promise<PhysicalOrderView>;
  fit(careerId: string, slot: unknown, designId: string, expected?: FitImpactView): Promise<void>;
}

import type { CareerPlayerCar } from "./career";
import type { CarPartDesign, CarPartType } from "./car-development";
import type { DesignFocus, DesignPlan, DesignProgramme } from "./car-design-project";

export type CarDesignErrorCode = "NOT_FOUND" | "UNAVAILABLE" | "LEGACY" | "CAPACITY" | "PART_ACTIVE" | "INVALID_CHOICE" | "STALE_PREVIEW" | "PERSISTENCE_FAILED";
export class CarDesignError extends Error {
  constructor(readonly code: CarDesignErrorCode, options?: ErrorOptions) { super(code, options); }
}
export interface CarDesignProjectView {
  readonly id: string;
  readonly partType: CarPartType;
  readonly newVersion: number;
  readonly focus: DesignFocus;
  readonly programme: DesignProgramme;
  readonly status: "ACTIVE" | "COMPLETED";
  readonly startedAtCareerDate: string;
  readonly completesAtCareerDate: string;
  readonly completedAtCareerDate: string | null;
  readonly planned: CarPartDesign;
}
export interface CarDevelopmentOverview {
  readonly car: CareerPlayerCar;
  readonly careerDate: string;
  readonly careerStatus: string;
  readonly projects: readonly CarDesignProjectView[];
  readonly availableDesigns: readonly CarPartDesign[];
}
export interface CarDesignRepository {
  getOverview(careerId: string): Promise<CarDevelopmentOverview | null>;
  preview(careerId: string, partType: unknown, focus: unknown, programme: unknown): Promise<DesignPlan>;
  start(careerId: string, partType: unknown, focus: unknown, programme: unknown, expectedPreview?: DesignPlan): Promise<CarDesignProjectView>;
}

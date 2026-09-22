import type { CareerProgress } from "./progression";
import type { RaceSimulationState } from "../../simulation/race/types";
export interface RaceRosterEntry {
  readonly driverId: string;
  readonly teamId: string;
  readonly driverName: string;
  readonly teamName: string;
  readonly teamOrder: number;
  readonly carNumber: number;
}
export interface RaceLabel {
  readonly entrantId: string;
  readonly driverName: string;
  readonly teamName: string;
}
export interface CareerRaceData {
  readonly progress: CareerProgress;
  readonly eventId: string;
  readonly sessionId: string;
  readonly state: RaceSimulationState | null;
  readonly labels: readonly RaceLabel[];
  readonly roster: readonly RaceRosterEntry[];
  readonly circuit: {
    readonly lengthMeters: number;
    readonly defaultLapCount: number;
  };
}
export interface RaceChange {
  readonly state: RaceSimulationState;
  readonly labels: readonly RaceLabel[];
  readonly progress: CareerProgress;
}
export interface CareerRaceRepository {
  getRace(careerId: string, eventId: string): Promise<CareerRaceData | null>;
  changeRace(
    careerId: string,
    eventId: string,
    change: (data: CareerRaceData) => RaceChange,
  ): Promise<void>;
}
export type RaceErrorCode =
  | "NOT_FOUND"
  | "INVALID_ACTION"
  | "STALE"
  | "INVALID_INPUT"
  | "UNSUPPORTED_VERSION"
  | "PERSISTENCE_FAILED";
export class RaceError extends Error {
  constructor(
    readonly code: RaceErrorCode,
    options?: ErrorOptions,
  ) {
    super(`Race operation: ${code}`, options);
  }
}

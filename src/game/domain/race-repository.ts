import type { CareerProgress } from "./progression";
import type { RaceSimulationState } from "../../simulation/race/types";
import type { CircuitRaceProfile } from "../../simulation/race/traffic/profiles";
/** Career-snapshotted game-balance values; null for Careers created before Content Expansion Pass A. */
export interface RosterBalance {
  readonly pace: number;
  readonly consistency: number;
  readonly carPerformance: number;
}
export interface RaceRosterEntry {
  readonly driverId: string;
  readonly teamId: string;
  readonly driverName: string;
  readonly teamName: string;
  readonly teamOrder: number;
  readonly carNumber: number;
  readonly balance?: RosterBalance | null;
}
/** Complete snapshotted balance for a season driver entry, or null (legacy Career / incomplete data). */
export function rosterBalance(entry: {
  readonly pace?: number | null;
  readonly consistency?: number | null;
  readonly teamEntry: { readonly carPerformance?: number | null };
}): RosterBalance | null {
  const { pace, consistency } = entry,
    carPerformance = entry.teamEntry.carPerformance;
  return pace != null && consistency != null && carPerformance != null
    ? { pace, consistency, carPerformance }
    : null;
}
export interface RaceLabel {
  readonly abbreviation?: string;
  readonly teamColor?: string;
  readonly carNumber?: number | null;
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
  /**
   * Starting order from the weekend's completed real Qualifying (driver IDs, P1 first); null when there is none
   * (legacy placeholder Qualifying), in which case the legacy roster-order grid applies. Only used at Race start —
   * a started Race keeps its own frozen grid.
   */
  readonly grid?: readonly string[] | null;
  readonly circuit: {
    readonly sourceCircuitId?: string | null;
    readonly lengthMeters: number;
    readonly defaultLapCount: number;
    /** Snapshotted Career circuit Race interaction identity; null for Careers created before it existed (neutral). */
    readonly raceProfile?: CircuitRaceProfile | null;
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

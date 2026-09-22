import type { EntityId } from "./identity";
import type {
  Team,
  Driver,
  Circuit,
  AuditedContent,
  IsoDate,
  DriverRole,
} from "./content";
export type CareerStatus = "ACTIVE" | "COMPLETED" | "ABANDONED";
export interface Career extends AuditedContent {
  readonly id: EntityId;
  readonly name: string;
  readonly sourceGameDatabaseId: EntityId;
  readonly sourceGameDatabaseVersion: string;
  readonly sourceSeasonId: EntityId;
  readonly playerTeamId: EntityId;
  readonly currentSeasonId: EntityId;
  readonly currentDate: IsoDate;
  readonly status: CareerStatus;
}
export interface CareerTeam extends Omit<Team, "gameDatabaseId"> {
  readonly careerId: EntityId;
  readonly sourceTeamId: EntityId | null;
}
export interface CareerDriver extends Omit<Driver, "gameDatabaseId"> {
  readonly careerId: EntityId;
  readonly sourceDriverId: EntityId | null;
}
export interface CareerCircuit extends Omit<
  Circuit,
  "gameDatabaseId" | keyof AuditedContent
> {
  readonly careerId: EntityId;
  readonly sourceCircuitId: EntityId | null;
}
export interface CareerSeason {
  readonly id: EntityId;
  readonly careerId: EntityId;
  readonly sourceSeasonId: EntityId | null;
  readonly year: number;
  readonly name: string;
  readonly status: "UPCOMING" | "ACTIVE" | "COMPLETED";
  readonly startDate: IsoDate | null;
  readonly endDate: IsoDate | null;
}
export interface CareerSeasonTeamEntry {
  readonly id: EntityId;
  readonly careerId: EntityId;
  readonly careerSeasonId: EntityId;
  readonly careerTeamId: EntityId;
  readonly entryOrder: number;
}
export interface CareerSeasonDriverEntry {
  readonly id: EntityId;
  readonly careerId: EntityId;
  readonly careerSeasonId: EntityId;
  readonly careerDriverId: EntityId;
  readonly careerSeasonTeamEntryId: EntityId;
  readonly carNumber: number | null;
  readonly role: DriverRole;
}
export interface CareerCalendarEvent {
  readonly id: EntityId;
  readonly careerId: EntityId;
  readonly careerSeasonId: EntityId;
  readonly careerCircuitId: EntityId;
  readonly sourceCalendarEventId: EntityId | null;
  readonly round: number;
  readonly name: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly status: "UPCOMING" | "CURRENT" | "COMPLETED";
}
export interface CareerWorld {
  readonly career: Career;
  readonly teams: readonly CareerTeam[];
  readonly drivers: readonly CareerDriver[];
  readonly circuits: readonly CareerCircuit[];
  readonly season: CareerSeason;
  readonly teamEntries: readonly CareerSeasonTeamEntry[];
  readonly driverEntries: readonly CareerSeasonDriverEntry[];
  readonly events: readonly CareerCalendarEvent[];
}
export interface CareerSummary {
  readonly career: Career;
  readonly playerTeam: CareerTeam;
  readonly season: CareerSeason;
}
export interface CareerOverview extends CareerSummary {
  readonly nextEvent: {
    readonly event: CareerCalendarEvent;
    readonly circuit: CareerCircuit;
  } | null;
}
export interface CreateCareerInput {
  readonly name: string;
  readonly gameDatabaseId: EntityId;
  readonly seasonId: EntityId;
  readonly playerTeamId: EntityId;
}
export type CareerErrorCode =
  | "INVALID_NAME"
  | "INVALID_ID"
  | "DATABASE_NOT_FOUND"
  | "SEASON_NOT_FOUND"
  | "TEAM_NOT_PARTICIPATING"
  | "INVALID_SOURCE"
  | "PERSISTENCE_FAILED";
export class CareerError extends Error {
  constructor(
    readonly code: CareerErrorCode,
    options?: ErrorOptions,
  ) {
    super(`Career operation failed: ${code}`, options);
    this.name = "CareerError";
  }
}
export interface CareerCreationOptions {
  readonly databases: readonly {
    readonly id: EntityId;
    readonly name: string;
    readonly version: string;
    readonly seasons: readonly {
      readonly id: EntityId;
      readonly name: string;
      readonly year: number;
      readonly teams: readonly {
        readonly id: EntityId;
        readonly name: string;
        readonly shortName: string;
      }[];
    }[];
  }[];
}

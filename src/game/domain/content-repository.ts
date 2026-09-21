import type { EntityId } from "./identity";
import type {
  GameDatabase,
  Season,
  Team,
  Driver,
  Circuit,
  SeasonTeamEntry,
  SeasonDriverEntry,
  CalendarEvent,
} from "./content";
export interface SeasonTeam {
  readonly entry: SeasonTeamEntry;
  readonly team: Team;
}
export interface SeasonDriver {
  readonly entry: SeasonDriverEntry;
  readonly driver: Driver;
}
export interface ScheduledEvent {
  readonly event: CalendarEvent;
  readonly circuit: Circuit;
}
/** All scoped reads require explicit dataset context. Missing records return null/lists return []. */
export interface GameContentRepository {
  getGameDatabaseById(id: EntityId): Promise<GameDatabase | null>;
  getSeasonById(gameDatabaseId: EntityId, id: EntityId): Promise<Season | null>;
  listTeamsForSeason(
    gameDatabaseId: EntityId,
    seasonId: EntityId,
  ): Promise<readonly SeasonTeam[]>;
  listDriversForSeason(
    gameDatabaseId: EntityId,
    seasonId: EntityId,
  ): Promise<readonly SeasonDriver[]>;
  listCalendarEvents(
    gameDatabaseId: EntityId,
    seasonId: EntityId,
  ): Promise<readonly ScheduledEvent[]>;
}
export class InvalidContentIdError extends Error {
  constructor() {
    super("Content ID must use canonical UUID format.");
    this.name = "InvalidContentIdError";
  }
}
export function assertContentId(id: EntityId): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new InvalidContentIdError();
}
export class ContentRepositoryError extends Error {
  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    super(`Content repository operation failed: ${operation}`, { cause });
    this.name = "ContentRepositoryError";
  }
}

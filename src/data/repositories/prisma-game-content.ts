import type { PrismaClient } from "../generated/prisma/client";
import {
  assertContentId,
  ContentRepositoryError,
  type GameContentRepository,
} from "../../game/domain/content-repository";
import type { EntityId } from "../../game/domain/identity";
function audit<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
async function query<T>(operation: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    throw new ContentRepositoryError(operation, cause);
  }
}
function scope(gameDatabaseId: EntityId, seasonId: EntityId) {
  assertContentId(gameDatabaseId);
  assertContentId(seasonId);
  return { gameDatabaseId, seasonId };
}
export class PrismaGameContentRepository implements GameContentRepository {
  constructor(
    private readonly client: Pick<
      PrismaClient,
      | "gameDatabase"
      | "season"
      | "seasonTeamEntry"
      | "seasonDriverEntry"
      | "calendarEvent"
    >,
  ) {}
  async getGameDatabaseById(id: EntityId) {
    assertContentId(id);
    return query("getGameDatabaseById", async () => {
      const row = await this.client.gameDatabase.findUnique({ where: { id } });
      return row ? audit(row) : null;
    });
  }
  async getSeasonById(gameDatabaseId: EntityId, id: EntityId) {
    scope(gameDatabaseId, id);
    return query("getSeasonById", async () => {
      const row = await this.client.season.findUnique({
        where: { gameDatabaseId_id: { gameDatabaseId, id } },
      });
      return row ? audit(row) : null;
    });
  }
  async listTeamsForSeason(gameDatabaseId: EntityId, seasonId: EntityId) {
    const where = scope(gameDatabaseId, seasonId);
    return query("listTeamsForSeason", async () => {
      const rows = await this.client.seasonTeamEntry.findMany({
        where,
        include: { team: true },
        orderBy: [{ entryOrder: "asc" }, { id: "asc" }],
      });
      return rows.map(({ team, ...entry }) => ({ entry, team: audit(team) }));
    });
  }
  async listDriversForSeason(gameDatabaseId: EntityId, seasonId: EntityId) {
    const where = scope(gameDatabaseId, seasonId);
    return query("listDriversForSeason", async () => {
      const rows = await this.client.seasonDriverEntry.findMany({
        where,
        include: { driver: true },
        orderBy: [
          { teamEntry: { entryOrder: "asc" } },
          { role: "asc" },
          { carNumber: "asc" },
          { id: "asc" },
        ],
      });
      return rows.map(({ driver, ...entry }) => ({
        entry,
        driver: {
          ...audit(driver),
          dateOfBirth: driver.dateOfBirth.toISOString().slice(0, 10),
        },
      }));
    });
  }
  async listCalendarEvents(gameDatabaseId: EntityId, seasonId: EntityId) {
    const where = scope(gameDatabaseId, seasonId);
    return query("listCalendarEvents", async () => {
      const rows = await this.client.calendarEvent.findMany({
        where,
        include: { circuit: true },
        orderBy: { round: "asc" },
      });
      return rows.map(({ circuit, ...event }) => ({
        event: {
          ...event,
          startDate: event.startDate.toISOString().slice(0, 10),
          endDate: event.endDate.toISOString().slice(0, 10),
        },
        circuit: audit(circuit),
      }));
    });
  }
}

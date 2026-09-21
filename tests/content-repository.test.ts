import { afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { PrismaGameContentRepository } from "../src/data/repositories/prisma-game-content";
import { createPrismaClient } from "../src/data/prisma/connection";
import {
  ContentRepositoryError,
  InvalidContentIdError,
} from "../src/game/domain/content-repository";
import { developmentContent as data } from "../src/data/seed/content-development";
const client = createPrismaClient(
  "postgresql://unused:unused@localhost:1/unused",
);
const repository = new PrismaGameContentRepository(client);
const db = data.database.id,
  season = data.seasons[0].id;
const timestamps = {
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
afterEach(() => vi.restoreAllMocks());
afterAll(() => client.$disconnect());
describe("Prisma repository mapping and failure contract (mocked delegates)", () => {
  it("maps database metadata to plain ISO values", async () => {
    vi.spyOn(client.gameDatabase, "findUnique").mockResolvedValue({
      ...data.database,
      ...timestamps,
    });
    const row = await repository.getGameDatabaseById(db);
    expect(row?.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(row?.key).toBe(data.database.key);
  });
  it("returns null for missing entities", async () => {
    vi.spyOn(client.gameDatabase, "findUnique").mockResolvedValue(null);
    vi.spyOn(client.season, "findUnique").mockResolvedValue(null);
    expect(await repository.getGameDatabaseById(db)).toBeNull();
    expect(await repository.getSeasonById(db, season)).toBeNull();
  });
  it("scopes season reads by database and ID", async () => {
    const query = vi
      .spyOn(client.season, "findUnique")
      .mockResolvedValue({ ...data.seasons[0], ...timestamps });
    await repository.getSeasonById(db, season);
    expect(query).toHaveBeenCalledWith({
      where: { gameDatabaseId_id: { gameDatabaseId: db, id: season } },
    });
  });
  it("validates IDs before invoking persistence", async () => {
    const query = vi.spyOn(client.gameDatabase, "findUnique");
    await expect(
      repository.getGameDatabaseById("wrong"),
    ).rejects.toBeInstanceOf(InvalidContentIdError);
    expect(query).not.toHaveBeenCalled();
  });
  it("wraps errors with operation and cause, never fake content", async () => {
    const failure = new Error("offline");
    vi.spyOn(client.gameDatabase, "findUnique").mockRejectedValue(failure);
    await expect(repository.getGameDatabaseById(db)).rejects.toMatchObject({
      name: "ContentRepositoryError",
      operation: "getGameDatabaseById",
      cause: failure,
    });
  });
  it("joins teams and orders by entry order", async () => {
    const rows = [
      { ...data.teamEntries[0], team: { ...data.teams[0], ...timestamps } },
    ];
    const query = vi
      .spyOn(client.seasonTeamEntry, "findMany")
      .mockResolvedValue(rows);
    const result = await repository.listTeamsForSeason(db, season);
    expect(result[0].team.id).toBe(result[0].entry.teamId);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gameDatabaseId: db, seasonId: season },
        orderBy: [{ entryOrder: "asc" }, { id: "asc" }],
      }),
    );
  });
  it("maps driver birthdates separately from timestamp metadata", async () => {
    const rows = [
      {
        ...data.driverEntries[0],
        driver: {
          ...data.drivers[0],
          dateOfBirth: new Date("1998-04-12T00:00:00Z"),
          ...timestamps,
        },
      },
    ];
    vi.spyOn(client.seasonDriverEntry, "findMany").mockResolvedValue(rows);
    const result = await repository.listDriversForSeason(db, season);
    expect(result[0].driver.dateOfBirth).toBe("1998-04-12");
    expect(result[0].driver).not.toHaveProperty("teamId");
  });
  it("orders calendar queries by round and maps real dates", async () => {
    const rows = [
      {
        ...data.events[0],
        startDate: new Date("2026-03-06T00:00:00Z"),
        endDate: new Date("2026-03-08T00:00:00Z"),
        circuit: { ...data.circuits[0], ...timestamps },
      },
    ];
    const query = vi
      .spyOn(client.calendarEvent, "findMany")
      .mockResolvedValue(rows);
    const result = await repository.listCalendarEvents(db, season);
    expect(result[0].event.startDate).toBe("2026-03-06");
    expect(query).toHaveBeenCalledWith({
      where: { gameDatabaseId: db, seasonId: season },
      include: { circuit: true },
      orderBy: { round: "asc" },
    });
  });
  it("returns an empty list for absent content but rejects query failures", async () => {
    const query = vi
      .spyOn(client.calendarEvent, "findMany")
      .mockResolvedValue([]);
    expect(await repository.listCalendarEvents(db, season)).toEqual([]);
    query.mockRejectedValue(new Error("database unavailable"));
    await expect(
      repository.listCalendarEvents(db, season),
    ).rejects.toBeInstanceOf(ContentRepositoryError);
  });
});

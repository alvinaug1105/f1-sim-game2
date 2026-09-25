import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
import { developmentContent as data } from "../src/data/seed/content-development";
import { PrismaGameContentRepository } from "../src/data/repositories/prisma-game-content";

// Executed only with test:db. A unique schema isolates all writes, even after a failed test.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    "TEST_DATABASE_URL is required; PostgreSQL tests were not run.",
  );
const schema = `formula_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(databaseUrl);
url.searchParams.set("schema", schema);
const adminUrl = new URL(databaseUrl);
adminUrl.searchParams.delete("schema");
const admin = new Pool({
  connectionString: adminUrl.toString(),
  connectionTimeoutMillis: 5000,
});
const client = createPrismaClient(url.toString());
const repository = new PrismaGameContentRepository(client);
const db = data.database.id,
  season = data.seasons[0].id;
const foreign = {
  database: randomUUID(),
  team: randomUUID(),
  driver: randomUUID(),
  circuit: randomUUID(),
  season: randomUUID(),
};
let created = false;
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: url.toString() },
      timeout: 45000,
      stdio: "pipe",
    },
  );
  await seedDevelopmentContent(client);
  await seedDevelopmentContent(client);
  await client.gameDatabase.create({
    data: { ...data.database, id: foreign.database, key: "foreign-dataset" },
  });
  await client.team.create({
    data: {
      ...data.teams[0],
      id: foreign.team,
      gameDatabaseId: foreign.database,
    },
  });
  await client.driver.create({
    data: {
      ...data.drivers[0],
      id: foreign.driver,
      gameDatabaseId: foreign.database,
      dateOfBirth: new Date("1998-04-12T00:00:00Z"),
    },
  });
  await client.circuit.create({
    data: {
      ...data.circuits[0],
      id: foreign.circuit,
      gameDatabaseId: foreign.database,
    },
  });
  await client.season.create({
    data: {
      ...data.seasons[0],
      id: foreign.season,
      gameDatabaseId: foreign.database,
    },
  });
});
afterAll(async () => {
  try {
    await client.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await admin.end();
  }
});
const eventData = () => ({
  ...data.events[0],
  id: randomUUID(),
  round: 10,
  startDate: new Date("2026-04-03T00:00:00Z"),
  endDate: new Date("2026-04-05T00:00:00Z"),
});
describe("PostgreSQL migration, seed and relational constraints", () => {
  it("applies migration and reruns seed without duplicating content", async () => {
    expect(await client.gameDatabase.count({ where: { id: db } })).toBe(1);
    expect(await client.team.count({ where: { gameDatabaseId: db } })).toBe(11);
    expect(await client.driver.count({ where: { gameDatabaseId: db } })).toBe(
      22,
    );
    expect(await client.circuit.count({ where: { gameDatabaseId: db } })).toBe(
      8,
    );
    expect(await client.season.count({ where: { gameDatabaseId: db } })).toBe(
      1,
    );
    expect(
      await client.seasonTeamEntry.count({ where: { gameDatabaseId: db } }),
    ).toBe(11);
    expect(
      await client.seasonDriverEntry.count({ where: { gameDatabaseId: db } }),
    ).toBe(22);
    expect(
      await client.calendarEvent.count({ where: { gameDatabaseId: db } }),
    ).toBe(8);
  });
  it("upgrades a database seeded with the pre-Pass-A content in place, idempotently", async () => {
    // Recreate the old shape: the Japanese GP back at round 2 with its old dates, the new rows absent.
    const newTeams = data.teams.slice(2).map((t) => t.id),
      newDrivers = data.drivers.slice(4).map((d) => d.id),
      newCircuits = data.circuits.slice(2).map((c) => c.id);
    await client.calendarEvent.deleteMany({ where: { circuitId: { in: newCircuits } } });
    await client.seasonDriverEntry.deleteMany({ where: { driverId: { in: newDrivers } } });
    await client.seasonTeamEntry.deleteMany({ where: { teamId: { in: newTeams } } });
    await client.driver.deleteMany({ where: { id: { in: newDrivers } } });
    await client.team.deleteMany({ where: { id: { in: newTeams } } });
    await client.circuit.deleteMany({ where: { id: { in: newCircuits } } });
    const suzuka = data.events.find((e) => e.circuitId === data.circuits[1].id)!;
    await client.calendarEvent.update({
      where: { id: suzuka.id },
      data: { round: 2, startDate: new Date("2026-03-20T00:00:00Z"), endDate: new Date("2026-03-22T00:00:00Z") },
    });
    await client.seasonTeamEntry.updateMany({ where: { gameDatabaseId: db }, data: { carPerformance: null } });
    await client.seasonDriverEntry.updateMany({ where: { gameDatabaseId: db }, data: { pace: null, consistency: null } });
    const snapshot = async () => ({
      teams: await client.team.findMany({ where: { gameDatabaseId: db }, orderBy: { id: "asc" }, omit: { createdAt: true, updatedAt: true } }),
      drivers: await client.driver.findMany({ where: { gameDatabaseId: db }, orderBy: { id: "asc" }, omit: { createdAt: true, updatedAt: true } }),
      circuits: await client.circuit.findMany({ where: { gameDatabaseId: db }, orderBy: { id: "asc" }, omit: { createdAt: true, updatedAt: true } }),
      teamEntries: await client.seasonTeamEntry.findMany({ where: { gameDatabaseId: db }, orderBy: { id: "asc" } }),
      driverEntries: await client.seasonDriverEntry.findMany({ where: { gameDatabaseId: db }, orderBy: { id: "asc" } }),
      events: await client.calendarEvent.findMany({ where: { gameDatabaseId: db }, orderBy: { round: "asc" } }),
    });
    await seedDevelopmentContent(client);
    const first = await snapshot();
    await seedDevelopmentContent(client);
    expect(await snapshot()).toEqual(first);
    expect([first.teams.length, first.drivers.length, first.circuits.length, first.events.length]).toEqual([11, 22, 8, 8]);
    expect(first.events.map((e) => e.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(first.events.find((e) => e.id === suzuka.id)!.round).toBe(3);
    expect(first.driverEntries.every((e) => e.pace !== null && e.consistency !== null)).toBe(true);
    expect(first.teamEntries.every((e) => e.carPerformance !== null)).toBe(true);
  });
  it("rejects out-of-range balance values in SQL", async () => {
    await expect(
      client.seasonTeamEntry.update({ where: { id: data.teamEntries[0].id }, data: { carPerformance: 101 } }),
    ).rejects.toThrow();
    await expect(
      client.seasonDriverEntry.update({ where: { id: data.driverEntries[0].id }, data: { pace: null } }),
    ).rejects.toThrow();
  });
  it("reads the seeded database and season through repositories", async () => {
    expect((await repository.getGameDatabaseById(db))?.key).toBe(
      data.database.key,
    );
    expect((await repository.getSeasonById(db, season))?.year).toBe(2026);
  });
  it("joins season teams in entry order", async () => {
    const rows = await repository.listTeamsForSeason(db, season);
    expect(rows.map((row) => row.entry.entryOrder)).toEqual(
      data.teams.map((_, i) => i + 1),
    );
    for (const row of rows) {
      expect(row.team.gameDatabaseId).toBe(db);
      expect(row.team.id).toBe(row.entry.teamId);
    }
  });
  it("reads independent drivers through season assignments", async () => {
    const rows = await repository.listDriversForSeason(db, season);
    expect(rows).toHaveLength(22);
    for (const row of rows) {
      expect(row.driver.id).toBe(row.entry.driverId);
      expect(row.driver).not.toHaveProperty("teamId");
      expect(row.entry.seasonId).toBe(season);
    }
  });
  it("joins circuits and sorts actual calendar queries by round", async () => {
    const rows = await repository.listCalendarEvents(db, season);
    expect(rows.map((row) => row.event.round)).toEqual(data.events.map((_, i) => i + 1));
    for (const row of rows) {
      expect(row.circuit.id).toBe(row.event.circuitId);
      expect(row.circuit.gameDatabaseId).toBe(db);
    }
  });
  it("returns no data for a season in another database", async () => {
    expect(await repository.getSeasonById(foreign.database, season)).toBeNull();
    expect(
      await repository.listTeamsForSeason(foreign.database, season),
    ).toEqual([]);
    expect(
      await repository.listDriversForSeason(foreign.database, season),
    ).toEqual([]);
    expect(
      await repository.listCalendarEvents(foreign.database, season),
    ).toEqual([]);
  });
  it("rejects duplicate database keys", async () => {
    await expect(
      client.gameDatabase.create({
        data: { ...data.database, id: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("allows scoped keys to repeat in another dataset", async () => {
    const team = await client.team.findUniqueOrThrow({
      where: { id: foreign.team },
    });
    expect(team.key).toBe(data.teams[0].key);
  });
  it("rejects duplicate team keys", async () => {
    await expect(
      client.team.create({ data: { ...data.teams[0], id: randomUUID() } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("rejects duplicate driver keys", async () => {
    await expect(
      client.driver.create({
        data: {
          ...data.drivers[0],
          id: randomUUID(),
          dateOfBirth: new Date("1998-04-12T00:00:00Z"),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("rejects duplicate circuit keys", async () => {
    await expect(
      client.circuit.create({
        data: { ...data.circuits[0], id: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("rejects duplicate season keys", async () => {
    await expect(
      client.season.create({ data: { ...data.seasons[0], id: randomUUID() } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("rejects a season entry using a foreign team", async () => {
    await expect(
      client.seasonTeamEntry.create({
        data: {
          ...data.teamEntries[0],
          id: randomUUID(),
          teamId: foreign.team,
          entryOrder: 99, // unused order: isolates the foreign-key check from the entry-order uniqueness
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects a team entry using a foreign season", async () => {
    await expect(
      client.seasonTeamEntry.create({
        data: {
          ...data.teamEntries[0],
          id: randomUUID(),
          seasonId: foreign.season,
          entryOrder: 3,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects a foreign driver in a valid team entry", async () => {
    await expect(
      client.seasonDriverEntry.create({
        data: {
          ...data.driverEntries[0],
          id: randomUUID(),
          driverId: foreign.driver,
          carNumber: 90,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects a driver assigned to a non-participating team", async () => {
    const team = await client.team.create({
      data: { ...data.teams[0], id: randomUUID(), key: "non-participating" },
    });
    const driver = await client.driver.create({
      data: {
        ...data.drivers[0],
        id: randomUUID(),
        key: "independent-driver",
        dateOfBirth: new Date("1998-04-12T00:00:00Z"),
      },
    });
    await expect(
      client.seasonDriverEntry.create({
        data: {
          ...data.driverEntries[0],
          id: randomUUID(),
          driverId: driver.id,
          teamId: team.id,
          carNumber: 90,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects an event referencing a foreign circuit", async () => {
    await expect(
      client.calendarEvent.create({
        data: { ...eventData(), circuitId: foreign.circuit },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects an event referencing a foreign season", async () => {
    await expect(
      client.calendarEvent.create({
        data: { ...eventData(), seasonId: foreign.season },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects duplicate season rounds", async () => {
    await expect(
      client.calendarEvent.create({ data: { ...eventData(), round: 1 } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("rejects conflicting driver assignments in the same season", async () => {
    await expect(
      client.seasonDriverEntry.create({
        data: {
          ...data.driverEntries[0],
          id: randomUUID(),
          teamId: data.teams[1].id,
          carNumber: 90,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("allows a driver to move teams between season definitions", async () => {
    const next = await client.season.create({
      data: {
        ...data.seasons[0],
        id: randomUUID(),
        key: "season-2027",
        year: 2027,
      },
    });
    await client.seasonTeamEntry.create({
      data: { ...data.teamEntries[1], id: randomUUID(), seasonId: next.id },
    });
    const entry = await client.seasonDriverEntry.create({
      data: {
        ...data.driverEntries[0],
        id: randomUUID(),
        seasonId: next.id,
        teamId: data.teams[1].id,
      },
    });
    expect(entry.driverId).toBe(data.drivers[0].id);
    expect(
      (await repository.listDriversForSeason(db, season))[0].entry.teamId,
    ).toBe(data.teams[0].id);
  });
  it("rejects reversed weekend dates", async () => {
    await expect(
      client.calendarEvent.create({
        data: { ...eventData(), endDate: new Date("2026-01-01T00:00:00Z") },
      }),
    ).rejects.toThrow(/constraint/i);
  });
  it("rejects non-positive circuit lengths", async () => {
    await expect(
      client.circuit.create({
        data: {
          ...data.circuits[0],
          id: randomUUID(),
          key: "invalid-length",
          lengthMeters: 0,
        },
      }),
    ).rejects.toThrow(/constraint/i);
  });
  it("preserves relationships after changing display names", async () => {
    await client.team.update({
      where: { id: data.teams[0].id },
      data: { name: "Renamed fictional team" },
    });
    const row = (await repository.listTeamsForSeason(db, season))[0];
    expect(row.team.name).toBe("Renamed fictional team");
    expect(row.entry.teamId).toBe(data.teams[0].id);
  });
});

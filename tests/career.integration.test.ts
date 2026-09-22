import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createPrismaClient } from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
import { developmentContent as source } from "../src/data/seed/content-development";
import { PrismaCareerRepository } from "../src/data/repositories/prisma-career";
import { createCareer } from "../src/features/career/create-career";
import type { CareerCreationTransaction } from "../src/game/domain/career-repository";
import type { Career } from "../src/game/domain/career";
const value = process.env.TEST_DATABASE_URL;
if (!value)
  throw new Error("TEST_DATABASE_URL required; SQL tests did not run.");
const schema = `career_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(value);
url.searchParams.set("schema", schema);
const adminUrl = new URL(value);
adminUrl.searchParams.delete("schema");
const admin = new Pool({
  connectionString: adminUrl.toString(),
  connectionTimeoutMillis: 5000,
});
const client = createPrismaClient(url.toString());
const repository = new PrismaCareerRepository(client);
const input = {
  name: "Independent Career",
  gameDatabaseId: source.database.id,
  seasonId: source.seasons[0].id,
  playerTeamId: source.teams[0].id,
};
let created = false;
let career: Career;
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
});
beforeEach(async () => {
  await seedDevelopmentContent(client);
  career = await createCareer(repository, input);
});
afterAll(async () => {
  try {
    await client.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await admin.end();
  }
});
async function counts() {
  return Promise.all([
    client.career.count(),
    client.careerTeam.count(),
    client.careerDriver.count(),
    client.careerCircuit.count(),
    client.careerSeason.count(),
    client.careerSeasonTeamEntry.count(),
    client.careerSeasonDriverEntry.count(),
    client.careerCalendarEvent.count(),
  ]);
}
describe("Career world PostgreSQL integration", () => {
  it("applies career migration and creates a complete persisted world", async () => {
    const overview = await repository.getCareerOverview(career.id);
    expect(overview?.playerTeam.name).toBe("Aurora Racing");
    expect(career.currentDate).toBe("2026-02-20");
    expect(
      await client.careerTeam.count({ where: { careerId: career.id } }),
    ).toBe(2);
    expect(
      await client.careerDriver.count({ where: { careerId: career.id } }),
    ).toBe(4);
    expect(
      await client.careerCircuit.count({ where: { careerId: career.id } }),
    ).toBe(2);
    expect(
      await client.careerCalendarEvent.count({
        where: { careerId: career.id },
      }),
    ).toBe(2);
  });
  it("persists the player pointer and all mappings using Career IDs", async () => {
    const teams = await client.careerTeam.findMany({
      where: { careerId: career.id },
    });
    const driverEntries = await client.careerSeasonDriverEntry.findMany({
      where: { careerId: career.id },
      include: { driver: true, teamEntry: true },
    });
    const events = await client.careerCalendarEvent.findMany({
      where: { careerId: career.id },
      include: { circuit: true },
    });
    expect(teams.map((row) => row.id)).toContain(career.playerTeamId);
    expect(career.playerTeamId).not.toBe(input.playerTeamId);
    for (const row of driverEntries) {
      expect(row.driver.careerId).toBe(career.id);
      expect(row.teamEntry.careerSeasonId).toBe(career.currentSeasonId);
      expect(row.careerDriverId).not.toBe(row.driver.sourceDriverId);
    }
    for (const row of events) {
      expect(row.circuit.careerId).toBe(career.id);
      expect(row.careerCircuitId).not.toBe(row.circuit.sourceCircuitId);
    }
  });
  it("isolates source Team names and colours", async () => {
    await client.team.update({
      where: { id: source.teams[0].id },
      data: { name: "Aurora Motorsport", color: "#000000" },
    });
    const row = await client.careerTeam.findUniqueOrThrow({
      where: { id: career.playerTeamId },
    });
    expect(row.name).toBe("Aurora Racing");
    expect(row.color).toBe(source.teams[0].color);
  });
  it("isolates source Driver name and nationality", async () => {
    await client.driver.update({
      where: { id: source.drivers[0].id },
      data: { lastName: "Edited", nationalityCode: "AU" },
    });
    const row = await client.careerDriver.findFirstOrThrow({
      where: { careerId: career.id, sourceDriverId: source.drivers[0].id },
    });
    expect(row.lastName).toBe("Smith");
    expect(row.nationalityCode).toBe("GB");
  });
  it("isolates source Circuit metadata", async () => {
    await client.circuit.update({
      where: { id: source.circuits[0].id },
      data: { name: "Edited circuit", lengthMeters: 6000 },
    });
    const row = await client.careerCircuit.findFirstOrThrow({
      where: { careerId: career.id, sourceCircuitId: source.circuits[0].id },
    });
    expect(row.name).toBe("Silver Coast Circuit");
    expect(row.lengthMeters).toBe(5200);
  });
  it("isolates source Calendar names and dates", async () => {
    await client.calendarEvent.update({
      where: { id: source.events[0].id },
      data: {
        name: "Edited event",
        startDate: new Date("2026-07-03T00:00:00Z"),
        endDate: new Date("2026-07-05T00:00:00Z"),
      },
    });
    const row = await client.careerCalendarEvent.findFirstOrThrow({
      where: {
        careerId: career.id,
        sourceCalendarEventId: source.events[0].id,
      },
    });
    expect(row.name).toBe("Silver Coast Grand Prix");
    expect(row.startDate.toISOString().slice(0, 10)).toBe("2026-03-06");
  });
  it("freezes source version and roster assignments", async () => {
    await client.gameDatabase.update({
      where: { id: source.database.id },
      data: { version: "2.0.0" },
    });
    await client.seasonDriverEntry.update({
      where: { id: source.driverEntries[0].id },
      data: { teamId: source.teams[1].id },
    });
    expect(
      (await repository.getCareerById(career.id))?.sourceGameDatabaseVersion,
    ).toBe("1.0.0");
    const row = await client.careerSeasonDriverEntry.findFirstOrThrow({
      where: {
        careerId: career.id,
        driver: { sourceDriverId: source.drivers[0].id },
      },
      include: { teamEntry: { include: { team: true } } },
    });
    expect(row.teamEntry.team.sourceTeamId).toBe(source.teams[0].id);
  });
  it("supports two independent Careers and isolated edits", async () => {
    const second = await createCareer(repository, input);
    await client.careerTeam.update({
      where: { id: career.playerTeamId },
      data: { name: "Only Career A" },
    });
    expect(
      (await repository.getCareerOverview(second.id))?.playerTeam.name,
    ).toBe("Aurora Racing");
    expect(second.playerTeamId).not.toBe(career.playerTeamId);
  });
  it("rejects a cross-Career player team pointer at commit", async () => {
    const second = await createCareer(repository, input);
    await expect(
      client.career.update({
        where: { id: career.id },
        data: { playerTeamId: second.playerTeamId },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects a cross-Career roster driver", async () => {
    const second = await createCareer(repository, input);
    const driver = await client.careerDriver.findFirstOrThrow({
      where: { careerId: second.id },
    });
    const entry = await client.careerSeasonDriverEntry.findFirstOrThrow({
      where: { careerId: career.id },
    });
    await expect(
      client.careerSeasonDriverEntry.update({
        where: { id: entry.id },
        data: { careerDriverId: driver.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rolls back ALL world tables when a late calendar CHECK fails", async () => {
    const before = await counts();
    class FailingRepository extends PrismaCareerRepository {
      override createAtomically(
        work: (tx: CareerCreationTransaction) => Promise<Career>,
      ) {
        return super.createAtomically((tx) =>
          work({
            ...tx,
            saveWorld: (world) =>
              tx.saveWorld({
                ...world,
                events: world.events.map((event) => ({ ...event, round: -1 })),
              }),
          }),
        );
      }
    }
    await expect(
      createCareer(new FailingRepository(client), input),
    ).rejects.toMatchObject({ code: "PERSISTENCE_FAILED" });
    expect(await counts()).toEqual(before);
  });
  it("rejects missing database and invalid names without creating saves", async () => {
    const before = await counts();
    await expect(
      createCareer(repository, { ...input, gameDatabaseId: randomUUID() }),
    ).rejects.toMatchObject({ code: "DATABASE_NOT_FOUND" });
    await expect(
      createCareer(repository, { ...input, name: " " }),
    ).rejects.toMatchObject({ code: "INVALID_NAME" });
    expect(await counts()).toEqual(before);
  });
  it("rejects a foreign season", async () => {
    const other = await client.gameDatabase.create({
      data: {
        ...source.database,
        id: randomUUID(),
        key: `other-${randomUUID()}`,
      },
    });
    const season = await client.season.create({
      data: {
        ...source.seasons[0],
        id: randomUUID(),
        gameDatabaseId: other.id,
      },
    });
    await expect(
      createCareer(repository, { ...input, seasonId: season.id }),
    ).rejects.toMatchObject({ code: "SEASON_NOT_FOUND" });
  });
  it("rejects a non-participating source team", async () => {
    const team = await client.team.create({
      data: {
        ...source.teams[0],
        id: randomUUID(),
        key: `unentered-${randomUUID()}`,
      },
    });
    await expect(
      createCareer(repository, { ...input, playerTeamId: team.id }),
    ).rejects.toMatchObject({ code: "TEAM_NOT_PARTICIPATING" });
  });
  it("lists and reopens Careers with a fresh client instance", async () => {
    const reopened = createPrismaClient(url.toString());
    try {
      const reads = new PrismaCareerRepository(reopened);
      expect((await reads.getCareerOverview(career.id))?.career.id).toBe(
        career.id,
      );
      expect(
        (await reads.listCareers()).some((row) => row.career.id === career.id),
      ).toBe(true);
    } finally {
      await reopened.$disconnect();
    }
  });
  it("source deletion does not delete or break Career worlds", async () => {
    const before = await repository.getCareerOverview(career.id);
    await client.$transaction(async (tx) => {
      const where = { gameDatabaseId: source.database.id };
      await tx.calendarEvent.deleteMany({ where });
      await tx.seasonDriverEntry.deleteMany({ where });
      await tx.seasonTeamEntry.deleteMany({ where });
      await tx.season.deleteMany({ where });
      await tx.driver.deleteMany({ where });
      await tx.team.deleteMany({ where });
      await tx.circuit.deleteMany({ where });
      await tx.gameDatabase.delete({ where: { id: source.database.id } });
    });
    expect(await repository.getCareerOverview(career.id)).toEqual(before);
    expect(
      await client.careerDriver.count({ where: { careerId: career.id } }),
    ).toBe(4);
  });
});

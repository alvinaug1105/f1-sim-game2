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
import { CAR_PART_TYPES, currentCarPerformance, deriveSessionCarPerformance } from "../src/game/domain/car-development";
import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import { PrismaPracticeRepository } from "../src/data/repositories/prisma-practice";
import { PrismaQualifyingRepository } from "../src/data/repositories/prisma-qualifying";
import { PrismaRaceRepository } from "../src/data/repositories/prisma-race";
import { advanceToNextEvent, runSessionAction } from "../src/features/career/progression";
import { startPracticeSession } from "../src/features/practice/service";
import { startIncidentCareerRace } from "../src/features/race/service";
import { projectRaceView } from "../src/features/race/projection";
import { PrismaCarDesignRepository, settleDueDesignProjects } from "../src/data/repositories/prisma-car-design";
import { PrismaCarPhysicalRepository, settleDueManufacturingOrders } from "../src/data/repositories/prisma-car-physical";
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
  it("starts a snapshotted player project, settles on normal Career progression, preserves v1 session input, then allocates v3", async () => {
    const design = new PrismaCarDesignRepository(client);
    const progression = new PrismaProgressionRepository(client);
    const before = (await repository.getPlayerCar(career.id))!;
    const preview = await design.preview(career.id, "FRONT_WING", "LOW_SPEED", "STANDARD");
    expect(preview.planned.version).toBe(2);
    const started = await design.start(career.id, "FRONT_WING", "LOW_SPEED", "STANDARD");
    expect(started.planned).toEqual(preview.planned);
    expect(started.completesAtCareerDate).toBe("2026-03-06");
    expect((await design.getOverview(career.id))!.availableDesigns).toEqual([]);
    await client.seasonTeamEntry.update({ where: { id: source.teamEntries[0].id }, data: { carPerformance: 30 } });
    const progress = (await progression.getProgress(career.id))!;
    const eventId = progress.events[0].id;
    const entered = await advanceToNextEvent(progression, career.id, eventId);
    const completed = await client.careerCarDesignProject.findUniqueOrThrow({ where: { id: started.id } });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAtCareerDate?.toISOString().slice(0, 10)).toBe("2026-03-06");
    const available = (await design.getOverview(career.id))!.availableDesigns;
    expect(available).toContainEqual(preview.planned);
    await client.$transaction(tx => settleDueDesignProjects(tx, career.id, "2026-03-06"));
    expect(await client.careerCarPartDesign.count({ where: { careerId: career.id, careerTeamId: career.playerTeamId, partType: "FRONT_WING", version: 2 } })).toBe(1);
    expect((await repository.getPlayerCar(career.id))!.overallPerformance).toBe(before.overallPerformance);
    const practice = new PrismaPracticeRepository(client);
    const qualifying = new PrismaQualifyingRepository(client);
    const race = new PrismaRaceRepository(client);
    const firstPractice = entered.events[0].weekend!.sessions[0].id;
    expect((await practice.getPractice(career.id, eventId, firstPractice))!.roster.find(row => row.teamId === career.playerTeamId)!.balance?.carPerformance).toBe(before.overallPerformance);
    expect((await qualifying.getQualifying(career.id, eventId))!.roster.find(row => row.teamId === career.playerTeamId)!.balance?.carPerformance).toBe(before.overallPerformance);
    expect((await race.getRace(career.id, eventId))!.roster.find(row => row.teamId === career.playerTeamId)!.balance?.carPerformance).toBe(before.overallPerformance);
    expect((await startPracticeSession(practice, career.id, eventId, firstPractice)).state!.input.entrants.find(row => row.teamId === career.playerTeamId)!.car.performance).toBe(before.overallPerformance);
    const next = await design.start(career.id, "FRONT_WING", "BALANCED", "EXTENSIVE");
    expect(next.newVersion).toBe(3);
    const nextRow = await client.careerCarDesignProject.findUniqueOrThrow({ where: { id: next.id } });
    expect(nextRow.basePartDesignId).toBe((await client.careerCarPartDesign.findFirstOrThrow({ where: { careerId: career.id, careerTeamId: career.playerTeamId, partType: "FRONT_WING", version: 2 } })).id);
  });

  it("enforces one active project per part and two team slots under concurrent requests", async () => {
    const design = new PrismaCarDesignRepository(client);
    await design.start(career.id, "FRONT_WING", "BALANCED", "STANDARD");
    await expect(design.start(career.id, "FRONT_WING", "LOW_SPEED", "STANDARD")).rejects.toMatchObject({ code: "PART_ACTIVE" });
    const results = await Promise.allSettled([
      design.start(career.id, "REAR_WING", "BALANCED", "STANDARD"),
      design.start(career.id, "UNDERFLOOR", "BALANCED", "STANDARD"),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await client.careerCarDesignProject.count({ where: { careerId: career.id, careerTeamId: career.playerTeamId, status: "ACTIVE" } })).toBe(2);
    await expect(design.start(career.id, "CHASSIS", "BALANCED", "STANDARD")).rejects.toMatchObject({ code: "CAPACITY" });
    const progression = new PrismaProgressionRepository(client);
    const eventId = (await progression.getProgress(career.id))!.events[0].id;
    await advanceToNextEvent(progression, career.id, eventId);
    expect((await design.start(career.id, "CHASSIS", "BALANCED", "STANDARD")).partType).toBe("CHASSIS");
  });

  it("rejects a stale preview after another Career-time transition", async () => {
    const design = new PrismaCarDesignRepository(client);
    const preview = await design.preview(career.id, "FRONT_WING", "LOW_SPEED", "STANDARD");
    const progression = new PrismaProgressionRepository(client);
    const eventId = (await progression.getProgress(career.id))!.events[0].id;
    await advanceToNextEvent(progression, career.id, eventId);
    await expect(design.start(career.id, "FRONT_WING", "LOW_SPEED", "STANDARD", preview)).rejects.toMatchObject({ code: "STALE_PREVIEW" });
    expect(await client.careerCarDesignProject.count({ where: { careerId: career.id, careerTeamId: career.playerTeamId } })).toBe(0);
  });

  it("enforces project scope, base part, version, dates and ratings in PostgreSQL", async () => {
    const design = new PrismaCarDesignRepository(client);
    const started = await design.start(career.id, "FRONT_WING", "BALANCED", "STANDARD");
    const row = await client.careerCarDesignProject.findUniqueOrThrow({ where: { id: started.id } });
    const other = await createCareer(repository, input);
    await expect(client.careerCarDesignProject.create({ data: { ...row, id: randomUUID(), newVersion: 3 } })).rejects.toMatchObject({ code: "P2002" });
    const data = { ...row, id: randomUUID(), newVersion: 3, status: "COMPLETED" as const,
      completedAt: new Date(), completedAtCareerDate: row.completesAtCareerDate };
    await expect(client.careerCarDesignProject.create({ data: { ...data, careerId: other.id } })).rejects.toMatchObject({ code: "P2003" });
    await expect(client.careerCarDesignProject.create({ data: { ...data, careerTeamId: other.playerTeamId } })).rejects.toMatchObject({ code: "P2003" });
    await expect(client.careerCarDesignProject.create({ data: { ...data, careerSeasonId: other.currentSeasonId } })).rejects.toMatchObject({ code: "P2003" });
    await expect(client.careerCarDesignProject.create({ data: { ...data, partType: "REAR_WING" } })).rejects.toMatchObject({ code: "P2003" });
    await expect(client.careerCarDesignProject.create({ data: { ...data, newVersion: 1 } })).rejects.toThrow();
    await expect(client.careerCarDesignProject.create({ data: { ...data, plannedLowSpeed: 101 } })).rejects.toThrow();
    await expect(client.careerCarDesignProject.create({ data: { ...data, completesAtCareerDate: row.startedAtCareerDate } })).rejects.toThrow();
  });

  it("keeps legacy Careers playable while rejecting design creation", async () => {
    const design = new PrismaCarDesignRepository(client);
    await client.careerCarDesignProject.deleteMany({ where: { careerId: career.id } });
    await client.careerSeasonTeamEntry.updateMany({ where: { careerId: career.id }, data: { developmentStyle: null } });
    await client.careerCarFitment.deleteMany({ where: { careerId: career.id } });
    await client.careerCarPartUnit.deleteMany({ where: { careerId: career.id } });
    await client.careerSeasonDriverEntry.updateMany({ where: { careerId: career.id }, data: { carSlot: null } });
    await client.careerCarPartDesign.deleteMany({ where: { careerId: career.id } });
    await expect(design.start(career.id, "FRONT_WING", "BALANCED", "STANDARD")).rejects.toMatchObject({ code: "LEGACY" });
    expect((await design.getOverview(career.id))!.car.parts).toEqual([]);
    const progression = new PrismaProgressionRepository(client);
    const eventId = (await progression.getProgress(career.id))!.events[0].id;
    await advanceToNextEvent(progression, career.id, eventId);
    expect(await client.careerCarDesignProject.count({ where: { careerId: career.id, careerTeamId: career.playerTeamId } })).toBe(0);
  });
  it("persists 66 scoped version-1 designs with exact 2026 scalar balance and player-only projection", async () => {
    const designs = await client.careerCarPartDesign.findMany({ where: { careerId: career.id } });
    expect(designs).toHaveLength(66);
    const entries = await client.careerSeasonTeamEntry.findMany({ where: { careerId: career.id }, include: { team: true } });
    for (const entry of entries) {
      const parts = designs.filter(part => part.careerTeamId === entry.careerTeamId);
      expect(parts).toHaveLength(6);
      expect(new Set(parts.map(part => part.partType))).toEqual(new Set(CAR_PART_TYPES));
      expect(parts.every(part => part.version === 1 && part.careerSeasonId === entry.careerSeasonId)).toBe(true);
      expect(currentCarPerformance(parts)?.overall).toBe(entry.carPerformance);
      expect(entry.carPerformance).toBe(source.teamEntries.find(row => row.teamId === entry.team.sourceTeamId)?.carPerformance);
    }
    const player = await repository.getPlayerCar(career.id);
    expect(player?.parts).toHaveLength(6);
    expect(player?.teamId).toBe(career.playerTeamId);
    expect(player?.parts.every(part => !Object.hasOwn(part, "careerTeamId"))).toBe(true);
    expect(JSON.stringify(player)).not.toContain(entries.find(entry => entry.careerTeamId !== career.playerTeamId)!.team.id);
  });

  it("keeps source car edits out of an existing Career but copies them into a later Career", async () => {
    const before = await repository.getPlayerCar(career.id);
    await client.seasonTeamEntry.update({ where: { id: source.teamEntries[0].id }, data: {
      carPerformance: 73, lowSpeedPerformance: 70, mediumSpeedPerformance: 71,
      highSpeedPerformance: 72, dragReductionPerformance: 73, drsEfficiencyPerformance: 74,
    } });
    expect(await repository.getPlayerCar(career.id)).toEqual(before);
    const later = await createCareer(repository, input);
    expect((await repository.getPlayerCar(later.id))?.stats).toEqual({
      lowSpeed: 70, mediumSpeed: 71, highSpeed: 72, dragReduction: 73, drsEfficiency: 74,
    });
    expect((await repository.getPlayerCar(later.id))?.overallPerformance).toBe(72);
  });

  it("rejects duplicate, invalid and cross-Career part designs in PostgreSQL", async () => {
    const existing = await client.careerCarPartDesign.findFirstOrThrow({ where: { careerId: career.id } });
    const copy = { id: existing.id, careerId: existing.careerId, careerSeasonId: existing.careerSeasonId,
      careerTeamId: existing.careerTeamId, partType: existing.partType, version: existing.version,
      lowSpeed: existing.lowSpeed, mediumSpeed: existing.mediumSpeed, highSpeed: existing.highSpeed,
      dragReduction: existing.dragReduction, drsEfficiency: existing.drsEfficiency };
    await expect(client.careerCarPartDesign.create({ data: { ...copy, id: randomUUID() } })).rejects.toMatchObject({ code: "P2002" });
    await expect(client.careerCarPartDesign.create({ data: { ...copy, id: randomUUID(), version: 0 } })).rejects.toThrow();
    await expect(client.careerCarPartDesign.create({ data: { ...copy, id: randomUUID(), version: 2, lowSpeed: 101 } })).rejects.toThrow();
    const other = await createCareer(repository, input);
    await expect(client.careerCarPartDesign.create({ data: { ...copy, id: randomUUID(), version: 2, careerTeamId: other.playerTeamId } })).rejects.toMatchObject({ code: "P2003" });
    await expect(client.careerCarPartDesign.create({ data: { ...copy, id: randomUUID(), version: 2, careerSeasonId: other.currentSeasonId } })).rejects.toMatchObject({ code: "P2003" });
    await expect(client.careerCarPartDesign.create({ data: { ...copy, id: randomUUID(), version: 2, careerId: other.id } })).rejects.toMatchObject({ code: "P2003" });
    await expect(client.careerSeasonTeamEntry.update({ where: { id: (await client.careerSeasonTeamEntry.findFirstOrThrow({ where: { careerId: career.id } })).id }, data: { lowSpeedPerformance: 101 } })).rejects.toThrow();
    await expect(client.seasonTeamEntry.update({ where: { id: source.teamEntries[0].id }, data: { drsEfficiencyPerformance: -1 } })).rejects.toThrow();
  });

  it("keeps legacy Careers on their stored scalar without synthesizing persistent designs", async () => {
    await client.careerCarDesignProject.deleteMany({ where: { careerId: career.id } });
    await client.careerSeasonTeamEntry.updateMany({ where: { careerId: career.id }, data: { developmentStyle: null } });
    await client.careerCarFitment.deleteMany({ where: { careerId: career.id } });
    await client.careerCarPartUnit.deleteMany({ where: { careerId: career.id } });
    await client.careerSeasonDriverEntry.updateMany({ where: { careerId: career.id }, data: { carSlot: null } });
    await client.careerCarPartDesign.deleteMany({ where: { careerId: career.id } });
    await client.careerSeasonTeamEntry.updateMany({ where: { careerId: career.id }, data: {
      lowSpeedPerformance: null, mediumSpeedPerformance: null, highSpeedPerformance: null,
      dragReductionPerformance: null, drsEfficiencyPerformance: null,
    } });
    const player = await repository.getPlayerCar(career.id);
    expect(player?.stats).toBeNull();
    expect(player?.parts).toEqual([]);
    expect(player?.overallPerformance).toBe(source.teamEntries[0].carPerformance);
    expect(await client.careerCarPartDesign.count({ where: { careerId: career.id } })).toBe(0);
  });

  it("feeds derived ratings to new session rosters and freezes started Practice input", async () => {
    const progression = new PrismaProgressionRepository(client);
    const progress = (await progression.getProgress(career.id))!;
    const eventId = progress.events[0].id;
    const entered = await advanceToNextEvent(progression, career.id, eventId);
    const firstPractice = entered.events[0].weekend!.sessions[0].id;
    const practice = new PrismaPracticeRepository(client);
    const qualifying = new PrismaQualifyingRepository(client);
    const race = new PrismaRaceRepository(client);
    const expected = (await repository.getPlayerCar(career.id))!.overallPerformance;
    const player = (await practice.getPractice(career.id, eventId, firstPractice))!.roster.find(row => row.teamId === career.playerTeamId)!;
    expect(player.balance?.carPerformance).toBe(expected);
    expect((await qualifying.getQualifying(career.id, eventId))!.roster.find(row => row.teamId === career.playerTeamId)!.balance?.carPerformance).toBe(expected);
    expect((await race.getRace(career.id, eventId))!.roster.find(row => row.teamId === career.playerTeamId)!.balance?.carPerformance).toBe(expected);
    const browserRaceData = projectRaceView((await race.getRace(career.id, eventId))!);
    expect(JSON.stringify(browserRaceData)).not.toMatch(/partDesigns|partType|lowSpeedPerformance|drsEfficiencyPerformance/);
    const started = await startPracticeSession(practice, career.id, eventId, firstPractice);
    const entrant = started.state!.input.entrants.find(row => row.teamId === career.playerTeamId)!;
    expect(entrant.car.performance).toBe(expected);
    await client.careerCarPartDesign.updateMany({ where: { careerId: career.id, careerTeamId: career.playerTeamId }, data: {
      lowSpeed: 55, mediumSpeed: 55, highSpeed: 55, dragReduction: 55, drsEfficiency: 55,
    } });
    expect((await practice.getPractice(career.id, eventId, firstPractice))!.state!.input.entrants.find(row => row.teamId === career.playerTeamId)!.car.performance).toBe(expected);
    expect((await race.getRace(career.id, eventId))!.roster.find(row => row.teamId === career.playerTeamId)!.balance?.carPerformance).toBe(55);
  });
  it("applies career migration and creates a complete persisted world", async () => {
    const overview = await repository.getCareerOverview(career.id);
    expect(overview?.playerTeam.name).toBe("Mercedes");
    expect(career.currentDate).toBe("2026-02-20");
    expect(
      await client.careerTeam.count({ where: { careerId: career.id } }),
    ).toBe(11);
    expect(
      await client.careerDriver.count({ where: { careerId: career.id } }),
    ).toBe(22);
    expect(
      await client.careerCircuit.count({ where: { careerId: career.id } }),
    ).toBe(24);
    expect(
      await client.careerCalendarEvent.count({
        where: { careerId: career.id },
      }),
    ).toBe(24);
    // Game-balance data is snapshotted into the Career (never read from the source at play time).
    expect(
      await client.careerSeasonDriverEntry.count({
        where: { careerId: career.id, pace: null },
      }),
    ).toBe(0);
    expect(
      await client.careerSeasonTeamEntry.count({
        where: { careerId: career.id, carPerformance: null },
      }),
    ).toBe(0);
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
    expect(row.name).toBe("Mercedes");
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
    expect(row.lastName).toBe("Russell");
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
    expect(row.name).toBe("Albert Park Grand Prix Circuit");
    expect(row.lengthMeters).toBe(5278);
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
    expect(row.name).toBe("Australian Grand Prix");
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
    ).toBe("1.3.0");
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
    ).toBe("Mercedes");
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
    ).toBe(22);
  });
});

describe("Phase 17C physical car PostgreSQL integration", () => {
  const playerScope = () => ({ careerId: career.id, careerSeasonId: career.currentSeasonId, careerTeamId: career.playerTeamId });
  async function improvedFrontWing() {
    const base = await client.careerCarPartDesign.findFirstOrThrow({ where: { ...playerScope(), partType: "FRONT_WING", version: 1 } });
    return client.careerCarPartDesign.create({ data: { ...base, id: randomUUID(), version: 2,
      lowSpeed: 100, mediumSpeed: 100, highSpeed: 100, dragReduction: 100, drsEfficiency: 100 } });
  }
  it("creates 22 stable car slots, 132 v1 units and fitments, and no spare inventory", async () => {
    const drivers = await client.careerSeasonDriverEntry.findMany({ where: { careerId: career.id, role: "RACE_DRIVER" }, include: { driver: true, teamEntry: true } });
    expect(drivers).toHaveLength(22);
    const teams = new Set(drivers.map(row => row.teamEntry.careerTeamId));
    expect(teams.size).toBe(11);
    for (const teamId of teams) expect(drivers.filter(row => row.teamEntry.careerTeamId === teamId).map(row => row.carSlot).sort()).toEqual(["CAR_1", "CAR_2"]);
    expect(await client.careerCarPartUnit.count({ where: { careerId: career.id } })).toBe(132);
    expect(await client.careerCarFitment.count({ where: { careerId: career.id } })).toBe(132);
    expect(await client.careerCarPartUnit.count({ where: { careerId: career.id, fitment: null } })).toBe(0);
    const designs = await client.careerCarPartUnit.findMany({ where: { careerId: career.id }, include: { design: true } });
    expect(designs.every(row => row.design.version === 1)).toBe(true);
    const physical = (await new PrismaCarDesignRepository(client).getOverview(career.id))!.physical!;
    expect(physical.cars.map(row => row.sessionPerformance)).toEqual([93, 93]);
    expect(physical.cars.every(row => row.parts.length === 6)).toBe(true);
    const second = await createCareer(repository, { ...input, name: "Same grid" });
    const assignments = async (id: string) => (await client.careerSeasonDriverEntry.findMany({ where: { careerId: id, role: "RACE_DRIVER" }, include: { driver: true } }))
      .map(row => [`${row.driver.firstName} ${row.driver.lastName}`, row.carSlot]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(await assignments(second.id)).toEqual(await assignments(career.id));
  });
  it("manufactures on Career time, then swaps physical units between cars and inventory", async () => {
    const design = await improvedFrontWing();
    const physical = new PrismaCarPhysicalRepository(client);
    await expect(physical.startManufacturing(career.id, design.id, 2, "2026-02-25")).rejects.toMatchObject({ code: "STALE_PREVIEW" });
    const order = await physical.startManufacturing(career.id, design.id, 2);
    expect(order.status).toBe("ACTIVE");
    expect(order.completesAtCareerDate).toBe("2026-02-26");
    expect(await client.careerCarPartUnit.count({ where: { designId: design.id } })).toBe(0);
    await expect(physical.startManufacturing(career.id, design.id, 1)).rejects.toMatchObject({ code: "DESIGN_ACTIVE" });
    const rear = await client.careerCarPartDesign.findFirstOrThrow({ where: { ...playerScope(), partType: "REAR_WING", version: 1 } });
    await physical.startManufacturing(career.id, rear.id, 1);
    const floor = await client.careerCarPartDesign.findFirstOrThrow({ where: { ...playerScope(), partType: "UNDERFLOOR", version: 1 } });
    await expect(physical.startManufacturing(career.id, floor.id, 1)).rejects.toMatchObject({ code: "CAPACITY" });
    const progression = new PrismaProgressionRepository(client);
    const eventId = (await progression.getProgress(career.id))!.events[0].id;
    await advanceToNextEvent(progression, career.id, eventId);
    expect((await client.careerCarManufacturingOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("COMPLETED");
    const units = await client.careerCarPartUnit.findMany({ where: { designId: design.id }, orderBy: { unitNumber: "asc" } });
    expect(units.map(row => row.unitNumber)).toEqual([1, 2]);
    await client.$transaction(tx => settleDueManufacturingOrders(tx, career.id, "2026-03-06"));
    expect(await client.careerCarPartUnit.count({ where: { designId: design.id } })).toBe(2);
    const view = () => new PrismaCarDesignRepository(client).getOverview(career.id);
    const before = (await view())!.physical!;
    expect(before.designs.find(row => row.id === design.id)?.availableUnits).toBe(2);
    await physical.fit(career.id, "CAR_1", design.id, before.fitImpacts.find(row => row.slot === "CAR_1" && row.designId === design.id));
    const one = (await view())!.physical!;
    expect(one.cars.map(row => row.parts.find(part => part.partType === "FRONT_WING")?.version)).toEqual([2, 1]);
    expect(one.cars[0].stats.lowSpeed).toBeGreaterThan(one.cars[1].stats.lowSpeed);
    expect(one.cars[0].sessionPerformance).toBeGreaterThan(one.cars[1].sessionPerformance);
    expect(one.designs.find(row => row.id === design.id)?.availableUnits).toBe(1);
    expect(one.designs.find(row => row.design.partType === "FRONT_WING" && row.design.version === 1)?.availableUnits).toBe(1);
    await physical.fit(career.id, "CAR_2", design.id);
    const both = (await view())!.physical!;
    expect(both.cars.map(row => row.parts.find(part => part.partType === "FRONT_WING")?.version)).toEqual([2, 2]);
    expect(both.designs.find(row => row.id === design.id)?.availableUnits).toBe(0);
    const old = both.designs.find(row => row.design.partType === "FRONT_WING" && row.design.version === 1)!;
    expect(old.availableUnits).toBe(2);
    await physical.fit(career.id, "CAR_1", old.id);
    const reverted = (await view())!.physical!;
    expect(reverted.cars[0].parts.find(part => part.partType === "FRONT_WING")?.version).toBe(1);
    expect(reverted.designs.find(row => row.id === design.id)?.availableUnits).toBe(1);
  });
  it("feeds separate fitted scalars to every future session kind and freezes started Practice", async () => {
    const design = await improvedFrontWing();
    const physical = new PrismaCarPhysicalRepository(client);
    await physical.startManufacturing(career.id, design.id, 1);
    const progression = new PrismaProgressionRepository(client);
    const eventId = (await progression.getProgress(career.id))!.events[0].id;
    const entered = await advanceToNextEvent(progression, career.id, eventId);
    await physical.fit(career.id, "CAR_1", design.id);
    const drivers = await client.careerSeasonDriverEntry.findMany({ where: { careerId: career.id, careerSeasonId: career.currentSeasonId, teamEntry: { careerTeamId: career.playerTeamId } } });
    const bySlot = Object.fromEntries(drivers.map(row => [row.carSlot!, row.careerDriverId]));
    const car1 = (await new PrismaCarDesignRepository(client).getOverview(career.id))!.physical!.cars[0].sessionPerformance;
    const car2 = (await new PrismaCarDesignRepository(client).getOverview(career.id))!.physical!.cars[1].sessionPerformance;
    expect(car1).toBeGreaterThan(car2);
    const check = (rows: readonly { driverId: string; balance?: { carPerformance: number } | null }[]) => {
      expect(rows.find(row => row.driverId === bySlot.CAR_1)?.balance?.carPerformance).toBe(car1);
      expect(rows.find(row => row.driverId === bySlot.CAR_2)?.balance?.carPerformance).toBe(car2);
    };
    const practice = new PrismaPracticeRepository(client), qualifying = new PrismaQualifyingRepository(client), race = new PrismaRaceRepository(client);
    const sessionId = entered.events[0].weekend!.sessions[0].id;
    check((await practice.getPractice(career.id, eventId, sessionId))!.roster);
    check((await qualifying.getQualifying(career.id, eventId))!.roster);
    check((await race.getRace(career.id, eventId))!.roster);
    const started = await startPracticeSession(practice, career.id, eventId, sessionId);
    const frozen = started.state!.input.entrants.find(row => row.driverId === bySlot.CAR_1)!.car.performance;
    expect(frozen).toBe(car1);
    const old = await client.careerCarPartDesign.findFirstOrThrow({ where: { ...playerScope(), partType: "FRONT_WING", version: 1 } });
    await expect(physical.fit(career.id, "CAR_1", old.id)).rejects.toMatchObject({ code: "SESSION_IN_PROGRESS" });
    expect((await practice.getPractice(career.id, eventId, sessionId))!.state!.input.entrants.find(row => row.driverId === bySlot.CAR_1)!.car.performance).toBe(frozen);
  });
  it("feeds the same per-car specification to Sprint Qualifying and Sprint", async () => {
    const base = await client.careerCarPartDesign.findFirstOrThrow({ where: { ...playerScope(), partType: "FRONT_WING", version: 1 } });
    const design = await improvedFrontWing();
    await client.careerCarPartUnit.create({ data: { ...playerScope(), partType: "FRONT_WING", designId: design.id, unitNumber: 1,
      manufacturedAtCareerDate: new Date(`${career.currentDate}T00:00:00.000Z`) } });
    await new PrismaCarPhysicalRepository(client).fit(career.id, "CAR_1", design.id);
    const sprintEvent = (await new PrismaProgressionRepository(client).getProgress(career.id))!.events.find(row => row.weekendFormat === "SPRINT")!;
    const sprintWeekend = await client.careerRaceWeekend.create({ data: { careerId: career.id, careerSeasonId: career.currentSeasonId, careerCalendarEventId: sprintEvent.id } });
    await client.careerSession.createMany({ data: [
      { careerId: career.id, careerRaceWeekendId: sprintWeekend.id, type: "SPRINT_QUALIFYING", order: 1, status: "AVAILABLE" },
      { careerId: career.id, careerRaceWeekendId: sprintWeekend.id, type: "SPRINT", order: 2, status: "LOCKED" },
    ] });
    const slot1 = await client.careerSeasonDriverEntry.findFirstOrThrow({ where: { careerId: career.id, carSlot: "CAR_1", teamEntry: { careerTeamId: career.playerTeamId } } });
    const expected = (await new PrismaCarDesignRepository(client).getOverview(career.id))!.physical!.cars[0].sessionPerformance;
    expect(expected).toBeGreaterThan(deriveSessionCarPerformance(base));
    for (const rows of [
      (await new PrismaQualifyingRepository(client, "SPRINT_QUALIFYING").getQualifying(career.id, sprintEvent.id))!.roster,
      (await new PrismaRaceRepository(client, "SPRINT").getRace(career.id, sprintEvent.id))!.roster,
    ]) expect(rows.find(row => row.driverId === slot1.careerDriverId)?.balance?.carPerformance).toBe(expected);
  });
  it("freezes a started Race's fitted car scalar and blocks mid-Race refitting", async () => {
    const design = await improvedFrontWing();
    await client.careerCarPartUnit.create({ data: { ...playerScope(), partType: "FRONT_WING", designId: design.id, unitNumber: 1,
      manufacturedAtCareerDate: new Date(`${career.currentDate}T00:00:00.000Z`) } });
    const physical = new PrismaCarPhysicalRepository(client);
    await physical.fit(career.id, "CAR_1", design.id);
    const progression = new PrismaProgressionRepository(client);
    const eventId = (await progression.getProgress(career.id))!.events[0].id;
    const entered = await advanceToNextEvent(progression, career.id, eventId);
    const sessions = entered.events[0].weekend!.sessions;
    for (let index = 0; index < 3; index++)
      await runSessionAction(progression, career.id, eventId, sessions[index].id, "simulatePractice");
    await runSessionAction(progression, career.id, eventId, sessions[3].id, "start");
    await runSessionAction(progression, career.id, eventId, sessions[3].id, "completeDevelopment");
    const slot1 = await client.careerSeasonDriverEntry.findFirstOrThrow({ where: { careerId: career.id, carSlot: "CAR_1", teamEntry: { careerTeamId: career.playerTeamId } } });
    const expected = (await new PrismaCarDesignRepository(client).getOverview(career.id))!.physical!.cars[0].sessionPerformance;
    await startIncidentCareerRace(new PrismaRaceRepository(client), career.id, eventId, {}, 17);
    const frozen = (await new PrismaRaceRepository(client).getRace(career.id, eventId))!.state!.input.entrants.find(row => row.driverId === slot1.careerDriverId)!.car.performance;
    expect(frozen).toBe(expected);
    const v1 = await client.careerCarPartDesign.findFirstOrThrow({ where: { ...playerScope(), partType: "FRONT_WING", version: 1 } });
    await expect(physical.fit(career.id, "CAR_1", v1.id)).rejects.toMatchObject({ code: "SESSION_IN_PROGRESS" });
    expect((await new PrismaRaceRepository(client).getRace(career.id, eventId))!.state!.input.entrants.find(row => row.driverId === slot1.careerDriverId)!.car.performance).toBe(frozen);
  });
  it("enforces database fitment scope and player authorization", async () => {
    const physical = new PrismaCarPhysicalRepository(client);
    const fitments = await client.careerCarFitment.findMany({ where: playerScope(), orderBy: [{ carSlot: "asc" }, { partType: "asc" }] });
    const front = fitments.find(row => row.carSlot === "CAR_1" && row.partType === "FRONT_WING")!;
    const rear = fitments.find(row => row.carSlot === "CAR_1" && row.partType === "REAR_WING")!;
    const rival = await client.careerCarPartUnit.findFirstOrThrow({ where: { careerId: career.id, careerTeamId: { not: career.playerTeamId }, partType: "FRONT_WING" } });
    const rearUnit = await client.careerCarPartUnit.findUniqueOrThrow({ where: { id: rear.partUnitId } });
    const spareRear = await client.careerCarPartUnit.create({ data: { ...rearUnit, id: randomUUID(), unitNumber: 3 } });
    const spareRival = await client.careerCarPartUnit.create({ data: { ...rival, id: randomUUID(), unitNumber: 3 } });
    const key = { careerId_careerSeasonId_careerTeamId_carSlot_partType: {
      careerId: front.careerId, careerSeasonId: front.careerSeasonId, careerTeamId: front.careerTeamId, carSlot: front.carSlot, partType: front.partType } };
    await expect(client.careerCarFitment.update({ where: key, data: { partUnitId: spareRear.id } })).rejects.toMatchObject({ code: "P2003" });
    await expect(client.careerCarFitment.update({ where: key, data: { partUnitId: spareRival.id } })).rejects.toMatchObject({ code: "P2003" });
    const otherFront = fitments.find(row => row.carSlot === "CAR_2" && row.partType === "FRONT_WING")!;
    await expect(client.careerCarFitment.update({ where: key, data: { partUnitId: otherFront.partUnitId } })).rejects.toMatchObject({ code: "P2002" });
    const rivalDesign = await client.careerCarPartDesign.findFirstOrThrow({ where: { careerId: career.id, careerTeamId: rival.careerTeamId } });
    await expect(physical.startManufacturing(career.id, rivalDesign.id, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

import legacyContent from "./fixtures/development-content-before-naming.json";
import beforeRealNames from "./fixtures/development-content-before-real-names.json";
it.each([legacyContent,beforeRealNames])("reseeding identities twice preserves old Career snapshots and updates only new Careers %#", async (previous) => {
  for (const e of previous.teams) await client.team.update({where:{id:e.id},data:{name:e.name,shortName:e.shortName,countryCode:e.countryCode,foundedYear:e.foundedYear}});
  for (const e of previous.drivers) await client.driver.update({where:{id:e.id},data:{firstName:e.firstName,lastName:e.lastName,abbreviation:e.abbreviation,nationalityCode:e.nationalityCode,preferredNumber:e.preferredNumber,dateOfBirth:new Date(e.dateOfBirth)}});
  // Pass A numbers (e.g. NOR #1, VER #3) would collide with the historical ones while the old state is simulated;
  // park them, and the re-seed below restores every canonical number.
  for(const [i,e] of source.driverEntries.slice(previous.driverEntries.length).entries())await client.seasonDriverEntry.update({where:{id:e.id},data:{carNumber:200+i}});
  for(const [i,e] of previous.driverEntries.entries())await client.seasonDriverEntry.update({where:{id:e.id},data:{carNumber:90+i}});
  for(const e of previous.driverEntries)await client.seasonDriverEntry.update({where:{id:e.id},data:{carNumber:e.carNumber}});
  for (const e of previous.circuits) await client.circuit.update({where:{id:e.id},data:{name:e.name,countryCode:e.countryCode,city:e.city}});
  for (const e of previous.events) await client.calendarEvent.update({where:{id:e.id},data:{name:e.name}});
  const oldCareer=await createCareer(repository,{...input,name:"Historical names"});
  const snapshot=async()=>Promise.all([
    client.careerTeam.findMany({where:{careerId:oldCareer.id},orderBy:{id:"asc"}}),
    client.careerDriver.findMany({where:{careerId:oldCareer.id},orderBy:{id:"asc"}}),
    client.careerCircuit.findMany({where:{careerId:oldCareer.id},orderBy:{id:"asc"}}),
    client.careerCalendarEvent.findMany({where:{careerId:oldCareer.id},orderBy:{id:"asc"}}),
  ]);
  const before=await snapshot();
  await seedDevelopmentContent(client); await seedDevelopmentContent(client);
  expect(await snapshot()).toEqual(before);
  expect((await repository.getCareerOverview(oldCareer.id))!.playerTeam.name).toBe(previous.teams[0].name);
  const fresh=await createCareer(repository,{...input,name:"New private-use identities"});
  expect((await repository.getCareerOverview(fresh.id))!.playerTeam.name).toBe("Mercedes");
  const drivers=await client.careerDriver.findMany({where:{careerId:fresh.id}});
  expect(drivers.map(e=>`${e.firstName} ${e.lastName}`).sort()).toEqual(source.drivers.map(e=>`${e.firstName} ${e.lastName}`).sort());
  expect((await client.careerCircuit.findMany({where:{careerId:fresh.id}})).map(e=>e.name).sort()).toEqual(source.circuits.map(e=>e.name).sort());
  for(const [rows,expected] of [
    [await client.team.findMany({where:{gameDatabaseId:source.database.id},select:{id:true,key:true}}),source.teams],
    [await client.driver.findMany({where:{gameDatabaseId:source.database.id},select:{id:true,key:true}}),source.drivers],
    [await client.circuit.findMany({where:{gameDatabaseId:source.database.id},select:{id:true,key:true}}),source.circuits],
  ] as const) expect(rows.sort((a,b)=>a.id.localeCompare(b.id))).toEqual(expected.map(e=>({id:e.id,key:e.key})).sort((a,b)=>a.id.localeCompare(b.id)));
});

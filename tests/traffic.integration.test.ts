import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createPrismaClient } from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
import { developmentContent as source } from "../src/data/seed/content-development";
import { PrismaCareerRepository } from "../src/data/repositories/prisma-career";
import { createCareer } from "../src/features/career/create-career";
import type { Career } from "../src/game/domain/career";
const value = process.env.TEST_DATABASE_URL;
if (!value)
  throw new Error("TEST_DATABASE_URL required; SQL tests did not run.");
const schema = `traffic_test_${randomUUID().replaceAll("-", "")}`;
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

import { PrismaRaceRepository } from "../src/data/repositories/prisma-race";
import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import {
  advanceToNextEvent,
  runSessionAction,
} from "../src/features/career/progression";
import {
  startTrafficCareerRace,
  advanceCareerRace,
} from "../src/features/race/service";
import { simulateRace } from "../src/simulation/race/engine";
const races = new PrismaRaceRepository(client);
const progression = new PrismaProgressionRepository(client);
let eventId: string;
beforeEach(async () => {
  const state = (await progression.getProgress(career.id))!;
  eventId = state.events[0].id;
  const entered = await advanceToNextEvent(progression, career.id, eventId);
  const sessions = entered.events[0].weekend!.sessions;
  for (let i = 0; i < 3; i++)
    await runSessionAction(
      progression,
      career.id,
      eventId,
      sessions[i].id,
      "simulatePractice",
    );
  await runSessionAction(
    progression,
    career.id,
    eventId,
    sessions[3].id,
    "start",
  );
  await runSessionAction(
    progression,
    career.id,
    eventId,
    sessions[3].id,
    "completeDevelopment",
  );
});
async function start(seed = 123456) {
  await startTrafficCareerRace(races, career.id, eventId, {}, seed);
  return (await races.getRace(career.id, eventId))!;
}
describe("real PostgreSQL traffic persistence", () => {
  it("creates v3 with tyre and interaction snapshots", async () => {
    const d = await start();
    expect(d.state!.simulationVersion).toBe(3);
    expect(
      await client.careerRaceTyreProfile.count({
        where: { careerId: career.id },
      }),
    ).toBe(3);
    expect(
      d.state!.entrants.every((e) => e.stint!.tyre.compound === "MEDIUM"),
    ).toBe(true);
  });
  it("lap15 new-client resume equals continuous state including fuel RNG tyres and classification", async () => {
    const d = await start();
    for (let lap = 0; lap < 15; lap += 5)
      await advanceCareerRace(races, career.id, eventId, lap, 5);
    const before = (await races.getRace(career.id, eventId))!.state!;
    const reopened = createPrismaClient(url.toString());
    try {
      const repo = new PrismaRaceRepository(reopened);
      expect((await repo.getRace(career.id, eventId))!.state).toEqual(before);
      await advanceCareerRace(repo, career.id, eventId, 15, "finish");
      expect((await repo.getRace(career.id, eventId))!.state).toEqual(
        simulateRace(d.state!.input).state,
      );
    } finally {
      await reopened.$disconnect();
    }
  });
  it("reads actual saved wear and temperature rather than deriving them", async () => {
    await start();
    await client.careerRaceEntrant.updateMany({
      where: { careerId: career.id },
      data: { tyreWearPermille: 321, tyreTemperatureMilliC: 91234 },
    });
    const s = (await races.getRace(career.id, eventId))!.state!;
    expect(
      s.entrants.every(
        (e) =>
          e.stint!.tyre.wearPermille === 321 &&
          e.stint!.tyre.temperatureMilliC === 91234,
      ),
    ).toBe(true);
  });
  it.each([
    { tyreWearPermille: -1 },
    { tyreWearPermille: 1001 },
    { tyreTemperatureMilliC: -1 },
    { tyreTemperatureMilliC: 160001 },
    { tyreAgeLaps: -1 },
    { stintNumber: 0 },
    { startingTyreWearPermille: 1001 },
  ])("rejects invalid SQL tyre bounds %j", async (data) => {
    await start();
    await expect(
      client.careerRaceEntrant.updateMany({
        where: { careerId: career.id },
        data,
      }),
    ).rejects.toBeDefined();
  });
  it("rejects invalid SQL compound", async () => {
    await start();
    await expect(
      client.$executeRawUnsafe(
        `UPDATE "${schema}"."CareerRaceEntrant" SET "compound" = 'WET' WHERE "careerId" = '${career.id}'::uuid`,
      ),
    ).rejects.toBeDefined();
  });
  it("rejects cross-career profile ownership", async () => {
    await start();
    const second = await createCareer(repository, input);
    await expect(
      client.careerRaceTyreProfile.updateMany({
        where: { careerId: career.id },
        data: { careerId: second.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rolls back tyre state when final lifecycle write fails", async () => {
    const before = await start();
    await client.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."Career" ADD CONSTRAINT fail_traffic_finish CHECK ("id" <> '${career.id}'::uuid OR "currentDate" <> DATE '2026-03-08')`,
    );
    try {
      await expect(
        advanceCareerRace(races, career.id, eventId, 0, "finish"),
      ).rejects.toMatchObject({ code: "PERSISTENCE_FAILED" });
      expect(await races.getRace(career.id, eventId)).toEqual(before);
    } finally {
      await client.$executeRawUnsafe(
        `ALTER TABLE "${schema}"."Career" DROP CONSTRAINT fail_traffic_finish`,
      );
    }
  });
  it("persists all three valid compounds and freezes choices", async () => {
    const data = (await races.getRace(career.id, eventId))!;
    const compounds = ["SOFT", "MEDIUM", "HARD"] as const;
    const choices = Object.fromEntries(
      data.roster.map((e, i) => [e.driverId, compounds[i % 3]]),
    );
    await startTrafficCareerRace(races, career.id, eventId, choices, 1);
    const before = (await races.getRace(career.id, eventId))!.state!;
    expect(
      new Set(before.entrants.map((e) => e.stint!.tyre.compound)).size,
    ).toBe(3);
    await expect(
      startTrafficCareerRace(races, career.id, eventId, {}, 1),
    ).rejects.toMatchObject({ code: "STALE" });
    await advanceCareerRace(races, career.id, eventId, 0, 5);
    expect((await races.getRace(career.id, eventId))!.state!.input).toEqual(
      before.input,
    );
  });
});

it("rolls back profiles and tyre entrants when start lifecycle fails", async () => {
  const before = (await races.getRace(career.id, eventId))!;
  await client.$executeRawUnsafe(
    `ALTER TABLE "${schema}"."CareerSession" ADD CONSTRAINT fail_traffic_start CHECK ("id" <> '${before.sessionId}'::uuid OR "status" <> 'IN_PROGRESS')`,
  );
  try {
    await expect(start()).rejects.toMatchObject({ code: "PERSISTENCE_FAILED" });
    expect(
      await client.careerRaceTyreProfile.count({
        where: { careerId: career.id },
      }),
    ).toBe(0);
    expect(
      await client.careerRaceEntrant.count({ where: { careerId: career.id } }),
    ).toBe(0);
    expect(await races.getRace(career.id, eventId)).toEqual(before);
  } finally {
    await client.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."CareerSession" DROP CONSTRAINT fail_traffic_start`,
    );
  }
});

it("rejects duplicate positions at transaction commit", async () => {
  await start();
  await expect(
    client.careerRaceEntrant.updateMany({
      where: { careerId: career.id },
      data: { position: 1 },
    }),
  ).rejects.toBeDefined();
});
it("persists interaction profile and immutable snapshot", async () => {
  const before = await start();
  expect(
    await client.careerRaceInteractionProfile.count({
      where: { careerId: career.id },
    }),
  ).toBe(1);
  await advanceCareerRace(races, career.id, eventId, 0, 5);
  const after = (await races.getRace(career.id, eventId))!.state!;
  expect(after.input).toEqual(before.state!.input);
  expect(after.entrants.every((e) => e.track !== undefined)).toBe(true);
});
it("rejects cross-career interaction profile ownership", async () => {
  await start();
  const second = await createCareer(repository, input);
  await expect(
    client.careerRaceInteractionProfile.updateMany({
      where: { careerId: career.id },
      data: { careerId: second.id },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
});
it.each([
  { overtakesCompleted: -1 },
  { driverOvertaking: 101 },
  { trafficLossMs: -1 },
  { drsBenefitMs: 501 },
])("rejects invalid interaction state %j", async (data) => {
  await start();
  await expect(
    client.careerRaceEntrant.updateMany({
      where: { careerId: career.id },
      data,
    }),
  ).rejects.toBeDefined();
});
it("rolls back interaction snapshot on failed start", async () => {
  const before = (await races.getRace(career.id, eventId))!;
  await client.$executeRawUnsafe(
    `ALTER TABLE "${schema}"."CareerSession" ADD CONSTRAINT fail_interaction CHECK ("id" <> '${before.sessionId}'::uuid OR "status" <> 'IN_PROGRESS')`,
  );
  try {
    await expect(start()).rejects.toBeDefined();
    expect(
      await client.careerRaceInteractionProfile.count({
        where: { careerId: career.id },
      }),
    ).toBe(0);
  } finally {
    await client.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."CareerSession" DROP CONSTRAINT fail_interaction`,
    );
  }
});

it("persists a successful physical swap through deferred uniqueness", async () => {
  const { createRace } = await import("../src/simulation/race/engine");
  const fixtureRepo = {
    getRace: races.getRace.bind(races),
    changeRace: (
      careerId: string,
      eventId: string,
      change: Parameters<PrismaRaceRepository["changeRace"]>[2],
    ) =>
      races.changeRace(careerId, eventId, (data) => {
        const next = change(data);
        const input = {
          ...next.state.input,
          interaction: {
            ...next.state.input.interaction!,
            overtakingDifficulty: 0,
            drsActivationLap: 1,
          },
          entrants: next.state.input.entrants.map((e, n) => ({
            ...e,
            car: { performance: n === 0 ? 40 : 100 },
            interaction: { overtaking: 100, defending: 0 },
          })),
        };
        return { ...next, state: createRace(input) };
      }),
  };
  await startTrafficCareerRace(fixtureRepo, career.id, eventId, {}, 42);
  const before = (await races.getRace(career.id, eventId))!.state!;
  await advanceCareerRace(races, career.id, eventId, 0, 5);
  const after = (await races.getRace(career.id, eventId))!.state!;
  expect(after.entrants.some((e) => e.track!.overtakesCompleted > 0)).toBe(
    true,
  );
  expect(after.entrants[0].entrantId).not.toBe(before.entrants[0].entrantId);
  expect(new Set(after.entrants.map((e) => e.position)).size).toBe(
    after.entrants.length,
  );
});

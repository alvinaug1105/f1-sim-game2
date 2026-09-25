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
const schema = `race_test_${randomUUID().replaceAll("-", "")}`;
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
  runScaffoldingAction,
} from "../src/features/career/progression";
import {
  startCareerRace,
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
  await startCareerRace(races, career.id, eventId, seed);
  return (await races.getRace(career.id, eventId))!;
}
describe("real PostgreSQL Race persistence", () => {
  it("applies fourth migration and snapshots owned race entrants", async () => {
    const data = await start();
    expect(data.state!.lap).toBe(0);
    expect(data.state!.input.entrants).toHaveLength(22);
    expect(data.state!.simulationVersion).toBe(1);
    expect(data.progress.events[0].weekend!.sessions[4].status).toBe(
      "IN_PROGRESS",
    );
    expect(
      await client.careerRaceSimulation.count({
        where: { careerId: career.id },
      }),
    ).toBe(1);
  });
  it("persists the full unsigned seed and RNG state", async () => {
    const data = await start(4294967295);
    expect(data.state!.input.seed).toBe(4294967295);
    expect(data.state!.rngState).toBe(4294967295);
    await advanceCareerRace(races, career.id, eventId, 0, 1);
    const next = (await races.getRace(career.id, eventId))!;
    expect(next.state!.input.seed).toBe(4294967295);
    expect(next.state!.rngState).not.toBe(4294967295);
  });
  it("persists lap, fuel, elapsed, last and best times", async () => {
    const data = await start();
    await advanceCareerRace(races, career.id, eventId, 0, 5);
    const state = (await races.getRace(career.id, eventId))!.state!;
    expect(state.lap).toBe(5);
    for (const entrant of state.entrants) {
      expect(entrant.completedLaps).toBe(5);
      expect(entrant.elapsedTimeMs).toBeGreaterThan(0);
      expect(entrant.bestLapTimeMs).toBeGreaterThan(0);
      expect(entrant.fuelMassKg).toBeLessThan(data.state!.input.initialFuelKg);
    }
  });
  it("resume after ten laps and a new client equals continuous simulation", async () => {
    const data = await start();
    const expected = simulateRace(data.state!.input).state;
    await advanceCareerRace(races, career.id, eventId, 0, 5);
    await advanceCareerRace(races, career.id, eventId, 5, 5);
    const reopened = createPrismaClient(url.toString());
    try {
      const repo = new PrismaRaceRepository(reopened);
      expect((await repo.getRace(career.id, eventId))!.state!.lap).toBe(10);
      await advanceCareerRace(repo, career.id, eventId, 10, 1);
      expect((await repo.getRace(career.id, eventId))!.state!.lap).toBe(11);
      await advanceCareerRace(repo, career.id, eventId, 11, "finish");
      expect((await repo.getRace(career.id, eventId))!.state).toEqual(expected);
    } finally {
      await reopened.$disconnect();
    }
  });
  it("finishes Race, session, weekend and event in one transaction", async () => {
    await start();
    await advanceCareerRace(races, career.id, eventId, 0, "finish");
    const data = (await races.getRace(career.id, eventId))!;
    expect(data.state!.status).toBe("FINISHED");
    expect(
      data.state!.entrants.every(
        (e) => e.completedLaps === data.state!.input.totalLaps,
      ),
    ).toBe(true);
    expect(data.progress.events[0].status).toBe("COMPLETED");
    expect(data.progress.events[0].weekend!.status).toBe("COMPLETED");
    expect(data.progress.events[0].weekend!.sessions[4].status).toBe(
      "COMPLETED",
    );
    expect(data.progress.career.currentDate).toBe("2026-03-08");
    expect(data.progress.events[1].weekend).toBeNull();
    const reopened = new PrismaRaceRepository(client);
    expect((await reopened.getRace(career.id, eventId))!.state).toEqual(
      data.state,
    );
  });
  it("rejects duplicate starts including concurrent requests", async () => {
    const results = await Promise.allSettled([
      startCareerRace(races, career.id, eventId, 1),
      startCareerRace(races, career.id, eventId, 2),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await client.careerRaceSimulation.count({
        where: { careerId: career.id },
      }),
    ).toBe(1);
  });
  it("rejects duplicate lap requests instead of double advancing", async () => {
    await start();
    const results = await Promise.allSettled([
      advanceCareerRace(races, career.id, eventId, 0, 5),
      advanceCareerRace(races, career.id, eventId, 0, 5),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await races.getRace(career.id, eventId))!.state!.lap).toBe(5);
  });
  it("database enforces one simulation per Race session", async () => {
    await start();
    const row = await client.careerRaceSimulation.findFirstOrThrow({
      where: { careerId: career.id },
    });
    await expect(
      client.careerRaceSimulation.create({
        data: { ...row, id: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("non-Race sessions cannot own a Race simulation", async () => {
    const data = await start();
    const row = await client.careerRaceSimulation.findFirstOrThrow({
      where: { careerId: career.id },
    });
    const practice = data.progress.events[0].weekend!.sessions[0];
    await expect(
      client.careerRaceSimulation.create({
        data: { ...row, id: randomUUID(), careerSessionId: practice.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      client.careerRaceSimulation.create({
        data: {
          ...row,
          id: randomUUID(),
          careerSessionId: practice.id,
          sessionType: "PRACTICE_1",
        },
      }),
    ).rejects.toBeDefined();
  });
  it("rejects cross-Career simulation ownership", async () => {
    await start();
    const second = await createCareer(repository, input);
    const row = await client.careerRaceSimulation.findFirstOrThrow({
      where: { careerId: career.id },
    });
    await expect(
      client.careerRaceSimulation.update({
        where: { id: row.id },
        data: { careerId: second.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects cross-Career entrant driver and team references", async () => {
    await start();
    const second = await createCareer(repository, input);
    const foreign = await client.careerDriver.findFirstOrThrow({
      where: { careerId: second.id },
    });
    const row = await client.careerRaceEntrant.findFirstOrThrow({
      where: { careerId: career.id },
    });
    await expect(
      client.careerRaceEntrant.update({
        where: { id: row.id },
        data: { careerDriverId: foreign.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      client.careerRaceEntrant.update({
        where: { id: row.id },
        data: { careerTeamId: second.playerTeamId },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("preserves frozen inputs and names after owned content changes", async () => {
    const before = await start();
    await client.careerDriver.updateMany({
      where: { careerId: career.id },
      data: { firstName: "Changed" },
    });
    await client.careerCircuit.updateMany({
      where: { careerId: career.id },
      data: { lengthMeters: 10000, defaultLapCount: 10 },
    });
    const after = (await races.getRace(career.id, eventId))!;
    expect(after.state).toEqual(before.state);
    expect(after.labels).toEqual(before.labels);
    await advanceCareerRace(races, career.id, eventId, 0, "finish");
    expect((await races.getRace(career.id, eventId))!.state).toEqual(
      simulateRace(before.state!.input).state,
    );
  });
  it("rolls back simulation and entrants if session start fails", async () => {
    const before = (await races.getRace(career.id, eventId))!;
    await client.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."CareerSession" ADD CONSTRAINT fail_race_start CHECK ("id" <> '${before.sessionId}'::uuid OR "status" <> 'IN_PROGRESS')`,
    );
    try {
      await expect(start()).rejects.toMatchObject({
        code: "PERSISTENCE_FAILED",
      });
      expect(
        await client.careerRaceSimulation.count({
          where: { careerId: career.id },
        }),
      ).toBe(0);
      expect(
        await client.careerRaceEntrant.count({
          where: { careerId: career.id },
        }),
      ).toBe(0);
      expect(await races.getRace(career.id, eventId)).toEqual(before);
    } finally {
      await client.$executeRawUnsafe(
        `ALTER TABLE "${schema}"."CareerSession" DROP CONSTRAINT fail_race_start`,
      );
    }
  });
  it("rolls back final result and lifecycle if final date write fails", async () => {
    const before = await start();
    await client.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."Career" ADD CONSTRAINT fail_race_finish CHECK ("id" <> '${career.id}'::uuid OR "currentDate" <> DATE '2026-03-08')`,
    );
    try {
      await expect(
        advanceCareerRace(races, career.id, eventId, 0, "finish"),
      ).rejects.toMatchObject({ code: "PERSISTENCE_FAILED" });
      expect(await races.getRace(career.id, eventId)).toEqual(before);
    } finally {
      await client.$executeRawUnsafe(
        `ALTER TABLE "${schema}"."Career" DROP CONSTRAINT fail_race_finish`,
      );
    }
  });
  it("blocks development Race completion and browser scaffolding bypass", async () => {
    const before = await start();
    await expect(
      runScaffoldingAction(
        progression,
        career.id,
        eventId,
        before.sessionId,
        "completeDevelopment",
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(
      runSessionAction(
        progression,
        career.id,
        eventId,
        before.sessionId,
        "completeDevelopment",
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect((await races.getRace(career.id, eventId))!.state).toEqual(
      before.state,
    );
  });
  it("Race progression is isolated from another Career", async () => {
    const second = await createCareer(repository, input);
    const before = await progression.getProgress(second.id);
    await start();
    await advanceCareerRace(races, career.id, eventId, 0, "finish");
    expect(await progression.getProgress(second.id)).toEqual(before);
  });
  it("rejects unsupported saved versions without updating state", async () => {
    const data = await start();
    await client.careerRaceSimulation.update({
      where: { careerSessionId: data.sessionId },
      data: { simulationVersion: 99 },
    });
    const before = await races.getRace(career.id, eventId);
    await expect(
      advanceCareerRace(races, career.id, eventId, 0, 1),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_VERSION" });
    expect(await races.getRace(career.id, eventId)).toEqual(before);
  });
  it("cannot create a Race from a locked session", async () => {
    const second = await createCareer(repository, input);
    const state = (await progression.getProgress(second.id))!;
    const e = state.events[0].id;
    await advanceToNextEvent(progression, second.id, e);
    await expect(startCareerRace(races, second.id, e, 1)).rejects.toMatchObject(
      { code: "INVALID_ACTION" },
    );
    expect(
      await client.careerRaceSimulation.count({
        where: { careerId: second.id },
      }),
    ).toBe(0);
  });
});

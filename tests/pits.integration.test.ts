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
const schema = `pit_test_${randomUUID().replaceAll("-", "")}`;
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
  startPitCareerRace,
  changeCareerPitRequest,
  advanceCareerRace,
} from "../src/features/race/service";
import { advanceRace } from "../src/simulation/race/engine";
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
  await startPitCareerRace(races, career.id, eventId, {}, seed);
  return (await races.getRace(career.id, eventId))!;
}

import { requestPitStop } from "../src/simulation/race/pits/model";
import type { CareerRaceData } from "../src/game/domain/race-repository";
const player = (data: CareerRaceData) =>
  data.state!.input.entrants.find((e) => e.strategyController === "PLAYER")!
    .entrantId;
async function request(compound: "SOFT" | "MEDIUM" | "HARD" | null) {
  const d = (await races.getRace(career.id, eventId))!;
  const id = player(d);
  const e = d.state!.entrants.find((e) => e.entrantId === id)!;
  await changeCareerPitRequest(
    races,
    career.id,
    eventId,
    id,
    d.state!.lap,
    e.pit!.commandRevision,
    compound,
  );
  return (await races.getRace(career.id, eventId))!;
}
describe("real PostgreSQL v4 pit strategy", () => {
  it("creates owned v4 profile and four open initial stints", async () => {
    const d = await start();
    expect(d.state!.simulationVersion).toBe(4);
    expect(
      await client.careerRacePitProfile.count({
        where: { careerId: career.id },
      }),
    ).toBe(1);
    expect(
      await client.careerRaceStint.count({
        where: { careerId: career.id, endLap: null },
      }),
    ).toBe(4);
    expect(
      d.state!.input.entrants.filter(
        (e) => e.strategyController === "DEVELOPMENT_AI",
      ),
    ).toHaveLength(2);
  });
  it("persists pending request through a fresh repository client", async () => {
    await start();
    const before = await request("SOFT");
    const reopened = createPrismaClient(url.toString());
    try {
      expect(
        (await new PrismaRaceRepository(reopened).getRace(career.id, eventId))!
          .state,
      ).toEqual(before.state);
    } finally {
      await reopened.$disconnect();
    }
  });
  it("changes compound and cancels before commitment", async () => {
    await start();
    await request("SOFT");
    const changed = await request("HARD");
    expect(
      changed.state!.entrants.find((e) => e.entrantId === player(changed))!.pit!
        .pendingCompound,
    ).toBe("HARD");
    await request(null);
    await advanceCareerRace(races, career.id, eventId, 0, 1);
    expect(
      await client.careerRacePitStop.count({ where: { careerId: career.id } }),
    ).toBe(0);
  });
  it("atomically persists tyre reset, closed/open stints, stop loss and changed order", async () => {
    const before = await start();
    await request("HARD");
    await advanceCareerRace(races, career.id, eventId, 0, 1);
    const after = (await races.getRace(career.id, eventId))!.state!;
    const e = after.entrants.find((e) => e.entrantId === player(before))!;
    expect(e.position).toBeGreaterThan(1);
    expect(e.stint).toMatchObject({
      number: 2,
      startedAtLap: 1,
      tyre: {
        compound: "HARD",
        ageLaps: 0,
        wearPermille: 0,
        temperatureMilliC: 80000,
      },
    });
    expect(e.pit!.stints[0].endLap).toBe(1);
    expect(e.pit!.stints[1].endLap).toBeNull();
    expect(e.pit!.stops).toHaveLength(1);
    expect(e.fuelMassKg).toBeCloseTo(
      before.state!.input.initialFuelKg - before.state!.input.fuelBurnPerLapKg,
      3,
    );
    expect(after.entrants.every((e) => e.track!.overtakesCompleted === 0)).toBe(
      true,
    );
  });
  it("lap15 pending save, reload, stop and finish equals uninterrupted execution", async () => {
    await start();
    for (let lap = 0; lap < 15; lap += 5)
      await advanceCareerRace(races, career.id, eventId, lap, 5);
    const before = (await races.getRace(career.id, eventId))!;
    const expected = advanceRace(
      requestPitStop(before.state!, player(before), "HARD"),
      1000,
    );
    const pending = await request("HARD");
    const reopened = createPrismaClient(url.toString());
    try {
      const repo = new PrismaRaceRepository(reopened);
      expect((await repo.getRace(career.id, eventId))!.state).toEqual(
        pending.state,
      );
      await advanceCareerRace(repo, career.id, eventId, 15, 1);
      expect(
        (await repo.getRace(career.id, eventId))!.state!.entrants.find(
          (e) => e.entrantId === player(before),
        )!.pit!.stops,
      ).toHaveLength(1);
      await advanceCareerRace(repo, career.id, eventId, 16, "finish");
      expect((await repo.getRace(career.id, eventId))!.state).toEqual(expected);
    } finally {
      await reopened.$disconnect();
    }
  });
  it("double Box click creates one request and one stop", async () => {
    const d = await start();
    const results = await Promise.allSettled([
      changeCareerPitRequest(
        races,
        career.id,
        eventId,
        player(d),
        0,
        0,
        "SOFT",
      ),
      changeCareerPitRequest(
        races,
        career.id,
        eventId,
        player(d),
        0,
        0,
        "SOFT",
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await advanceCareerRace(races, career.id, eventId, 0, 1);
    expect(
      await client.careerRacePitStop.count({
        where: { careerId: career.id, entrantId: player(d) },
      }),
    ).toBe(1);
  });
  it("Box and Cancel with same revision cannot both commit", async () => {
    await start();
    const d = await request("SOFT");
    const results = await Promise.allSettled([
      changeCareerPitRequest(
        races,
        career.id,
        eventId,
        player(d),
        0,
        1,
        "HARD",
      ),
      changeCareerPitRequest(races, career.id, eventId, player(d), 0, 1, null),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const e = (await races.getRace(career.id, eventId))!.state!.entrants.find(
      (e) => e.entrantId === player(d),
    )!;
    expect(e.pit!.commandRevision).toBe(2);
    expect(e.pit!.stops).toHaveLength(0);
  });
  it("rejects stale lap and non-player commands", async () => {
    const d = await start();
    await advanceCareerRace(races, career.id, eventId, 0, 1);
    await expect(
      changeCareerPitRequest(
        races,
        career.id,
        eventId,
        player(d),
        0,
        0,
        "SOFT",
      ),
    ).rejects.toMatchObject({ code: "STALE" });
    const ai = d.state!.input.entrants.find(
      (e) => e.strategyController === "DEVELOPMENT_AI",
    )!;
    await expect(
      changeCareerPitRequest(
        races,
        career.id,
        eventId,
        ai.entrantId,
        1,
        0,
        "SOFT",
      ),
    ).rejects.toMatchObject({ code: "INVALID_ACTION" });
  });
  it("rejects invalid SQL compound", async () => {
    const d = await start();
    await expect(
      client.$executeRawUnsafe(
        `UPDATE "${schema}"."CareerRaceEntrant" SET "pendingPitCompound"='WET' WHERE "id"='${player(d)}'::uuid`,
      ),
    ).rejects.toBeDefined();
  });
  it("rolls back service, history, RNG and pending request when stop insert fails", async () => {
    await start();
    const before = await request("HARD");
    await client.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."CareerRacePitStop" ADD CONSTRAINT fail_pit_insert CHECK ("entrantId" <> '${player(before)}'::uuid)`,
    );
    try {
      await expect(
        advanceCareerRace(races, career.id, eventId, 0, 1),
      ).rejects.toMatchObject({ code: "PERSISTENCE_FAILED" });
      expect(await races.getRace(career.id, eventId)).toEqual(before);
    } finally {
      await client.$executeRawUnsafe(
        `ALTER TABLE "${schema}"."CareerRacePitStop" DROP CONSTRAINT fail_pit_insert`,
      );
    }
  });
  it("rolls back pit histories with failed final lifecycle write", async () => {
    await start();
    const before = await request("HARD");
    await client.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."Career" ADD CONSTRAINT fail_pit_finish CHECK ("id" <> '${career.id}'::uuid OR "currentDate" <> DATE '2026-03-08')`,
    );
    try {
      await expect(
        advanceCareerRace(races, career.id, eventId, 0, "finish"),
      ).rejects.toMatchObject({ code: "PERSISTENCE_FAILED" });
      expect(await races.getRace(career.id, eventId)).toEqual(before);
    } finally {
      await client.$executeRawUnsafe(
        `ALTER TABLE "${schema}"."Career" DROP CONSTRAINT fail_pit_finish`,
      );
    }
  });
  it("protects stint and stop ownership across Careers", async () => {
    await start();
    await request("HARD");
    await advanceCareerRace(races, career.id, eventId, 0, 1);
    const second = await createCareer(repository, input);
    await expect(
      client.careerRaceStint.updateMany({
        where: { careerId: career.id },
        data: { careerId: second.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      client.careerRacePitStop.updateMany({
        where: { careerId: career.id },
        data: { careerId: second.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("protects pit profile ownership across Careers", async () => {
    await start();
    const second = await createCareer(repository, input);
    await expect(
      client.careerRacePitProfile.updateMany({
        where: { careerId: career.id },
        data: { careerId: second.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects duplicate stop history", async () => {
    await start();
    await request("HARD");
    await advanceCareerRace(races, career.id, eventId, 0, 1);
    const row = await client.careerRacePitStop.findFirstOrThrow({
      where: { careerId: career.id },
    });
    await expect(
      client.careerRacePitStop.create({ data: row }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("rejects a second open stint for an entrant", async () => {
    await start();
    const row = await client.careerRaceStint.findFirstOrThrow({
      where: { careerId: career.id },
    });
    await expect(
      client.careerRaceStint.create({
        data: { ...row, number: 2, startLap: 1 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("retains final history and rejects commands after finish", async () => {
    await start();
    await request("SOFT");
    await advanceCareerRace(races, career.id, eventId, 0, "finish");
    const d = (await races.getRace(career.id, eventId))!;
    expect(
      d.state!.entrants.every((e) =>
        e.pit!.stints.every((s) => s.endLap !== null),
      ),
    ).toBe(true);
    await expect(
      changeCareerPitRequest(
        races,
        career.id,
        eventId,
        player(d),
        58,
        2,
        "HARD",
      ),
    ).rejects.toMatchObject({ code: "INVALID_ACTION" });
    expect((await races.getRace(career.id, eventId))!.state).toEqual(d.state);
  });
  it.each([
    { pitLaneLossMs: -1 },
    { stationaryVariationMs: 1001 },
    { newTyreTemperatureMilliC: 160001 },
  ])("rejects invalid pit snapshot bounds %j", async (data) => {
    await start();
    await expect(
      client.careerRacePitProfile.updateMany({
        where: { careerId: career.id },
        data,
      }),
    ).rejects.toBeDefined();
  });
});

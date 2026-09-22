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
const schema = `progression_test_${randomUUID().replaceAll("-", "")}`;
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

import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import {
  advanceToNextEvent,
  runSessionAction,
} from "../src/features/career/progression";
import { progressSummary } from "../src/game/domain/progression";
const progression = new PrismaProgressionRepository(client);
async function enter(id = career.id) {
  const state = (await progression.getProgress(id))!;
  return advanceToNextEvent(progression, id, progressSummary(state).next!.id);
}
async function action(
  index: number,
  intent: "start" | "simulatePractice" | "completeDevelopment",
  id = career.id,
) {
  const state = (await progression.getProgress(id))!;
  const event = progressSummary(state).active!;
  return runSessionAction(
    progression,
    id,
    event.id,
    event.weekend!.sessions[index].id,
    intent,
  );
}
async function prepareFinal() {
  await enter();
  for (let i = 0; i < 3; i++) await action(i, "simulatePractice");
  await action(3, "start");
  await action(3, "completeDevelopment");
  await action(4, "start");
}
describe("PostgreSQL race weekend progression", () => {
  it("applies all migrations and persists initialized sessions", async () => {
    await enter();
    const state = (await progression.getProgress(career.id))!;
    expect(state.career.currentDate).toBe("2026-03-06");
    expect(state.events[0].status).toBe("CURRENT");
    expect(state.events[0].weekend!.sessions.map((s) => s.status)).toEqual([
      "AVAILABLE",
      "LOCKED",
      "LOCKED",
      "LOCKED",
      "LOCKED",
    ]);
  });
  it("serializes concurrent entry requests with exactly one winner", async () => {
    const state = (await progression.getProgress(career.id))!;
    const results = await Promise.allSettled([
      advanceToNextEvent(progression, career.id, state.events[0].id),
      advanceToNextEvent(progression, career.id, state.events[0].id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await client.careerRaceWeekend.count({ where: { careerId: career.id } }),
    ).toBe(1);
    expect(
      await client.careerSession.count({ where: { careerId: career.id } }),
    ).toBe(5);
  });
  it("serializes duplicate session completions without skipping a session", async () => {
    const state = await enter();
    const e = state.events[0];
    const s = e.weekend!.sessions[0];
    const results = await Promise.allSettled([
      runSessionAction(progression, career.id, e.id, s.id, "simulatePractice"),
      runSessionAction(progression, career.id, e.id, s.id, "simulatePractice"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await progression.getProgress(
        career.id,
      ))!.events[0].weekend!.sessions.map((s) => s.status),
    ).toEqual(["COMPLETED", "AVAILABLE", "LOCKED", "LOCKED", "LOCKED"]);
  });
  it("enforces one weekend per calendar event", async () => {
    await enter();
    const row = await client.careerRaceWeekend.findFirstOrThrow({
      where: { careerId: career.id },
    });
    await expect(
      client.careerRaceWeekend.create({ data: { ...row, id: randomUUID() } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("enforces one active weekend across a Career", async () => {
    const state = await enter();
    await expect(
      client.careerRaceWeekend.create({
        data: {
          careerId: career.id,
          careerSeasonId: career.currentSeasonId,
          careerCalendarEventId: state.events[1].id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("enforces one current calendar event", async () => {
    const state = await enter();
    await expect(
      client.careerCalendarEvent.update({
        where: { id: state.events[1].id },
        data: { status: "CURRENT" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("rejects duplicate session type and order", async () => {
    const state = await enter();
    const row = state.events[0].weekend!.sessions[0];
    await expect(
      client.careerSession.create({
        data: { ...row, id: randomUUID(), status: "LOCKED", order: 6 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      client.careerSession.update({
        where: { id: state.events[0].weekend!.sessions[1].id },
        data: { order: 1 },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("rejects a session referencing another Career's weekend", async () => {
    const second = await createCareer(repository, input);
    const state = await enter();
    await expect(
      client.careerSession.update({
        where: { id: state.events[0].weekend!.sessions[0].id },
        data: { careerId: second.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects a weekend referencing another Career's event", async () => {
    const second = await createCareer(repository, input);
    const state = (await progression.getProgress(career.id))!;
    await expect(
      client.careerRaceWeekend.create({
        data: {
          careerId: second.id,
          careerSeasonId: second.currentSeasonId,
          careerCalendarEventId: state.events[0].id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("enforces practice-only skip and current-session uniqueness", async () => {
    const state = await enter();
    const sessions = state.events[0].weekend!.sessions;
    await expect(
      client.careerSession.update({
        where: { id: sessions[4].id },
        data: {
          status: "SKIPPED",
          completedAtCareerDate: new Date("2026-03-06"),
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      client.careerSession.update({
        where: { id: sessions[1].id },
        data: { status: "AVAILABLE" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("rolls back entry if a late event-status write fails", async () => {
    const before = await progression.getProgress(career.id);
    await client.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."CareerCalendarEvent" ADD CONSTRAINT fail_entry CHECK ("careerId" <> '${career.id}'::uuid OR "status" <> 'CURRENT')`,
    );
    try {
      await expect(enter()).rejects.toMatchObject({
        code: "PERSISTENCE_FAILED",
      });
      expect(await progression.getProgress(career.id)).toEqual(before);
      expect(
        await client.careerSession.count({ where: { careerId: career.id } }),
      ).toBe(0);
    } finally {
      await client.$executeRawUnsafe(
        `ALTER TABLE "${schema}"."CareerCalendarEvent" DROP CONSTRAINT fail_entry`,
      );
    }
  });
  it("commits final session, weekend, event and date together", async () => {
    await prepareFinal();
    await action(4, "completeDevelopment");
    const state = (await progression.getProgress(career.id))!;
    expect(state.events[0].weekend!.sessions[4].status).toBe("COMPLETED");
    expect(state.events[0].weekend!.status).toBe("COMPLETED");
    expect(state.events[0].status).toBe("COMPLETED");
    expect(state.career.currentDate).toBe("2026-03-08");
    expect(state.events[1].weekend).toBeNull();
    expect(
      (
        await client.careerRaceWeekend.findUniqueOrThrow({
          where: { id: state.events[0].weekend!.id },
        })
      ).completedAt,
    ).not.toBeNull();
  });
  it("rolls back final-session writes if the Career date update fails", async () => {
    await prepareFinal();
    const before = await progression.getProgress(career.id);
    await client.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."Career" ADD CONSTRAINT fail_finish CHECK ("id" <> '${career.id}'::uuid OR "currentDate" <> DATE '2026-03-08')`,
    );
    try {
      await expect(action(4, "completeDevelopment")).rejects.toMatchObject({
        code: "PERSISTENCE_FAILED",
      });
      expect(await progression.getProgress(career.id)).toEqual(before);
    } finally {
      await client.$executeRawUnsafe(
        `ALTER TABLE "${schema}"."Career" DROP CONSTRAINT fail_finish`,
      );
    }
  });
  it("Career A progression never changes Career B", async () => {
    const second = await createCareer(repository, input);
    const before = await progression.getProgress(second.id);
    await prepareFinal();
    await action(4, "completeDevelopment");
    expect(await progression.getProgress(second.id)).toEqual(before);
  });
  it("rejects foreign session requests without changing either world", async () => {
    const second = await createCareer(repository, input);
    const a = await enter();
    const b = await enter(second.id);
    await expect(
      runSessionAction(
        progression,
        career.id,
        a.events[0].id,
        b.events[0].weekend!.sessions[0].id,
        "start",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await progression.getProgress(career.id)).toEqual({
      ...a,
      career: expect.objectContaining({ id: career.id }),
    });
  });
});

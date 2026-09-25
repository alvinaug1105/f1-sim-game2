import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createPrismaClient } from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
import { developmentContent as source } from "../src/data/seed/content-development";
import { PrismaCareerRepository } from "../src/data/repositories/prisma-career";
import { PrismaPracticeRepository } from "../src/data/repositories/prisma-practice";
import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import { createCareer } from "../src/features/career/create-career";
import { advanceToNextEvent } from "../src/features/career/progression";
import {
  advancePracticeSession, practiceCommand, simulatePracticeRemainder, simulatePracticeSession, simulateRemainingPractice, startPracticeSession,
} from "../src/features/practice/service";
import { practiceView } from "../src/features/practice/view-model";
import type { Career } from "../src/game/domain/career";
const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error("TEST_DATABASE_URL required; SQL tests did not run.");
const schema = `practice_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(value);
url.searchParams.set("schema", schema);
const adminUrl = new URL(value);
adminUrl.searchParams.delete("schema");
const admin = new Pool({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
const client = createPrismaClient(url.toString());
const careers = new PrismaCareerRepository(client);
const practice = new PrismaPracticeRepository(client);
const progression = new PrismaProgressionRepository(client);
const input = { name: "Practice Career", gameDatabaseId: source.database.id, seasonId: source.seasons[0].id, playerTeamId: source.teams[0].id };
const plan = { compound: "MEDIUM" as const, targetLaps: 3, pace: "BALANCED" as const };
let created = false;
let career: Career;
let eventId: string;
let sessions: { id: string; type: string }[];
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url.toString() }, timeout: 45000, stdio: "pipe",
  });
});
beforeEach(async () => {
  await seedDevelopmentContent(client);
  career = await createCareer(careers, input);
  const state = (await progression.getProgress(career.id))!;
  eventId = state.events[0].id;
  const entered = await advanceToNextEvent(progression, career.id, eventId);
  sessions = [...entered.events[0].weekend!.sessions].sort((a, b) => a.order - b.order);
});
afterAll(async () => {
  try {
    await client.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await admin.end();
  }
});
describe("practice persistence", () => {
  it("start, send out, return, setup change and reload round-trip the exact state", async () => {
    const p1 = sessions[0].id;
    let data = await startPracticeSession(practice, career.id, eventId, p1);
    const mine = data.state!.input.entrants.find((e) => e.controller === "PLAYER")!;
    data = await practiceCommand(practice, career.id, eventId, p1, 0, { kind: "send", entrantId: mine.entrantId, revision: 0, plan });
    for (let i = 0; i < 30; i++) data = await advancePracticeSession(practice, career.id, eventId, p1, data.state!.elapsedMs);
    const index = data.state!.entrants.findIndex((e) => e.entrantId === mine.entrantId);
    expect(data.state!.entrants[index].location).toBe("GARAGE");
    const reloaded = await practice.getPractice(career.id, eventId, p1);
    expect(reloaded!.state).toEqual(data.state);
    const e = data.state!.entrants[index];
    data = await practiceCommand(practice, career.id, eventId, p1, data.state!.elapsedMs, {
      kind: "setup", entrantId: mine.entrantId, revision: e.commandRevision, setup: { ...e.preparation.setup, AERO: e.preparation.setup.AERO + 5 },
    });
    expect((await practice.getPractice(career.id, eventId, p1))!.state).toEqual(data.state);
    expect(data.state!.entrants[index].runs[0].plan).toEqual(plan);
  });
  it("rejects stale and concurrent duplicate advances; exactly one commits", async () => {
    const p1 = sessions[0].id;
    await startPracticeSession(practice, career.id, eventId, p1);
    const results = await Promise.allSettled([0, 1, 2].map(() => advancePracticeSession(practice, career.id, eventId, p1, 0)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "STALE" });
    expect((await practice.getPractice(career.id, eventId, p1))!.state!.elapsedMs).toBe(30_000);
  });
  it("Simulate Remainder completes the session once and the weekend moves on; learning carries to P2", async () => {
    const [p1, p2] = sessions;
    const started = await startPracticeSession(practice, career.id, eventId, p1.id);
    const done = await simulatePracticeRemainder(practice, career.id, eventId, p1.id, started.state!.elapsedMs);
    expect(done.state!.status).toBe("FINISHED");
    const progress = (await progression.getProgress(career.id))!;
    const weekend = progress.events.find((e) => e.id === eventId)!.weekend!;
    expect(weekend.sessions.find((s) => s.id === p1.id)!.status).toBe("COMPLETED");
    expect(weekend.sessions.find((s) => s.id === p2.id)!.status).toBe("AVAILABLE");
    await expect(simulatePracticeRemainder(practice, career.id, eventId, p1.id)).rejects.toMatchObject({ code: "INVALID_ACTION" });
    const next = await startPracticeSession(practice, career.id, eventId, p2.id);
    const driver = done.state!.input.entrants[0].driverId;
    const carried = next.state!.entrants[next.state!.input.entrants.findIndex((e) => e.driverId === driver)].preparation;
    expect(carried).toEqual(done.state!.entrants[0].preparation);
  });
  it("Simulate All Remaining Practice reaches the Qualifying placeholder; the view stays lossy", async () => {
    await simulatePracticeSession(practice, career.id, eventId, sessions[0].id);
    expect(await simulateRemainingPractice(practice, () => progression.getProgress(career.id), career.id, eventId)).toBe(2);
    const weekend = (await progression.getProgress(career.id))!.events.find((e) => e.id === eventId)!.weekend!;
    expect([...weekend.sessions].sort((a, b) => a.order - b.order).map((s) => s.status)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED", "AVAILABLE", "LOCKED"]);
    const text = JSON.stringify(practiceView((await practice.getPractice(career.id, eventId, sessions[2].id))!));
    for (const forbidden of ['"ideal"', '"timeline"', '"rngState"', '"seed"']) expect(text).not.toContain(forbidden);
  });
});

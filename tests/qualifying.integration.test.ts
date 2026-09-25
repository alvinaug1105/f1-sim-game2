import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createPrismaClient } from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
import { developmentContent as source } from "../src/data/seed/content-development";
import { PrismaCareerRepository } from "../src/data/repositories/prisma-career";
import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import { PrismaQualifyingRepository } from "../src/data/repositories/prisma-qualifying";
import { PrismaRaceRepository } from "../src/data/repositories/prisma-race";
import { createCareer } from "../src/features/career/create-career";
import { advanceToNextEvent, runSessionAction } from "../src/features/career/progression";
import {
  advanceQualifyingSession, continueQualifyingPhase, qualifyingCommand, simulateQualifyingRemainder, simulateQualifyingSession, startQualifyingSession,
} from "../src/features/qualifying/service";
import { qualifyingView } from "../src/features/qualifying/view-model";
import { startIncidentCareerRace } from "../src/features/race/service";
import type { Career } from "../src/game/domain/career";
const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error("TEST_DATABASE_URL required; SQL tests did not run.");
const schema = `qualifying_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(value);
url.searchParams.set("schema", schema);
const adminUrl = new URL(value);
adminUrl.searchParams.delete("schema");
const admin = new Pool({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
const client = createPrismaClient(url.toString());
const careers = new PrismaCareerRepository(client);
const qualifying = new PrismaQualifyingRepository(client);
const progression = new PrismaProgressionRepository(client);
const races = new PrismaRaceRepository(client);
const plan = { compound: "SOFT" as const, pushLaps: 1 };
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
/** A new Pass-A Career (Cadillac) with Practice done through the internal development transitions → Qualifying AVAILABLE. */
beforeEach(async () => {
  await seedDevelopmentContent(client);
  career = await createCareer(careers, { name: "Qualifying Career", gameDatabaseId: source.database.id, seasonId: source.seasons[0].id, playerTeamId: source.teams.find((t) => t.key === "team-cadillac")!.id });
  eventId = (await progression.getProgress(career.id))!.events[0].id;
  const entered = await advanceToNextEvent(progression, career.id, eventId);
  sessions = [...entered.events[0].weekend!.sessions].sort((a, b) => a.order - b.order);
  for (let i = 0; i < 3; i++) await runSessionAction(progression, career.id, eventId, sessions[i].id, "simulatePractice");
});
afterAll(async () => {
  try {
    await client.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await admin.end();
  }
});
const status = async (sessionId: string) => (await progression.getProgress(career.id))!.events.find((e) => e.id === eventId)!.weekend!.sessions.find((s) => s.id === sessionId)!.status;
describe("Qualifying persistence (PostgreSQL)", () => {
  it("starts, commands, advances and reloads the exact state; completes once and unlocks the Race", async () => {
    let d = await startQualifyingSession(qualifying, career.id, eventId);
    expect(d.state!.input.entrants).toHaveLength(22);
    const mine = d.state!.input.entrants.filter((e) => e.controller === "PLAYER");
    expect(mine).toHaveLength(2);
    d = await qualifyingCommand(qualifying, career.id, eventId, 0, { kind: "send", entrantId: mine[0].entrantId, revision: 0, plan });
    for (let i = 0; i < 12; i++) d = await advanceQualifyingSession(qualifying, career.id, eventId, d.state!.sessionElapsedMs);
    expect((await qualifying.getQualifying(career.id, eventId))!.state).toEqual(d.state);
    const done = await simulateQualifyingRemainder(qualifying, career.id, eventId, d.state!.sessionElapsedMs);
    expect(done.state!.status).toBe("FINISHED");
    expect((await qualifying.getQualifying(career.id, eventId))!.state).toEqual(done.state);
    expect(await status(sessions[3].id)).toBe("COMPLETED");
    expect(await status(sessions[4].id)).toBe("AVAILABLE");
    const view = qualifyingView(done);
    expect(view.entrants.map((e) => e.position)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    await expect(simulateQualifyingRemainder(qualifying, career.id, eventId)).rejects.toMatchObject({ code: "INVALID_ACTION" });
  });
  it("exactly one of concurrent duplicates wins: advance, send out, continue, simulate remainder", async () => {
    let d = await startQualifyingSession(qualifying, career.id, eventId);
    const twice = <T,>(work: () => Promise<T>) => Promise.allSettled([work(), work(), work()]);
    let results = await twice(() => advanceQualifyingSession(qualifying, career.id, eventId, 0));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    d = (await qualifying.getQualifying(career.id, eventId))!;
    const mine = d.state!.input.entrants.find((e) => e.controller === "PLAYER")!;
    results = await twice(() => qualifyingCommand(qualifying, career.id, eventId, d.state!.sessionElapsedMs, { kind: "send", entrantId: mine.entrantId, revision: 0, plan }));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // Run Q1 to its end manually (auto-management off) and Continue twice at once.
    d = (await qualifying.getQualifying(career.id, eventId))!;
    while (d.state!.phaseStatus !== "COMPLETE") d = await advanceQualifyingSession(qualifying, career.id, eventId, d.state!.sessionElapsedMs);
    const token = d.state!.sessionElapsedMs;
    results = await twice(() => continueQualifyingPhase(qualifying, career.id, eventId, token, "Q1"));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    d = (await qualifying.getQualifying(career.id, eventId))!;
    expect(d.state!.phase).toBe("Q2");
    results = await twice(() => simulateQualifyingRemainder(qualifying, career.id, eventId, d.state!.sessionElapsedMs));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await status(sessions[3].id)).toBe("COMPLETED");
  });
  it("the finished classification is the Race grid (all 22), frozen once the Race starts", async () => {
    const q = await simulateQualifyingSession(qualifying, career.id, eventId);
    const position = new Map(q.state!.input.entrants.map((e, i) => [e.driverId, q.state!.entrants[i].finalPosition!]));
    await startIncidentCareerRace(races, career.id, eventId, {});
    const race = (await races.getRace(career.id, eventId))!;
    expect(race.state!.input.entrants).toHaveLength(22);
    for (const e of race.state!.input.entrants) expect(e.gridPosition).toBe(position.get(e.driverId));
    expect(race.state!.entrants.find((e) => e.position === 1)!.entrantId).toBe(race.state!.input.entrants.find((e) => e.gridPosition === 1)!.entrantId);
    // Later changes to Qualifying data never move a started Race's grid.
    const sim = await client.careerQualifyingSimulation.findFirstOrThrow({ where: { careerId: career.id } });
    await client.careerQualifyingEntrant.updateMany({ where: { careerQualifyingSimulationId: sim.id }, data: { finalPosition: null } });
    const again = (await races.getRace(career.id, eventId))!;
    expect(again.state!.input.entrants.map((e) => [e.driverId, e.gridPosition])).toEqual(race.state!.input.entrants.map((e) => [e.driverId, e.gridPosition]));
  });
});
describe("legacy Qualifying placeholder states", () => {
  it("IN_PROGRESS without a simulation: concurrent opens bootstrap exactly one simulation from the start", async () => {
    await runSessionAction(progression, career.id, eventId, sessions[3].id, "start"); // the pre-Phase-14 placeholder
    const results = await Promise.allSettled([0, 1, 2].map(() => startQualifyingSession(qualifying, career.id, eventId)));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);           // idempotent: all return the one session
    expect(await client.careerQualifyingSimulation.count({ where: { careerId: career.id } })).toBe(1);
    const d = (await qualifying.getQualifying(career.id, eventId))!;
    expect(d.state!.sessionElapsedMs).toBe(0);
    expect(d.state!.entrants.every((e) => e.lapsCompleted === 0)).toBe(true);
    expect(await status(sessions[3].id)).toBe("IN_PROGRESS");
    const done = await simulateQualifyingRemainder(qualifying, career.id, eventId, 0);
    expect(done.state!.status).toBe("FINISHED");
    expect(await status(sessions[4].id)).toBe("AVAILABLE");
  });
  it("COMPLETED without a simulation keeps its history; the Race uses the legacy grid", async () => {
    await runSessionAction(progression, career.id, eventId, sessions[3].id, "start");
    await runSessionAction(progression, career.id, eventId, sessions[3].id, "completeDevelopment");
    expect(qualifyingView((await qualifying.getQualifying(career.id, eventId))!).status).toBe("LEGACY_COMPLETED");
    await expect(startQualifyingSession(qualifying, career.id, eventId)).rejects.toMatchObject({ code: "INVALID_ACTION" });
    const before = (await races.getRace(career.id, eventId))!;
    expect(before.grid).toBeNull();                                             // no real Qualifying result exists
    await startIncidentCareerRace(races, career.id, eventId, {});
    const race = (await races.getRace(career.id, eventId))!;
    expect(race.state!.input.entrants.map((e) => e.gridPosition)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(race.state!.input.entrants.map((e) => e.driverId)).toEqual(before.roster.map((r) => r.driverId)); // legacy roster order
    expect(await client.careerQualifyingSimulation.count({ where: { careerId: career.id } })).toBe(0);
  });
});

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createPrismaClient } from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
import { developmentContent as source } from "../src/data/seed/content-development";
import { PrismaCareerRepository } from "../src/data/repositories/prisma-career";
import { PrismaRaceRepository } from "../src/data/repositories/prisma-race";
import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import { createCareer } from "../src/features/career/create-career";
import { advanceToNextEvent, runSessionAction } from "../src/features/career/progression";
import { advanceCareerRace, startIncidentCareerRace } from "../src/features/race/service";
import { advanceRace, raceResult } from "../src/simulation/race/engine";
import { defaultAiStrategyConfiguration } from "../src/simulation/race/pits/ai-strategy";
import { circuitInteractionConfiguration, defaultInteractionConfiguration } from "../src/simulation/race/traffic/profiles";
import type { RaceSimulationState } from "../src/simulation/race/types";
import type { Career } from "../src/game/domain/career";
import { pitAndRetireNextLap, stintProblems } from "./helpers/race-dynamics";

const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error("TEST_DATABASE_URL required; SQL tests did not run.");
const schema = `race_dynamics_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(value);
url.searchParams.set("schema", schema);
const adminUrl = new URL(value);
adminUrl.searchParams.delete("schema");
const admin = new Pool({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
const client = createPrismaClient(url.toString());
const repository = new PrismaCareerRepository(client);
const races = new PrismaRaceRepository(client);
const progression = new PrismaProgressionRepository(client);
const input = { name: "Race Dynamics Career", gameDatabaseId: source.database.id, seasonId: source.seasons[0].id, playerTeamId: source.teams[0].id };
let created = false, career: Career, eventId: string;
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url.toString() }, timeout: 45000, stdio: "pipe" });
});
beforeEach(async () => {
  await seedDevelopmentContent(client);
  career = await createCareer(repository, input);
  const state = (await progression.getProgress(career.id))!;
  eventId = state.events[0].id;
  const entered = await advanceToNextEvent(progression, career.id, eventId);
  const sessions = entered.events[0].weekend!.sessions;
  for (let i = 0; i < 3; i++) await runSessionAction(progression, career.id, eventId, sessions[i].id, "simulatePractice");
  await runSessionAction(progression, career.id, eventId, sessions[3].id, "start");
  await runSessionAction(progression, career.id, eventId, sessions[3].id, "completeDevelopment");
});
afterAll(async () => {
  try {
    await client.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await admin.end();
  }
});
const get = async () => (await races.getRace(career.id, eventId))!;
async function start(seed = 42) { await startIncidentCareerRace(races, career.id, eventId, {}, seed); return (await get()).state!; }
async function edit(fn: (s: RaceSimulationState) => RaceSimulationState) { await races.changeRace(career.id, eventId, d => ({ state: fn(d.state!), labels: d.labels, progress: d.progress })); return (await get()).state!; }
const playerIndex = (s: RaceSimulationState, teamId: string) => s.input.entrants.findIndex(e => e.teamId === teamId);
/** What the pre-fix retirement produced: the just-opened post-stop stint closed at the same lap (startLap === endLap). */
function oldRetirementClosure(s: RaceSimulationState, id: string): RaceSimulationState {
  return { ...s, entrants: s.entrants.map(e => e.entrantId !== id ? e : { ...e, pit: { ...e.pit!, stints: e.pit!.stints.map(x => x.endLap === null ? { ...x, endLap: e.incident!.retiredLap, endingTyre: e.stint!.tyre } : x) } }) };
}

describe("A1 — pit service + same-lap retirement (real PostgreSQL)", () => {
  it("the old zero-length stint is rejected by SQL; the fixed domain persists, reloads, advances and finishes", async () => {
    const s0 = await start(), index = playerIndex(s0, career.playerTeamId), id = s0.input.entrants[index].entrantId;
    // The exact checkpoint that used to deadlock: player called in before lap 1 and certain to retire on lap 1.
    const stuck = await edit(s => pitAndRetireNextLap(s, index));
    expect(stuck.lap).toBe(0);
    const expected = advanceRace(stuck, 1);
    const retired = expected.entrants.find(e => e.entrantId === id)!;
    expect(retired.incident).toMatchObject({ status: "RETIRED", retiredLap: 1 });
    expect(retired.pit!.stops).toHaveLength(1);
    // Old behaviour reproduced: persisting startLap === endLap fails the Stint CHECK and rolls everything back.
    await expect(edit(() => oldRetirementClosure(expected, id))).rejects.toMatchObject({ code: "PERSISTENCE_FAILED" });
    expect((await get()).state).toEqual(stuck);
    // Fixed domain: the same checkpoint now advances.
    await advanceCareerRace(races, career.id, eventId, 0, 1);
    const reloaded = (await get()).state!;
    expect(reloaded).toEqual(expected);
    const e = reloaded.entrants.find(x => x.entrantId === id)!;
    expect(stintProblems(e.pit!.stints, e.pit!.stops)).toEqual([]);
    expect(e.pit!.stints.at(-1)).toMatchObject({ startLap: 1, endLap: null });
    const rows = await client.careerRaceStint.findMany({ where: { entrantId: id }, orderBy: { number: "asc" } });
    expect(rows.map(r => [r.startLap, r.endLap])).toEqual([[0, 1], [1, null]]);
    expect(await client.careerRacePitStop.count({ where: { entrantId: id } })).toBe(1);
    // Retry / advance never deadlocks; Finish completes the session; the result is valid and replays the engine.
    await expect(advanceCareerRace(races, career.id, eventId, 0, 1)).rejects.toMatchObject({ code: "STALE" });
    await advanceCareerRace(races, career.id, eventId, 1, 5);
    await advanceCareerRace(races, career.id, eventId, 6, "finish");
    const done = await get();
    expect(done.state).toEqual(advanceRace(stuck, 1000));
    expect(done.state!.status).toBe("FINISHED");
    expect(done.progress.events[0].weekend!.sessions.find(x => x.type === "RACE")!.status).toBe("COMPLETED");
    const result = raceResult(done.state!);
    expect(result.map(r => r.position)).toEqual(result.map((_, i) => i + 1));
    expect(result.at(-1)).toMatchObject({ entrantId: id, status: "RETIRED", completedLaps: 1 });
    for (const x of done.state!.entrants) expect(stintProblems(x.pit!.stints, x.pit!.stops), x.entrantId).toEqual([]);
    expect(await client.careerRaceStint.count({ where: { careerId: career.id, endLap: { not: null } } })).toBeGreaterThan(0);
    const zeroLength = await admin.query(`SELECT count(*)::int AS n FROM "${schema}"."CareerRaceStint" WHERE "endLap" IS NOT NULL AND "endLap" <= "startLap"`);
    expect(zeroLength.rows[0].n).toBe(0);
  });
  it("a later-lap pit + retirement (mid-race) also persists and the Race reaches the flag", async () => {
    await start(7);
    await advanceCareerRace(races, career.id, eventId, 0, 5);
    const index = playerIndex((await get()).state!, career.playerTeamId);
    const stuck = await edit(s => pitAndRetireNextLap(s, index, "SOFT"));
    await advanceCareerRace(races, career.id, eventId, 5, "finish");
    expect((await get()).state).toEqual(advanceRace(stuck, 1000));
  });
});

describe("circuit Race profile and AI strategy persistence (real PostgreSQL)", () => {
  it("snapshots the circuit profile into the Career and freezes it (and the AI strategy) into the Race", async () => {
    const circuits = await client.careerCircuit.findMany({ where: { careerId: career.id } });
    for (const c of circuits) {
      const src = source.circuits.find(x => x.id === c.sourceCircuitId)!;
      expect([c.overtakingDifficulty, c.dirtyAirSensitivityPermille, c.drsEffectivenessPermille]).toEqual([src.overtakingDifficulty, src.dirtyAirSensitivityPermille, src.drsEffectivenessPermille]);
    }
    const s = await start();
    const event = await client.careerCalendarEvent.findUniqueOrThrow({ where: { id: eventId }, include: { circuit: true } });
    const c = event.circuit;
    expect(s.input.interaction).toEqual(circuitInteractionConfiguration({ overtakingDifficulty: c.overtakingDifficulty!, dirtyAirSensitivityPermille: c.dirtyAirSensitivityPermille!, drsEffectivenessPermille: c.drsEffectivenessPermille! }));
    expect(s.input.pits!.strategy).toEqual(defaultAiStrategyConfiguration());
    // Editing Career (or source) circuit data later never changes a started Race.
    await client.careerCircuit.update({ where: { id: c.id }, data: { overtakingDifficulty: 0, dirtyAirSensitivityPermille: 0, drsEffectivenessPermille: 0 } });
    await client.circuit.updateMany({ data: { overtakingDifficulty: 99, dirtyAirSensitivityPermille: 99, drsEffectivenessPermille: 99 } });
    expect((await get()).state).toEqual(s);
    await advanceCareerRace(races, career.id, eventId, 0, "finish");
    expect((await get()).state).toEqual(advanceRace(s, 1000));
  });
  it("an older Career (NULL circuit profile) starts its Race with the neutral legacy interaction", async () => {
    await client.careerCircuit.updateMany({ where: { careerId: career.id }, data: { overtakingDifficulty: null, dirtyAirSensitivityPermille: null, drsEffectivenessPermille: null } });
    expect((await get()).circuit.raceProfile).toBeNull();
    expect((await start()).input.interaction).toEqual(defaultInteractionConfiguration());
  });
  it("a Race saved before this pass (NULL strategy) reads back without it and keeps the legacy AI policy", async () => {
    const s = await start();
    const sim = await client.careerRaceSimulation.findFirstOrThrow({ where: { careerId: career.id } });
    await admin.query(`UPDATE "${schema}"."CareerRacePitProfile" SET "strategy" = NULL WHERE "careerRaceSimulationId" = $1`, [sim.id]);
    const legacy = (await get()).state!;
    expect(legacy.input.pits!.strategy).toBeUndefined();
    expect("strategy" in legacy.input.pits!).toBe(false);
    const pits = { ...s.input.pits! };
    delete pits.strategy;
    expect(legacy).toEqual({ ...s, input: { ...s.input, pits } });
    await advanceCareerRace(races, career.id, eventId, 0, "finish");
    expect((await get()).state).toEqual(advanceRace(legacy, 1000));
  });
  it("SQL rejects a partial or out-of-range circuit profile and a non-object strategy", async () => {
    const c = await client.careerCircuit.findFirstOrThrow({ where: { careerId: career.id } });
    await expect(client.careerCircuit.update({ where: { id: c.id }, data: { drsEffectivenessPermille: null } })).rejects.toThrow();
    await expect(client.careerCircuit.update({ where: { id: c.id }, data: { overtakingDifficulty: 101 } })).rejects.toThrow();
    const src = await client.circuit.findFirstOrThrow();
    await expect(client.circuit.update({ where: { id: src.id }, data: { dirtyAirSensitivityPermille: null } })).rejects.toThrow();
    await start();
    const sim = await client.careerRaceSimulation.findFirstOrThrow({ where: { careerId: career.id } });
    await expect(admin.query(`UPDATE "${schema}"."CareerRacePitProfile" SET "strategy" = '[1]'::jsonb WHERE "careerRaceSimulationId" = $1`, [sim.id])).rejects.toThrow();
  });
});

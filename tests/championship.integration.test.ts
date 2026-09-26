import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaClient } from "../src/data/generated/prisma/client";
import { createPrismaClient } from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
import { developmentContent as source } from "../src/data/seed/content-development";
import { PrismaCareerRepository } from "../src/data/repositories/prisma-career";
import { PrismaRaceRepository } from "../src/data/repositories/prisma-race";
import { PrismaQualifyingRepository } from "../src/data/repositories/prisma-qualifying";
import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import { PrismaChampionshipRepository } from "../src/data/repositories/prisma-championship";
import { createCareer } from "../src/features/career/create-career";
import { advanceToNextEvent, runSessionAction } from "../src/features/career/progression";
import { isPractice, progressSummary, type SessionType } from "../src/game/domain/progression";
import { advanceCareerRace, simulateCareerRace, startIncidentCareerRace } from "../src/features/race/service";
import { simulateQualifyingSession } from "../src/features/qualifying/service";
import { championshipInput, championshipSummary, standingsPage, weekendResultsPage } from "../src/features/championship/model";
import { computeStandings, POINT_UNITS } from "../src/game/domain/championship";

const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error("TEST_DATABASE_URL required; SQL tests did not run.");
const schema = `championship_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(value);
url.searchParams.set("schema", schema);
const adminUrl = new URL(value);
adminUrl.searchParams.delete("schema");
const admin = new Pool({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
const client = createPrismaClient(url.toString());
const input = { name: "Championship Career", gameDatabaseId: source.database.id, seasonId: source.seasons[0].id, playerTeamId: source.teams[0].id };
let created = false;
const extraSchemas: string[] = [];
function deploy(target: URL) {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: target.toString() }, timeout: 60000, stdio: "pipe" });
}
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  deploy(url);
  await seedDevelopmentContent(client);
});
afterAll(async () => {
  try {
    await client.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    for (const s of extraSchemas) await admin.query(`DROP SCHEMA IF EXISTS "${s}" CASCADE`);
  } finally {
    await admin.end();
  }
});
/** The real services of one database: Practice simulated, (Sprint) Qualifying and Sprint/Race on their engines. */
function world(c: PrismaClient) {
  const progression = new PrismaProgressionRepository(c);
  const races = { RACE: new PrismaRaceRepository(c, "RACE"), SPRINT: new PrismaRaceRepository(c, "SPRINT") };
  const quals = { QUALIFYING: new PrismaQualifyingRepository(c, "QUALIFYING"), SPRINT_QUALIFYING: new PrismaQualifyingRepository(c, "SPRINT_QUALIFYING") };
  const championship = new PrismaChampionshipRepository(c);
  async function enter(careerId: string) {
    const next = progressSummary((await progression.getProgress(careerId))!).next!;
    await advanceToNextEvent(progression, careerId, next.id);
    return next.id;
  }
  /** Runs the active weekend's sessions in order, stopping before `until` (if given). */
  async function play(careerId: string, eventId: string, until?: SessionType) {
    const sessions = [...(await progression.getProgress(careerId))!.events.find((e) => e.id === eventId)!.weekend!.sessions].sort((a, b) => a.order - b.order);
    for (const s of sessions) {
      if (s.type === until) return;
      if (s.status === "COMPLETED" || s.status === "SKIPPED") continue;
      if (isPractice(s.type)) await runSessionAction(progression, careerId, eventId, s.id, "simulatePractice");
      else if (s.type === "QUALIFYING" || s.type === "SPRINT_QUALIFYING") await simulateQualifyingSession(quals[s.type], careerId, eventId);
      else await simulateCareerRace(races[s.type as "RACE" | "SPRINT"], careerId, eventId);
    }
  }
  /** Development completion (no simulations) — a completed weekend with no classification. */
  async function developmentWeekend(careerId: string, eventId: string) {
    const sessions = [...(await progression.getProgress(careerId))!.events.find((e) => e.id === eventId)!.weekend!.sessions].sort((a, b) => a.order - b.order);
    for (const s of sessions) {
      if (isPractice(s.type)) await runSessionAction(progression, careerId, eventId, s.id, "simulatePractice");
      else {
        await runSessionAction(progression, careerId, eventId, s.id, "start");
        await runSessionAction(progression, careerId, eventId, s.id, "completeDevelopment");
      }
    }
  }
  return { progression, races, quals, championship, enter, play, developmentWeekend };
}
const w = world(client);
const total = (rows: readonly { units: number }[]) => rows.reduce((a, r) => a + r.units, 0) / POINT_UNITS;
describe("Championship from persisted results", () => {
  it("a new Career freezes F1_2026; a completed Grand Prix scores immediately — 22 drivers, 11 teams, 101 points", async () => {
    const career = await createCareer(new PrismaCareerRepository(client), input);
    expect((await client.careerSeason.findFirstOrThrow({ where: { careerId: career.id } })).scoringRulesVersion).toBe("F1_2026");
    const empty = (await w.championship.load(career.id))!;
    expect(standingsPage(empty, null).through).toBeNull();
    const eventId = await w.enter(career.id);
    await w.play(career.id, eventId);
    const s = (await w.championship.load(career.id))!;
    expect(s.season.scoringRulesVersion).toBe("F1_2026");
    const ev = s.events.find((e) => e.id === eventId)!;
    expect(ev.race!.entrants).toHaveLength(22);
    expect(ev.qualifying).toHaveLength(22);
    expect(ev.sprint).toBeNull();
    const standings = computeStandings(championshipInput(s));
    expect(standings.drivers).toHaveLength(22);
    expect(standings.constructors).toHaveLength(11);
    expect(total(standings.drivers)).toBe(101);
    expect(total(standings.constructors)).toBe(101);
    const winner = ev.race!.entrants.find((e) => e.position === 1)!;
    expect(standings.drivers[0]).toMatchObject({ id: winner.driverId, units: 50, wins: 1, movement: null });
    // Each car scores for the team it was entered for in that Race.
    for (const t of standings.constructors) expect(t.units).toBe(standings.drivers.filter((d) => ev.race!.entrants.some((e) => e.driverId === d.id && e.teamId === t.id)).reduce((a, d) => a + d.units, 0));
    const results = weekendResultsPage(s, eventId)!;
    expect(results.race!.rows).toHaveLength(22);
    expect(results.sprint).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/seed|rngState|timeline|strategy|reliability/i);
  }, 120000);
  it("a Sprint weekend: the finished Sprint counts live, Sprint Qualifying never enters the countback, then the Grand Prix", async () => {
    const career = await createCareer(new PrismaCareerRepository(client), { ...input, name: "Sprint championship" });
    const first = await w.enter(career.id);
    await w.developmentWeekend(career.id, first); // Round 1 completed without a classification: scores nothing.
    const china = await w.enter(career.id);
    await w.play(career.id, china, "QUALIFYING");
    expect(await client.careerQualifyingSimulation.count({ where: { careerId: career.id, sessionType: "SPRINT_QUALIFYING", status: "FINISHED" } })).toBe(1);
    let s = (await w.championship.load(career.id))!;
    let ev = s.events.find((e) => e.id === china)!;
    expect(ev.format).toBe("SPRINT");
    expect(ev.sprint!.entrants).toHaveLength(22);
    expect(ev.race).toBeNull();
    expect(ev.qualifying).toBeNull(); // Sprint Qualifying is not Grand Prix Qualifying
    expect(s.events.find((e) => e.id === first)).toMatchObject({ race: null, sprint: null, qualifying: null });
    let standings = computeStandings(championshipInput(s));
    expect(standings.through).toEqual({ round: ev.round, stage: "SPRINT" });
    expect(total(standings.drivers)).toBe(36);
    expect(standings.drivers.every((d) => d.qualifyingCountback.length === 0 && d.raceCountback.length === 0)).toBe(true);
    expect(weekendResultsPage(s, china)).toMatchObject({ through: "SPRINT", race: null });
    await w.play(career.id, china);
    s = (await w.championship.load(career.id))!;
    ev = s.events.find((e) => e.id === china)!;
    standings = computeStandings(championshipInput(s));
    expect(standings.through).toEqual({ round: ev.round, stage: "RACE" });
    expect(total(standings.drivers)).toBe(137);
    expect(total(standings.constructors)).toBe(137);
    expect(ev.qualifying).toHaveLength(22);
    expect(standings.drivers.reduce((a, d) => a + d.qualifyingCountback.reduce((x, y) => x + y, 0), 0)).toBe(22);
    // The after-Sprint cutoff still reproduces the live Sprint-only table exactly.
    expect(total(computeStandings(championshipInput(s), { round: ev.round, stage: "SPRINT" }).drivers)).toBe(36);
  }, 180000);
  it("source edits never change an existing Career's rules or names", async () => {
    const career = await createCareer(new PrismaCareerRepository(client), { ...input, name: "Snapshot" });
    const before = (await w.championship.load(career.id))!;
    const team = source.teams[0];
    try {
      await client.season.update({ where: { id: source.seasons[0].id }, data: { scoringRulesVersion: null } });
      await client.team.update({ where: { id: team.id }, data: { name: "Renamed Source Team" } });
      const after = (await w.championship.load(career.id))!;
      expect(after).toEqual(before);
      expect(Object.values(after.teamLabels).map((t) => t.name)).not.toContain("Renamed Source Team");
      expect((await client.careerSeason.findFirstOrThrow({ where: { careerId: career.id } })).scoringRulesVersion).toBe("F1_2026");
    } finally {
      await seedDevelopmentContent(client);
    }
  });
  it("reads are bounded: the same number of SQL statements with no results and with a completed weekend", async () => {
    const counted = new URL(url.toString());
    const schemaName = counted.searchParams.get("schema")!;
    counted.searchParams.delete("schema");
    const logged = new PrismaClient({ adapter: new PrismaPg({ connectionString: counted.toString() }, { schema: schemaName }), log: [{ emit: "event", level: "query" }] });
    let statements = 0;
    const seen: string[] = [];
    logged.$on("query", (e) => { statements++; seen.push(e.query.slice(0, 90)); });
    try {
      const repo = new PrismaChampionshipRepository(logged);
      const fresh = await createCareer(new PrismaCareerRepository(client), { ...input, name: "Bounded" });
      statements = 0;
      await repo.load(fresh.id);
      const none = statements;
      const played = (await createCareer(new PrismaCareerRepository(client), { ...input, name: "Bounded, played" })).id;
      await w.play(played, await w.enter(played));
      statements = 0;
      seen.length = 0;
      const s = (await repo.load(played))!;
      expect(s.events.filter((e) => e.race || e.sprint).length).toBeGreaterThan(0);
      expect(statements).toBe(none);
      if (process.env.SHOW_SQL) console.info(`[bounded] ${statements} statements\n${seen.join("\n")}`);
      expect(statements).toBeLessThanOrEqual(20);
    } finally {
      await logged.$disconnect();
    }
  }, 60000);
});
describe("Placeholder completion is not a result (B2)", () => {
  it("all 8 Race sessions COMPLETED by development scaffolding: zero points, not season complete, no champion", async () => {
    const career = await createCareer(new PrismaCareerRepository(client), { ...input, name: "Placeholders" });
    for (let round = 1; round <= 8; round++) await w.developmentWeekend(career.id, await w.enter(career.id));
    const progress = (await w.progression.getProgress(career.id))!;
    expect(progress.events.every((e) => e.status === "COMPLETED" && e.weekend!.sessions.some((x) => x.type === "RACE" && x.status === "COMPLETED"))).toBe(true);
    const s = (await w.championship.load(career.id))!;
    expect(s.events.every((e) => e.race === null && e.sprint === null)).toBe(true);
    const page = standingsPage(s, null);
    expect(page.seasonComplete).toBe(false);
    expect(page.champions).toBeNull();
    expect(page.history).toEqual([]);
    expect(page.through).toBeNull();
    expect(page.drivers.every((d) => d.units === 0)).toBe(true);
    expect(championshipSummary(s).seasonComplete).toBe(false);
  }, 120000);
  it("mixed: rounds 1–2 real, 3–8 placeholders → real points stand, no champion", async () => {
    const career = await createCareer(new PrismaCareerRepository(client), { ...input, name: "Mixed" });
    for (let round = 1; round <= 8; round++) {
      const eventId = await w.enter(career.id);
      if (round <= 2) await w.play(career.id, eventId);
      else await w.developmentWeekend(career.id, eventId);
    }
    const s = (await w.championship.load(career.id))!;
    const page = standingsPage(s, null);
    expect(total(page.drivers)).toBe(2 * 101 + 36);
    expect(total(page.constructors)).toBe(2 * 101 + 36);
    expect(page.seasonComplete).toBe(false);
    expect(page.champions).toBeNull();
    expect(page.history.map((h) => h.round)).toEqual([1, 2]);
    expect(page.through).toMatchObject({ round: 2, stage: "RACE" });
    // Cutoffs still stop exactly where asked.
    expect(total(computeStandings(championshipInput(s), { round: 2, stage: "BEFORE" }).drivers)).toBe(101);
    expect(total(computeStandings(championshipInput(s), { round: 2, stage: "SPRINT" }).drivers)).toBe(137);
    expect(total(computeStandings(championshipInput(s), { round: 2, stage: "RACE" }).drivers)).toBe(238);
  }, 180000);
});
describe("Full development season sanity (8 rounds, 3 Sprints)", () => {
  it("8 Grands Prix + 3 Sprints: 22 WDC, 11 WCC, conserved points, a champion only at the end, deterministic", async () => {
    const career = await createCareer(new PrismaCareerRepository(client), { ...input, name: "Full season" });
    const leaders: string[] = [];
    for (let round = 1; round <= 8; round++) {
      const eventId = await w.enter(career.id);
      if (round === 8) {
        // The last round (a Sprint weekend): Sprint Qualifying, Sprint and Qualifying done, no Grand Prix yet.
        await w.play(career.id, eventId, "RACE");
        const pending = (await w.championship.load(career.id))!;
        expect(pending.events.find((e) => e.id === eventId)).toMatchObject({ format: "SPRINT", race: null });
        expect(pending.events.find((e) => e.id === eventId)!.sprint).not.toBeNull();
        const page = standingsPage(pending, null);
        expect(page.seasonComplete).toBe(false);
        expect(page.champions).toBeNull();
        expect(championshipSummary(pending).seasonComplete).toBe(false);
      }
      await w.play(career.id, eventId);
      const s = (await w.championship.load(career.id))!;
      const page = standingsPage(s, null);
      leaders.push(page.drivers[0].driver.abbreviation);
      expect(page.seasonComplete).toBe(round === 8);
      expect(page.champions === null).toBe(round < 8);
    }
    const s = (await w.championship.load(career.id))!;
    expect(s.events.filter((e) => e.race)).toHaveLength(8);
    expect(s.events.filter((e) => e.sprint)).toHaveLength(3);
    expect(s.events.filter((e) => e.format === "SPRINT").map((e) => e.round)).toEqual(s.events.filter((e) => e.sprint).map((e) => e.round));
    const input8 = championshipInput(s), standings = computeStandings(input8);
    expect(standings.drivers).toHaveLength(22);
    expect(standings.constructors).toHaveLength(11);
    expect(total(standings.drivers)).toBe(8 * 101 + 3 * 36);
    expect(total(standings.constructors)).toBe(8 * 101 + 3 * 36);
    for (const d of standings.drivers) expect(d.units).toBe(d.rounds.reduce((a, r) => a + (r.sprint?.units ?? 0) + (r.race?.units ?? 0), 0));
    // Every real v7 Grand Prix is full distance with ≥ 2 green laps (eligible for full points); green laps are
    // the leader's laps minus the Safety Car / VSC laps in its persisted Race control log.
    for (const e of s.events) {
      expect(e.race!.leaderGreenLaps).toBeGreaterThanOrEqual(2);
      expect(e.race!.leaderGreenLaps).toBeLessThanOrEqual(e.race!.scheduledLaps);
    }
    const champions = standingsPage(s, null).champions!;
    expect(champions.drivers.map((d) => d.id)).toEqual(standings.drivers.filter((r) => r.position === 1).map((r) => r.id));
    expect(champions.constructors.map((t) => t.id)).toEqual(standings.constructors.filter((r) => r.position === 1).map((r) => r.id));
    console.info(`[season sanity] green laps by round: ${s.events.map((e) => `${e.race!.leaderGreenLaps}/${e.race!.scheduledLaps}`).join(" ")}`);
    expect(standings.drivers.reduce((a, d) => a + d.wins, 0)).toBe(8);
    for (let i = 1; i < standings.drivers.length; i++) expect(standings.drivers[i - 1].units).toBeGreaterThanOrEqual(standings.drivers[i].units);
    const page = standingsPage(s, null);
    expect(page.champions!.drivers.length).toBeGreaterThanOrEqual(1);
    expect(page.champions!.constructors.length).toBeGreaterThanOrEqual(1);
    expect(page.history).toHaveLength(8);
    expect(page.cutoffs).toHaveLength(11);
    // Deterministic: a fresh read derives the identical tables; every cutoff is reproducible.
    const again = (await w.championship.load(career.id))!;
    expect(standingsPage(again, null)).toEqual(page);
    for (const c of page.cutoffs) expect(computeStandings(championshipInput(again), { round: c.round, stage: c.stage })).toEqual(computeStandings(input8, { round: c.round, stage: c.stage }));
    const summary = championshipSummary(s);
    expect(summary.seasonComplete).toBe(true);
    expect(summary.playerDrivers).toHaveLength(2);
    console.info(`[season sanity] leaders by round: ${leaders.join(" ")}; champion ${page.champions!.drivers.map((d) => d.abbreviation).join("/")} ${page.drivers[0].units / 2} pts; constructors ${page.champions!.constructors.map((t) => t.name).join("/")} ${page.constructors[0].units / 2} pts; P22 ${page.drivers[21].units / 2} pts`);
  }, 600000);
});
describe("Phase 16 migration — forward from a pre-Phase-16 database", () => {
  it("preserves every row; old Careers (none / Race / Sprint + Race / active weekend / legacy 4-car) derive standings immediately", async () => {
    const full = `full16_${randomUUID().replaceAll("-", "")}`;
    extraSchemas.push(full);
    await admin.query(`CREATE SCHEMA "${full}"`);
    const fullUrl = new URL(value!);
    fullUrl.searchParams.set("schema", full);
    deploy(fullUrl);
    const fullClient = createPrismaClient(fullUrl.toString());
    const f = world(fullClient);
    const ids: Record<string, string> = {};
    let activeEvent = "";
    const expected: Record<string, unknown> = {};
    try {
      await seedDevelopmentContent(fullClient);
      const careers = new PrismaCareerRepository(fullClient);
      ids.none = (await createCareer(careers, { ...input, name: "No results" })).id;
      ids.race = (await createCareer(careers, { ...input, name: "One Race" })).id;
      await f.play(ids.race, await f.enter(ids.race));
      ids.sprint = (await createCareer(careers, { ...input, name: "Sprint and Race" })).id;
      await f.developmentWeekend(ids.sprint, await f.enter(ids.sprint));
      await f.play(ids.sprint, await f.enter(ids.sprint));
      ids.active = (await createCareer(careers, { ...input, name: "Active weekend" })).id;
      activeEvent = await f.enter(ids.active);
      await f.play(ids.active, activeEvent, "RACE");
      await startIncidentCareerRace(f.races.RACE, ids.active, activeEvent, {}, 16);
      await advanceCareerRace(f.races.RACE, ids.active, activeEvent, 0, 5);
      // Legacy 4-car Career: the pre-Pass-A world of two teams and four drivers, no balance or format snapshots.
      ids.legacy = (await createCareer(careers, { ...input, name: "Legacy four cars" })).id;
      const keep = (await fullClient.careerSeasonTeamEntry.findMany({ where: { careerId: ids.legacy }, orderBy: { entryOrder: "asc" } })).slice(0, 2);
      const keepTeams = keep.map((t) => t.careerTeamId);
      const dropEntries = { careerId: ids.legacy, careerSeasonTeamEntryId: { notIn: keep.map((t) => t.id) } };
      const dropDrivers = (await fullClient.careerSeasonDriverEntry.findMany({ where: dropEntries })).map((d) => d.careerDriverId);
      await fullClient.careerSeasonDriverEntry.deleteMany({ where: dropEntries });
      await fullClient.careerSeasonTeamEntry.deleteMany({ where: { careerId: ids.legacy, careerTeamId: { notIn: keepTeams } } });
      await fullClient.careerDriver.deleteMany({ where: { careerId: ids.legacy, id: { in: dropDrivers } } });
      await fullClient.careerTeam.deleteMany({ where: { careerId: ids.legacy, id: { notIn: keepTeams } } });
      await fullClient.careerSeasonTeamEntry.updateMany({ where: { careerId: ids.legacy }, data: { carPerformance: null } });
      await fullClient.careerSeasonDriverEntry.updateMany({ where: { careerId: ids.legacy }, data: { pace: null, consistency: null } });
      await fullClient.careerCalendarEvent.updateMany({ where: { careerId: ids.legacy }, data: { weekendFormat: null } });
      await f.play(ids.legacy, await f.enter(ids.legacy));
      // An old Career whose whole calendar was completed by development scaffolding (no simulations at all).
      ids.placeholder = (await createCareer(careers, { ...input, name: "Old placeholders" })).id;
      for (let round = 1; round <= 8; round++) await f.developmentWeekend(ids.placeholder, await f.enter(ids.placeholder));
      for (const [k, id] of Object.entries(ids)) expected[k] = standingsPage((await f.championship.load(id))!, null);
    } finally {
      await fullClient.$disconnect();
    }
    expect((expected.none as ReturnType<typeof standingsPage>).through).toBeNull();
    expect((expected.legacy as ReturnType<typeof standingsPage>).drivers).toHaveLength(4);
    expect((expected.legacy as ReturnType<typeof standingsPage>).constructors).toHaveLength(2);
    expect(total((expected.legacy as ReturnType<typeof standingsPage>).drivers)).toBe(25 + 18 + 15 + 12);
    expect(total((expected.sprint as ReturnType<typeof standingsPage>).drivers)).toBe(137);
    expect(expected.placeholder).toMatchObject({ seasonComplete: false, champions: null, through: null, history: [] });
    // A pre-Phase-16 schema: every earlier migration applied as SQL, then the rows copied into it.
    const old = `pre16_${randomUUID().replaceAll("-", "")}`;
    extraSchemas.push(old);
    const migrations = readdirSync("prisma/migrations").filter((d) => /^\d/.test(d)).sort();
    const phase16 = migrations.find((d) => d.endsWith("_championship"))!;
    const conn = await admin.connect();
    try {
      await conn.query(`CREATE SCHEMA "${old}"`);
      await conn.query(`SET search_path TO "${old}"`);
      for (const m of migrations.filter((d) => d < phase16)) await conn.query(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
      await conn.query(`CREATE TABLE "${old}"."_prisma_migrations" (LIKE "${full}"."_prisma_migrations" INCLUDING ALL)`);
      await conn.query(`INSERT INTO "${old}"."_prisma_migrations" SELECT * FROM "${full}"."_prisma_migrations" WHERE migration_name <> $1`, [phase16]);
      const tables = (await conn.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`, [old])).rows.map((r) => r.table_name as string);
      const edges = (await conn.query(`SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.contype = 'f' AND NOT c.condeferrable`, [old])).rows as { child: string; parent: string }[];
      const name = (qualified: string) => qualified.replace(/^.*\./, "").replaceAll('"', "");
      const ordered: string[] = [];
      const visit = (t: string, seen = new Set<string>()) => {
        if (ordered.includes(t) || seen.has(t)) return;
        seen.add(t);
        for (const e of edges.filter((x) => name(x.child) === t && name(x.parent) !== t)) visit(name(e.parent), seen);
        ordered.push(t);
      };
      for (const t of tables) visit(t);
      await conn.query("BEGIN");
      await conn.query("SET CONSTRAINTS ALL DEFERRED");
      for (const t of ordered) {
        const columns = (await conn.query(`SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [old, t])).rows as { column_name: string; data_type: string; udt_name: string }[];
        const list = columns.map((c) => `"${c.column_name}"`).join(", ");
        const exprs = columns.map((c) => (c.data_type === "USER-DEFINED" ? `"${c.column_name}"::text::"${old}"."${c.udt_name}"` : `"${c.column_name}"`)).join(", ");
        await conn.query(`INSERT INTO "${old}"."${t}" (${list}) SELECT ${exprs} FROM "${full}"."${t}"`);
      }
      await conn.query("COMMIT");
      expect((await conn.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = $1 AND column_name = 'scoringRulesVersion'`, [old])).rows[0].n).toBe(0);
      const hash = async () => {
        const out: Record<string, string> = {};
        for (const t of ordered) out[t] = (await conn.query(`SELECT count(*)::text || ':' || coalesce(md5(string_agg(j::text, ',' ORDER BY j::text)), '') AS h FROM (SELECT to_jsonb(t) - 'scoringRulesVersion' AS j FROM "${old}"."${t}" t) x`)).rows[0].h;
        return out;
      };
      const before = await hash();
      const oldUrl = new URL(value!);
      oldUrl.searchParams.set("schema", old);
      deploy(oldUrl);
      expect(await hash()).toEqual(before);
      for (const table of ["Season", "CareerSeason"]) expect((await conn.query(`SELECT count(*)::int AS n FROM "${old}"."${table}" WHERE "scoringRulesVersion" IS NOT NULL`)).rows[0].n).toBe(0);
      const oldClient = createPrismaClient(oldUrl.toString());
      try {
        const o = world(oldClient);
        // Derived immediately from the existing results, with no backfill: NULL rules = F1_2026.
        for (const [k, id] of Object.entries(ids)) {
          const loaded = (await o.championship.load(id))!;
          expect(loaded.season.scoringRulesVersion).toBe("F1_2026");
          expect(standingsPage(loaded, null)).toEqual(expected[k]);
        }
        expect(await oldClient.careerSeason.count({ where: { scoringRulesVersion: { not: null } } })).toBe(0);
        // The active weekend continues: its Grand Prix finishes and scores.
        let live = (await o.championship.load(ids.active))!;
        expect(live.events.find((e) => e.id === activeEvent)!.race).toBeNull();
        await advanceCareerRace(o.races.RACE, ids.active, activeEvent, 5, "finish");
        live = (await o.championship.load(ids.active))!;
        expect(live.events.find((e) => e.id === activeEvent)!.race!.entrants).toHaveLength(22);
        expect(total(computeStandings(championshipInput(live)).drivers)).toBe(101);
      } finally {
        await oldClient.$disconnect();
      }
    } finally {
      conn.release();
    }
  }, 600000);
});

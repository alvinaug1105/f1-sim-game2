import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createPrismaClient } from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
import { developmentContent as source } from "../src/data/seed/content-development";
import { PrismaCareerRepository } from "../src/data/repositories/prisma-career";
import { PrismaRaceRepository } from "../src/data/repositories/prisma-race";
import { PrismaQualifyingRepository } from "../src/data/repositories/prisma-qualifying";
import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import { createCareer } from "../src/features/career/create-career";
import { advanceToNextEvent, runSessionAction } from "../src/features/career/progression";
import { isPractice, progressSummary } from "../src/game/domain/progression";
import { advanceCareerRace, autoManagePlayerCars, simulateCareerRace, simulateCareerRaceRemainder, startIncidentCareerRace } from "../src/features/race/service";
import { simulateQualifyingSession } from "../src/features/qualifying/service";
import { sprintLapCount } from "../src/features/race/development-profiles";
import { advanceRace, raceResult } from "../src/simulation/race/engine";
import type { RaceSimulationState } from "../src/simulation/race/types";
import type { Career } from "../src/game/domain/career";
import { pitAndRetireNextLap, stintProblems } from "./helpers/race-dynamics";

const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error("TEST_DATABASE_URL required; SQL tests did not run.");
const schema = `sprint_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(value);
url.searchParams.set("schema", schema);
const adminUrl = new URL(value);
adminUrl.searchParams.delete("schema");
const admin = new Pool({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
const client = createPrismaClient(url.toString());
const careers = new PrismaCareerRepository(client);
const progression = new PrismaProgressionRepository(client);
const races = { RACE: new PrismaRaceRepository(client, "RACE"), SPRINT: new PrismaRaceRepository(client, "SPRINT") };
const quals = { QUALIFYING: new PrismaQualifyingRepository(client, "QUALIFYING"), SPRINT_QUALIFYING: new PrismaQualifyingRepository(client, "SPRINT_QUALIFYING") };
const input = { name: "Sprint Career", gameDatabaseId: source.database.id, seasonId: source.seasons[0].id, playerTeamId: source.teams[0].id };
let created = false, career: Career;
const extraSchemas: string[] = [];
function deploy(target: URL) {
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: target.toString() }, timeout: 60000, stdio: "pipe" });
}
beforeAll(async () => {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    deploy(url);
});
beforeEach(async () => {
    await seedDevelopmentContent(client);
    career = await createCareer(careers, input);
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
/** Development transitions through the whole current weekend (no simulations), then enter the next event. */
async function completeWeekendAndEnterNext(careerId: string) {
    const p = (await progression.getProgress(careerId))!, event = progressSummary(p).active!;
    for (const s of [...event.weekend!.sessions].sort((a, b) => a.order - b.order)) {
        if (isPractice(s.type)) await runSessionAction(progression, careerId, event.id, s.id, "simulatePractice");
        else { await runSessionAction(progression, careerId, event.id, s.id, "start"); await runSessionAction(progression, careerId, event.id, s.id, "completeDevelopment"); }
    }
    const next = progressSummary((await progression.getProgress(careerId))!).next!;
    await advanceToNextEvent(progression, careerId, next.id);
    return next.id;
}
async function enterFirst(careerId: string) {
    const first = progressSummary((await progression.getProgress(careerId))!).next!;
    await advanceToNextEvent(progression, careerId, first.id);
    return first.id;
}
const sessionsOf = async (careerId: string, eventId: string) => [...(await progression.getProgress(careerId))!.events.find(e => e.id === eventId)!.weekend!.sessions].sort((a, b) => a.order - b.order);
const orderOfQualifying = (d: Awaited<ReturnType<typeof quals.QUALIFYING.getQualifying>>) => [...d!.state!.entrants.map((e, i) => ({ driverId: d!.state!.input.entrants[i].driverId, p: e.finalPosition! }))].sort((a, b) => a.p - b.p).map(x => x.driverId);
const gridOf = (s: RaceSimulationState) => [...s.input.entrants].sort((a, b) => a.gridPosition - b.gridPosition).map(e => e.driverId);
const resultOrder = (s: RaceSimulationState) => raceResult(s).map(r => r.driverId);

describe("Phase 15 — weekend format snapshot (real PostgreSQL)", () => {
    it("a new Career snapshots all 8 formats; later source edits never change it; a later Career sees the edit", async () => {
        const events = await client.careerCalendarEvent.findMany({ where: { careerId: career.id }, orderBy: { round: "asc" } });
        expect(events.map(e => [e.name, e.weekendFormat])).toEqual(source.events.slice().sort((a, b) => a.round - b.round).map(e => [e.name, e.weekendFormat]));
        expect(events.filter(e => e.weekendFormat === "SPRINT").map(e => e.name)).toEqual(["Chinese Grand Prix", "British Grand Prix", "Singapore Grand Prix"]);
        await client.calendarEvent.updateMany({ data: { weekendFormat: "STANDARD" } });
        expect((await client.careerCalendarEvent.findMany({ where: { careerId: career.id }, orderBy: { round: "asc" } })).map(e => e.weekendFormat)).toEqual(events.map(e => e.weekendFormat));
        const later = await createCareer(careers, input);
        expect((await client.careerCalendarEvent.findMany({ where: { careerId: later.id } })).every(e => e.weekendFormat === "STANDARD")).toBe(true);
    });
    it("round 1 is a Standard weekend (P1 → P2 → P3 → Q → Race) with no Sprint sessions or Sprint simulations reachable", async () => {
        const eventId = await enterFirst(career.id);
        expect((await sessionsOf(career.id, eventId)).map(s => s.type)).toEqual(["PRACTICE_1", "PRACTICE_2", "PRACTICE_3", "QUALIFYING", "RACE"]);
        expect(await races.SPRINT.getRace(career.id, eventId)).toBeNull();
        expect(await quals.SPRINT_QUALIFYING.getQualifying(career.id, eventId)).toBeNull();
        expect((await races.RACE.getRace(career.id, eventId))!.kind).toBe("RACE");
    });
});

describe("Phase 15 — a complete Sprint weekend (real PostgreSQL)", () => {
    it("P1 → SQ (Sprint grid) → Sprint (frozen grid, Simulate Remainder) → Q (Race grid) → Race; four independent simulations", async () => {
        await enterFirst(career.id);
        const eventId = await completeWeekendAndEnterNext(career.id);
        let sessions = await sessionsOf(career.id, eventId);
        expect(sessions.map(s => [s.type, s.status])).toEqual([["PRACTICE_1", "AVAILABLE"], ["SPRINT_QUALIFYING", "LOCKED"], ["SPRINT", "LOCKED"], ["QUALIFYING", "LOCKED"], ["RACE", "LOCKED"]]);
        await runSessionAction(progression, career.id, eventId, sessions[0].id, "simulatePractice");
        // Sprint Qualifying → Sprint grid.
        const sq = await simulateQualifyingSession(quals.SPRINT_QUALIFYING, career.id, eventId);
        expect(sq.kind).toBe("SPRINT_QUALIFYING");
        expect(sq.state!.input.format.phases.map(p => [p.eligible, p.durationMs])).toEqual([[22, 720_000], [16, 600_000], [10, 480_000]]);
        const sqOrder = orderOfQualifying(sq);
        expect(sqOrder).toHaveLength(22);
        sessions = await sessionsOf(career.id, eventId);
        expect(sessions.map(s => s.status)).toEqual(["COMPLETED", "COMPLETED", "AVAILABLE", "LOCKED", "LOCKED"]);
        // Sprint: grid = Sprint Qualifying P1–P22; Sprint distance and fuel.
        await startIncidentCareerRace(races.SPRINT, career.id, eventId, {}, 17);
        const started = (await races.SPRINT.getRace(career.id, eventId))!;
        const circuit = await client.careerCircuit.findFirstOrThrow({ where: { careerId: career.id, events: { some: { id: eventId } } } });
        expect(started.kind).toBe("SPRINT");
        expect(gridOf(started.state!)).toEqual(sqOrder);
        expect(started.state!.input.totalLaps).toBe(sprintLapCount(circuit.lengthMeters));
        expect(started.state!.simulationVersion).toBe(7);
        // Editing the finished Sprint Qualifying afterwards cannot move an already started Sprint grid.
        const sqRow = await client.careerQualifyingSimulation.findFirstOrThrow({ where: { careerId: career.id, sessionType: "SPRINT_QUALIFYING" }, include: { entrants: true } });
        const [a, b] = [sqRow.entrants.find(e => e.finalPosition === 1)!, sqRow.entrants.find(e => e.finalPosition === 2)!];
        await client.careerQualifyingEntrant.update({ where: { id: a.id }, data: { finalPosition: 99 } });
        await client.careerQualifyingEntrant.update({ where: { id: b.id }, data: { finalPosition: 1 } });
        await client.careerQualifyingEntrant.update({ where: { id: a.id }, data: { finalPosition: 2 } });
        expect(gridOf((await races.SPRINT.getRace(career.id, eventId))!.state!)).toEqual(sqOrder);
        // Manual laps, then Simulate Remainder = offline replay of the exact saved state with auto-managed player cars.
        await advanceCareerRace(races.SPRINT, career.id, eventId, 0, 5);
        const saved = structuredClone((await races.SPRINT.getRace(career.id, eventId))!.state!);
        await simulateCareerRaceRemainder(races.SPRINT, career.id, eventId, 5);
        const sprintDone = (await races.SPRINT.getRace(career.id, eventId))!.state!;
        expect(sprintDone).toEqual(advanceRace(autoManagePlayerCars(saved), saved.input.totalLaps));
        expect(sprintDone.input.entrants.every(e => e.strategyController === "DEVELOPMENT_AI")).toBe(true);
        sessions = await sessionsOf(career.id, eventId);
        expect(sessions.map(s => s.status)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED", "AVAILABLE", "LOCKED"]);
        // Grand Prix Qualifying starts clean at Q1 (own seed/weather), unaffected by the Sprint.
        const q = await simulateQualifyingSession(quals.QUALIFYING, career.id, eventId);
        expect(q.kind).toBe("QUALIFYING");
        expect(q.sessionId).not.toBe(sq.sessionId);
        expect(q.state!.input.seed).not.toBe(sq.state!.input.seed);
        expect(q.state!.input.format.phases.map(p => p.durationMs)).toEqual([1_080_000, 900_000, 780_000]);
        const qOrder = orderOfQualifying(q);
        // Grand Prix: grid = Grand Prix Qualifying (all 22), never the Sprint result or the Sprint Qualifying order.
        await startIncidentCareerRace(races.RACE, career.id, eventId, {}, 23);
        const gp = (await races.RACE.getRace(career.id, eventId))!;
        expect(gp.kind).toBe("RACE");
        expect(gridOf(gp.state!)).toEqual(qOrder);
        expect(gridOf(gp.state!)).not.toEqual(resultOrder(sprintDone));
        expect(gridOf(gp.state!)).not.toEqual(sqOrder);
        expect(gp.state!.input.totalLaps).toBe(circuit.defaultLapCount);
        expect(gp.state!.input.initialFuelKg).toBeGreaterThan(sprintDone.input.initialFuelKg * 2);
        expect(gp.state!.input.entrants.filter(e => e.teamId === career.playerTeamId).every(e => e.strategyController === "PLAYER")).toBe(true);
        // Coexistence: exactly one simulation per session; each reloads independently; nothing overwritten.
        const qRows = await client.careerQualifyingSimulation.findMany({ where: { careerId: career.id }, select: { sessionType: true, careerSessionId: true } });
        const rRows = await client.careerRaceSimulation.findMany({ where: { careerId: career.id }, select: { sessionType: true, careerSessionId: true } });
        expect(qRows.map(r => r.sessionType).sort()).toEqual(["QUALIFYING", "SPRINT_QUALIFYING"]);
        expect(rRows.map(r => r.sessionType).sort()).toEqual(["RACE", "SPRINT"]);
        expect(new Set([...qRows, ...rRows].map(r => r.careerSessionId)).size).toBe(4);
        await advanceCareerRace(races.RACE, career.id, eventId, 0, "finish");
        expect((await races.SPRINT.getRace(career.id, eventId))!.state).toEqual(sprintDone);
        expect((await quals.SPRINT_QUALIFYING.getQualifying(career.id, eventId))!.state!.status).toBe("FINISHED");
        expect((await quals.QUALIFYING.getQualifying(career.id, eventId))!.state).toEqual(q.state);
        const final = (await progression.getProgress(career.id))!.events.find(e => e.id === eventId)!;
        expect(final.weekend!.status).toBe("COMPLETED");
    }, 60000);
    it("Simulate Sprint persists a real, fully auto-managed v7 result; A1 (pit + same-lap retirement) persists in a Sprint", async () => {
        await enterFirst(career.id);
        const eventId = await completeWeekendAndEnterNext(career.id);
        const sessions = await sessionsOf(career.id, eventId);
        await runSessionAction(progression, career.id, eventId, sessions[0].id, "simulatePractice");
        await simulateQualifyingSession(quals.SPRINT_QUALIFYING, career.id, eventId);
        // A1 inside the Sprint first (fresh start), on disposable state: the player's car pits and retires on lap 1.
        await startIncidentCareerRace(races.SPRINT, career.id, eventId, {}, 31);
        const s0 = (await races.SPRINT.getRace(career.id, eventId))!.state!, index = s0.input.entrants.findIndex(e => e.teamId === career.playerTeamId);
        await races.SPRINT.changeRace(career.id, eventId, d => ({ state: pitAndRetireNextLap(d.state!, index), labels: d.labels, progress: d.progress }));
        await advanceCareerRace(races.SPRINT, career.id, eventId, 0, 1);
        const after = (await races.SPRINT.getRace(career.id, eventId))!.state!, e = after.entrants.find(x => x.entrantId === s0.input.entrants[index].entrantId)!;
        expect(e.incident!.status).toBe("RETIRED");
        expect(stintProblems(e.pit!.stints, e.pit!.stops)).toEqual([]);
        await advanceCareerRace(races.SPRINT, career.id, eventId, 1, "finish");
        expect((await races.SPRINT.getRace(career.id, eventId))!.state!.status).toBe("FINISHED");
        // The retired driver still takes part in Grand Prix Qualifying and the Race.
        const q = await simulateQualifyingSession(quals.QUALIFYING, career.id, eventId);
        expect(q.state!.input.entrants.map(x => x.driverId)).toContain(s0.input.entrants[index].driverId);
    }, 60000);
    it("Simulate Sprint (clean start): both player cars auto-managed, session completed, result persisted", async () => {
        await enterFirst(career.id);
        const eventId = await completeWeekendAndEnterNext(career.id);
        const sessions = await sessionsOf(career.id, eventId);
        await runSessionAction(progression, career.id, eventId, sessions[0].id, "simulatePractice");
        await simulateQualifyingSession(quals.SPRINT_QUALIFYING, career.id, eventId);
        await simulateCareerRace(races.SPRINT, career.id, eventId, 44);
        const d = (await races.SPRINT.getRace(career.id, eventId))!;
        expect(d.state!.status).toBe("FINISHED");
        expect(d.state!.input.entrants.every(x => x.strategyController === "DEVELOPMENT_AI")).toBe(true);
        expect(raceResult(d.state!)).toHaveLength(22);
        expect((await sessionsOf(career.id, eventId)).map(s => s.status)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED", "AVAILABLE", "LOCKED"]);
    }, 60000);
});

describe("Phase 15 migration — forward from a pre-Phase-15 database with an active old Career", () => {
    it("preserves every existing row; the old Career continues exactly and stays STANDARD", async () => {
        // 1. A dedicated database holding only an old Career: no snapshotted format, active standard weekend, completed
        //    real Qualifying, and a Race under way.
        const full = `full15_${randomUUID().replaceAll("-", "")}`;
        extraSchemas.push(full);
        await admin.query(`CREATE SCHEMA "${full}"`);
        const fullUrl = new URL(value!); fullUrl.searchParams.set("schema", full);
        deploy(fullUrl);
        const fullClient = createPrismaClient(fullUrl.toString());
        const schema = full;
        let eventId: string, live: RaceSimulationState, career: Career;
        try {
            await seedDevelopmentContent(fullClient);
            career = await createCareer(new PrismaCareerRepository(fullClient), input);
            const p = new PrismaProgressionRepository(fullClient), r = new PrismaRaceRepository(fullClient), q = new PrismaQualifyingRepository(fullClient);
            await fullClient.careerCalendarEvent.updateMany({ where: { careerId: career.id }, data: { weekendFormat: null } });
            const first = progressSummary((await p.getProgress(career.id))!).next!;
            eventId = first.id;
            const entered = await advanceToNextEvent(p, career.id, eventId);
            const sessions = [...entered.events.find(e => e.id === eventId)!.weekend!.sessions].sort((a, b) => a.order - b.order);
            expect(sessions.map(x => x.type)).toEqual(["PRACTICE_1", "PRACTICE_2", "PRACTICE_3", "QUALIFYING", "RACE"]);
            for (const x of sessions.slice(0, 3)) await runSessionAction(p, career.id, eventId, x.id, "simulatePractice");
            await simulateQualifyingSession(q, career.id, eventId);
            await startIncidentCareerRace(r, career.id, eventId, {}, 8);
            await advanceCareerRace(r, career.id, eventId, 0, 5);
            live = (await r.getRace(career.id, eventId))!.state!;
        } finally {
            await fullClient.$disconnect();
        }
        // 2. A pre-Phase-15 schema: every earlier migration, applied as SQL; then the old rows copied into it.
        const old = `pre15_${randomUUID().replaceAll("-", "")}`;
        extraSchemas.push(old);
        const migrations = readdirSync("prisma/migrations").filter(d => /^\d/.test(d)).sort();
        const phase15 = migrations.find(d => d.endsWith("_sprint_weekend"))!;
        const conn = await admin.connect();
        try {
            await conn.query(`CREATE SCHEMA "${old}"`);
            await conn.query(`SET search_path TO "${old}"`);
            for (const m of migrations.filter(d => d < phase15)) await conn.query(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
            await conn.query(`CREATE TABLE "${old}"."_prisma_migrations" (LIKE "${schema}"."_prisma_migrations" INCLUDING ALL)`);
            await conn.query(`INSERT INTO "${old}"."_prisma_migrations" SELECT * FROM "${schema}"."_prisma_migrations" WHERE migration_name <> $1`, [phase15]);
            // Parent-first copy (deferrable cycles deferred), enum columns re-typed into the old schema.
            const tables = (await conn.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`, [old])).rows.map(r => r.table_name as string);
            const edges = (await conn.query(`SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.contype = 'f' AND NOT c.condeferrable`, [old])).rows as { child: string; parent: string }[];
            const name = (qualified: string) => qualified.replace(/^.*\./, "").replaceAll('"', "");
            const ordered: string[] = [];
            const visit = (t: string, seen = new Set<string>()) => { if (ordered.includes(t) || seen.has(t)) return; seen.add(t); for (const e of edges.filter(x => name(x.child) === t && name(x.parent) !== t)) visit(name(e.parent), seen); ordered.push(t); };
            for (const t of tables) visit(t);
            await conn.query("BEGIN");
            await conn.query("SET CONSTRAINTS ALL DEFERRED");
            for (const t of ordered) {
                const columns = (await conn.query(`SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [old, t])).rows as { column_name: string; data_type: string; udt_name: string }[];
                const list = columns.map(c => `"${c.column_name}"`).join(", ");
                const exprs = columns.map(c => c.data_type === "USER-DEFINED" ? `"${c.column_name}"::text::"${old}"."${c.udt_name}"` : `"${c.column_name}"`).join(", ");
                await conn.query(`INSERT INTO "${old}"."${t}" (${list}) SELECT ${exprs} FROM "${schema}"."${t}"`);
            }
            await conn.query("COMMIT");
            // 3. Row hashes before the Phase-15 migration.
            const hash = async () => {
                const out: Record<string, string> = {};
                for (const t of ordered) out[t] = (await conn.query(`SELECT count(*)::text || ':' || coalesce(md5(string_agg(j::text, ',' ORDER BY j::text)), '') AS h FROM (SELECT to_jsonb(t) - 'weekendFormat' AS j FROM "${old}"."${t}" t) x`)).rows[0].h;
                return out;
            };
            const before = await hash();
            // 4. Apply ONLY the Phase-15 migration with Prisma, exactly as a deployment would.
            const oldUrl = new URL(value!); oldUrl.searchParams.set("schema", old);
            deploy(oldUrl);
            expect(await hash()).toEqual(before);
            expect((await conn.query(`SELECT count(*)::int AS n FROM "${old}"."CareerCalendarEvent" WHERE "weekendFormat" IS NOT NULL`)).rows[0].n).toBe(0);
            expect((await conn.query(`SELECT count(*)::int AS n FROM "${old}"."CalendarEvent" WHERE "weekendFormat" IS NOT NULL`)).rows[0].n).toBe(0);
            // 5. The old Career continues exactly: same Race checkpoint, same finish, and its next weekend is STANDARD.
            const oldClient = createPrismaClient(oldUrl.toString());
            try {
                const oldRaces = new PrismaRaceRepository(oldClient), oldProgression = new PrismaProgressionRepository(oldClient);
                expect((await oldRaces.getRace(career.id, eventId))!.state).toEqual(live);
                await advanceCareerRace(oldRaces, career.id, eventId, 5, "finish");
                expect((await oldRaces.getRace(career.id, eventId))!.state).toEqual(advanceRace(live, 1000));
                const next = progressSummary((await oldProgression.getProgress(career.id))!).next!;
                const entered = await advanceToNextEvent(oldProgression, career.id, next.id);
                expect(entered.events.find(e => e.id === next.id)!.weekend!.sessions.map(s => s.type)).toEqual(["PRACTICE_1", "PRACTICE_2", "PRACTICE_3", "QUALIFYING", "RACE"]);
            } finally {
                await oldClient.$disconnect();
            }
        } finally {
            conn.release();
        }
    }, 120000);
});

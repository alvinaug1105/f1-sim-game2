/**
 * Race v8C (progression revision 3) on real PostgreSQL: historical revision-3 creation, regulation obligation persistence
 * (outstanding / pending / satisfied / exempt), the final DSQ record, and championship scoring from the database.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { createPrismaClient } from '../src/data/prisma/connection';
import { seedDevelopmentContent } from '../src/data/seed/seed-content';
import { developmentContent as source } from '../src/data/seed/content-development';
import { PrismaCareerRepository } from '../src/data/repositories/prisma-career';
import { PrismaRaceRepository } from '../src/data/repositories/prisma-race';
import { PrismaProgressionRepository } from '../src/data/repositories/prisma-progression';
import { PrismaChampionshipRepository } from '../src/data/repositories/prisma-championship';
import { createCareer } from '../src/features/career/create-career';
import { advanceToNextEvent, runSessionAction } from '../src/features/career/progression';
import { startRevision3CareerRace, setDriverEnergyPolicy, setDriverErsMode, advanceCareerRace, changeCareerPitRequest } from '../src/features/race/service';
import { advanceRace } from '../src/simulation/race/engine';
import { assessTyreRule } from '../src/simulation/race/regulations/tyres';
import { championshipInput } from '../src/features/championship/model';
import { computeStandings } from '../src/game/domain/championship';
import type { Career } from '../src/game/domain/career';
import type { RaceSimulationState } from '../src/simulation/race/types';
const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error('TEST_DATABASE_URL required; SQL tests did not run.');
const schema = `race_v8c_${randomUUID().replaceAll('-', '')}`, url = new URL(value); url.searchParams.set('schema', schema);
const adminUrl = new URL(value); adminUrl.searchParams.delete('schema'); const admin = new Pool({ connectionString: adminUrl.toString() });
const client = createPrismaClient(url.toString()), careers = new PrismaCareerRepository(client), races = new PrismaRaceRepository(client), progression = new PrismaProgressionRepository(client), championship = new PrismaChampionshipRepository(client);
let career: Career, eventId: string;
const createInput = { name: 'v8C disposable integration', gameDatabaseId: source.database.id, seasonId: source.seasons[0].id, playerTeamId: source.teams[0].id };
beforeAll(async () => {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url.toString() }, timeout: 45000, stdio: 'pipe' });
});
beforeEach(async () => {
    await seedDevelopmentContent(client); career = await createCareer(careers, createInput);
    const progress = (await progression.getProgress(career.id))!; eventId = progress.events[0].id;
    const entered = await advanceToNextEvent(progression, career.id, eventId), sessions = entered.events[0].weekend!.sessions;
    for (const s of sessions.filter(s => s.type.startsWith('PRACTICE'))) await runSessionAction(progression, career.id, eventId, s.id, 'simulatePractice');
    const q = sessions.find(s => s.type === 'QUALIFYING')!; await runSessionAction(progression, career.id, eventId, q.id, 'start'); await runSessionAction(progression, career.id, eventId, q.id, 'completeDevelopment');
});
afterAll(async () => { await client.$disconnect(); await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); });
const get = async () => (await races.getRace(career.id, eventId))!;
const mine = (s: RaceSimulationState) => s.input.entrants.filter(e => e.teamId === career.playerTeamId).map(e => e.entrantId);
/** Accepted v8C (revision 3) creation: production now freezes revision 4 (tests/race-v8d.integration.test.ts). */
async function start() { await startRevision3CareerRace(races, career.id, eventId, {}, 42); return (await get()).state!; }
/** Advance one checkpoint at a time until `done` holds for the reloaded state (bounded). */
async function until(done: (s: RaceSimulationState) => boolean) {
    for (let n = 0; n < 15; n++) { const s = (await get()).state!; if (done(s) || s.status !== 'RUNNING') return s; await advanceCareerRace(races, career.id, eventId, s.lap, 1); }
    return (await get()).state!;
}

describe('PostgreSQL v8C revision 3', () => {
    it('revision-3 (accepted v8C) Race creation freezes revision 3 with the Grand Prix regulation; v8 assistance controls only', async () => {
        const s = await start(), id = mine(s)[0];
        expect(s.simulationVersion).toBe(8); expect(s.input.progression!.version).toBe(3);
        expect(s.input.progression!.regulation).toMatchObject({ session: 'RACE', dryTyres: { article: 'B6.3.6', minimumDistinctDrySpecifications: 2, mandatoryDrySpecifications: [] } });
        const row = await client.careerRaceSimulation.findFirstOrThrow({ where: { careerId: career.id } });
        expect(row.progression).toEqual({ configuration: s.input.progression, state: s.progression });
        await setDriverEnergyPolicy(races, career.id, eventId, id, 0, 0, 'BOOST');
        expect((await get()).state!.progression!.cars[id].assistance!.policy).toBe('BOOST');
        await expect(setDriverErsMode(races, career.id, eventId, id, 0, 1, 'OVERTAKE')).rejects.toThrow();
    });
    it('outstanding and pending obligations survive reload: a pending different-compound request is NOT tyre use', async () => {
        const s = await start(), [a, b] = mine(s);
        await advanceCareerRace(races, career.id, eventId, 0, 1); await advanceCareerRace(races, career.id, eventId, 1, 1);
        let saved = (await get()).state!;
        expect(assessTyreRule(saved, a).status).toBe('OUTSTANDING');
        await changeCareerPitRequest(races, career.id, eventId, b, saved.lap, saved.entrants.find(e => e.entrantId === b)!.pit!.commandRevision, 'HARD');
        saved = (await get()).state!;
        expect(saved.entrants.find(e => e.entrantId === b)!.pit!.pendingCompound).toBe('HARD');
        expect(assessTyreRule(saved, b).status).toBe('OUTSTANDING');
        expect(assessTyreRule(saved, b).usedDry).toEqual(assessTyreRule(saved, a).usedDry);
    });
    it('a second dry compound actually fitted (and out of the pit lane) persists as SATISFIED; an intermediate as EXEMPT', async () => {
        const s = await start(), [a, b] = mine(s);
        await changeCareerPitRequest(races, career.id, eventId, a, 0, s.entrants.find(e => e.entrantId === a)!.pit!.commandRevision, s.entrants.find(e => e.entrantId === a)!.stint!.tyre.compound === 'HARD' ? 'SOFT' : 'HARD');
        const r = (await get()).state!;
        await changeCareerPitRequest(races, career.id, eventId, b, 0, r.entrants.find(e => e.entrantId === b)!.pit!.commandRevision, 'INTERMEDIATE');
        const saved = await until(x => [a, b].every(id => x.entrants.find(e => e.entrantId === id)!.pit!.stops.length === 1 && x.progression!.cars[id].route === 'TRACK'));
        expect(assessTyreRule(saved, a).status).toBe('SATISFIED');
        expect(assessTyreRule(saved, b).status).toBe('EXEMPT');
        const reloaded = (await get()).state!;
        expect(reloaded).toEqual(saved);
    });
    it('final DSQ record persists and the championship read model scores the disqualified cars zero', async () => {
        const s = await start(), ids = mine(s);
        await advanceCareerRace(races, career.id, eventId, 0, 'finish');
        const done = (await get()).state!;
        expect(done).toEqual(advanceRace(s, s.input.totalLaps));
        expect(done.status).toBe('FINISHED');
        const record = done.progression!.classification!;
        const dsq = record.entries.filter(x => x.status === 'DISQUALIFIED').map(x => x.entrantId).sort();
        expect(dsq).toEqual([...ids].sort()); // the player never stopped: one dry specification each
        for (const id of ids) expect(done.entrants.find(e => e.entrantId === id)!.position).toBeGreaterThan(done.entrants.length - 2);
        const src = await championship.load(career.id);
        const race = src!.events.find(e => e.id === eventId)!.race!;
        expect(race.entrants.filter(e => e.disqualified).map(e => e.driverId).sort()).toEqual(s.input.entrants.filter(e => ids.includes(e.entrantId)).map(e => e.driverId).sort());
        const standings = computeStandings(championshipInput(src!));
        for (const d of race.entrants.filter(e => e.disqualified)) expect(standings.drivers.find(r => r.id === d.driverId)!.units).toBe(0);
        expect(standings.constructors.find(r => r.id === career.playerTeamId)!.units).toBe(0);
        expect(race.entrants.find(e => e.position === 1)!.disqualified).toBe(false);
    }, 120_000);
});

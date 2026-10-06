/**
 * Race v8E (progression revision 5) on real PostgreSQL: production creation freezes revision 5 and the whole v8E
 * bundle; a saved revision-5 Race (attack cadence state, SC / strategy / tyre snapshots, assistance) reloads and
 * continues exactly like an uninterrupted shadow; a revision-4 Race created through the explicit helper stays revision 4
 * and resumes exactly. No migration: every v8E value lives in existing columns / JSON profiles.
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
import { createCareer } from '../src/features/career/create-career';
import { advanceToNextEvent, runSessionAction } from '../src/features/career/progression';
import { startProgressionCareerRace, startRevision4CareerRace, advanceCareerRace, simulateCareerRaceRemainder, autoManagePlayerCars } from '../src/features/race/service';
import { advanceRace } from '../src/simulation/race/engine';
import { v8eAiStrategyConfiguration } from '../src/simulation/race/pits/ai-strategy';
import { v8eRacecraftConfiguration } from '../src/simulation/race/traffic/racecraft';
import { v8eWeatherTyreConfiguration } from '../src/simulation/race/tyres/profiles';
import { circuitPitTiming } from '../src/simulation/race/pits/circuit-timing';
import { v8eIncidentConfiguration } from '../src/simulation/race/incidents/model';
import type { Career } from '../src/game/domain/career';
const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error('TEST_DATABASE_URL required; SQL tests did not run.');
const schema = `race_v8e_${randomUUID().replaceAll('-', '')}`, url = new URL(value); url.searchParams.set('schema', schema);
const adminUrl = new URL(value); adminUrl.searchParams.delete('schema'); const admin = new Pool({ connectionString: adminUrl.toString() });
const client = createPrismaClient(url.toString()), careers = new PrismaCareerRepository(client), races = new PrismaRaceRepository(client), progression = new PrismaProgressionRepository(client);
let career: Career, eventId: string;
const createInput = { name: 'v8E disposable integration', gameDatabaseId: source.database.id, seasonId: source.seasons[0].id, playerTeamId: source.teams[0].id };
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

describe('PostgreSQL v8E revision 5', () => {
    it('production creation freezes revision 5 and the whole v8E bundle; the snapshot round-trips exactly', async () => {
        await startProgressionCareerRace(races, career.id, eventId, {}, 42);
        const s = (await get()).state!, timing = circuitPitTiming(s.input.progression!.pit, s.input.circuit.baseLapTimeMs);
        expect(s.simulationVersion).toBe(8); expect(s.input.progression!.version).toBe(5);
        expect(s.input.tyres).toEqual(v8eWeatherTyreConfiguration());
        expect(s.input.pits!.strategy).toEqual(v8eAiStrategyConfiguration());
        expect(s.input.commands!.racecraft).toEqual(v8eRacecraftConfiguration());
        expect(s.input.pits!.pitLaneLossMs).toBe(timing.pitLaneLossMs);
        expect(s.input.incidents).toEqual(v8eIncidentConfiguration(timing.pitTrackSectionMs));
        for (const c of Object.values(s.progression!.cars)) expect(c).toMatchObject({ attacksThisLap: 0, lastAttackAtMs: -1, attackArmed: true, passingCause: null });
    }, 120_000);
    it('save / reload mid-Race continues exactly like an uninterrupted shadow (no extra attack, entitlement, energy or RNG)', async () => {
        await startProgressionCareerRace(races, career.id, eventId, {}, 42);
        const initial = (await get()).state!;
        for (let n = 0; n < 6; n++) { const s = (await get()).state!; await advanceCareerRace(races, career.id, eventId, s.lap, 1); }
        const saved = (await get()).state!;
        expect(saved).toEqual(advanceRace(initial, 6));
        await simulateCareerRaceRemainder(races, career.id, eventId, saved.lap);
        const done = (await get()).state!;
        expect(done.status).toBe('FINISHED');
        expect(done).toEqual(advanceRace(autoManagePlayerCars(advanceRace(initial, 6)), initial.input.totalLaps));
    }, 240_000);
    it('a revision-4 Race (explicit helper) stays revision 4 and resumes exactly', async () => {
        await startRevision4CareerRace(races, career.id, eventId, {}, 42);
        const initial = (await get()).state!;
        expect(initial.input.progression!.version).toBe(4);
        for (const c of Object.values(initial.progression!.cars)) expect(c).not.toHaveProperty('attacksThisLap');
        await advanceCareerRace(races, career.id, eventId, 0, 5);
        expect((await get()).state!).toEqual(advanceRace(initial, 5));
    }, 120_000);
});

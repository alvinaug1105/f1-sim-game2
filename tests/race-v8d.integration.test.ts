/**
 * Race v8D (progression revision 4) on real PostgreSQL: production creation freezes revision 4 with the v8D tuning
 * bundle, the explicit revision-3 helper freezes the accepted v8C configuration, and both survive reload exactly
 * (no migration: every v8D value lives in existing columns / JSON profiles).
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
import { startProgressionCareerRace, startRevision3CareerRace, advanceCareerRace } from '../src/features/race/service';
import { advanceRace } from '../src/simulation/race/engine';
import { v8dAiStrategyConfiguration, defaultAiStrategyConfiguration } from '../src/simulation/race/pits/ai-strategy';
import { v8dRacecraftConfiguration, defaultRacecraftConfiguration } from '../src/simulation/race/traffic/racecraft';
import { v8dWeatherTyreConfiguration, weatherTyreConfiguration } from '../src/simulation/race/tyres/profiles';
import { circuitPitTiming } from '../src/simulation/race/pits/circuit-timing';
import { defaultIncidentConfiguration } from '../src/simulation/race/incidents/model';
import type { Career } from '../src/game/domain/career';
const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error('TEST_DATABASE_URL required; SQL tests did not run.');
const schema = `race_v8d_${randomUUID().replaceAll('-', '')}`, url = new URL(value); url.searchParams.set('schema', schema);
const adminUrl = new URL(value); adminUrl.searchParams.delete('schema'); const admin = new Pool({ connectionString: adminUrl.toString() });
const client = createPrismaClient(url.toString()), careers = new PrismaCareerRepository(client), races = new PrismaRaceRepository(client), progression = new PrismaProgressionRepository(client);
let career: Career, eventId: string;
const createInput = { name: 'v8D disposable integration', gameDatabaseId: source.database.id, seasonId: source.seasons[0].id, playerTeamId: source.teams[0].id };
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

describe('PostgreSQL v8D revision 4', () => {
    it('production Race creation freezes revision 4 and the whole v8D bundle; reload is exact', async () => {
        await startProgressionCareerRace(races, career.id, eventId, {}, 42);
        const s = (await get()).state!, timing = circuitPitTiming(s.input.progression!.pit, s.input.circuit.baseLapTimeMs);
        expect(s.simulationVersion).toBe(8); expect(s.input.progression!.version).toBe(4);
        expect(s.input.progression!.regulation).toMatchObject({ session: 'RACE', dryTyres: { article: 'B6.3.6' } });
        expect(s.input.tyres).toEqual(v8dWeatherTyreConfiguration());
        expect(s.input.pits!.strategy).toEqual(v8dAiStrategyConfiguration());
        expect(s.input.commands!.racecraft).toEqual(v8dRacecraftConfiguration());
        expect(s.input.pits!.pitLaneLossMs).toBe(timing.pitLaneLossMs);
        expect(s.input.incidents!.pitTrackSectionMs).toBe(timing.pitTrackSectionMs);
        const row = await client.careerRaceSimulation.findFirstOrThrow({ where: { careerId: career.id } });
        expect(row.progression).toEqual({ configuration: s.input.progression, state: s.progression });
        await advanceCareerRace(races, career.id, eventId, 0, 5);
        const saved = (await get()).state!;
        expect(saved).toEqual(advanceRace(s, 5));
        expect(saved.input).toEqual(s.input); // the frozen snapshot is never upgraded or re-derived
    }, 120_000);
    it('the explicit revision-3 helper freezes the accepted v8C configuration exactly (no v8D field)', async () => {
        await startRevision3CareerRace(races, career.id, eventId, {}, 42);
        const s = (await get()).state!;
        expect(s.input.progression!.version).toBe(3);
        expect(s.input.tyres).toEqual(weatherTyreConfiguration());
        expect(s.input.pits!.strategy).toEqual(defaultAiStrategyConfiguration());
        expect(s.input.commands!.racecraft).toEqual(defaultRacecraftConfiguration());
        expect(s.input.pits!.pitLaneLossMs).toBe(19500);
        expect(s.input.incidents!.pitTrackSectionMs).toBe(defaultIncidentConfiguration().pitTrackSectionMs);
    }, 120_000);
});

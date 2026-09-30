import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createPrismaClient } from '../src/data/prisma/connection';
import { seedDevelopmentContent } from '../src/data/seed/seed-content';
import { developmentContent as source } from '../src/data/seed/content-development';
import before from './fixtures/content-before-pass-b.json';
import { PrismaCareerRepository } from '../src/data/repositories/prisma-career';
import { createCareer } from '../src/features/career/create-career';
import { climateWeather, scenarioWeather } from '../src/features/race/weather-scenarios';

const value = process.env.TEST_DATABASE_URL!;
if (!value) throw new Error('TEST_DATABASE_URL required');
const schema = `climate_${randomUUID().replaceAll('-','')}`, url = new URL(value);
url.searchParams.set('schema',schema);
const admin = new Pool({connectionString:value}), client = createPrismaClient(url.toString());
const input = {name:'Climate snapshot',gameDatabaseId:source.database.id,seasonId:source.seasons[0].id,playerTeamId:source.teams[0].id};
beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA "${schema}"`);
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:url.toString()},stdio:'pipe'});
  await seedDevelopmentContent(client);
});
afterAll(async()=>{await client.$disconnect();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();});
it('upgrades legacy columns without backfill; source reseeding preserves the 8-round Career and creates a 24-round world',async()=>{
  // Restore the accepted Pass-A source shape before creating an old Career.
  await client.calendarEvent.deleteMany({where:{id:{notIn:before.events.map(e=>e.id)}}});
  for(const e of [...before.events].sort((a,b)=>a.round-b.round)) await client.calendarEvent.update({where:{id:e.id},data:{round:e.round}});
  await client.circuit.deleteMany({where:{id:{notIn:before.circuits.map(c=>c.id)}}});
  for(const c of before.circuits) await client.circuit.update({where:{id:c.id},data:{...c,climateProfile:null}});
  await client.gameDatabase.update({where:{id:source.database.id},data:{version:'1.0.0'}});
  const old = await createCareer(new PrismaCareerRepository(client),input);
  const oldEvents = await client.careerCalendarEvent.findMany({where:{careerId:old.id},orderBy:{round:'asc'}});
  const oldCircuits = await client.careerCircuit.findMany({where:{careerId:old.id},orderBy:{id:'asc'}});
  expect(oldEvents).toHaveLength(8);
  // Reconstruct the pre-addition schema with populated rows, then execute the exact additive migration.
  const conn=await admin.connect();
  try {
    await conn.query(`SET search_path TO "${schema}"`);
    await conn.query('ALTER TABLE "Circuit" DROP COLUMN "climateProfile"; ALTER TABLE "CareerCircuit" DROP COLUMN "climateProfile"; DROP TYPE "CircuitClimateProfile";');
    await conn.query(readFileSync('prisma/migrations/20261001000100_circuit_climate/migration.sql','utf8'));
  } finally { await conn.query('RESET search_path');conn.release(); }
  expect(await client.careerCircuit.findMany({where:{careerId:old.id},orderBy:{id:'asc'}})).toEqual(oldCircuits);
  await seedDevelopmentContent(client);
  await seedDevelopmentContent(client);
  expect(await client.circuit.count()).toBe(24);
  expect(await client.calendarEvent.count()).toBe(24);
  expect(await client.careerCalendarEvent.findMany({where:{careerId:old.id},orderBy:{round:'asc'}})).toEqual(oldEvents);
  expect(await client.careerCircuit.findMany({where:{careerId:old.id},orderBy:{id:'asc'}})).toEqual(oldCircuits);
  expect((await client.career.findUniqueOrThrow({where:{id:old.id}})).sourceGameDatabaseVersion).toBe('1.0.0');
  for(const c of oldCircuits) expect(climateWeather(91,58,c.climateProfile)).toEqual(scenarioWeather(91,58));
  const fresh=await createCareer(new PrismaCareerRepository(client),input);
  expect(fresh.sourceGameDatabaseVersion).toBe('1.3.0');
  expect(await client.careerCalendarEvent.count({where:{careerId:fresh.id}})).toBe(24);
  const frozen=await client.careerCircuit.findMany({where:{careerId:fresh.id},orderBy:{id:'asc'}});
  for(const c of frozen) {
    const original=source.circuits.find(x=>x.id===c.sourceCircuitId)!;
    expect(c.climateProfile).toBe(original.climateProfile);
    expect(c.overtakingDifficulty).toBe(original.overtakingDifficulty);
  }
  await client.circuit.updateMany({data:{climateProfile:'ARID',overtakingDifficulty:99}});
  expect(await client.careerCircuit.findMany({where:{careerId:fresh.id},orderBy:{id:'asc'}})).toEqual(frozen);
},60000);

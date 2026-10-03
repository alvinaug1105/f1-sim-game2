import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { Pool } from 'pg';
import { beforeAll,beforeEach,afterAll,describe,it,expect } from 'vitest';
import { createPrismaClient } from '../src/data/prisma/connection';
import { seedDevelopmentContent } from '../src/data/seed/seed-content';
import { developmentContent as source } from '../src/data/seed/content-development';
import { PrismaCareerRepository } from '../src/data/repositories/prisma-career';
import { PrismaRaceRepository } from '../src/data/repositories/prisma-race';
import { PrismaProgressionRepository } from '../src/data/repositories/prisma-progression';
import { createCareer } from '../src/features/career/create-career';
import { advanceToNextEvent,runSessionAction } from '../src/features/career/progression';
import { startCareerRace,simulateProgressionCareerRace,startIncidentCareerRace,advanceCareerRace,changeCareerPitRequest,setDriverPaceMode,simulateCareerRaceRemainder } from '../src/features/race/service';
import { advanceRace } from '../src/simulation/race/engine';
import { neutralise,forceMechanical } from './helpers/incidents';
import { projectRaceView } from '../src/features/race/projection';
import type { Career } from '../src/game/domain/career';
import type { RaceSimulationState } from '../src/simulation/race/types';
const value=process.env.TEST_DATABASE_URL;
if(!value)throw new Error('TEST_DATABASE_URL required; SQL tests did not run.');
const schema=`race_v8_${randomUUID().replaceAll('-','')}`,url=new URL(value);url.searchParams.set('schema',schema);
const adminUrl=new URL(value);adminUrl.searchParams.delete('schema');const admin=new Pool({connectionString:adminUrl.toString()});
const client=createPrismaClient(url.toString()),careers=new PrismaCareerRepository(client),races=new PrismaRaceRepository(client),progression=new PrismaProgressionRepository(client);
let career:Career,eventId:string;
const createInput={name:'v8 disposable integration',gameDatabaseId:source.database.id,seasonId:source.seasons[0].id,playerTeamId:source.teams[0].id};
beforeAll(async()=>{
 await admin.query(`CREATE SCHEMA "${schema}"`);
 execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:url.toString()},timeout:45000,stdio:'pipe'});
});
beforeEach(async()=>{
 await seedDevelopmentContent(client);career=await createCareer(careers,createInput);
 const progress=(await progression.getProgress(career.id))!;eventId=progress.events[0].id;
 const entered=await advanceToNextEvent(progression,career.id,eventId),sessions=entered.events[0].weekend!.sessions;
 for(const s of sessions.filter(s=>s.type.startsWith('PRACTICE')))await runSessionAction(progression,career.id,eventId,s.id,'simulatePractice');
 const q=sessions.find(s=>s.type==='QUALIFYING')!;await runSessionAction(progression,career.id,eventId,q.id,'start');await runSessionAction(progression,career.id,eventId,q.id,'completeDevelopment');
});
afterAll(async()=>{await client.$disconnect();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();});
const get=async()=>(await races.getRace(career.id,eventId))!;
async function start(){await startCareerRace(races,career.id,eventId,42,{},true,true,true,true,true,false,true);return (await get()).state!;}
async function edit(fn:(s:RaceSimulationState)=>RaceSimulationState){await races.changeRace(career.id,eventId,d=>({state:fn(d.state!),labels:d.labels,progress:d.progress}));return (await get()).state!;}
const own=(s:RaceSimulationState)=>s.input.entrants.find(e=>e.teamId===career.playerTeamId)!.entrantId;
describe('PostgreSQL v8 progression / compatibility',()=>{
 it('reloads the historical v8A circuit catalogue and creates all 22 cars with a private progression snapshot',async()=>{
  const s=await start();expect(s.simulationVersion).toBe(8);expect(s.entrants).toHaveLength(22);expect(s.progression!.elapsedTimeMs).toBe(0);expect(s.input.progression!.segments.at(-1)!.end).toBe(1000000);
  const row=await client.careerRaceSimulation.findFirstOrThrow({where:{careerId:career.id}});expect(row.progression).toEqual({configuration:s.input.progression,state:s.progression});
  const publicState=projectRaceView(await get()).state!;expect(publicState.entrants.every(e=>e.track!.local)).toBe(true);expect(JSON.stringify(publicState)).not.toContain('expectedLapMs');expect(publicState).not.toHaveProperty('progression');
 });
 it('matches green checkpoint / reload / command / auto-managed completion and normal session closure',async()=>{
  const s=await start();await advanceCareerRace(races,career.id,eventId,0,5);expect((await get()).state).toEqual(advanceRace(s,5));
  let checkpoint=(await get()).state!;const id=own(checkpoint);await setDriverPaceMode(races,career.id,eventId,id,5,checkpoint.entrants.find(e=>e.entrantId===id)!.commands!.commandRevision,'PUSH');checkpoint=(await get()).state!;
  const expected=advanceRace({...checkpoint,input:{...checkpoint.input,entrants:checkpoint.input.entrants.map(e=>({...e,strategyController:'DEVELOPMENT_AI' as const}))}},checkpoint.input.totalLaps);
  await simulateCareerRaceRemainder(races,career.id,eventId,5);const done=await get();expect(done.state).toEqual(expected);expect(done.progress.events[0].weekend!.sessions.find(s=>s.id===done.sessionId)!.status).toBe('COMPLETED');
 },30000);
 it('uses v8 for a new production Sprint and completes its own session without creating the Grand Prix',async()=>{
  const current=(await progression.getProgress(career.id))!.events[0];
  const race=current.weekend!.sessions.find(s=>s.type==='RACE')!;
  await runSessionAction(progression,career.id,eventId,race.id,'start');await runSessionAction(progression,career.id,eventId,race.id,'completeDevelopment');
  const next=(await progression.getProgress(career.id))!.events.find(e=>e.status==='UPCOMING')!;
  const entered=await advanceToNextEvent(progression,career.id,next.id),weekend=entered.events.find(e=>e.id===next.id)!.weekend!;
  for(const session of [...weekend.sessions].sort((a,b)=>a.order-b.order)){
   if(session.type==='SPRINT')break;
   if(session.type.startsWith('PRACTICE'))await runSessionAction(progression,career.id,next.id,session.id,'simulatePractice');
   else {await runSessionAction(progression,career.id,next.id,session.id,'start');await runSessionAction(progression,career.id,next.id,session.id,'completeDevelopment');}
  }
  const sprint=new PrismaRaceRepository(client,'SPRINT');await simulateProgressionCareerRace(sprint,career.id,next.id,42);
  const done=(await sprint.getRace(career.id,next.id))!;expect(done.state!.simulationVersion).toBe(8);expect(done.state!.status).toBe('FINISHED');expect(done.state!.entrants).toHaveLength(22);
  // Production Sprints freeze the latest revision (4, v8D) with the Sprint regulation — B6.3.6 does not apply, so no tyre DSQ.
  expect(done.state!.input.progression!.version).toBe(4);expect(done.state!.input.progression!.regulation).toMatchObject({session:'SPRINT',dryTyres:null});
  expect(done.state!.progression!.classification!.entries.some(x=>x.status==='DISQUALIFIED')).toBe(false);
  expect(done.progress.events.find(e=>e.id===next.id)!.weekend!.sessions.find(s=>s.id===done.sessionId)!.status).toBe('COMPLETED');
  expect((await races.getRace(career.id,next.id))!.state).toBeNull();
 },30000);
 it('persists an in-flight pit route and matches service / rejoin after reload',async()=>{
  const s=await start(),id=own(s);await changeCareerPitRequest(races,career.id,eventId,id,0,0,'HARD');const before=(await get()).state!;
  await advanceCareerRace(races,career.id,eventId,0,1);let saved=(await get()).state!;expect(saved).toEqual(advanceRace(before,1));expect(saved.progression!.cars[id].route).not.toBe('TRACK');
  await advanceCareerRace(races,career.id,eventId,1,5);saved=(await get()).state!;expect(saved).toEqual(advanceRace(before,6));expect(saved.entrants.find(e=>e.entrantId===id)!.pit!.stops).toHaveLength(1);
 });
 it.each(['VSC','SAFETY_CAR'] as const)('persists %s local distances, laps down and restart exactly',async mode=>{
  await start();await advanceCareerRace(races,career.id,eventId,0,5);
  const before=await edit(s=>{const id=s.input.entrants.at(-1)!.entrantId;return neutralise({...s,entrants:s.entrants.map(e=>e.entrantId===id?{...e,completedLaps:2,track:{...e.track!,progressMicrolaps:2800000}}:e)},mode,2);});
  await advanceCareerRace(races,career.id,eventId,5,5);const after=(await get()).state!;expect(after).toEqual(advanceRace(before,5));expect(after.incidents!.mode).toBe('GREEN');expect(after.entrants.at(-1)!.completedLaps).toBeLessThan(after.lap-1);
 });
 it('keeps retirees stationary through repository reload',async()=>{
  await start();const before=await edit(s=>forceMechanical(s,true));await advanceCareerRace(races,career.id,eventId,0,1);const retired=(await get()).state!;expect(retired).toEqual(advanceRace(before,1));await advanceCareerRace(races,career.id,eventId,1,5);const after=(await get()).state!;
  for(const e of retired.entrants.filter(e=>e.incident!.status==='RETIRED'))expect(after.entrants.find(x=>x.entrantId===e.entrantId)!.track!.progressMicrolaps).toBe(e.track!.progressMicrolaps);
 });
 it('rejects invalid / missing v8 JSON and mismatched integer distance in SQL',async()=>{
  await start();const row=await client.careerRaceSimulation.findFirstOrThrow({where:{careerId:career.id}});
  await expect(client.careerRaceSimulation.update({where:{id:row.id},data:{progression:{}}})).rejects.toThrow();
  const e=await client.careerRaceEntrant.findFirstOrThrow({where:{careerId:career.id}});await expect(client.careerRaceEntrant.update({where:{id:e.id},data:{trackProgressMicrolaps:1000000n}})).rejects.toThrow();
 });
 it('rolls back invalid persisted remainder / local distance before committing a mutation',async()=>{
  const s=await start(),id=own(s);await expect(edit(x=>({...x,progression:{...x.progression!,cars:{...x.progression!.cars,[id]:{...x.progression!.cars[id],remainder:1000}}}}))).rejects.toThrow();expect((await get()).state).toEqual(s);
 });
 it('retains legacy v7 without acquiring progression and resumes the historical engine exactly',async()=>{
  await startIncidentCareerRace(races,career.id,eventId,{},42);const before=(await get()).state!;expect(before.simulationVersion).toBe(7);expect(before.progression).toBeUndefined();await advanceCareerRace(races,career.id,eventId,0,5);expect((await get()).state).toEqual(advanceRace(before,5));
  const row=await client.careerRaceSimulation.findFirstOrThrow({where:{careerId:career.id}});expect(row.progression).toBeNull();await expect(client.careerRaceSimulation.update({where:{id:row.id},data:{progression:{configuration:{},state:{}}}})).rejects.toThrow();
 });
 it('rejects concurrent stale advances and preserves one deterministic checkpoint',async()=>{
  const s=await start();const result=await Promise.allSettled([advanceCareerRace(races,career.id,eventId,0,1),advanceCareerRace(races,career.id,eventId,0,1)]);expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await get()).state).toEqual(advanceRace(s,1));
 });
 it('upgrades an existing 21-migration schema additively without rewriting existing content',async()=>{
  const old=`v8_upgrade_${randomUUID().replaceAll('-','')}`,conn=await admin.connect();
  try{
   await conn.query(`CREATE SCHEMA "${old}"`);await conn.query(`SET search_path TO "${old}"`);
   const migrations=readdirSync('prisma/migrations').filter(n=>n!=='migration_lock.toml').sort();
   for(const migration of migrations.filter(n=>n!=='20261005000200_race_v8_progression'))await conn.query(readFileSync(`prisma/migrations/${migration}/migration.sql`,'utf8'));
   await conn.query(`INSERT INTO "GameDatabase" (id,key,name,version,"createdAt","updatedAt") VALUES ($1,'v8-upgrade-content','Existing editable content','1',now(),now())`,[randomUUID()]);
   const before=(await conn.query('SELECT to_jsonb(t) AS value FROM "GameDatabase" t')).rows;
   await conn.query(readFileSync('prisma/migrations/20261005000200_race_v8_progression/migration.sql','utf8'));
   expect((await conn.query('SELECT to_jsonb(t) AS value FROM "GameDatabase" t')).rows).toEqual(before);
   expect((await conn.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name='CareerRaceSimulation' AND column_name='progression'`,[old])).rows[0].n).toBe(1);
  }finally{await conn.query('SET search_path TO public');await conn.query(`DROP SCHEMA IF EXISTS "${old}" CASCADE`);conn.release();}
 });
});

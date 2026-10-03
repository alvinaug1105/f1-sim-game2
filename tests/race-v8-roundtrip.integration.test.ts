/**
 * Persisted determinism through PostgreSQL, per the versioned contract (no tolerance):
 * - v8A revision 1 (frozen): the save written to JSONB, reloaded and finished by the server continues exactly as the
 *   same state (same IDs) continues in memory. Each repetition runs on a fresh career, so it is persisted under a
 *   different, freshly generated ID set — but the comparison is always against its own IDs.
 * - v8B revision 2: the server continuation equals the in-memory continuation of the exact pre-persist object, and
 *   also the continuation of that object under remapped entrant / driver / team IDs (after restoring identity).
 */
import fixture from './fixtures/race-v8a-postgres-main-save.json';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
import { startRevision2CareerRace as startProgressionCareerRace,startCareerRace,setDriverEnergyPolicy,advanceCareerRace } from '../src/features/race/service';
import { advanceRace } from '../src/simulation/race/engine';
import { qualify } from '../src/simulation/race/assistance/model';
import { requestPitStop } from '../src/simulation/race/pits/model';
import { canonical,remapIds } from './helpers/determinism';
import type { Career } from '../src/game/domain/career';
import type { RaceSimulationState } from '../src/simulation/race/types';
const value=process.env.TEST_DATABASE_URL;
if(!value)throw new Error('TEST_DATABASE_URL required; SQL tests did not run.');
/** v8A repetitions (fresh career, fresh entrant IDs each). */
const REPS=Number(process.env.V8A_ROUNDTRIP_REPS ?? 20);
const schema=`race_v8rt_${randomUUID().replaceAll('-','')}`,url=new URL(value);url.searchParams.set('schema',schema);
const adminUrl=new URL(value);adminUrl.searchParams.delete('schema');const admin=new Pool({connectionString:adminUrl.toString()});
const client=createPrismaClient(url.toString()),careers=new PrismaCareerRepository(client),races=new PrismaRaceRepository(client),progression=new PrismaProgressionRepository(client);
let career:Career,eventId:string;
const createInput={name:'v8 round-trip integration',gameDatabaseId:source.database.id,seasonId:source.seasons[0].id,playerTeamId:source.teams[0].id};
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
/** Replace the stored state; returns the exact in-memory object that was handed to PostgreSQL. */
async function persist(fn:(s:RaceSimulationState)=>RaceSimulationState){let written!:RaceSimulationState;await races.changeRace(career.id,eventId,d=>{written=fn(structuredClone(d.state!));return {state:written,labels:d.labels,progress:d.progress};});return written;}
const own=(s:RaceSimulationState)=>s.input.entrants.filter(e=>e.teamId===career.playerTeamId).map(e=>e.entrantId);

describe('PostgreSQL round trip: exact persisted continuation',()=>{
 const original=fixture.state as unknown as RaceSimulationState;
 const seen=new Set<string>();
 it.each(Array.from({length:REPS},(_,n)=>n+1))(`v8A real main save, repetition %i of ${REPS}: persisted, reloaded and finished = same-ID in-memory continuation`,async()=>{
  await startCareerRace(races,career.id,eventId,42,{},true,true,true,true,true,false,true);const fresh=(await get()).state!;
  const ids=new Map<string,string>();for(const e of original.input.entrants){const n=fresh.input.entrants.find(x=>x.gridPosition===e.gridPosition)!;ids.set(e.entrantId,n.entrantId);ids.set(e.driverId,n.driverId);ids.set(e.teamId,n.teamId);}
  for(const e of fresh.input.entrants){expect(seen.has(e.entrantId)).toBe(false);seen.add(e.entrantId);}
  let text=JSON.stringify(original);for(const [from,to]of ids)text=text.split(from).join(to);
  const written=await persist(()=>JSON.parse(text) as RaceSimulationState);expect(written.input.progression!.version).toBe(1);
  await advanceCareerRace(races,career.id,eventId,written.lap,'finish');const done=(await get()).state!;
  expect(done.status).toBe('FINISHED');
  expect(canonical(done)).toBe(canonical(advanceRace(written,written.input.totalLaps)));
 },180000);
 /** Revision-2 scenario: continue the exact pre-persist object in memory (and under remapped IDs) and through PostgreSQL. */
 async function revision2(laps:number,scenario:(s:RaceSimulationState,mine:string[])=>RaceSimulationState,prepare?:(s:RaceSimulationState)=>Promise<unknown>){
  await startProgressionCareerRace(races,career.id,eventId,{},42);if(prepare)await prepare((await get()).state!);
  for(let n=0;n<laps;n++){const s=(await get()).state!;await advanceCareerRace(races,career.id,eventId,s.lap,1);}
  const written=await persist(s=>scenario(s,own(s)));expect(written.input.progression!.version).toBe(2);
  const memory=advanceRace(written,written.input.totalLaps),{state:remapped,restore}=remapIds(written,7919+laps),other=restore(advanceRace(remapped,remapped.input.totalLaps));
  await advanceCareerRace(races,career.id,eventId,written.lap,'finish');const done=(await get()).state!;
  expect(done.status).toBe('FINISHED');
  expect(canonical(done)).toBe(canonical(memory));
  expect(canonical(other)).toBe(canonical(memory));
  return {written,done};
 }
 it('v8B revision 2: normal Race from the grid',async()=>{await revision2(0,s=>s);},300000);
 it('v8B revision 2: double-stacked pit sequence requested for both player cars',async()=>{
  const {done}=await revision2(6,(s,mine)=>requestPitStop(requestPitStop(s,mine[0],'HARD'),mine[1],'MEDIUM'));
  expect(own(done).every(id=>done.entrants.find(e=>e.entrantId===id)!.stint!.number>1)).toBe(true);
 },300000);
 it('v8B revision 2: qualified Overtake entitlement not yet used, with remainders',async()=>{
  await revision2(4,(s,mine)=>{const a=s.progression!.cars[mine[0]].assistance!;qualify(a,s.input.progression!.assistance!,s.lap,500,0,true);a.deploymentRemainder=123;a.recoveryRemainder=456;return s;});
 },300000);
 it('v8B revision 2: Boost policy on a near-empty battery',async()=>{
  const {written}=await revision2(0,(x,mine)=>{x.progression!.cars[mine[0]].assistance!.energy=40;return x;},s=>setDriverEnergyPolicy(races,career.id,eventId,own(s)[0],0,0,'BOOST'));
  expect(written.progression!.cars[own(written)[0]].assistance!.policy).toBe('BOOST');
 },300000);
 it('v8B revision 2: Safety Car deployed mid-race',async()=>{
  await revision2(8,s=>({...s,incidents:{...s.incidents!,mode:'SAFETY_CAR',startedLap:s.lap,remainingLaps:3}}));
 },300000);
 it('v8B revision 2: Virtual Safety Car deployed mid-race',async()=>{
  await revision2(12,s=>({...s,incidents:{...s.incidents!,mode:'VSC',startedLap:s.lap,remainingLaps:2}}));
 },300000);
});

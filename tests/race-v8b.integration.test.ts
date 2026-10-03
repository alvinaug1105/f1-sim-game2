import fixture from './fixtures/race-v8a-postgres-main-save.json';
import {createHash} from 'node:crypto';
import {qualify} from '../src/simulation/race/assistance/model';
import {canonical,slotCanonical} from './helpers/determinism';
import {placeInPitPhase} from './helpers/pit-phase';
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
import { startProgressionCareerRace,startCareerRace,setDriverEnergyPolicy,setDriverErsMode,advanceCareerRace, } from '../src/features/race/service';
import { advanceRace } from '../src/simulation/race/engine';
import { projectRaceView } from '../src/features/race/projection';
import type { Career } from '../src/game/domain/career';
import type { RaceSimulationState } from '../src/simulation/race/types';
const value=process.env.TEST_DATABASE_URL;
if(!value)throw new Error('TEST_DATABASE_URL required; SQL tests did not run.');
const schema=`race_v8b_${randomUUID().replaceAll('-','')}`,url=new URL(value);url.searchParams.set('schema',schema);
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
async function start(){await startProgressionCareerRace(races,career.id,eventId,{},42);return (await get()).state!;}
async function edit(fn:(s:RaceSimulationState)=>RaceSimulationState){await races.changeRace(career.id,eventId,d=>({state:fn(d.state!),labels:d.labels,progress:d.progress}));return (await get()).state!;}
const own=(s:RaceSimulationState)=>s.input.entrants.find(e=>e.teamId===career.playerTeamId)!.entrantId;

describe('PostgreSQL v8B revision persistence and server commands',()=>{
 it('creates revision 2 using existing JSON, saves independent energy policy and rejects legacy/rival/stale/invalid commands',async()=>{
  const s=await start(),id=own(s);expect(s.input.progression!.version).toBe(2);
  await setDriverEnergyPolicy(races,career.id,eventId,id,0,0,'BOOST');const b=(await get()).state!;expect(b.progression!.cars[id].assistance!.policy).toBe('BOOST');expect(b.entrants.find(e=>e.entrantId===id)!.commands!.ersMode).toBe('NEUTRAL');
  await expect(setDriverErsMode(races,career.id,eventId,id,0,1,'OVERTAKE')).rejects.toThrow();
  await expect(setDriverEnergyPolicy(races,career.id,eventId,id,0,0,'RECHARGE')).rejects.toThrow();
  const rival=s.input.entrants.find(e=>e.teamId!==career.playerTeamId)!.entrantId;await expect(setDriverEnergyPolicy(races,career.id,eventId,rival,0,0,'BOOST')).rejects.toThrow();
  expect(()=>setDriverEnergyPolicy(races,career.id,eventId,id,0,1,'DEPLOY' as 'BOOST')).toThrow();
  await advanceCareerRace(races,career.id,eventId,0,1);expect((await get()).state).toEqual(advanceRace(b,1));
 });
 it('persists qualified-but-not-yet-used entitlement and remainders exactly',async()=>{
  await start();const before=await edit(s=>{const id=own(s),a=s.progression!.cars[id].assistance!,c=s.input.progression!.assistance!;qualify(a,c,0,500,0,true);a.deploymentRemainder=123;a.recoveryRemainder=456;return s;});
  const row=await client.careerRaceSimulation.findFirstOrThrow({where:{careerId:career.id}});expect(row.progression).toEqual({configuration:before.input.progression,state:before.progression});await advanceCareerRace(races,career.id,eventId,0,1);expect((await get()).state).toEqual(advanceRace(before,1));
 });
 it.each(['ENTRY','LANE','SERVICE','EXIT'] as const)('reloads %s without acquiring main-track interaction',async route=>{
  await start();await advanceCareerRace(races,career.id,eventId,0,1);
  // Phase distances come from this Race's own frozen pit anchors (circuit-authored), never from magic numbers.
  const before=await edit(s=>placeInPitPhase(s,own(s),route));
  expect(before.progression!.cars[own(before)].route).toBe(route);
  await advanceCareerRace(races,career.id,eventId,1,1);expect((await get()).state).toEqual(advanceRace(before,1));
 });
 it('round-trips a real main v8A fixture and finishes with its original engine digest; legacy ERS remains accepted',async()=>{
  const original=fixture.state as unknown as RaceSimulationState;
  await startCareerRace(races,career.id,eventId,42,{},true,true,true,true,true,false,true);const fresh=(await get()).state!;
  const replacements=new Map<string,string>();for(const e of original.input.entrants){const n=fresh.input.entrants.find(x=>x.gridPosition===e.gridPosition)!;replacements.set(e.entrantId,n.entrantId);replacements.set(e.driverId,n.driverId);replacements.set(e.teamId,n.teamId);}
  let text=JSON.stringify(original);for(const [from,to]of replacements)text=text.replaceAll(from,to);const mapped=JSON.parse(text) as RaceSimulationState;
  await edit(()=>mapped);const historical=(await get()).state!;expect(historical).toEqual(mapped);expect(historical.input.progression!.version).toBe(1);
  const expected=advanceRace(historical,historical.input.totalLaps);
  // Frozen revision 1: with its original IDs the accepted save still finishes with the digest recorded on main.
  expect(createHash('sha256').update(slotCanonical(advanceRace(original,original.input.totalLaps),original)).digest('hex')).toBe(fixture.finishedSha256);
  // Revision-1 contract is same IDs → same continuation (its historical tie rule uses entrant-ID text, so a save remapped
  // onto other IDs is a different historical Race). The reloaded save must continue exactly as the state that was written.
  expect(canonical(expected)).toBe(canonical(advanceRace(mapped,mapped.input.totalLaps)));
  const id=own(historical);await expect(setDriverEnergyPolicy(races,career.id,eventId,id,historical.lap,historical.entrants.find(e=>e.entrantId===id)!.commands!.commandRevision,'BOOST')).rejects.toThrow();await setDriverErsMode(races,career.id,eventId,id,historical.lap,historical.entrants.find(e=>e.entrantId===id)!.commands!.commandRevision,'DEPLOY');const commanded=(await get()).state!;
  const done=advanceRace(commanded,commanded.input.totalLaps);await advanceCareerRace(races,career.id,eventId,commanded.lap,'finish');expect((await get()).state).toEqual(done);
 },180000); // several full 57-lap continuations; not a determinism allowance
 it('rolls back invalid/mixed revision state and keeps hidden entitlement and rival energy off the browser',async()=>{
  const s=await start(),id=own(s);await expect(edit(x=>{x.progression!.cars[id].assistance!.energy=-1;return x;})).rejects.toThrow();expect((await get()).state).toEqual(s);
  const v=projectRaceView(await get()),text=JSON.stringify(v);for(const hidden of ['qualifiedLap','validUseLap','expiresAfterLap','deploymentRemainder','recoveryRemainder','rngState','"seed"'])expect(text).not.toContain(hidden);
  expect(v.state!.entrants.filter(e=>s.input.entrants.find(x=>x.entrantId===e.entrantId)!.teamId!==career.playerTeamId).every(e=>!e.assistance&&!e.commands)).toBe(true);
 });
});

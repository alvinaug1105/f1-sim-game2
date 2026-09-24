import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createPrismaClient } from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
import { developmentContent as source } from "../src/data/seed/content-development";
import { PrismaCareerRepository } from "../src/data/repositories/prisma-career";
import { createCareer } from "../src/features/career/create-career";
import type { Career } from "../src/game/domain/career";
const value = process.env.TEST_DATABASE_URL;
if (!value)
    throw new Error("TEST_DATABASE_URL required; SQL tests did not run.");
const schema = `incidents_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(value);
url.searchParams.set("schema", schema);
const adminUrl = new URL(value);
adminUrl.searchParams.delete("schema");
const admin = new Pool({
    connectionString: adminUrl.toString(),
    connectionTimeoutMillis: 5000,
});
const client = createPrismaClient(url.toString());
const repository = new PrismaCareerRepository(client);
const input = {
    name: "Independent Career",
    gameDatabaseId: source.database.id,
    seasonId: source.seasons[0].id,
    playerTeamId: source.teams[0].id,
};
let created = false;
let career: Career;
beforeAll(async () => {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
        env: { ...process.env, DATABASE_URL: url.toString() },
        timeout: 45000,
        stdio: "pipe",
    });
});
beforeEach(async () => {
    await seedDevelopmentContent(client);
    career = await createCareer(repository, input);
});
afterAll(async () => {
    try {
        await client.$disconnect();
        if (created)
            await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    finally {
        await admin.end();
    }
});
import { PrismaRaceRepository } from "../src/data/repositories/prisma-race";
import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import { advanceToNextEvent, runSessionAction, } from "../src/features/career/progression";
import { startIncidentCareerRace, changeCareerPitRequest, advanceCareerRace, } from "../src/features/race/service";
import { advanceRace } from "../src/simulation/race/engine";
const races = new PrismaRaceRepository(client);
const progression = new PrismaProgressionRepository(client);
let eventId: string;
beforeEach(async () => {
    const state = (await progression.getProgress(career.id))!;
    eventId = state.events[0].id;
    const entered = await advanceToNextEvent(progression, career.id, eventId);
    const sessions = entered.events[0].weekend!.sessions;
    for (let i = 0; i < 3; i++)
        await runSessionAction(progression, career.id, eventId, sessions[i].id, "simulatePractice");
    await runSessionAction(progression, career.id, eventId, sessions[3].id, "start");
    await runSessionAction(progression, career.id, eventId, sessions[3].id, "completeDevelopment");
});
async function start() { await startIncidentCareerRace(races, career.id, eventId, {}, 42); return (await races.getRace(career.id, eventId))!; }
const get = async () => (await races.getRace(career.id, eventId))!;
const player = (d: Awaited<ReturnType<typeof get>>) => d.state!.input.entrants.find(e => e.teamId === d.progress.career.playerTeamId)!.entrantId;
import { neutralise, forceMechanical } from "./helpers/incidents";
import { setDriverPaceMode } from "../src/features/race/service";
import type { RaceSimulationState } from "../src/simulation/race/types";
async function edit(fn: (s: RaceSimulationState) => RaceSimulationState) { await races.changeRace(career.id, eventId, d => ({ state: fn(d.state!), labels: d.labels, progress: d.progress })); return (await get()).state!; }
describe("real PostgreSQL v7 incidents", () => {
    it("creates v7 frozen reliability and independent RNG", async () => { const d = await start(); expect(d.state!.simulationVersion).toBe(7); expect(d.state!.input.entrants.every(e => e.reliability!.reliability === 97)).toBe(true); expect(await client.careerRaceIncidents.count({ where: { careerId: career.id } })).toBe(1); });
    it("persists exact events and mechanical penalties", async () => { await start(); const s = await edit(forceMechanical); const expected = advanceRace(s, 1); await advanceCareerRace(races, career.id, eventId, 0, 1); expect((await get()).state).toEqual(expected); expect(expected.incidents!.events.length).toBeGreaterThan(0); expect(expected.entrants[0].incident!.mechanicalPenaltyMs).toBeGreaterThan(0); });
    it.each(["VSC", "SAFETY_CAR"] as const)("%s reload, restart and finish match uninterrupted engine", async (mode) => { await start(); const s = await edit(s => neutralise(s, mode, 3)); await advanceCareerRace(races, career.id, eventId, 0, 1); const checkpoint = (await get()).state!; expect(checkpoint).toEqual(advanceRace(s, 1)); await advanceCareerRace(races, career.id, eventId, 1, 5); expect((await get()).state).toEqual(advanceRace(s, 6)); await advanceCareerRace(races, career.id, eventId, 6, "finish"); expect((await get()).state).toEqual(advanceRace(s, 1000)); });
    it("retirement survives reload and rejects commands/pits", async () => { const d = await start(), id = player(d); await edit(s => forceMechanical(s, true)); await advanceCareerRace(races, career.id, eventId, 0, 1); const s = (await get()).state!, e = s.entrants.find(e => e.entrantId === id)!; expect(e.incident!.status).toBe("RETIRED"); await expect(changeCareerPitRequest(races, career.id, eventId, id, 1, e.pit!.commandRevision, "HARD")).rejects.toMatchObject({ code: "INVALID_ACTION" }); await expect(setDriverPaceMode(races, career.id, eventId, id, 1, e.commands!.commandRevision, "ATTACK")).rejects.toMatchObject({ code: "INVALID_ACTION" }); await advanceCareerRace(races, career.id, eventId, 1, 5); expect((await get()).state!.entrants.find(e => e.entrantId === id)).toEqual(e); });
    it.each(["VSC", "SAFETY_CAR"] as const)("player pit under %s persists route and service history", async (mode) => { const d = await start(), id = player(d); await edit(s => neutralise(s, mode)); await changeCareerPitRequest(races, career.id, eventId, id, 0, 0, "WET"); const s = (await get()).state!; await advanceCareerRace(races, career.id, eventId, 0, 1); expect((await get()).state).toEqual(advanceRace(s, 1)); expect((await get()).state!.entrants.find(e => e.entrantId === id)!.pit!.stops).toHaveLength(1); });
    it("rolls back control, events, resources and RNG on invalid event ownership", async () => { const d = await start(); await expect(edit(s => ({ ...advanceRace(s, 1), incidents: { ...s.incidents!, events: [{ sequence: 1, lap: 1, type: "INCIDENT", entrantIds: [crypto.randomUUID()], kind: "SPIN", severity: "MINOR", timeLossMs: 1000 }] } }))).rejects.toThrow(); expect((await get()).state).toEqual(d.state); });
    it.each([{ mode: "RED_FLAG" }, { remainingLaps: -1 }, { drsDelay: 11 }, { rngState: BigInt(-1) }, { mode: "VSC", remainingLaps: 0 }])("SQL rejects invalid control %#", async (data) => { await start(); const row = await client.careerRaceIncidents.findFirstOrThrow({ where: { careerId: career.id } }); await expect(client.careerRaceIncidents.update({ where: { careerRaceSimulationId: row.careerRaceSimulationId }, data })).rejects.toThrow(); });
    it("rejects cross-Career ownership", async () => { await start(); const other = await createCareer(repository, input), row = await client.careerRaceIncidents.findFirstOrThrow({ where: { careerId: career.id } }); await expect(client.careerRaceIncidents.update({ where: { careerRaceSimulationId: row.careerRaceSimulationId }, data: { careerId: other.id } })).rejects.toThrow(); });
    it("concurrent advances commit only one incident stream checkpoint", async () => { const d = await start(); const results = await Promise.allSettled([advanceCareerRace(races, career.id, eventId, 0, 5), advanceCareerRace(races, career.id, eventId, 0, 5)]); expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect((await get()).state).toEqual(advanceRace(d.state!, 5)); });
    it("SQL rejects foreign event participants and invalid entrant statuses", async () => { await start(); const row = await client.careerRaceIncidents.findFirstOrThrow({ where: { careerId: career.id } }); await expect(client.careerRaceIncidents.update({ where: { careerRaceSimulationId: row.careerRaceSimulationId }, data: { events: [{ sequence: 1, lap: 1, type: "INCIDENT", kind: "SPIN", severity: "MINOR", timeLossMs: 100, entrantIds: [crypto.randomUUID()] }] } })).rejects.toThrow(); const entrants = row.entrants as Record<string, {
        status: string;
    }>; const id = Object.keys(entrants)[0]; await expect(client.careerRaceIncidents.update({ where: { careerRaceSimulationId: row.careerRaceSimulationId }, data: { entrants: { ...entrants, [id]: { ...entrants[id], status: "GHOST" } } } })).rejects.toThrow(); });
});

import { raceResult } from "../src/simulation/race/engine";
import legacyNames from "./fixtures/development-content-before-naming.json";
it("v7 full results ignore renamed driver/team/circuit/event labels", async () => {
  const data=await start(),id=player(data);
  await changeCareerPitRequest(races,career.id,eventId,id,0,0,"WET");
  const before=await edit(forceMechanical);
  const labels=(await get()).labels;
  for(const [index,e] of before.input.entrants.entries()) {
    const driver=legacyNames.drivers[index];
    await client.careerRaceEntrant.update({where:{id:e.entrantId},data:{driverName:`${driver.firstName} ${driver.lastName}`,teamName:legacyNames.teams[Math.floor(index/2)].name}});
  }
  await client.careerCircuit.updateMany({where:{careerId:career.id},data:{name:"Independent renamed circuit"}});
  await client.careerCalendarEvent.update({where:{id:eventId},data:{name:"Independent renamed event"}});
  const renamed=await get();
  expect(renamed.labels).not.toEqual(labels);
  expect(renamed.state).toEqual(before);
  const expected=advanceRace(before,1000);
  expect(expected.incidents!.events.length).toBeGreaterThan(0);
  expect(expected.entrants.some(e=>e.pit!.stops.length>0)).toBe(true);
  await advanceCareerRace(races,career.id,eventId,0,"finish");
  const actual=(await get()).state!;
  expect(actual).toEqual(expected); // Includes timing, weather, tyres, pits, incidents and both RNG streams.
  expect(raceResult(actual)).toEqual(raceResult(expected));
});

import {applyViewerIntent} from '../src/features/race/viewer/service';
import {checkpointDuration} from '../src/features/race/viewer/motion';
import {PlaybackController,type PlaybackClock} from '../src/features/race/viewer/playback';
it('viewer 1x and 8x persist EXACTLY the same full v7 result under the same commands',async()=>{
 const initial=await start(),id=player(initial);
 async function run(speed:1|8){
  let queued:(()=>void)|null=null;const delays:number[]=[];
  // Virtual presentation clock: time never passes between callbacks, so each scheduled delay is exact.
  const clock:PlaybackClock={set:(callback,delay)=>{expect(queued).toBeNull();queued=callback;delays.push(delay);return 1 as unknown as ReturnType<typeof setTimeout>;},clear:()=>{queued=null;},now:()=>0};
  const controller=new PlaybackController(initial.state!,initial.progress.career.playerTeamId,async s=>{
   if(s.lap===4){const e=s.entrants.find(e=>e.entrantId===id)!;await applyViewerIntent(races,career.id,eventId,s.lap,{kind:'paceMode',entrantId:id,revision:e.commands!.commandRevision,mode:'PUSH'});}
   if(s.lap===8){const d=await get(),e=d.state!.entrants.find(e=>e.entrantId===id)!;await applyViewerIntent(races,career.id,eventId,s.lap,{kind:'pit',entrantId:id,revision:e.pit!.commandRevision,compound:'HARD'});}
   return (await applyViewerIntent(races,career.id,eventId,s.lap,{kind:'advance'})).state!;
  },clock);
  controller.setAutoPause(false);controller.setSpeed(speed);controller.play();
  while(controller.getSnapshot().playing){
   const completed=new Promise<void>(resolve=>{const off=controller.subscribe(()=>{if(!controller.getSnapshot().busy){off();resolve();}});});
   // Phase 12C: a fresh Resume has nothing left to animate, so the first advance is scheduled at 0 ms; every later
   // checkpoint then waits its full interval at the selected speed (no pause, so the whole budget remains).
   expect(delays.at(-1)).toBe(delays.length===1?0:checkpointDuration(speed,controller.getState().incidents?.mode));
   const tick=queued!;expect(tick).toBeTypeOf('function');queued=null;tick();await completed;
  }
  expect(delays).toHaveLength(initial.state!.input.totalLaps);expect(delays[0]).toBe(0);expect(delays.slice(1).every(d=>d>=2400/speed)).toBe(true);
  const reopened=await get();expect(reopened.state).toEqual(controller.getState());return reopened.state;
 }
 const slow=await run(1);
 // Test-only reset in this suite's disposable schema; restore the identical frozen checkpoint and IDs.
 await races.changeRace(career.id,eventId,d=>({state:initial.state!,labels:initial.labels,progress:{...d.progress,career:{...d.progress.career,currentDate:initial.progress.career.currentDate},events:d.progress.events.map(e=>e.id===eventId?initial.progress.events.find(e=>e.id===eventId)!:e)}}));
 await client.careerRacePitStop.deleteMany({where:{careerId:career.id}});
 await client.careerRaceStint.deleteMany({where:{careerId:career.id,number:{gt:1}}});
 expect((await get()).state).toEqual(initial.state);
 const fast=await run(8);expect(fast).toEqual(slow);
},60000);
it('viewer commands preserve server ownership, stale-lap and finished guards',async()=>{
 const d=await start(),id=player(d),ai=d.state!.input.entrants.find(e=>e.teamId!==d.progress.career.playerTeamId)!.entrantId;
 await expect(applyViewerIntent(races,career.id,eventId,0,{kind:'paceMode',entrantId:ai,revision:0,mode:'ATTACK'})).rejects.toMatchObject({code:'INVALID_ACTION'});
 await applyViewerIntent(races,career.id,eventId,0,{kind:'fuelMode',entrantId:id,revision:0,mode:'CONSERVE'});
 await applyViewerIntent(races,career.id,eventId,0,{kind:'ersMode',entrantId:id,revision:1,mode:'DEPLOY'});
 await applyViewerIntent(races,career.id,eventId,0,{kind:'advance'});
 await expect(applyViewerIntent(races,career.id,eventId,0,{kind:'advance'})).rejects.toMatchObject({code:'STALE'});
 const state=(await get()).state!;expect(state.entrants.find(e=>e.entrantId===id)!.commands!.fuelMode).toBe('CONSERVE');
 await advanceCareerRace(races,career.id,eventId,1,'finish');
 await expect(applyViewerIntent(races,career.id,eventId,state.input.totalLaps,{kind:'advance'})).rejects.toMatchObject({code:'INVALID_ACTION'});
});
it('display car numbers cannot reorder a new race roster or change an existing v7 checkpoint',async()=>{
 const before=(await get()).roster;
 const entries=await client.careerSeasonDriverEntry.findMany({where:{careerId:career.id}});
 for(const [i,e] of entries.entries())await client.careerSeasonDriverEntry.update({where:{id:e.id},data:{carNumber:90+i}});
 const after=(await get()).roster;
 expect(after.map(e=>e.driverId)).toEqual(before.map(e=>e.driverId));
 const d=await start();
 await client.careerDriver.updateMany({where:{careerId:career.id},data:{preferredNumber:99}});
 expect((await get()).state).toEqual(d.state);
 await advanceCareerRace(races,career.id,eventId,0,'finish');
 expect((await get()).state).toEqual(advanceRace(d.state!,1000));
});

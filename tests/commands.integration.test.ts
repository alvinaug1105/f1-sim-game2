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
const schema = `commands_test_${randomUUID().replaceAll("-", "")}`;
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
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: url.toString() },
      timeout: 45000,
      stdio: "pipe",
    },
  );
});
beforeEach(async () => {
  await seedDevelopmentContent(client);
  career = await createCareer(repository, input);
});
afterAll(async () => {
  try {
    await client.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await admin.end();
  }
});

import { PrismaRaceRepository } from "../src/data/repositories/prisma-race";
import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import {
  advanceToNextEvent,
  runSessionAction,
} from "../src/features/career/progression";
import {
  startCommandCareerRace,
  setDriverPaceMode, setDriverFuelMode, setDriverErsMode,
  changeCareerPitRequest,
  advanceCareerRace,
} from "../src/features/race/service";
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
    await runSessionAction(
      progression,
      career.id,
      eventId,
      sessions[i].id,
      "simulatePractice",
    );
  await runSessionAction(
    progression,
    career.id,
    eventId,
    sessions[3].id,
    "start",
  );
  await runSessionAction(
    progression,
    career.id,
    eventId,
    sessions[3].id,
    "completeDevelopment",
  );
});

async function start() { await startCommandCareerRace(races,career.id,eventId,{},42);return (await races.getRace(career.id,eventId))!; }
const get = async () => (await races.getRace(career.id,eventId))!;
const player = (d: Awaited<ReturnType<typeof get>>) => d.state!.input.entrants.find(e=>e.teamId === d.progress.career.playerTeamId)!.entrantId;
describe("PostgreSQL v5 driver commands",()=>{
 it("creates complete v5 and frozen profile",async()=>{const d=await start();expect(d.state!.simulationVersion).toBe(5);expect(d.state!.entrants.every(e=>e.commands?.ersCharge===700)).toBe(true);expect(await client.careerRaceCommandProfile.count({where:{careerId:career.id}})).toBe(1);});
 it("persists commands and shared revision without changing physics",async()=>{const d=await start(),id=player(d);await setDriverPaceMode(races,career.id,eventId,id,0,0,"ATTACK");await setDriverFuelMode(races,career.id,eventId,id,0,1,"PUSH");await setDriverErsMode(races,career.id,eventId,id,0,2,"OVERTAKE");const s=(await get()).state!;expect(s.entrants.find(e=>e.entrantId===id)!.commands).toMatchObject({paceMode:"ATTACK",fuelMode:"PUSH",ersMode:"OVERTAKE",commandRevision:3,ersCharge:700});expect(s.rngState).toBe(d.state!.rngState);expect(s.lap).toBe(0);});
 it("rejects AI ownership",async()=>{const d=await start(),id=d.state!.input.entrants.find(e=>e.teamId!==d.progress.career.playerTeamId)!.entrantId;await expect(setDriverPaceMode(races,career.id,eventId,id,0,0,"ATTACK")).rejects.toMatchObject({code:"INVALID_ACTION"});});
 it("rejects other Career and nonexistent entrant",async()=>{const d=await start();const other=await createCareer(repository,input);await expect(setDriverPaceMode(races,other.id,eventId,player(d),0,0,"ATTACK")).rejects.toMatchObject({code:"NOT_FOUND"});await expect(setDriverPaceMode(races,career.id,eventId,randomUUID(),0,0,"ATTACK")).rejects.toMatchObject({code:"INVALID_ACTION"});});
 it("rejects stale revision and stale lap",async()=>{const d=await start(),id=player(d);await setDriverPaceMode(races,career.id,eventId,id,0,0,"ATTACK");await expect(setDriverPaceMode(races,career.id,eventId,id,0,0,"STANDARD")).rejects.toMatchObject({code:"STALE"});await expect(setDriverFuelMode(races,career.id,eventId,id,1,1,"PUSH")).rejects.toMatchObject({code:"STALE"});});
 it("serializes competing commands, one winner",async()=>{const d=await start(),id=player(d);const result=await Promise.allSettled([setDriverPaceMode(races,career.id,eventId,id,0,0,"ATTACK"),setDriverPaceMode(races,career.id,eventId,id,0,0,"CONSERVE")]);expect(result.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(result.filter(x=>x.status==="rejected")).toHaveLength(1);});
 it.each([{ersCharge:-1},{ersCharge:1001},{paceMode:"INVALID"},{fuelMode:"INVALID"},{ersMode:"INVALID"},{commandRevision:-1}])("SQL rejects invalid state %j",async data=>{const d=await start();await expect(client.careerRaceEntrant.update({where:{id:player(d)},data})).rejects.toThrow();});
 it("profile cannot link across Careers",async()=>{await start();const other=await createCareer(repository,input);const p=await client.careerRaceCommandProfile.findFirstOrThrow({where:{careerId:career.id}});await expect(client.careerRaceCommandProfile.update({where:{careerRaceSimulationId:p.careerRaceSimulationId},data:{careerId:other.id}})).rejects.toThrow();});
 it("resume equals uninterrupted scheduled continuation with pits",async()=>{let d=await start();const id=player(d);await advanceCareerRace(races,career.id,eventId,0,5);await advanceCareerRace(races,career.id,eventId,5,5);await setDriverPaceMode(races,career.id,eventId,id,10,0,"ATTACK");await setDriverFuelMode(races,career.id,eventId,id,10,1,"PUSH");await setDriverErsMode(races,career.id,eventId,id,10,2,"OVERTAKE");d=await get();const expected15=advanceRace(d.state!,5);await advanceCareerRace(races,career.id,eventId,10,5);expect((await get()).state).toEqual(expected15);await setDriverPaceMode(races,career.id,eventId,id,15,3,"CONSERVE");await setDriverFuelMode(races,career.id,eventId,id,15,4,"CONSERVE");await setDriverErsMode(races,career.id,eventId,id,15,5,"HARVEST");d=await get();await changeCareerPitRequest(races,career.id,eventId,id,15,d.state!.entrants.find(e=>e.entrantId===id)!.pit!.commandRevision,"HARD");d=await get();const expected=advanceRace(d.state!,1000);await advanceCareerRace(races,career.id,eventId,15,"finish");expect((await get()).state).toEqual(expected);});
 it("rolls back all resources when checkpoint persistence fails",async()=>{const d=await start();await expect(races.changeRace(career.id,eventId,x=>({state:{...advanceRace(x.state!,1),entrants:advanceRace(x.state!,1).entrants.map(e=>({...e,commands:{...e.commands!,ersCharge:1001}}))},labels:x.labels,progress:x.progress}))).rejects.toThrow();expect((await get()).state).toEqual(d.state);});
});

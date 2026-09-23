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
const schema = `weather_test_${randomUUID().replaceAll("-", "")}`;
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
  startWeatherCareerRace,

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


async function start() {await startWeatherCareerRace(races,career.id,eventId,{},42);return (await races.getRace(career.id,eventId))!;}
const get=async()=>(await races.getRace(career.id,eventId))!;
const player=(d:Awaited<ReturnType<typeof get>>)=>d.state!.input.entrants.find(e=>e.teamId===d.progress.career.playerTeamId)!.entrantId;
describe("real PostgreSQL v6 weather",()=>{
 it("creates complete v6 weather and five frozen tyre profiles",async()=>{const d=await start();expect(d.state!.simulationVersion).toBe(6);expect(d.state!.weather!.trackWater).toBe(0);expect(await client.careerRaceWeather.count({where:{careerId:career.id}})).toBe(1);expect(await client.careerRaceTyreProfile.count({where:{careerId:career.id}})).toBe(5);});
 it("persists exact timeline, forecast, rain and DRS after advance",async()=>{const d=await start(),expected=advanceRace(d.state!,5);await advanceCareerRace(races,career.id,eventId,0,5);expect((await get()).state).toEqual(expected);expect((await get()).state!.input.weather).toEqual(d.state!.input.weather);});
 it.each(["INTERMEDIATE","WET"] as const)("pits into %s and persists history",async compound=>{const d=await start(),id=player(d);await changeCareerPitRequest(races,career.id,eventId,id,0,0,compound);await advanceCareerRace(races,career.id,eventId,0,1);const e=(await get()).state!.entrants.find(e=>e.entrantId===id)!;expect(e.stint!.tyre.compound).toBe(compound);expect(e.pit!.stops[0].newCompound).toBe(compound);expect(e.pit!.stints[1].startingTyre.compound).toBe(compound);});
 it.each([{trackWater:-1},{trackWater:1001},{rainfallIntensity:-1},{rainfallIntensity:1001},{drsState:"INVALID"},{trackTemperatureMilliC:80001},{airTemperatureMilliC:60001}])("SQL rejects invalid weather %j",async data=>{await start();const w=await client.careerRaceWeather.findFirstOrThrow({where:{careerId:career.id}});await expect(client.careerRaceWeather.update({where:{careerRaceSimulationId:w.careerRaceSimulationId},data})).rejects.toThrow();});
 it("rejects weather linked to another Career",async()=>{await start();const other=await createCareer(repository,input),w=await client.careerRaceWeather.findFirstOrThrow({where:{careerId:career.id}});await expect(client.careerRaceWeather.update({where:{careerRaceSimulationId:w.careerRaceSimulationId},data:{careerId:other.id}})).rejects.toThrow();});
 it("rejects player pit control of AI car",async()=>{const d=await start(),id=d.state!.input.entrants.find(e=>e.teamId!==d.progress.career.playerTeamId)!.entrantId;await expect(changeCareerPitRequest(races,career.id,eventId,id,0,0,"WET")).rejects.toMatchObject({code:"INVALID_ACTION"});});
 it("resume through mixed weather, AI stops and DRS equals pure engine",async()=>{const d=await start();let expected=d.state!;for(let lap=0;lap<20;lap+=5){expected=advanceRace(expected,5);await advanceCareerRace(races,career.id,eventId,lap,5);expect((await get()).state).toEqual(expected);}expect(expected.weather!.drsState).toBe("DRS_DISABLED_WET");const id=player(d),e=expected.entrants.find(e=>e.entrantId===id)!;await changeCareerPitRequest(races,career.id,eventId,id,20,e.pit!.commandRevision,"WET");const checkpoint=(await get()).state!;expected=advanceRace(checkpoint,1000);await advanceCareerRace(races,career.id,eventId,20,"finish");expect((await get()).state).toEqual(expected);expect(expected.weather!.trackWater).toBe(0);expect(expected.weather!.drsState).toBe("DRS_ENABLED");expect(expected.entrants.filter(e=>e.entrantId!==id).some(e=>e.pit!.stops.some(p=>p.newCompound==="INTERMEDIATE"))).toBe(true);});
 it("rolls back weather and every entrant on checkpoint failure",async()=>{const d=await start();await expect(races.changeRace(career.id,eventId,x=>({state:{...advanceRace(x.state!,1),weather:{...x.state!.weather!,trackWater:1001}},labels:x.labels,progress:x.progress}))).rejects.toThrow();expect((await get()).state).toEqual(d.state);});
 it("concurrent advances commit only one weather step",async()=>{const d=await start(),results=await Promise.allSettled([advanceCareerRace(races,career.id,eventId,0,5),advanceCareerRace(races,career.id,eventId,0,5)]);expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect((await get()).state).toEqual(advanceRace(d.state!,5));});
});

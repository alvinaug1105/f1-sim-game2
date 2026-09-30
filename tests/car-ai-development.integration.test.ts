import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createPrismaClient } from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
import { developmentContent as source } from "../src/data/seed/content-development";
import { PrismaCareerRepository } from "../src/data/repositories/prisma-career";
import { PrismaProgressionRepository } from "../src/data/repositories/prisma-progression";
import { PrismaPracticeRepository } from "../src/data/repositories/prisma-practice";
import { PrismaQualifyingRepository } from "../src/data/repositories/prisma-qualifying";
import { PrismaRaceRepository } from "../src/data/repositories/prisma-race";
import { PrismaCarDesignRepository } from "../src/data/repositories/prisma-car-design";
import { PrismaCarPhysicalRepository } from "../src/data/repositories/prisma-car-physical";
import { reconcileAiCarDevelopment } from "../src/data/repositories/prisma-car-ai";
import { loadManagementTeams, fittedCarStats } from "../src/data/repositories/prisma-car-management";
import { createCareer } from "../src/features/career/create-career";
import { advanceToNextEvent, runSessionAction } from "../src/features/career/progression";
import { startPracticeSession, simulatePracticeSession, simulatePracticeRemainder } from "../src/features/practice/service";
import { simulateQualifyingSession } from "../src/features/qualifying/service";
import { startIncidentCareerRace, advanceCareerRace, simulateCareerRace } from "../src/features/race/service";
import { projectRaceView } from "../src/features/race/projection";
import { simulateRace } from "../src/simulation/race/engine";
import { CAR_PERFORMANCE_DIMENSIONS, storedPartDesign, deriveSessionCarPerformance, sourceCarStats } from "../src/game/domain/car-development";
import { planCarPartDesign } from "../src/game/domain/car-design-project";
import type { Career } from "../src/game/domain/career";

const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error("TEST_DATABASE_URL required; PostgreSQL tests did not run.");
const schema = `ai17d_${randomUUID().replaceAll("-", "")}`, url = new URL(value);
url.searchParams.set("schema", schema);
const adminUrl = new URL(value); adminUrl.searchParams.delete("schema");
const admin = new Pool({ connectionString: adminUrl.toString() }), client = createPrismaClient(url.toString());
const careers = new PrismaCareerRepository(client), progression = new PrismaProgressionRepository(client);
const input = { name: "Phase 17D", gameDatabaseId: source.database.id, seasonId: source.seasons[0].id, playerTeamId: source.teams[0].id };
let career: Career;
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe", timeout: 45000 });
});
beforeEach(async () => { await seedDevelopmentContent(client); career = await createCareer(careers, input); });
afterAll(async () => { await client.$disconnect(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });
const scope = (teamId = career.playerTeamId) => ({ careerId: career.id, careerSeasonId: career.currentSeasonId, careerTeamId: teamId });
async function reconcile() {
  await client.$transaction(async tx => {
    await tx.career.update({ where: { id: career.id }, data: { updatedAt: new Date() } });
    await reconcileAiCarDevelopment(tx, career.id);
  }, { timeout: 15000 });
}
async function enter() { const next = (await progression.getProgress(career.id))!.events.find(event => event.status === "UPCOMING")!; return advanceToNextEvent(progression, career.id, next.id); }
async function completeScaffold(eventId: string) {
  const sessions = (await progression.getProgress(career.id))!.events.find(event => event.id === eventId)!.weekend!.sessions;
  for (const session of sessions) {
    if (session.type.startsWith("PRACTICE")) await runSessionAction(progression, career.id, eventId, session.id, "simulatePractice");
    else { await runSessionAction(progression, career.id, eventId, session.id, "start"); await runSessionAction(progression, career.id, eventId, session.id, "completeDevelopment"); }
  }
}
async function playerUpgrade() {
  const base = await client.careerCarPartDesign.findFirstOrThrow({ where: { ...scope(), partType: "FRONT_WING", version: 1 } });
  const design = await client.careerCarPartDesign.create({ data: { ...base, id: randomUUID(), version: 2, lowSpeed: base.lowSpeed + 2 } });
  await client.careerCarPartUnit.create({ data: { ...scope(), partType: "FRONT_WING", designId: design.id, unitNumber: 1, manufacturedAtCareerDate: new Date(`${career.currentDate}T00:00:00Z`) } });
  return design;
}
describe("Phase 17D shared mechanics and precision PostgreSQL", () => {
  it("initializes 20 rival projects atomically with identical shared design maths and diverse choices", async () => {
    const projects = await client.careerCarDesignProject.findMany({ where: { careerId: career.id }, include: { basePartDesign: true } });
    expect(projects).toHaveLength(20);
    expect(projects.every(project => project.careerTeamId !== career.playerTeamId)).toBe(true);
    expect(new Set(projects.map(project => `${project.partType}:${project.focus}:${project.programme}`)).size).toBeGreaterThanOrEqual(4);
    for (const project of projects) {
      const same = planCarPartDesign(storedPartDesign(project.basePartDesign), project.focus, project.programme, career.currentDate);
      expect([project.plannedLowSpeed, project.plannedMediumSpeed, project.plannedHighSpeed, project.plannedDragReduction, project.plannedDrsEfficiency])
        .toEqual(CAR_PERFORMANCE_DIMENSIONS.map(dimension => same.planned.stats[dimension]));
      expect(project.completesAtCareerDate.toISOString().slice(0,10)).toBe(same.completesAtCareerDate);
    }
    const teams = await client.careerSeasonTeamEntry.findMany({ where: { careerId: career.id }, include: { team: true } });
    for (const team of teams) expect(deriveSessionCarPerformance(sourceCarStats(team))).toBe(source.teamEntries.find(entry => entry.teamId === team.team.sourceTeamId)!.carPerformance);
    await reconcile();
    expect(await client.careerCarDesignProject.count({ where: { careerId: career.id } })).toBe(20);
  });
  it("rolls back the whole Career when AI initialization fails", async () => {
    const before = await client.career.count();
    await admin.query(`CREATE FUNCTION "${schema}".reject_ai() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected AI initialization failure'; END $$; CREATE TRIGGER reject_ai BEFORE INSERT ON "${schema}"."CareerCarDesignProject" FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_ai();`);
    try { await expect(createCareer(careers, input)).rejects.toMatchObject({ code: "PERSISTENCE_FAILED" }); }
    finally { await admin.query(`DROP TRIGGER reject_ai ON "${schema}"."CareerCarDesignProject"; DROP FUNCTION "${schema}".reject_ai();`); }
    expect(await client.career.count()).toBe(before);
  });
  it("preserves source technical/style snapshots and leaves old physical or absent-foundation Careers outside AI", async () => {
    await client.seasonTeamEntry.updateMany({ data: { developmentStyle: null, lowSpeedPerformance: 90, mediumSpeedPerformance: 90, highSpeedPerformance: 90, dragReductionPerformance: 90, drsEfficiencyPerformance: 90 } });
    const old = await createCareer(careers, input);
    const frozen = await client.careerSeasonTeamEntry.findMany({ where: { careerId: old.id } });
    await seedDevelopmentContent(client);
    const fresh = await createCareer(careers, input);
    expect(await client.careerSeasonTeamEntry.findMany({ where: { careerId: old.id } })).toEqual(frozen);
    expect(await client.careerCarDesignProject.count({ where: { careerId: old.id } })).toBe(0);
    const newEntry = await client.careerSeasonTeamEntry.findFirstOrThrow({ where: { careerId: fresh.id, careerTeamId: fresh.playerTeamId } });
    expect(newEntry.developmentStyle).toBe("BALANCED");
    expect(sourceCarStats(newEntry)).toEqual(sourceCarStats(source.teamEntries[0]));
    await client.careerCarFitment.deleteMany({ where: { careerId: old.id } });
    await client.careerCarPartUnit.deleteMany({ where: { careerId: old.id } });
    await client.careerSeasonDriverEntry.updateMany({ where: { careerId: old.id }, data: { carSlot: null } });
    const entered = await advanceToNextEvent(progression, old.id, (await progression.getProgress(old.id))!.events[0].id);
    const first = entered.events[0];
    expect((await startPracticeSession(new PrismaPracticeRepository(client), old.id, first.id, first.weekend!.sessions[0].id)).state!.input.entrants[0].car.performance).toBe(90);
    expect(await client.careerCarDesignProject.count({ where: { careerId: old.id } })).toBe(0);
    expect(await client.careerCarPartUnit.count({ where: { careerId: old.id } })).toBe(0);
  });
  it("completes the persisted AI design/manufacture/fit loop on normal progression", async () => {
    const initial = await client.careerCarDesignProject.findMany({ where: { careerId: career.id } });
    let entered = await enter(); const eventId = entered.events[0].id;
    const manufactured = await client.careerCarManufacturingOrder.findMany({ where: { careerId: career.id }, include: { design: true } });
    expect(manufactured.length).toBeGreaterThan(0);
    for (const order of manufactured) {
      expect(order.quantity).toBe(2);
      const days = (order.completesAtCareerDate.getTime() - order.startedAtCareerDate.getTime()) / 86400000;
      expect(days).toBe(({FRONT_WING:3,REAR_WING:3,UNDERFLOOR:5,SIDEPODS:4,CHASSIS:6,SUSPENSION:4})[order.partType]*2);
      expect(initial.some(project=>project.careerTeamId===order.careerTeamId && project.partType===order.partType)).toBe(true);
    }
    await completeScaffold(eventId); entered = await enter();
    const completed = await client.careerCarManufacturingOrder.findMany({ where: { careerId: career.id, status: "COMPLETED" } });
    expect(completed.length).toBeGreaterThan(0);
    for (const order of completed) {
      expect(await client.careerCarPartUnit.count({ where: { designId: order.designId } })).toBe(2);
      expect(await client.careerCarFitment.count({ where: { careerId: career.id, unit: { designId: order.designId } } })).toBe(2);
    }
    const race = (await new PrismaRaceRepository(client).getRace(career.id, entered.events[1].id))!;
    expect(race.roster.some(row=>row.teamId!==career.playerTeamId && row.balance!.carPerformance > source.teamEntries[row.teamOrder-1].carPerformance)).toBe(true);
    expect(await client.careerCarDesignProject.count({ where: { ...scope(), status: "ACTIVE" } })).toBe(0);
  });
  it("consumes a single actual AI unit for Car 1, blocks fitting during a session and never downgrades", async () => {
    const ai = await client.careerSeasonTeamEntry.findFirstOrThrow({ where: { careerId: career.id, careerTeamId: { not: career.playerTeamId } }, orderBy: { entryOrder: "asc" } });
    const base = await client.careerCarPartDesign.findFirstOrThrow({ where: { ...scope(ai.careerTeamId), partType: "FRONT_WING", version: 1 } });
    const improved = await client.careerCarPartDesign.create({ data: { ...base, id:randomUUID(), version:2, lowSpeed:100 } });
    await client.careerCarPartUnit.create({ data: { ...scope(ai.careerTeamId), partType:"FRONT_WING", designId:improved.id, unitNumber:1, manufacturedAtCareerDate:new Date(`${career.currentDate}T00:00:00Z`) } });
    const entered = await enter(), event=entered.events[0];
    const practice=new PrismaPracticeRepository(client), sessionId=event.weekend!.sessions[0].id;
    const started=await startPracticeSession(practice,career.id,event.id,sessionId);
    await client.careerCarPartUnit.create({ data: { ...scope(ai.careerTeamId), partType:"FRONT_WING", designId:improved.id, unitNumber:2, manufacturedAtCareerDate:new Date(`${career.currentDate}T00:00:00Z`) } });
    await reconcile();
    // Entry into the weekend fits the single unit once, prior to session start.
    const fitments=await client.careerCarFitment.findMany({where:{...scope(ai.careerTeamId),partType:"FRONT_WING"},include:{unit:true},orderBy:{carSlot:"asc"}});
    expect(fitments.map(row=>row.unit.designId)).toEqual([improved.id,base.id]);
    expect(await client.careerCarPartUnit.count({where:{designId:improved.id}})).toBe(2);
    expect(new Set(fitments.map(row=>row.partUnitId)).size).toBe(2);
    expect((await practice.getPractice(career.id,event.id,sessionId))!.state!.input).toEqual(started.state!.input);
    expect(started.state!.input.entrants.find(row=>row.teamId===ai.careerTeamId)!.car.performance).toBeGreaterThan(ai.carPerformance!);
    await simulatePracticeRemainder(practice,career.id,event.id,sessionId);
    expect(await client.careerCarFitment.count({where:{...scope(ai.careerTeamId),unit:{designId:improved.id}}})).toBe(2);
    const worse=await client.careerCarPartDesign.create({data:{...base,id:randomUUID(),version:3,lowSpeed:base.lowSpeed-1}});
    await client.careerCarPartUnit.create({data:{...scope(ai.careerTeamId),partType:"FRONT_WING",designId:worse.id,unitNumber:1,manufacturedAtCareerDate:new Date(`${career.currentDate}T00:00:00Z`)}});
    await reconcile();
    expect(await client.careerCarFitment.count({where:{...scope(ai.careerTeamId),unit:{designId:worse.id}}})).toBe(0);
  });
  it("preserves 93.2 through every session kind, freeze, Race reload and the public projection", async () => {
    const upgraded = await playerUpgrade();
    await new PrismaCarPhysicalRepository(client).fit(career.id,"CAR_1",upgraded.id);
    expect((await new PrismaCarDesignRepository(client).getOverview(career.id))!.physical!.cars[0].sessionPerformance).toBe(93.2);
    const driver=await client.careerSeasonDriverEntry.findFirstOrThrow({where:{careerId:career.id,carSlot:"CAR_1",teamEntry:{careerTeamId:career.playerTeamId}}});
    const practice=new PrismaPracticeRepository(client), qualifying=new PrismaQualifyingRepository(client), race=new PrismaRaceRepository(client);
    const entered=await enter(), event=entered.events[0], sessions=event.weekend!.sessions;
    const p=await startPracticeSession(practice,career.id,event.id,sessions[0].id);
    expect(p.state!.input.entrants.find(row=>row.driverId===driver.careerDriverId)!.car.performance).toBe(93.2);
    const v1=await client.careerCarPartDesign.findFirstOrThrow({where:{...scope(),partType:"FRONT_WING",version:1}});
    await expect(new PrismaCarPhysicalRepository(client).fit(career.id,"CAR_1",v1.id)).rejects.toMatchObject({code:"SESSION_IN_PROGRESS"});
    await simulatePracticeRemainder(practice,career.id,event.id,sessions[0].id);
    await simulatePracticeSession(practice,career.id,event.id,sessions[1].id); await simulatePracticeSession(practice,career.id,event.id,sessions[2].id);
    const q=await simulateQualifyingSession(qualifying,career.id,event.id);
    expect(q.state!.input.entrants.find(row=>row.driverId===driver.careerDriverId)!.car.performance).toBe(93.2);
    await startIncidentCareerRace(race,career.id,event.id,{},1717);
    const started=(await race.getRace(career.id,event.id))!;
    expect(started.state!.input.entrants.find(row=>row.driverId===driver.careerDriverId)!.car.performance).toBe(93.2);
    const continuous=simulateRace(started.state!.input);
    await advanceCareerRace(race,career.id,event.id,0,1);
    const reloaded=(await new PrismaRaceRepository(client).getRace(career.id,event.id))!;
    await advanceCareerRace(new PrismaRaceRepository(client),career.id,event.id,reloaded.state!.lap,"finish");
    const finished=(await race.getRace(career.id,event.id))!;
    expect(finished.state).toEqual(continuous.state);
    expect(JSON.stringify(projectRaceView(finished))).not.toMatch(/developmentStyle|designId|partUnitId|manufacturingOrders|lowSpeedPerformance/);
    const sprintEntered=await enter(), sprintEvent=sprintEntered.events[1];
    await simulatePracticeSession(practice,career.id,sprintEvent.id,sprintEvent.weekend!.sessions[0].id);
    const sq=await simulateQualifyingSession(new PrismaQualifyingRepository(client,"SPRINT_QUALIFYING"),career.id,sprintEvent.id);
    expect(sq.state!.input.entrants.find(row=>row.driverId===driver.careerDriverId)!.car.performance).toBe(93.2);
    const sprintRace=new PrismaRaceRepository(client,"SPRINT"); await simulateCareerRace(sprintRace,career.id,sprintEvent.id,1718);
    expect((await sprintRace.getRace(career.id,sprintEvent.id))!.state!.input.entrants.find(row=>row.driverId===driver.careerDriverId)!.car.performance).toBe(93.2);
  },60000);
  it("retains player authorization, manufacturing capacity and one-unit concurrency under the shared services", async () => {
    const physical=new PrismaCarPhysicalRepository(client), rival=await client.careerCarPartDesign.findFirstOrThrow({where:{careerId:career.id,careerTeamId:{not:career.playerTeamId}}});
    await expect(physical.startManufacturing(career.id,rival.id,2)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(physical.fit(career.id,"CAR_1",rival.id)).rejects.toMatchObject({code:"NO_UNIT"});
    const designs=await client.careerCarPartDesign.findMany({where:scope(),orderBy:{partType:"asc"}});
    await physical.startManufacturing(career.id,designs[0].id,1);
    const concurrent=await Promise.allSettled([physical.startManufacturing(career.id,designs[1].id,1),physical.startManufacturing(career.id,designs[2].id,1)]);
    expect(concurrent.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(await client.careerCarManufacturingOrder.count({where:{...scope(),status:"ACTIVE"}})).toBe(2);
    const upgraded=await playerUpgrade();
    const fits=await Promise.allSettled([physical.fit(career.id,"CAR_1",upgraded.id),physical.fit(career.id,"CAR_2",upgraded.id)]);
    expect(fits.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(await client.careerCarFitment.count({where:{...scope(),unit:{designId:upgraded.id}}})).toBe(1);
  });
  it("keeps AI decisions stable across repeated initialization and a different selected player team", async () => {
    const second=await createCareer(careers,{...input,playerTeamId:source.teams[1].id});
    const signature=async(id:string)=>(await client.careerCarDesignProject.findMany({where:{careerId:id},include:{teamEntry:{include:{team:true}}}}))
      .filter(row=>![source.teams[0].id,source.teams[1].id].includes(row.teamEntry.team.sourceTeamId!))
      .map(row=>[row.teamEntry.team.sourceTeamId,row.partType,row.focus,row.programme,row.completesAtCareerDate.toISOString()]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(await signature(career.id)).toEqual(await signature(second.id));
  });
});

it("runs a complete 24-round season on real session engines with evolving physical AI cars", async () => {
  const timings:number[]=[], started=performance.now();
  const events=(await progression.getProgress(career.id))!.events;
  for(const event of events){
    const tick=performance.now();
    const entered=await advanceToNextEvent(progression,career.id,event.id);
    timings.push(performance.now()-tick);
    for(const session of entered.events.find(row=>row.id===event.id)!.weekend!.sessions){
      const owner=await client.career.findUniqueOrThrow({where:{id:career.id}});
      const before=await loadManagementTeams(client,owner);
      let entrants:readonly {driverId:string;car:{performance:number}}[];
      if(session.type.startsWith("PRACTICE")) entrants=(await simulatePracticeSession(new PrismaPracticeRepository(client),career.id,event.id,session.id)).state!.input.entrants;
      else if(session.type==="QUALIFYING"||session.type==="SPRINT_QUALIFYING") entrants=(await simulateQualifyingSession(new PrismaQualifyingRepository(client,session.type),career.id,event.id)).state!.input.entrants;
      else {
        const race=new PrismaRaceRepository(client,session.type as "SPRINT"|"RACE");
        await simulateCareerRace(race,career.id,event.id,17000+event.round);
        entrants=(await race.getRace(career.id,event.id))!.state!.input.entrants;
      }
      for(const team of before) for(const driver of team.drivers.filter(row=>row.role==="RACE_DRIVER")) {
        const expected=deriveSessionCarPerformance(fittedCarStats(team,driver.carSlot!));
        expect(entrants.find(row=>row.driverId===driver.careerDriverId)!.car.performance).toBe(expected);
        if(event.round===1) expect(expected).toBe(team.carPerformance);
      }
    }
    const now=(await client.career.findUniqueOrThrow({where:{id:career.id}})).currentDate;
    expect(await client.careerCarDesignProject.count({where:{careerId:career.id,status:"ACTIVE",completesAtCareerDate:{lte:now}}})).toBe(0);
    expect(await client.careerCarManufacturingOrder.count({where:{careerId:career.id,status:"ACTIVE",completesAtCareerDate:{lte:now}}})).toBe(0);
  }
  const owner=await client.career.findUniqueOrThrow({where:{id:career.id}}),teams=await loadManagementTeams(client,owner);
  const identity=await client.careerTeam.findMany({where:{careerId:career.id}});
  const rows=teams.map(team=>{
    const car1=fittedCarStats(team,"CAR_1"),car2=fittedCarStats(team,"CAR_2");
    expect(team.designProjects.length).toBeGreaterThan(2);
    expect(team.designProjects.filter(row=>row.status==="ACTIVE").length).toBeLessThanOrEqual(2);
    expect(team.manufacturingOrders.filter(row=>row.status==="ACTIVE").length).toBeLessThanOrEqual(2);
    expect(team.fitments).toHaveLength(12);
    expect(new Set(team.fitments.map(row=>row.partUnitId)).size).toBe(12);
    for(const design of team.partDesigns)for(const dimension of CAR_PERFORMANCE_DIMENSIONS)expect(design[dimension]).toBeLessThanOrEqual(100);
    expect(Object.values(car1).every(value=>value===100)).toBe(false);
    expect(deriveSessionCarPerformance(car1)).toBeGreaterThan(deriveSessionCarPerformance(sourceCarStats(team)));
    return {team:identity.find(row=>row.id===team.careerTeamId)!.name,style:team.developmentStyle,startPerformance:deriveSessionCarPerformance(sourceCarStats(team)),
      endPerformance:deriveSessionCarPerformance(car1),designsStarted:team.designProjects.length,designsCompleted:team.designProjects.filter(row=>row.status==="COMPLETED").length,
      manufacturingCompleted:team.manufacturingOrders.filter(row=>row.status==="COMPLETED").length,highestVersion:Math.max(...team.partDesigns.map(row=>row.version)),
      car1:deriveSessionCarPerformance(car1),car2:deriveSessionCarPerformance(car2),endStats:car1};
  });
  expect(new Set(rows.map(row=>JSON.stringify(row.endStats))).size).toBeGreaterThan(3);
  expect(await client.careerCarDesignProject.count({where:scope()})).toBe(0);
  expect(await client.careerCarManufacturingOrder.count({where:scope()})).toBe(0);
  expect((await new PrismaCarDesignRepository(client).getOverview(career.id))!.physical!.cars.map(row=>row.sessionPerformance)).toEqual([93,93]);
  expect(await client.careerCalendarEvent.count({where:{careerId:career.id,status:"COMPLETED"}})).toBe(24);
  const report={careerId:career.id,rounds:24,realRaceSessions:30,elapsedMs:Math.round(performance.now()-started),
    progressionMaxMs:Math.round(Math.max(...timings)),progressionMeanMs:Math.round(timings.reduce((a,b)=>a+b,0)/timings.length),rows};
  writeFileSync("/tmp/f1-phase17d-campaign.json",JSON.stringify(report,null,2));
},180000);

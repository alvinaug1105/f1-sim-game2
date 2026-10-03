import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

const baseUrl=process.env.TEST_DATABASE_URL;
if(!baseUrl)throw new Error('TEST_DATABASE_URL is required for disposable PostgreSQL persistence QA');
const ranges=JSON.parse(await readFile(resolve('qa/race-v8-final/seed-ranges.json'),'utf8'));
const seedBase=ranges.ranges.supplemental.start+20000;
const schema='race_v8remote_'+randomUUID().replaceAll('-','');
const scoped=new URL(baseUrl);scoped.searchParams.set('schema',schema);
const adminUrl=new URL(baseUrl);adminUrl.searchParams.delete('schema');
const admin=new Pool({connectionString:adminUrl.toString()});
const clientModule=await import(pathToFileURL(resolve('src/data/prisma/connection.ts')).href);
const {createPrismaClient}=clientModule;
const client=createPrismaClient(scoped.toString());
const load=async path=>import(pathToFileURL(resolve(path)).href);
const [{seedDevelopmentContent},{developmentContent:content},{PrismaCareerRepository},{PrismaRaceRepository},{PrismaProgressionRepository},{createCareer},{advanceToNextEvent,runSessionAction},{startProgressionCareerRace},{createRace,advanceRace},{developmentWeather}]=await Promise.all([
  load('src/data/seed/seed-content.ts'),load('src/data/seed/content-development.ts'),load('src/data/repositories/prisma-career.ts'),load('src/data/repositories/prisma-race.ts'),load('src/data/repositories/prisma-progression.ts'),load('src/features/career/create-career.ts'),load('src/features/career/progression.ts'),load('src/features/race/service.ts'),load('src/simulation/race/engine.ts'),load('src/simulation/race/weather/model.ts'),
]);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
const careers=new PrismaCareerRepository(client),races=new PrismaRaceRepository(client),progression=new PrismaProgressionRepository(client);
const get=async(careerId,eventId)=>(await races.getRace(careerId,eventId))?.state;
const tags=['GREEN','PIT_ENTRY','PIT_LANE','PIT_SERVICE','PIT_EXIT','SC','VSC','WEATHER_CROSSOVER','BOOST_DEPLETION','OVERTAKE_QUALIFICATION'];
const results=[],errors=[];
let careerId=null,eventId=null;
try {
  await admin.query('CREATE SCHEMA \"'+schema+'\"');
  execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:scoped.toString()},timeout:60000,stdio:'pipe'});
  await seedDevelopmentContent(client);
  const career=await createCareer(careers,{name:'Race v8 final remote persistence QA',gameDatabaseId:content.database.id,seasonId:content.seasons[0].id,playerTeamId:content.teams[0].id});
  careerId=career.id;
  const progress=(await progression.getProgress(career.id));
  eventId=progress.events[0].id;
  const entered=await advanceToNextEvent(progression,career.id,eventId),sessions=entered.events[0].weekend.sessions;
  for(const session of sessions.filter(s=>s.type.startsWith('PRACTICE')))await runSessionAction(progression,career.id,eventId,session.id,'simulatePractice');
  const qualifying=sessions.find(s=>s.type==='QUALIFYING');
  await runSessionAction(progression,career.id,eventId,qualifying.id,'start');
  await runSessionAction(progression,career.id,eventId,qualifying.id,'completeDevelopment');
  await startProgressionCareerRace(races,career.id,eventId,{},42);
  const starting=(await races.getRace(career.id,eventId)).state;
  if(starting.simulationVersion!==8||starting.input.progression.version!==4)throw new Error('production progression revision 4 was not created');

  for(let i=0;i<100;i++) {
    const seed=seedBase+i,tag=tags[i%tags.length],input=structuredClone(starting.input);
    input.seed=seed;
    input.weather=developmentWeather(seed,input.totalLaps);
    if(tag==='SC')input.incidents={...input.incidents,scMajorPermille:1000,vscMinorPermille:0,vscRetirementPermille:0};
    if(tag==='VSC')input.incidents={...input.incidents,scMajorPermille:0,vscMinorPermille:1000,vscRetirementPermille:0};
    if(tag==='WEATHER_CROSSOVER'){
      const change=Math.max(2,Math.floor(input.totalLaps*.5));
      input.weather={...input.weather,timeline:[{startLap:1,rainfall:0,airTemperatureMilliC:24000},{startLap:change,rainfall:800,airTemperatureMilliC:19000}],forecast:[{arrivalMinLap:change-2,arrivalMaxLap:change+2,rainfallMin:650,rainfallMax:950}],initial:{...input.weather.initial,rainfallIntensity:0,trackWater:0,drsState:'DRS_ENABLED'}};
    }
    let state=createRace(input),targetLap=Math.max(1,Math.min(input.totalLaps-1,Math.round((i+1)*input.totalLaps/101))),fallback=null,chosen=null;
    if(tag==='BOOST_DEPLETION')state={...state,progression:{...state.progression,cars:Object.fromEntries(Object.entries(state.progression.cars).map(([id,car])=>[id,{...car,assistance:{...car.assistance,policy:'BOOST'}}]))}};
    while(state.status==='RUNNING') {
      state=advanceRace(state,1);
      if(state.status!=='RUNNING')break;
      if(state.lap===targetLap)fallback=structuredClone(state);
      const routes=Object.values(state.progression.cars).map(c=>c.route);
      const hasEnergy=Object.values(state.progression.cars).some(c=>c.assistance?.policy==='BOOST'&&c.assistance.energy<=100);
      const hit=tag==='GREEN'?state.incidents.mode==='GREEN'&&state.lap>0:
        tag==='PIT_ENTRY'?routes.includes('ENTRY'):
        tag==='PIT_LANE'?routes.includes('LANE'):
        tag==='PIT_SERVICE'?routes.includes('SERVICE'):
        tag==='PIT_EXIT'?routes.includes('EXIT'):
        tag==='SC'?state.incidents.mode==='SAFETY_CAR':
        tag==='VSC'?state.incidents.mode==='VSC':
        tag==='WEATHER_CROSSOVER'?state.input.weather.timeline.some(seg=>seg.startLap>1&&seg.startLap<=state.lap):
        tag==='BOOST_DEPLETION'?hasEnergy:
        Object.values(state.progression.cars).some(c=>c.assistance&&c.assistance.qualifiedLap!==null);
      if(hit)chosen=structuredClone(state);
    }
    const snapshot=chosen||fallback;
    if(!snapshot)throw new Error('could not produce running persistence checkpoint for case '+i);
    await races.changeRace(career.id,eventId,data=>({state:snapshot,labels:data.labels,progress:data.progress}));
    const reloaded=await get(career.id,eventId);
    const exact=canonical(reloaded)===canonical(snapshot);
    if(!exact)errors.push({case:i,tag,seed,reason:'PostgreSQL reload differs from saved checkpoint'});
    const nextLaps=Math.min(1,snapshot.input.totalLaps-snapshot.lap);
    const expected=advanceRace(snapshot,nextLaps);
    await races.changeRace(career.id,eventId,data=>({state:advanceRace(data.state,nextLaps),labels:data.labels,progress:data.progress}));
    const continued=await get(career.id,eventId);
    const continuationEqual=canonical(continued)===canonical(expected);
    if(!continuationEqual)errors.push({case:i,tag,seed,reason:'PostgreSQL continuation differs from in-memory continuation'});
    results.push({case:i,tag,seed,lap:snapshot.lap,totalLaps:snapshot.input.totalLaps,incidentMode:snapshot.incidents.mode,weather:snapshot.weather,carRoutes:Array.from(new Set(Object.values(snapshot.progression.cars).map(c=>c.route))),exactReload:exact,continuationEqual,usedTargetState:Boolean(chosen)});
    if((i+1)%10===0)process.stdout.write(JSON.stringify({completed:i+1,total:100,failures:errors.length})+'\n');
  }
} finally {
  await client.$disconnect();
  if(careerId)await admin.query('DROP SCHEMA IF EXISTS \"'+schema+'\" CASCADE');
  await admin.end();
}
const summary={productionSHA:'55846a9c465b58fc5687517ace67772421868dff',scenarioCount:results.length,exactReloads:results.filter(x=>x.exactReload).length,continuationMatches:results.filter(x=>x.continuationEqual).length,uniqueSeedCount:new Set(results.map(x=>x.seed)).size,tagCounts:Object.fromEntries(tags.map(t=>[t,results.filter(x=>x.tag===t).length])),targetStateMatches:results.filter(x=>x.usedTargetState).length,targetStateMatchesByTag:Object.fromEntries(tags.map(t=>[t,results.filter(x=>x.tag===t&&x.usedTargetState).length])),targetStateMisses:results.filter(x=>!x.usedTargetState).map(x=>({case:x.case,tag:x.tag,seed:x.seed})),failures:errors};
await writeFile(resolve('qa-out/postgres-persistence.json'),JSON.stringify({summary,results},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(results.length!==100||summary.uniqueSeedCount!==100||errors.length)process.exitCode=1;

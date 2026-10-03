import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';

process.env.RACE_QA_IMPORT_ONLY='1';
const {buildInput}=await import(pathToFileURL(resolve('qa/race-v8-final/worker.mjs')).href);
const {createRace,advanceRace}=await import(pathToFileURL(resolve('src/simulation/race/engine.ts')).href);
const {progressionCForCircuit}=await import(pathToFileURL(resolve('src/data/seed/circuit-progression.ts')).href);
const {defaultPitConfiguration}=await import(pathToFileURL(resolve('src/simulation/race/pits/profiles.ts')).href);
const {defaultAiStrategyConfiguration}=await import(pathToFileURL(resolve('src/simulation/race/pits/ai-strategy.ts')).href);
const {defaultRacecraftConfiguration}=await import(pathToFileURL(resolve('src/simulation/race/traffic/racecraft.ts')).href);
const {circuitInteractionConfiguration}=await import(pathToFileURL(resolve('src/simulation/race/traffic/profiles.ts')).href);
const {weatherTyreConfiguration}=await import(pathToFileURL(resolve('src/simulation/race/tyres/profiles.ts')).href);
const {defaultIncidentConfiguration}=await import(pathToFileURL(resolve('src/simulation/race/incidents/model.ts')).href);
const {developmentContent}=await import(pathToFileURL(resolve('src/data/seed/content-development.ts')).href);
const circuits=new Map(developmentContent.circuits.map(c=>[c.id,c]));
const manifestPath=resolve(process.argv[2]||'qa-out/full/manifest.jsonl'),out=resolve(process.argv[3]||'qa-out/performance');
const jobs=[];for await(const line of createInterface({input:createReadStream(manifestPath),crlfDelay:Infinity}))if(line)jobs.push(JSON.parse(line));
const pick=(count)=>Array.from({length:count},(_,i)=>jobs[Math.floor(i*jobs.length/count)]);
function simulate(input){let state=createRace(input);while(state.status==='RUNNING')state=advanceRace(state,1);return state;}
function memory(){const m=process.memoryUsage();return{rss:m.rss,heapUsed:m.heapUsed,heapTotal:m.heapTotal,activeResourceTypes:process.getActiveResourcesInfo()};}
function stats(values){const x=values.slice().sort((a,b)=>a-b);const mean=x.reduce((s,v)=>s+v,0)/x.length;const q=p=>{const i=(x.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return x[l]+(x[h]-x[l])*(i-l);};const sd=x.length>1?Math.sqrt(x.reduce((s,v)=>s+(v-mean)**2,0)/(x.length-1)):0;const half=x.length>1?1.96*sd/Math.sqrt(x.length):0;return{n:x.length,mean,median:q(.5),p90:q(.9),p95:q(.95),p99:q(.99),min:x[0],max:x.at(-1),sd,ci95:[mean-half,mean+half]};}
const benchmarks=[];
for(const count of [1,100,1000,10000]){
  if(count>jobs.length)throw new Error(`manifest cannot provide ${count} performance rows`);
  const selected=pick(count),before=memory(),started=performance.now(),raceMs=[];let completed=0;
  for(const job of selected){const input=buildInput(job),t=performance.now(),state=simulate(input);raceMs.push(performance.now()-t);if(state.status!=='FINISHED'||state.input.progression.version!==4)throw new Error(`bad v4 perf race ${job.scenarioId}`);completed++;if(completed%500===0)process.stdout.write(JSON.stringify({benchmark:`batch-${count}`,completed,total:count,elapsedMs:Math.round(performance.now()-started)})+'\n');}
  if(global.gc)global.gc();
  benchmarks.push({simulationVersion:8,progressionRevision:4,races:completed,wallMs:Math.round(performance.now()-started),perRaceSimulationMs:stats(raceMs),memoryBefore:before,memoryAfter:memory()});
}
const pairedJobs=pick(Math.min(100,jobs.length)),comparison=[];
for(const job of pairedJobs){
  const source=buildInput(job),v4Started=performance.now(),v4=simulate(source),v4Ms=performance.now()-v4Started;
  const c=circuits.get(job.circuitId);if(!c)throw new Error(`missing performance circuit ${job.circuitId}`);
  const progression=progressionCForCircuit(c.id,job.sessionKind==='SPRINT'?'SPRINT':'RACE');
  const v3Input={...source,progression,tyres:weatherTyreConfiguration(),pits:{...defaultPitConfiguration(),strategy:defaultAiStrategyConfiguration()},commands:{...source.commands,racecraft:defaultRacecraftConfiguration()},interaction:circuitInteractionConfiguration({overtakingDifficulty:c.overtakingDifficulty,dirtyAirSensitivityPermille:c.dirtyAirSensitivityPermille,drsEffectivenessPermille:c.drsEffectivenessPermille}),incidents:{...source.incidents,pitTrackSectionMs:defaultIncidentConfiguration().pitTrackSectionMs}};
  const v3Started=performance.now(),v3=simulate(v3Input),v3Ms=performance.now()-v3Started;
  if(v4.status!=='FINISHED'||v4.input.progression.version!==4||v3.status!=='FINISHED'||v3.input.progression.version!==3)throw new Error(`bad paired v3/v4 benchmark ${job.scenarioId}`);
  comparison.push({scenarioId:job.scenarioId,raceSeed:job.raceSeed,circuitId:job.circuitId,v3WallMs:v3Ms,v4WallMs:v4Ms,wallDeltaMs:v4Ms-v3Ms,v3Pits:v3.entrants.reduce((s,e)=>s+(e.pit?.stops.length||0),0),v4Pits:v4.entrants.reduce((s,e)=>s+(e.pit?.stops.length||0),0)});
}
if(global.gc)global.gc();
const report={productionSHA:'55846a9c465b58fc5687517ace67772421868dff',hostedIdentity:{runnerEnvironment:process.env.RUNNER_ENVIRONMENT??null,runnerOS:process.env.RUNNER_OS??null,runnerArch:process.env.RUNNER_ARCH??null,githubRunId:process.env.GITHUB_RUN_ID??null},benchmarks,revision3Vs4:{pairedRaces:comparison.length,revision3WallMs:stats(comparison.map(x=>x.v3WallMs)),revision4WallMs:stats(comparison.map(x=>x.v4WallMs)),pairedWallDeltaMs:stats(comparison.map(x=>x.wallDeltaMs)),scenarios:comparison},postGcMemory:memory()};
await mkdir(out,{recursive:true});await writeFile(resolve(out,'performance-analysis.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({productionSHA:report.productionSHA,batches:benchmarks.map(x=>({races:x.races,wallMs:x.wallMs})),revision3Vs4Pairs:comparison.length}));

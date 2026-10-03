import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

const PROD = '55846a9c465b58fc5687517ace67772421868dff';
const root = resolve(process.argv[2] || 'qa-out/full');
const out = resolve(process.argv[3] || 'qa-out/analysis');
const expected = { A: 12000, B: 3000, C: 9000, D: 3000, E: 2000, F: 1000 };
const keys = ['raceTimeMs','wallMs','totalLaps','passes','passAttempts','earlyPassAttempts','latePassAttempts','earlyPasses','latePasses','pitStops','incidents','safetyCarStarts','vscStarts','retirements','dsqs','nearFloorSamples','exactFloorSamples','longestSamePairNearFloorRun','longestClampOnlyRun','longestActiveAttackRun','longestRecatchingRun','deepCliffLaps'];
const values = Object.fromEntries(keys.map(k => [k, []]));
const campaigns = new Map(), circuits = new Map(), weatherFamilies = new Map(), commands = new Map(), modes = { pace: new Map(), fuel: new Map(), energy: new Map() }, fuelBurn = new Map();
const outliers = new Map(), failures = [], seen = new Set(), cliffStats = {}, compounds = {}, stintSequences = {};
const pitCounts = [];
const regulation = { GP: { races:0, dsqs:0, wetGridRaces:0, compliant:0, wetExempt:0, retired:0 }, SPRINT: { races:0, dsqs:0, incorrectDsqs:0 } };
const expectedCliffs = {
  SOFT:{degradationStartWear:400,cliffWear:780,progressivePenaltyMs:1700,cliffPenaltyMs:8500},
  MEDIUM:{degradationStartWear:450,cliffWear:830,progressivePenaltyMs:1300,cliffPenaltyMs:7000},
  HARD:{degradationStartWear:500,cliffWear:880,progressivePenaltyMs:1000,cliffPenaltyMs:5500},
  INTERMEDIATE:{degradationStartWear:420,cliffWear:820,progressivePenaltyMs:1300,cliffPenaltyMs:7000},
  WET:{degradationStartWear:450,cliffWear:850,progressivePenaltyMs:1200,cliffPenaltyMs:6500},
};
const nearFloorRunThresholds = Object.fromEntries([2,3,5,8,10,15,20].map(n=>[n,{all:0,clampOnly:0,activeAttack:0,recatching:0}]));
let laps = 0, entrants = 0, validRows = 0, attempts = 0, passes = 0, pits = 0, incidents = 0, sc = 0, vsc = 0, retirements = 0, dsqs = 0, numeric = 0, fuelCreation = 0, drsEligible = 0, drsBenefit = 0;

function stats(a) {
  const x = a.filter(Number.isFinite).sort((u,v)=>u-v);
  if (!x.length) return { n:0, mean:null, median:null, sd:null, p5:null, p25:null, p75:null, p90:null, p95:null, p99:null, min:null, max:null, ci95:null };
  const m = x.reduce((s,v)=>s+v,0)/x.length;
  const sd = x.length > 1 ? Math.sqrt(x.reduce((s,v)=>s+(v-m)*(v-m),0)/(x.length-1)) : 0;
  function q(p) { const i=(x.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i); return x[lo]+(x[hi]-x[lo])*(i-lo); }
  const half=x.length>1?1.96*sd/Math.sqrt(x.length):0;
  return { n:x.length, mean:m, median:q(.5), sd, p5:q(.05), p25:q(.25), p75:q(.75), p90:q(.9), p95:q(.95), p99:q(.99), min:x[0], max:x[x.length-1], ci95:[m-half,m+half] };
}
function proportion(s,n) {
  if (!n) return { n:0, successes:s, rate:null, ci95:null };
  const z=1.96,p=s/n,d=1+z*z/n,mid=(p+z*z/(2*n))/d,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return { n, successes:s, rate:p, ci95:[Math.max(0,mid-half),Math.min(1,mid+half)] };
}
function accumulator(map,key) {
  let a=map.get(key);
  if (!a) { a={ races:0, metrics:Object.fromEntries(keys.map(k=>[k,[]])), attempts:0, passes:0, transitions:[] }; map.set(key,a); }
  return a;
}
function addTop(name,value,row,extra={}) {
  if (!Number.isFinite(value)) return;
  let a=outliers.get(name); if(!a){a=[];outliers.set(name,a);}
  a.push(Object.assign({value,scenarioId:row.scenarioId,campaign:row.campaign,circuitId:row.circuitId,circuitName:row.circuitName,sessionKind:row.sessionKind,seedIndex:row.seedIndex,raceSeed:row.raceSeed,configurationHash:row.configurationHash,qaShardId:row.qaShardId,productionSHA:row.productionSHA,finalDigest:row.finalDigest},extra));
  a.sort((x,y)=>y.value-x.value||x.scenarioId.localeCompare(y.scenarioId)); if(a.length>100)a.length=100;
}
async function walk(dir) {
  let files=[];
  for(const e of await readdir(dir,{withFileTypes:true})) { const p=join(dir,e.name); if(e.isDirectory()) files=files.concat(await walk(p)); else if(e.name.endsWith('.jsonl.gz')) files.push(p); }
  return files.sort();
}
async function walkSuffix(dir,suffix){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())files=files.concat(await walkSuffix(p,suffix));else if(e.name.endsWith(suffix))files.push(p);}return files.sort();}
function groupReport(map) {
  return Object.fromEntries(Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,a])=>[k,{races:a.races,metrics:Object.fromEntries(Object.entries(a.metrics).map(([n,x])=>[n,stats(x)])),passSuccess:proportion(a.passes,a.attempts),passAttemptsPerRace:a.races?a.attempts/a.races:null,passesPerRace:a.races?a.passes/a.races:null,weatherTransitions:stats(a.transitions)}]));
}

const manifestText=await readFile(join(root,'manifest.jsonl'),'utf8');
const manifest=manifestText.trim().split('\n').map(x=>JSON.parse(x));
const expectedRows=new Map(manifest.map(x=>[x.scenarioId,x]));
if(expectedRows.size!==manifest.length) failures.push({reason:'duplicate manifest scenario ID'});
const counts=Object.fromEntries(Object.keys(expected).map(k=>[k,manifest.filter(x=>x.campaign===k).length]));

const telemetryFiles=await walk(root),retryBases=new Set(telemetryFiles.filter(file=>file.includes('/attempt-2/')).map(file=>file.slice(0,file.indexOf('/attempt-2/'))));
const supersededAttempt=file=>file.includes('/attempt-1/')&&retryBases.has(file.slice(0,file.indexOf('/attempt-1/')));
for(const file of telemetryFiles.filter(file=>!supersededAttempt(file))) {
  for await(const line of createInterface({input:createReadStream(file).pipe(createGunzip()),crlfDelay:Infinity})) {
    if(!line)continue;
    const r=JSON.parse(line),job=expectedRows.get(r.scenarioId);
    if(seen.has(r.scenarioId)) failures.push({scenarioId:r.scenarioId,reason:'duplicate telemetry'});
    seen.add(r.scenarioId);
    if(!job) failures.push({scenarioId:r.scenarioId,reason:'not in manifest'});
    else if(job.raceSeed!==r.raceSeed||job.configurationHash!==r.configurationHash||job.qaShardId!==r.qaShardId||job.productionSHA!==r.productionSHA) failures.push({scenarioId:r.scenarioId,reason:'manifest/telemetry mismatch'});
    if(r.productionSHA!==PROD||r.testedSHA!==PROD) failures.push({scenarioId:r.scenarioId,reason:'wrong production SHA'});
    if(!r.validFullRace||r.status!=='FINISHED'||r.entrantCount!==22||r.simulationVersion!==8||r.revision!==4||!r.classified||r.entrants?.length!==22) failures.push({scenarioId:r.scenarioId,reason:'invalid full race/version/classification'});
    for(const [compound,expectedProfile] of Object.entries(expectedCliffs)) {
      const actual=r.tyreCliffs?.[compound];
      for(const [key,value] of Object.entries(expectedProfile)) if(actual?.[key]!==value) failures.push({scenarioId:r.scenarioId,reason:'v8D tyre cliff mismatch',compound,key,expected:value,actual:actual?.[key]});
      if(actual&&!(actual.degradationStartWear<actual.cliffWear&&actual.progressivePenaltyMs>0&&actual.cliffPenaltyMs>0)) failures.push({scenarioId:r.scenarioId,reason:'non-monotonic/invalid tyre cliff profile',compound,actual});
    }
    if(r.numericErrors||r.fuelCreation||r.pitRouteErrors||r.drsEligibleObservations||r.drsBenefitObservations||r.drsPasses) failures.push({scenarioId:r.scenarioId,reason:'numeric/fuel/pit/legacy DRS invariant',numericErrors:r.numericErrors,fuelCreation:r.fuelCreation,pitRouteErrors:r.pitRouteErrors,drsEligible:r.drsEligibleObservations,drsBenefit:r.drsBenefitObservations,drsPasses:r.drsPasses});
    validRows+=r.validFullRace?1:0;
    const regulationGroup=r.sessionKind==='SPRINT'?regulation.SPRINT:regulation.GP;
    regulationGroup.races++;
    if(r.sessionKind==='SPRINT')regulation.SPRINT.dsqs+=r.dsqs||0;
    if(r.sessionKind==='SPRINT'&&(r.dsqs||0)>0)regulation.SPRINT.incorrectDsqs+=r.dsqs;
    if(r.sessionKind!=='SPRINT') for(const entry of r.classification||[]) {
      if(entry.status==='RETIRED')regulation.GP.retired++;
      else if(entry.status==='DISQUALIFIED')regulation.GP.dsqs++;
      else if(r.entrants?.find(e=>e.entrantId===entry.entrantId)?.stints?.some(s=>s.startingTyre==='INTERMEDIATE'||s.startingTyre==='WET'))regulation.GP.wetExempt++;
      else regulation.GP.compliant++;
    }
    if(r.sessionKind==='RACE'&&(r.initialWeather?.trackWater??0)>=500)regulation.GP.wetGridRaces++;
    for(const k of keys) values[k].push(r[k]);
    laps+=r.totalLaps||0; attempts+=r.passAttempts||0; passes+=r.passes||0; pits+=r.pitStops||0; incidents+=r.incidents||0; sc+=r.safetyCarStarts||0; vsc+=r.vscStarts||0; retirements+=r.retirements||0; dsqs+=r.dsqs||0; numeric+=r.numericErrors||0; fuelCreation+=r.fuelCreation||0; drsEligible+=r.drsEligibleObservations||0; drsBenefit+=r.drsBenefitObservations||0; entrants+=r.entrants?.length||0;
    for(const [map,key] of [[campaigns,r.campaign],[circuits,r.circuitName]]) {
      const a=accumulator(map,key); a.races++; a.attempts+=r.passAttempts||0; a.passes+=r.passes||0; a.transitions.push(Math.max(0,(r.weatherTimeline?.length||0)-1));
      for(const k of keys)a.metrics[k].push(r[k]);
    }
    if(r.campaign==='E') {
      const family=r.scenarioId.split(':')[1]||'UNKNOWN',a=accumulator(weatherFamilies,family);a.races++;a.attempts+=r.passAttempts||0;a.passes+=r.passes||0;a.transitions.push(Math.max(0,(r.weatherTimeline?.length||0)-1));
      for(const k of keys)a.metrics[k].push(r[k]);
    }
    const finishers=(r.entrants||[]).filter(e=>!e.disqualified&&e.status!=='RETIRED').map(e=>e.totalTimeMs).filter(Number.isFinite);
    const spread=finishers.length>1?Math.max(...finishers)-Math.min(...finishers):0;
    const recovery=(r.entrants||[]).slice().sort((a,b)=>(b.gridPosition-b.position)-(a.gridPosition-a.position))[0];
    const collapse=(r.entrants||[]).slice().sort((a,b)=>(b.position-b.gridPosition)-(a.position-a.gridPosition))[0];
    const maxPasser=(r.entrants||[]).slice().sort((a,b)=>b.passes-a.passes)[0];
    addTop('highest-pass-races',r.passes,r,{passer:maxPasser?.entrantId});
    if((r.initialWeather?.trackWater??1000)===0&&(r.initialWeather?.rainfallIntensity??1000)===0)addTop('lowest-pass-dry-races',-r.passes,r);
    addTop('highest-attempt-races',r.passAttempts,r); addTop('highest-pit-count-races',r.pitStops,r); addTop('highest-incident-races',r.incidents,r);
    addTop('widest-finish-spread',spread,r); addTop('tightest-finish-spread',-spread,r);
    addTop('deepest-tyre-cliff-races',r.deepCliffLaps,r); addTop('longest-clamp-only',r.longestClampOnlyRun,r); addTop('longest-active-attack',r.longestActiveAttackRun,r); addTop('longest-recatching',r.longestRecatchingRun,r);
    addTop('biggest-recovery',(recovery?.gridPosition||0)-(recovery?.position||0),r,{driverId:recovery?.driverId,gridPosition:recovery?.gridPosition,finishPosition:recovery?.position});
    addTop('biggest-collapse',(collapse?.position||0)-(collapse?.gridPosition||0),r,{driverId:collapse?.driverId,gridPosition:collapse?.gridPosition,finishPosition:collapse?.position});
    for(const run of r.nearFloorPairRuns||[]) for(const n of [2,3,5,8,10,15,20]) if(run.length>=n) {
      nearFloorRunThresholds[n].all++;
      if(run.attackAttempts===0)nearFloorRunThresholds[n].clampOnly++;
      if(run.attackAttempts>0)nearFloorRunThresholds[n].activeAttack++;
      if(run.recatch)nearFloorRunThresholds[n].recatching++;
    }
    for(const e of r.entrants||[]) {
      pitCounts.push(e.pits||0); compounds[e.tyreCompound]=(compounds[e.tyreCompound]||0)+1;
      const seq=(e.stints||[]).map(s=>s.startingTyre).join('→')||'NONE'; stintSequences[seq]=(stintSequences[seq]||0)+1;
      if(!cliffStats[e.tyreCompound])cliffStats[e.tyreCompound]={crossingStints:0,lapsBeyond:{'>0':0,'>1':0,'>3':0,'>5':0,'>8':0,'>10':0},maxLapsBeyond:0};
      let compound=null,age=0,cross=null;
      for(const l of e.lapTelemetry||[]) {
        if(l.tyreCompound!==compound||(l.tyreAgeLaps||0)<=age)cross=null;
        if(!cliffStats[l.tyreCompound])cliffStats[l.tyreCompound]={crossingStints:0,lapsBeyond:{'>0':0,'>1':0,'>3':0,'>5':0,'>8':0,'>10':0},maxLapsBeyond:0};
        const cliff=r.tyreCliffs?.[l.tyreCompound]?.cliffWear;
        if(Number.isFinite(cliff)&&Number.isFinite(l.tyreWearPermille)&&l.tyreWearPermille>cliff) {
          if(cross===null){cross=l.tyreAgeLaps||0;cliffStats[l.tyreCompound].crossingStints++;}
          const beyond=Math.max(0,(l.tyreAgeLaps||0)-cross);
          cliffStats[l.tyreCompound].maxLapsBeyond=Math.max(cliffStats[l.tyreCompound].maxLapsBeyond,beyond);
          for(const n of [0,1,3,5,8,10])if(beyond>n)cliffStats[l.tyreCompound].lapsBeyond['>'+n]++;
        }
        compound=l.tyreCompound; age=l.tyreAgeLaps||0;
      }
    }
    if(r.campaign==='C') {
      const p=r.scenarioId.split(':'),key=p.slice(1,5).join('|'),player=(r.entrants||[]).find(e=>e.gridPosition===10);
      let a=commands.get(key); if(!a){a={n:0,position:[],time:[],fuel:[],starved:0,energyStart:[],energyEnd:[],pits:[],passes:[],attempts:[],wear:[],planKinds:{}};commands.set(key,a);}
      if(player){a.n++;a.position.push(player.position);a.time.push(player.totalTimeMs);a.fuel.push(player.fuelUsedKg);a.starved+=player.starved?1:0;a.energyStart.push(player.energyStart);a.energyEnd.push(player.energyEnd);a.pits.push(player.pits);a.passes.push(player.passes);a.attempts.push(player.attempts);a.wear.push(player.maxTyreWearPermille);}
      const plan=r.commandSchedule?.length>1?'PHASE':'FIXED';a.planKinds[plan]=(a.planKinds[plan]||0)+1;
      const lapGroups=new Map();
      for(const l of player?.lapTelemetry||[]) for(const [kind,mode] of [['pace',l.paceMode],['fuel',l.fuelMode],['energy',l.energyPolicy]]) {
        if(!mode)continue;const id=kind+'|'+mode,box=lapGroups.get(id)||[];box.push(kind==='energy'?l.energy:l.lapTimeMs);lapGroups.set(id,box);
      }
      for(const [id,x] of lapGroups){const [kind,mode]=id.split('|'),map=modes[kind],v=map.get(mode)||{raceMeans:[],lapSamples:0};const good=x.filter(Number.isFinite);if(good.length){v.raceMeans.push(good.reduce((s,n)=>s+n,0)/good.length);v.lapSamples+=good.length;}map.set(mode,v);}
      if(player?.lapTelemetry?.length) {
        const consumption=new Map();let previous=player.fuelStartKg;
        for(const lap of player.lapTelemetry){if(Number.isFinite(previous)&&Number.isFinite(lap.fuelKg)&&lap.fuelMode){const a=consumption.get(lap.fuelMode)||[];a.push(previous-lap.fuelKg);consumption.set(lap.fuelMode,a);}previous=lap.fuelKg;}
        for(const [mode,x] of consumption){const a=fuelBurn.get(mode)||[];if(x.length)a.push(x.reduce((s,n)=>s+n,0)/x.length);fuelBurn.set(mode,a);}
      }
    }
  }
}

for(const id of expectedRows.keys())if(!seen.has(id))failures.push({scenarioId:id,reason:'manifest race missing telemetry'});
if(manifest.length!==30000||seen.size!==30000||validRows!==30000)failures.push({reason:'30,000 primary race count not met',manifest:manifest.length,telemetry:seen.size,validFullRaces:validRows});
for(const k of Object.keys(expected))if(counts[k]!==expected[k])failures.push({reason:'campaign count mismatch',campaign:k,expected:expected[k],actual:counts[k]});
const seedGroups=new Map();
for(const job of manifest){const a=seedGroups.get(job.raceSeed)||[];a.push(job);seedGroups.set(job.raceSeed,a);}
for(const [seed,rows] of seedGroups)if(rows.length>1&&!(rows.length===45&&rows.every(x=>x.campaign==='C'&&x.circuitId===rows[0].circuitId&&x.seedIndex===rows[0].seedIndex&&x.qaShardId===rows[0].qaShardId)))failures.push({reason:'unexpected duplicate seed or cross-shard seed group',seed,count:rows.length,shards:Array.from(new Set(rows.map(x=>x.qaShardId)))});
const commandReport=Object.fromEntries(Array.from(commands.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,a])=>[k,{samples:a.n,planKinds:a.planKinds,finishPosition:stats(a.position),raceTimeMs:stats(a.time),fuelUsedKg:stats(a.fuel),starvation:proportion(a.starved,a.n),energyStart:stats(a.energyStart),energyEnd:stats(a.energyEnd),pitStops:stats(a.pits),passes:stats(a.passes),attempts:stats(a.attempts),maxTyreWearPermille:stats(a.wear)}]));
const memoryByWorker=new Map();
for(const file of (await walkSuffix(root,'.jsonl')).filter(file=>file.includes('progress-')&&!supersededAttempt(file)))for await(const line of createInterface({input:createReadStream(file),crlfDelay:Infinity}))if(line){
  const sample=JSON.parse(line),key=String(sample.worker),list=memoryByWorker.get(key)||[];list.push(sample);memoryByWorker.set(key,list);
}
const workerMemory=Object.fromEntries(Array.from(memoryByWorker.entries()).sort((a,b)=>Number(a[0])-Number(b[0])).map(([worker,samples])=>{
  const memory=samples.map(x=>x.memory).filter(Boolean),rss=memory.map(x=>x.rss),heap=memory.map(x=>x.heapUsed),postGc=memory.map(x=>x.postGcHeapUsed).filter(Number.isFinite),first=samples[0],last=samples.at(-1);
  const resources=Array.from(new Set(memory.flatMap(x=>x.activeResourceTypes||[]))).sort();
  return [worker,{samples:samples.length,completed:first?.valid!==undefined?last?.completed:null,elapsedMs:last?.elapsedMs??null,rssBytes:{first:rss[0]??null,last:rss.at(-1)??null,max:rss.length?Math.max(...rss):null},heapUsedBytes:{first:heap[0]??null,last:heap.at(-1)??null,max:heap.length?Math.max(...heap):null,postGcMax:postGc.length?Math.max(...postGc):null},activeResourceTypes:resources}];
}));
const performance={singleRaceSimulationWallMs:stats(values.wallMs.slice(0,1)),first100SequentialRaceWallMs:{raceCount:Math.min(100,values.wallMs.length),sum:values.wallMs.slice(0,100).reduce((a,b)=>a+(b||0),0)},first1000SequentialRaceWallMs:{raceCount:Math.min(1000,values.wallMs.length),sum:values.wallMs.slice(0,1000).reduce((a,b)=>a+(b||0),0)},primaryCampaignRaceWallMs:stats(values.wallMs),primaryWorkerMemory:workerMemory,memoryScope:'per-shard Node process snapshots every 10 completed races; postGcHeapUsed sampled every 100 races when launched with --expose-gc; the full campaign elapsed wall time is reported by the Actions run'};
const passing={passAttemptsPerRace:stats(values.passAttempts),passesPerRace:stats(values.passes),success:proportion(passes,attempts),earlyAttempts:values.earlyPassAttempts.reduce((a,b)=>a+(b||0),0),lateAttempts:values.latePassAttempts.reduce((a,b)=>a+(b||0),0),earlyPasses:values.earlyPasses.reduce((a,b)=>a+(b||0),0),latePasses:values.latePasses.reduce((a,b)=>a+(b||0),0),nearFloorSamples:stats(values.nearFloorSamples),exactFloorSamples:stats(values.exactFloorSamples),longestSamePair:stats(values.longestSamePairNearFloorRun),longestClampOnly:stats(values.longestClampOnlyRun),longestActiveAttack:stats(values.longestActiveAttackRun),longestRecatching:stats(values.longestRecatchingRun)};
const commandCombinationKeys=new Set(Array.from(commands.keys(),key=>key.split('|').slice(1).join('|')));
if(commandCombinationKeys.size!==45||commands.size!==450)failures.push({reason:'command factorial matrix incomplete',expectedCombinations:45,actualCombinations:commandCombinationKeys.size,expectedCircuitCombinationCells:450,actualCircuitCombinationCells:commands.size});
const requiredOutlierGroups=['highest-pass-races','lowest-pass-dry-races','highest-attempt-races','highest-pit-count-races','highest-incident-races','widest-finish-spread','tightest-finish-spread','deepest-tyre-cliff-races','longest-clamp-only','longest-active-attack','longest-recatching','biggest-recovery','biggest-collapse'];
for(const group of requiredOutlierGroups)if((outliers.get(group)||[]).length!==100)failures.push({reason:'outlier replay seed quota not met',group,expected:100,actual:(outliers.get(group)||[]).length});
const report={verdict:failures.length?'FAIL':'PASS',productionSHA:PROD,sample:{primaryRaces:seen.size,manifestRaces:manifest.length,validFullRaces:validRows,entrantRaceObservations:entrants,totalLaps:Math.round(laps),campaignCounts:counts,GP:counts.A+counts.D+counts.E+counts.F,Sprint:counts.B,commandFactorial:counts.C,passAttempts:attempts,passes,pitStops:pits,incidents,safetyCarStarts:sc,vscStarts:vsc,retirements,dsqs,numericErrors:numeric,fuelCreationEvents:fuelCreation,legacyDrsEligible:drsEligible,legacyDrsBenefits:drsBenefit},raceLevelMetrics:Object.fromEntries(keys.map(k=>[k,stats(values[k])])),byCampaign:groupReport(campaigns),byCircuit:groupReport(circuits),weatherByScenarioFamily:groupReport(weatherFamilies),passing,nearFloorRunThresholds,commandFactorial:{combinationCount:commandCombinationKeys.size,circuitCombinationCells:commands.size,expectedCombinations:45,expectedCircuitCombinationCells:450,all45:commandReport,modeLapMeans:Object.fromEntries(Object.entries(modes).map(([k,m])=>[k,Object.fromEntries(Array.from(m.entries()).map(([name,x])=>[name,{raceMeans:stats(x.raceMeans),lapSamples:x.lapSamples}]))])),fuelBurnPerLapByMode:Object.fromEntries(Array.from(fuelBurn.entries()).map(([k,a])=>[k,stats(a)]))},regulation,tyreCompounds:compounds,tyreCliffs:cliffStats,pitStopsPerEntrant:stats(pitCounts),stintSequences,failures};
await mkdir(out,{recursive:true});
await writeFile(join(out,'primary-summary.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(out,'command-factorial.json'),JSON.stringify(report.commandFactorial,null,2)+'\n');
await writeFile(join(out,'passing-analysis.json'),JSON.stringify(passing,null,2)+'\n');
await writeFile(join(out,'weather-analysis.json'),JSON.stringify({weatherByScenarioFamily:report.weatherByScenarioFamily,byCampaign:Object.fromEntries(Object.entries(report.byCampaign).map(([k,v])=>[k,v.weatherTransitions]))},null,2)+'\n');
await writeFile(join(out,'regulation-analysis.json'),JSON.stringify(regulation,null,2)+'\n');
await writeFile(join(out,'tyre-analysis.json'),JSON.stringify({compounds,cliffs:cliffStats,pitStopsPerEntrant:report.pitStopsPerEntrant,stintSequences},null,2)+'\n');
await writeFile(join(out,'outlier-replay-seeds.json'),JSON.stringify(Object.fromEntries(Array.from(outliers.entries()).map(([k,a])=>[k,a.map(x=>Object.assign({},x,{value:(k==='lowest-pass-dry-races'||k==='tightest-finish-spread')?-x.value:x.value}))])),null,2)+'\n');
await writeFile(join(out,'performance-primary.json'),JSON.stringify(performance,null,2)+'\n');
await writeFile(join(out,'failures.json'),JSON.stringify(failures,null,2)+'\n');
await writeFile(join(out,'sample-disclosure.json'),JSON.stringify(report.sample,null,2)+'\n');
console.log(JSON.stringify({verdict:report.verdict,sample:report.sample,failureCount:failures.length,output:out},null,2));
if(failures.length)process.exitCode=1;

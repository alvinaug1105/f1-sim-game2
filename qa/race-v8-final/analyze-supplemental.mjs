import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

const root=resolve(process.argv[2]||'qa-out/supplemental'),out=resolve(process.argv[3]||'qa-out/supplemental-analysis');
const manifest=(await readFile(join(root,'manifest.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
const expected=new Map(manifest.map(j=>[j.scenarioId,j])),rows=new Map(),failures=[];
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())files=files.concat(await walk(p));else if(e.name.endsWith('.jsonl.gz'))files.push(p);}return files.sort();}
const telemetryFiles=await walk(root),retryBases=new Set(telemetryFiles.filter(file=>file.includes('/attempt-2/')).map(file=>file.slice(0,file.indexOf('/attempt-2/'))));
const superseded=file=>file.includes('/attempt-1/')&&retryBases.has(file.slice(0,file.indexOf('/attempt-1/')));
for(const file of telemetryFiles.filter(file=>!superseded(file)))for await(const line of createInterface({input:createReadStream(file).pipe(createGunzip()),crlfDelay:Infinity}))if(line){
  const row=JSON.parse(line),job=expected.get(row.scenarioId);
  if(!job)failures.push({scenarioId:row.scenarioId,reason:'unexpected race telemetry'});
  if(rows.has(row.scenarioId))failures.push({scenarioId:row.scenarioId,reason:'duplicate race telemetry'});
  if(job&&(job.raceSeed!==row.raceSeed||job.configurationHash!==row.configurationHash||job.qaShardId!==row.qaShardId||job.productionSHA!==row.productionSHA))failures.push({scenarioId:row.scenarioId,reason:'job identity mismatch'});
  if(row.productionSHA!=='55846a9c465b58fc5687517ace67772421868dff'||row.status!=='FINISHED'||row.revision!==4||row.simulationVersion!==8||row.entrantCount!==22||!row.validFullRace||!row.classified)failures.push({scenarioId:row.scenarioId,reason:'invalid full race'});
  rows.set(row.scenarioId,row);
}
for(const id of expected.keys())if(!rows.has(id))failures.push({scenarioId:id,reason:'missing race telemetry'});
const quantiles=a=>{const x=a.filter(Number.isFinite).sort((m,n)=>m-n);if(!x.length)return{n:0,mean:null,median:null,sd:null,min:null,max:null,ci95:null};const mean=x.reduce((s,v)=>s+v,0)/x.length,sd=x.length>1?Math.sqrt(x.reduce((s,v)=>s+(v-mean)**2,0)/(x.length-1)):0;const q=p=>{const z=(x.length-1)*p,l=Math.floor(z),h=Math.ceil(z);return x[l]+(x[h]-x[l])*(z-l);};const half=x.length>1?1.96*sd/Math.sqrt(x.length):0;return{n:x.length,mean,median:q(.5),p5:q(.05),p95:q(.95),sd,min:x[0],max:x.at(-1),ci95:[mean-half,mean+half]};};
const experiments={UNDERCUT:{},OVERCUT:{}};
for(const job of manifest){const row=rows.get(job.scenarioId);if(!row)continue;const p=experiments[job.campaign==='G'?'UNDERCUT':'OVERCUT'];(p[job.comparisonGroup]??={})[job.comparisonRole]=row;}
const reports={};
for(const [kind,pairs] of Object.entries(experiments)){
  const timeDiff=[],positionDiff=[],actualStopDiff=[],complete=[];
  for(const [id,pair] of Object.entries(pairs)){
    const a=pair[kind==='UNDERCUT'?'early':'control'],b=pair[kind==='UNDERCUT'?'control':'late'];
    if(!a||!b){failures.push({comparisonGroup:id,reason:'paired scenario incomplete'});continue;}
    if(a.raceSeed!==b.raceSeed)failures.push({comparisonGroup:id,reason:'paired seeds differ'});
    const ea=a.entrants.find(e=>e.gridPosition===10),eb=b.entrants.find(e=>e.gridPosition===10);
    const pa=ea?.pitStops?.[0]?.lap??null,pb=eb?.pitStops?.[0]?.lap??null;
    if(!ea||!eb||!pa||!pb)failures.push({comparisonGroup:id,reason:'controlled player stop was not recorded',requested:[a.strategyPitLap,b.strategyPitLap],actual:[pa,pb]});
    else if(Math.abs(pa-a.strategyPitLap)>2||Math.abs(pb-b.strategyPitLap)>2)failures.push({comparisonGroup:id,reason:'pit target and actual stop differ by more than two laps',requested:[a.strategyPitLap,b.strategyPitLap],actual:[pa,pb]});
    if(ea&&eb){timeDiff.push(ea.totalTimeMs-eb.totalTimeMs);positionDiff.push(ea.position-eb.position);if(pa&&pb)actualStopDiff.push(pa-pb);complete.push({comparisonGroup:id,seed:a.raceSeed,circuitId:a.circuitId,earlyOrControlTimeMs:ea.totalTimeMs,controlOrLateTimeMs:eb.totalTimeMs,playerTimeDeltaMs:ea.totalTimeMs-eb.totalTimeMs,playerPositionDelta:ea.position-eb.position,playerPitLaps:[pa,pb],requestedPitLaps:[a.strategyPitLap,b.strategyPitLap],status:[ea.status,eb.status]});}
  }
  reports[kind]={pairCount:Object.keys(pairs).length,completePairCount:complete.length,pairedRaceFailures:failures.length,timeDeltaMs:quantiles(timeDiff),positionDelta:quantiles(positionDiff),actualPitLapDelta:quantiles(actualStopDiff),firstPlanFaster:complete.filter(x=>x.playerTimeDeltaMs<0).length,secondPlanFaster:complete.filter(x=>x.playerTimeDeltaMs>0).length,ties:complete.filter(x=>x.playerTimeDeltaMs===0).length,pairedResults:complete};
}
const summary={productionSHA:'55846a9c465b58fc5687517ace67772421868dff',manifestRaces:manifest.length,telemetryRaces:rows.size,uniqueSeeds:new Set(manifest.map(j=>j.raceSeed)).size,failures,reports};
await mkdir(out,{recursive:true});await writeFile(join(out,'undercut-overcut-analysis.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({manifestRaces:manifest.length,telemetryRaces:rows.size,undercutPairs:reports.UNDERCUT?.completePairCount,overcutPairs:reports.OVERCUT?.completePairCount,failures:failures.length}));
if(manifest.length!==12000||rows.size!==12000||reports.UNDERCUT?.completePairCount!==3000||reports.OVERCUT?.completePairCount!==3000||failures.length)process.exitCode=1;

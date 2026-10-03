import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';

const mode=process.argv[2], manifestPath=resolve(process.argv[3]||'qa-out/full/manifest.jsonl'), outDir=resolve(process.argv[4]||'qa-out/replays'), shardIndex=Number(process.argv[5]||0), shardCount=Number(process.argv[6]||1),outlierPath=process.argv[7]?resolve(process.argv[7]):null;
if(!['determinism','path','uuid','outlier'].includes(mode)||!Number.isInteger(shardIndex)||!Number.isInteger(shardCount)||shardIndex<0||shardIndex>=shardCount||(mode==='outlier'&&!outlierPath))throw new Error('usage: replay.mjs determinism|path|uuid|outlier MANIFEST OUTPUT_DIR SHARD_INDEX SHARD_COUNT [OUTLIER_SEEDS]');
process.env.RACE_QA_IMPORT_ONLY='1';
const worker=await import(pathToFileURL(resolve('qa/race-v8-final/worker.mjs')).href);
const {runRace,buildInput}=worker;
const engine=await import(pathToFileURL(resolve('src/simulation/race/engine.ts')).href);
const {createRace,advanceRace,simulateRace}=engine;
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
const all=[];
for await(const line of createInterface({input:createReadStream(manifestPath),crlfDelay:Infinity}))if(line)all.push(JSON.parse(line));
let selected=[];
if(mode==='outlier') {
  const groups=JSON.parse(await (await import('node:fs/promises')).readFile(outlierPath,'utf8'));
  const byId=new Map(all.map(j=>[j.scenarioId,j]));
  for(const [category,items] of Object.entries(groups))for(const item of items){const job=byId.get(item.scenarioId);if(!job)throw new Error(`outlier scenario not found in full manifest: ${item.scenarioId}`);selected.push({job,category,expectedDigest:item.finalDigest});}
} else {
  const targetCount=mode==='determinism'?1500:500;
  for(let i=0;i<targetCount;i++)selected.push({job:all[Math.floor(i*all.length/targetCount)],category:null});
}
const targetCount=selected.length;
const assigned=selected.map((entry,index)=>({...entry,index})).filter(x=>x.index%shardCount===shardIndex);
await mkdir(outDir,{recursive:true});
const results=[];
for(let i=0;i<assigned.length;i++) {
  const job=assigned[i].job,globalIndex=assigned[i].index;
  if(mode==='determinism') {
    const first=runRace(job),second=runRace(job);
    results.push({mode,scenarioId:job.scenarioId,raceSeed:job.raceSeed,configurationHash:job.configurationHash,productionSHA:job.productionSHA,qaShardId:job.qaShardId,firstDigest:first.finalDigest,secondDigest:second.finalDigest,equal:first.finalDigest===second.finalDigest});
  } else if(mode==='path') {
    const input=buildInput(job);
    const baseline=simulateRace(input).state;
    let chunked=createRace(input);while(chunked.status==='RUNNING')chunked=advanceRace(chunked,Math.min(5,chunked.input.totalLaps-chunked.lap));
    let checkpoint=createRace(input);while(checkpoint.status==='RUNNING')checkpoint=advanceRace(checkpoint,1);
    let mixed=createRace(input),chunk=0;const sizes=[1,5,2,9,3,7];
    while(mixed.status==='RUNNING'){const n=Math.min(sizes[chunk++%sizes.length],mixed.input.totalLaps-mixed.lap);mixed=advanceRace(mixed,n);}
    let serialized=createRace(input),serialIndex=0;
    while(serialized.status==='RUNNING') {
      const n=Math.min([4,1,8,3,5][serialIndex++%5],serialized.input.totalLaps-serialized.lap);
      serialized=JSON.parse(JSON.stringify(advanceRace(serialized,n)));
    }
    const expected=canonical(baseline),variants={fiveLap:canonical(chunked),singleCheckpoint:canonical(checkpoint),mixed:canonical(mixed),serializeReload:canonical(serialized)};
    const matches=Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,v===expected]));
    results.push({mode,scenarioId:job.scenarioId,raceSeed:job.raceSeed,configurationHash:job.configurationHash,productionSHA:job.productionSHA,qaShardId:job.qaShardId,matches,allEqual:Object.values(matches).every(Boolean)});
  } else if(mode==='uuid') {
    const first=runRace(job),salt=3600030000+globalIndex;
    const remappedJob={...job,uuidRemapSalt:salt,configurationHash:createHash('sha256').update(job.configurationHash+'|uuid-remap|'+salt).digest('hex')};
    const second=runRace(remappedJob);
    const semantic=row=>{
      const ids=new Map(),teams=new Map();
      for(const e of row.entrants.slice().sort((a,b)=>a.gridPosition-b.gridPosition)) {
        ids.set(e.entrantId,'entrant:'+e.gridPosition);ids.set(e.driverId,'driver:'+e.gridPosition);
        if(!teams.has(e.teamId))teams.set(e.teamId,'team:'+teams.size);
      }
      const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>k!=='finalDigest'&&k!=='configurationHash').map(([k,v])=>[k,normalize(v)])):typeof value==='string'?ids.get(value)||teams.get(value)||value:value;
      return normalize(row);
    };
    const equal=canonical(semantic(first))===canonical(semantic(second));
    results.push({mode,scenarioId:job.scenarioId,raceSeed:job.raceSeed,configurationHash:job.configurationHash,remappedConfigurationHash:remappedJob.configurationHash,uuidRemapSalt:salt,productionSHA:job.productionSHA,qaShardId:job.qaShardId,firstDigest:first.finalDigest,remappedDigest:second.finalDigest,equal});
  } else {
    const entry=assigned[i],actual=runRace(job),equal=actual.finalDigest===entry.expectedDigest;
    results.push({mode,category:entry.category,scenarioId:job.scenarioId,raceSeed:job.raceSeed,configurationHash:job.configurationHash,productionSHA:job.productionSHA,qaShardId:job.qaShardId,expectedDigest:entry.expectedDigest,actualDigest:actual.finalDigest,equal});
  }
  if((i+1)%25===0)process.stdout.write(JSON.stringify({mode,shardIndex,completed:i+1,total:assigned.length})+'\n');
}
const failed=results.filter(r=>mode==='path'?!r.allEqual:!r.equal);
const summary={mode,requestedCount:targetCount,shardIndex,shardCount,completed:results.length,failed:failed.length,productionSHA:'55846a9c465b58fc5687517ace67772421868dff',categories:mode==='outlier'?Object.fromEntries(Array.from(new Set(results.map(r=>r.category)),category=>[category,results.filter(r=>r.category===category).length])):undefined};
await writeFile(resolve(outDir,'results.jsonl'),results.map(x=>JSON.stringify(x)).join('\n')+'\n');
await writeFile(resolve(outDir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
if(failed.length)process.exitCode=1;

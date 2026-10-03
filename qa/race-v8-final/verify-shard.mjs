import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const input=resolve(process.argv[2]||'qa-out/full/shard/jobs.jsonl'),expectedId=process.argv[3];
if(!expectedId)throw new Error('expected shard ID missing');
const jobs=(await readFile(input,'utf8')).trim().split('\n').map(JSON.parse);
const errors=[];
if(!jobs.length)errors.push('empty shard');
if(jobs.some(j=>j.qaShardId!==expectedId))errors.push('job assigned to wrong shard');
if(jobs.some(j=>j.productionSHA!=='55846a9c465b58fc5687517ace67772421868dff'||j.testedSHA!=='55846a9c465b58fc5687517ace67772421868dff'))errors.push('wrong production SHA');
if(jobs.some(j=>!Number.isInteger(j.raceSeed)||j.raceSeed<2500000000||j.raceSeed>=2500050000))errors.push('race seed outside reserved primary range');
if(new Set(jobs.map(j=>j.scenarioId)).size!==jobs.length)errors.push('duplicate scenario IDs inside shard');
const seeds=new Map();for(const job of jobs){const group=seeds.get(job.raceSeed)||[];group.push(job);seeds.set(job.raceSeed,group);}
for(const [seed,rows] of seeds)if(rows.length>1&&!(rows.length===45&&rows.every(j=>j.campaign==='C'&&j.circuitId===rows[0].circuitId&&j.seedIndex===rows[0].seedIndex&&j.qaShardId===expectedId)))errors.push(`unexpected duplicate seed ${seed}`);
const counts=Object.fromEntries(['A','B','C','D','E','F'].map(c=>[c,jobs.filter(j=>j.campaign===c).length]));
const report={shardId:expectedId,raceCount:jobs.length,uniqueSeedCount:seeds.size,seedRange:{min:Math.min(...jobs.map(j=>j.raceSeed)),max:Math.max(...jobs.map(j=>j.raceSeed))},campaignCounts:counts,productionSHA:'55846a9c465b58fc5687517ace67772421868dff',errors};
await writeFile(resolve(dirname(input),'shard-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(errors.length)process.exitCode=1;

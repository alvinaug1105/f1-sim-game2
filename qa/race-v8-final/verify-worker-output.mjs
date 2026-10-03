import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

const jobsPath=resolve(process.argv[2]||''),out=resolve(process.argv[3]||'');
if(!process.argv[2]||!process.argv[3])throw new Error('usage: verify-worker-output.mjs JOBS_JSONL ATTEMPT_DIR');
const jobs=(await readFile(jobsPath,'utf8')).trim().split('\n').map(JSON.parse),telemetryPath=resolve(out,'telemetry-worker-01.jsonl.gz'),rows=[],errors=[];
for await(const line of createInterface({input:createReadStream(telemetryPath).pipe(createGunzip()),crlfDelay:Infinity}))if(line)rows.push(JSON.parse(line));
if(rows.length!==jobs.length)errors.push(`race row count ${rows.length} does not match shard manifest ${jobs.length}`);
const jobsById=new Map(jobs.map(j=>[j.scenarioId,j]));
if(jobsById.size!==jobs.length)errors.push('duplicate scenario in shard manifest');
for(const row of rows){
  const job=jobsById.get(row.scenarioId);
  if(!job)errors.push(`unexpected scenario ${row.scenarioId}`);
  else if(job.raceSeed!==row.raceSeed||job.configurationHash!==row.configurationHash||job.qaShardId!==row.qaShardId||job.productionSHA!==row.productionSHA)errors.push(`identity mismatch ${row.scenarioId}`);
  if(!row.validFullRace||row.status!=='FINISHED'||row.entrantCount!==22||row.simulationVersion!==8||row.revision!==4||!row.classified)errors.push(`invalid full revision-4 race ${row.scenarioId}`);
}
for(const job of jobs)if(!rows.some(r=>r.scenarioId===job.scenarioId))errors.push(`missing scenario ${job.scenarioId}`);
const summary={attemptDirectory:out,manifestRows:jobs.length,telemetryRows:rows.length,validFullRaces:rows.filter(r=>r.validFullRace).length,uniqueSeeds:new Set(jobs.map(j=>j.raceSeed)).size,errors};
await writeFile(resolve(out,'attempt-verification.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
if(errors.length)process.exitCode=1;

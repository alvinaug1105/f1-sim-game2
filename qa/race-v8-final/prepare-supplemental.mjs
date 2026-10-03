import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRODUCTION_SHA='55846a9c465b58fc5687517ace67772421868dff';
const repo=resolve(process.env.RACE_QA_REPO||process.cwd());
const out=resolve(process.argv[2]||'qa-out/supplemental');
const ranges=JSON.parse(await readFile(join(repo,'qa/race-v8-final/seed-ranges.json'),'utf8'));
const {developmentContent}=await import(pathToFileURL(join(repo,'src/data/seed/content-development.ts')).href);
const circuitKeys=['monaco','monza','baku','silverstone','mountain-park','spa-francorchamps','marina-bay','bahrain','interlagos','zandvoort'];
const alias={monaco:'MONACO',monza:'MONZA',baku:'BAKU',silverstone:'SILVERSTONE','mountain-park':'SUZUKA','spa-francorchamps':'SPA', 'marina-bay':'SINGAPORE',bahrain:'BAHRAIN',interlagos:'INTERLAGOS',zandvoort:'ZANDVOORT'};
const byKey=new Map(developmentContent.circuits.map(c=>[c.key,c]));
const circuits=circuitKeys.map(k=>{const c=byKey.get(`circuit-${k}`);if(!c)throw new Error(`missing circuit ${k}`);return c;});
const seedStart=ranges.ranges.supplemental.start;
const seedCapacity=ranges.ranges.supplemental.capacity;
const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`:JSON.stringify(x);
const hash=x=>createHash('sha256').update(canonical(x)).digest('hex');
const jobs=[],groups=new Map();
function add(type,index,role,c,seed,lap) {
  const campaign=type==='UNDERCUT'?'G':'H',comparisonGroup=`${type}:${String(index).padStart(4,'0')}`;
  const scenarioId=`${type}:${alias[circuitKeys[(index-1)%circuits.length]]}:${String(index).padStart(4,'0')}:${role}`;
  const configuration={campaign,type,role,circuitId:c.id,sessionKind:'RACE',raceSeed:seed,strategyPitLap:lap,gridPosition:10};
  const job={scenarioId,campaign,sessionKind:'RACE',circuitId:c.id,circuitName:c.name,circuitKey:c.key,seedIndex:index,raceSeed:seed,configurationHash:hash(configuration),productionSHA:PRODUCTION_SHA,testedSHA:PRODUCTION_SHA,weatherKind:'CLIMATE',planKind:'PAIRED_STOP_WINDOW',strategyPitLap:lap,comparisonGroup,comparisonRole:role,qaShardId:`supplement-${String((index-1)%8+1).padStart(2,'0')}`};
  jobs.push(job);
  const pair=groups.get(comparisonGroup)||[];pair.push(job);groups.set(comparisonGroup,pair);
}

for(let i=1;i<=3000;i++) {
  const c=circuits[(i-1)%circuits.length],laps=c.defaultLapCount;
  const seed=seedStart+i-1;
  const baseline=Math.max(2,Math.min(laps-2,Math.floor(laps*.5)));
  const early=Math.max(2,Math.min(laps-2,Math.floor(laps*.33)));
  add('UNDERCUT',i,'early',c,seed,early);
  add('UNDERCUT',i,'control',c,seed,baseline);
  const overSeed=seedStart+3000+i-1;
  const late=Math.max(2,Math.min(laps-2,Math.floor(laps*.67)));
  add('OVERCUT',i,'control',c,overSeed,baseline);
  add('OVERCUT',i,'late',c,overSeed,late);
}
if(jobs.length!==12000||jobs.some(j=>j.raceSeed<seedStart||j.raceSeed>=seedStart+6000))throw new Error('paired-stop manifest size or seed range mismatch');
for(const [key,pair] of groups)if(pair.length!==2||pair[0].raceSeed!==pair[1].raceSeed||new Set(pair.map(j=>j.qaShardId)).size!==1)throw new Error(`paired scenario mismatch ${key}`);
await mkdir(join(out,'shards'),{recursive:true});
await writeFile(join(out,'manifest.jsonl'),`${jobs.map(j=>JSON.stringify(j)).join('\n')}\n`);
await writeFile(join(out,'manifest.sha256'),`${createHash('sha256').update(await readFile(join(out,'manifest.jsonl'))).digest('hex')}  manifest.jsonl\n`);
for(let i=1;i<=8;i++) {
  const id=`supplement-${String(i).padStart(2,'0')}`,rows=jobs.filter(j=>j.qaShardId===id);
  const dir=join(out,'shards',id);await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'jobs.jsonl'),`${rows.map(j=>JSON.stringify(j)).join('\n')}\n`);
  await writeFile(join(dir,'shard.json'),`${JSON.stringify({shardId:id,raceCount:rows.length,uniqueSeedCount:new Set(rows.map(j=>j.raceSeed)).size,seedRange:{min:Math.min(...rows.map(j=>j.raceSeed)),max:Math.max(...rows.map(j=>j.raceSeed))},productionSHA:PRODUCTION_SHA},null,2)}\n`);
}
await writeFile(join(out,'run.json'),`${JSON.stringify({productionSHA:PRODUCTION_SHA,qaMode:'paired-undercut-overcut',raceCount:jobs.length,pairsPerExperiment:3000,experimentPairs:{undercut:3000,overcut:3000},uniqueRaceSeeds:new Set(jobs.map(j=>j.raceSeed)).size,pairedRows:jobs.length/2,shardCount:8,seedRange:{min:Math.min(...jobs.map(j=>j.raceSeed)),max:Math.max(...jobs.map(j=>j.raceSeed))}},null,2)}\n`);
console.log(JSON.stringify({productionSHA:PRODUCTION_SHA,raceCount:jobs.length,pairGroups:groups.size,uniqueSeeds:new Set(jobs.map(j=>j.raceSeed)).size,output:out}));

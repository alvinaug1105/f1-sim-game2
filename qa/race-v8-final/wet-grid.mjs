import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.RACE_QA_IMPORT_ONLY='1';
const {buildInput}=await import(pathToFileURL(resolve('qa/race-v8-final/worker.mjs')).href);
const {developmentContent}=await import(pathToFileURL(resolve('src/data/seed/content-development.ts')).href);
const values=[0,50,100,200,300,400,450,500,550,600,650,700,750,800,850,1000];
const circuitKeys=['circuit-monaco','circuit-monza','circuit-silverstone','circuit-marina-bay'];
const circuits=developmentContent.circuits.filter(c=>circuitKeys.includes(c.key));
if(circuits.length!==circuitKeys.length)throw new Error('wet-grid representative circuit missing');
const cases=[];
for(let c=0;c<circuits.length;c++)for(const trackWater of values){
  const circuit=circuits[c],raceSeed=3600007000+c*100+trackWater;
  const input=buildInput({campaign:'WETGRID',sessionKind:'RACE',circuitId:circuit.id,circuitName:circuit.name,circuitKey:circuit.key,raceSeed,weatherKind:'WET_GRID',trackWater});
  const compounds=input.entrants.map(e=>e.startingTyre.compound),counts=Object.fromEntries(['INTERMEDIATE','WET','SOFT','MEDIUM','HARD'].map(x=>[x,compounds.filter(y=>y===x).length]));
  cases.push({circuitId:circuit.id,circuitName:circuit.name,trackWater,rainfallIntensity:input.weather.initial.rainfallIntensity,publicGridWeather:input.weather.initial,counts,driverChoices:input.entrants.map(e=>({gridPosition:e.gridPosition,compound:e.startingTyre.compound})),policy:'production v8D AI grid selector; current-grid conditions only'});
}
const summary={productionSHA:'55846a9c465b58fc5687517ace67772421868dff',trackWaterPoints:values,circuitCount:circuits.length,caseCount:cases.length,weatherTruthReadByAI:false,values:cases};
await mkdir('qa-out',{recursive:true});await writeFile(resolve('qa-out/wet-grid.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({productionSHA:summary.productionSHA,trackWaterPoints:values,circuitCount:circuits.length,caseCount:cases.length}));
if(cases.length!==values.length*circuits.length||cases.some(c=>Object.values(c.counts).reduce((a,b)=>a+b,0)!==22))process.exitCode=1;

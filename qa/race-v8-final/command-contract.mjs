import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.RACE_QA_IMPORT_ONLY='1';
const {buildInput}=await import(pathToFileURL(resolve('qa/race-v8-final/worker.mjs')).href);
const {createRace}=await import(pathToFileURL(resolve('src/simulation/race/engine.ts')).href);
const service=await import(pathToFileURL(resolve('src/features/race/service.ts')).href);
const modes={pace:['CONSERVE','LIGHT','STANDARD','PUSH','ATTACK'],fuel:['CONSERVE','BALANCED','PUSH'],energy:['RECHARGE','BALANCED','BOOST'],legacy:['HARVEST','NEUTRAL','DEPLOY','OVERTAKE']};
const job={campaign:'C',sessionKind:'RACE',circuitKey:'circuit-monaco',circuitId:'circuit-monaco',circuitName:'Monaco',raceSeed:3600010000,weatherKind:'CLIMATE'};
const input=buildInput(job),state=createRace(input),player=input.entrants.find(e=>e.gridPosition===10),rival=input.entrants.find(e=>e.gridPosition===9);
const eventId='qa-event',sessionId='qa-session';
let data={state,sessionId,labels:{},progress:{career:{status:'ACTIVE',playerTeamId:player.teamId},events:[{id:eventId,status:'CURRENT',weekend:{sessions:[{id:sessionId,status:'IN_PROGRESS'}]}}]}};
const repository={changeRace:async(_career,_event,fn)=>{data=await fn(data);return data;}};
const args=()=>[repository,'qa-career',eventId,player.entrantId,data.state.lap,data.state.entrants.find(e=>e.entrantId===player.entrantId).commands.commandRevision];
const passed=[],rejected=[];
async function accepts(name,action){try{await action();passed.push(name);}catch(error){rejected.push({name,expected:'accepted',actual:error.code??String(error)});}}
async function rejects(name,action,code='INVALID_ACTION'){try{await action();rejected.push({name,expected:code,actual:'accepted'});}catch(error){if(error.code===code)passed.push(name);else rejected.push({name,expected:code,actual:error.code??String(error)});}}
for(const mode of modes.pace)await accepts(`pace:${mode}`,()=>service.setDriverPaceMode(...args(),mode));
for(const mode of modes.fuel)await accepts(`fuel:${mode}`,()=>service.setDriverFuelMode(...args(),mode));
for(const mode of modes.energy)await accepts(`energy:${mode}`,()=>service.setDriverEnergyPolicy(...args(),mode));
for(const mode of modes.legacy)await rejects(`revision4-legacy-ers:${mode}`,()=>service.setDriverErsMode(...args(),mode));
await rejects('invalid-energy-policy',()=>service.setDriverEnergyPolicy(...args(),'OVERTAKE'),'INVALID_INPUT');
await rejects('stale-lap',()=>service.setDriverEnergyPolicy(repository,'qa-career',eventId,player.entrantId,data.state.lap+1,data.state.entrants.find(e=>e.entrantId===player.entrantId).commands.commandRevision,'BOOST'),'STALE');
await rejects('stale-revision',()=>service.setDriverEnergyPolicy(repository,'qa-career',eventId,player.entrantId,data.state.lap,data.state.entrants.find(e=>e.entrantId===player.entrantId).commands.commandRevision-1,'BOOST'),'STALE');
const saved=data;
data={...data,state:{...data.state,input:{...data.state.input,entrants:data.state.input.entrants.map(e=>e.entrantId===rival.entrantId?{...e,strategyController:'DEVELOPMENT_AI'}:e)}}};
await rejects('AI-rival-command',()=>service.setDriverEnergyPolicy(repository,'qa-career',eventId,rival.entrantId,data.state.lap,data.state.entrants.find(e=>e.entrantId===rival.entrantId).commands.commandRevision,'BOOST'));
data=saved;
data={...data,state:{...data.state,entrants:data.state.entrants.map(e=>e.entrantId===player.entrantId?{...e,incident:{...e.incident,status:'RETIRED'}}:e)}};
await rejects('retired-player-command',()=>service.setDriverEnergyPolicy(...args(),'BOOST'));
data=saved;
data={...data,state:{...data.state,status:'FINISHED'}};
await rejects('finished-race-command',()=>service.setDriverEnergyPolicy(...args(),'BOOST'));
const report={productionSHA:'55846a9c465b58fc5687517ace67772421868dff',simulationVersion:state.simulationVersion,progressionRevision:state.input.progression.version,accepted:passed,rejected,passedCount:passed.length,failedCount:rejected.length,legacyErsRejected:modes.legacy.every(m=>passed.includes(`revision4-legacy-ers:${m}`)),energyPoliciesAccepted:modes.energy.every(m=>passed.includes(`energy:${m}`)),paceModesAccepted:modes.pace.every(m=>passed.includes(`pace:${m}`)),fuelModesAccepted:modes.fuel.every(m=>passed.includes(`fuel:${m}`))};
await mkdir('qa-out',{recursive:true});await writeFile(resolve('qa-out/command-contract.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(report.progressionRevision!==4||report.simulationVersion!==8||report.failedCount||!report.legacyErsRejected||!report.energyPoliciesAccepted)process.exitCode=1;

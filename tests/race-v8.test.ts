import { describe, it, expect } from 'vitest';
import { createRace, advanceRace, advanceRaceLap, raceResult } from '../src/simulation/race/engine';
import { progressionForCircuit, circuitProgression } from '../src/data/seed/circuit-progression';
import { LAP_UNITS, localProgress, segmentAt, zonesAt, physicalAhead, classifyProgress, validateProgressionState, validateProgressionConfiguration } from '../src/simulation/race/progression/model';
import { racecraftInput } from './helpers/racecraft';
import { chooseAiCommands } from '../src/simulation/race/commands/policy';
import { neutralise, forceMechanical } from './helpers/incidents';
import { requestPitStop } from '../src/simulation/race/pits/model';
import { projectRaceState } from '../src/features/race/projection';
import type { RaceSimulationState } from '../src/simulation/race/types';
import { tieOrderFor } from '../src/simulation/race/progression/tie-order';
function input(count=4,laps=12) { const i=racecraftInput({count,laps,paceMs:Array.from({length:count},(_,n)=>n*250)}); return {...i,progression:progressionForCircuit('00000000-0000-4000-8000-000000000301')}; }
function distance(s:RaceSimulationState,id:string,total:number):RaceSimulationState { return {...s,entrants:classifyProgress(s.entrants.map(e=>e.entrantId===id?{...e,completedLaps:Math.floor(total/LAP_UNITS),track:{...e.track!,progressMicrolaps:total}}:e),s.input.circuit.baseLapTimeMs,tieOrderFor(s.input.progression!))}; }
const reload=(s:RaceSimulationState)=>JSON.parse(JSON.stringify(s)) as RaceSimulationState;
describe('v8 authoritative distance foundation',()=>{
    it('dispatches explicitly and retains the historical v7 creation / continuation path',()=>{
        const v7=createRace(racecraftInput()); expect(v7.simulationVersion).toBe(7); expect(v7.progression).toBeUndefined(); expect(advanceRaceLap(v7).simulationVersion).toBe(7);
        expect(createRace(input()).simulationVersion).toBe(8);
    });
    it('moves different cars independently on one clock with integer monotonic total distance',()=>{
        let s=createRace(input());
        for(let k=0;k<5;k++) { const old=s;s=advanceRaceLap(s);validateProgressionState(s);expect(s.entrants.some(e=>localProgress(e.track!.progressMicrolaps)!==0)).toBe(true);for(const e of s.entrants)expect(e.track!.progressMicrolaps).toBeGreaterThanOrEqual(old.entrants.find(x=>x.entrantId===e.entrantId)!.track!.progressMicrolaps); }
        expect(s.entrants[0].completedLaps).toBe(5);expect(s.entrants.at(-1)!.completedLaps).toBeLessThan(5);
    });
    it('produces lap deficits naturally from sustained slow pace and retains them at the flag',()=>{
        const i=input(3,40), adjusted={...i,parameters:{...i.parameters,carPerformanceRangeMs:10000},entrants:i.entrants.map((e,n)=>({...e,car:{performance:n===2?0:100}}))};
        const s=advanceRace(createRace(adjusted),40); expect(s.status).toBe('FINISHED');expect(s.entrants[0].completedLaps).toBe(40);expect(s.entrants[2].completedLaps).toBeLessThan(39);expect(raceResult(s).length).toBe(3);
        expect(Object.values(s.progression!.cars).reduce((n,c)=>n+c.completedLappingPasses,0)).toBeGreaterThan(0);
    });
    it('separates circular physical neighbours from championship order, including start/finish wrap',()=>{
        let s=advanceRace(createRace(input(3)),4);const [a,b,c]=s.input.entrants.map(e=>e.entrantId);
        s=distance(distance(distance(s,a,4_800_000),b,3_820_000),c,4_300_000);
        const leader=s.entrants.find(e=>e.entrantId===a)!; expect(leader.position).toBe(1);expect(physicalAhead(s.entrants,leader,s.progression!.cars,tieOrderFor(s.input.progression!))!.entrant.entrantId).toBe(b);
        s=distance(distance(s,a,4_990_000),b,3_010_000);expect(physicalAhead(s.entrants,s.entrants.find(e=>e.entrantId===a)!,undefined,tieOrderFor(s.input.progression!))!.distance).toBe(20000);
    });
    it('accepts one/multiple lap deficits and deterministic reload without equalising the field',()=>{
        let s=advanceRace(createRace(input(4,20)),6);const id=s.input.entrants[3].entrantId;s=distance(s,id,2_600_000);
        const next=advanceRace(s,4);expect(next.entrants.find(e=>e.entrantId===id)!.completedLaps).toBeLessThan(next.lap-1);expect(advanceRace(reload(s),14)).toEqual(advanceRace(s,14));
    });
    it('uses reduced lapped resistance and a finite passing cost, with no teleport to the leader',()=>{
        let s=advanceRace(createRace(input(2,15)),4);const [a,b]=s.input.entrants.map(e=>e.entrantId);
        s=distance(distance(s,a,4_300_000),b,3_305_000);s={...s,entrants:s.entrants.map(e=>e.entrantId===b?{...e,incident:{...e.incident!,mechanicalPenaltyMs:3000}}:e)};
        const next=advanceRace(s,2);expect(next.progression!.cars[a].completedLappingPasses).toBeGreaterThan(0);expect(next.entrants.find(e=>e.entrantId===b)!.completedLaps).toBeLessThan(next.lap);expect(next.progression!.elapsedTimeMs).toBeGreaterThan(s.progression!.elapsedTimeMs);
    });
    it('allows a genuinely faster lap-down car to pass naturally under green',()=>{
        const i=input(2,20);i.entrants=i.entrants.map((e,n)=>({...e,car:{performance:n===1?100:0}}));
        let s=advanceRace(createRace(i),4);const [a,b]=i.entrants.map(e=>e.entrantId);s=distance(distance(s,a,4_310_000),b,3_305_000);
        const next=advanceRace(s,4);expect(next.incidents!.events.some(e=>e.type==='OVERTAKE'&&e.entrantIds[0]===b)).toBe(true);
    });
    it('does not create traffic from close classification times when cars are physically far apart',()=>{
        let s=advanceRace(createRace(input(2,12)),3);const [a,b]=s.input.entrants.map(e=>e.entrantId);
        s=distance(distance(s,a,3_800_000),b,3_200_000);
        s={...s,entrants:s.entrants.map(e=>({...e,elapsedTimeMs:100000,intervalToAheadMs:0})),input:{...s.input,interaction:{...s.input.interaction!,minimumPaceAdvantageMs:2000}}};
        const next=advanceRaceLap(s);expect(next.entrants.every(e=>!e.track!.attempted)).toBe(true);expect(next.incidents!.events.filter(e=>e.type==='OVERTAKE')).toHaveLength(0);
    });
    it('uses local AI neighbours and yields instead of defending a lead-lap car with OVERTAKE commands',()=>{
        let s=advanceRace(createRace(input(2,15)),4);const [a,b]=s.input.entrants.map(e=>e.entrantId);s=distance(distance(s,a,4_305_000),b,3_310_000);
        s={...s,input:{...s.input,entrants:s.input.entrants.map(e=>({...e,strategyController:'DEVELOPMENT_AI'}))},entrants:s.entrants.map(e=>e.entrantId===a?{...e,commands:{...e.commands!,paceMode:'PUSH',ersMode:'OVERTAKE'}}:e)};
        const ai=chooseAiCommands(s).entrants.find(e=>e.entrantId===b)!;expect(ai.commands!.paceMode).toBe('STANDARD');expect(ai.commands!.ersMode).not.toBe('DEPLOY');
    });
    it('only enables passing and assistance in the current configured zones',()=>{
        let s=advanceRace(createRace(input(2,15)),4);const [a,b]=s.input.entrants.map(e=>e.entrantId);
        s=distance(distance(s,a,4_300_000),b,3_305_000);
        s={...s,input:{...s.input,progression:{...s.input.progression!,zones:[{id:'air-only',kind:'DIRTY_AIR',start:0,end:LAP_UNITS}]}},entrants:s.entrants.map(e=>e.entrantId===b?{...e,incident:{...e.incident!,mechanicalPenaltyMs:3000}}:e)};
        const next=advanceRaceLap(s);expect(next.entrants.every(e=>!e.track!.attempted&&!e.track!.drsEligible)).toBe(true);expect(next.progression!.cars[a].completedLappingPasses).toBe(s.progression!.cars[a].completedLappingPasses);
    });
    it('applies new command modes at each car lap boundary and preserves the active lap resource contract',()=>{
        let s=advanceRace(createRace(input(2,10)),2);const id=s.input.entrants[1].entrantId;
        const before=s.progression!.cars[id].lapCommands!;s={...s,entrants:s.entrants.map(e=>e.entrantId===id?{...e,commands:{...e.commands!,paceMode:'ATTACK',ersMode:'OVERTAKE',commandRevision:1}}:e)};
        const next=advanceRaceLap(s);expect(before.ersMode).toBe('NEUTRAL');expect(next.progression!.cars[id].lapCommands!.ersMode).toBe('OVERTAKE');expect(next.progression!.cars[id].lapCommands!.commandRevision).toBe(1);
    });
    it('covers every production circuit including Suzuka with exact segments and metadata-only zones',()=>{
        expect(Object.keys(circuitProgression)).toHaveLength(24);expect(circuitProgression['00000000-0000-4000-8000-000000000301']).toBeDefined();
        for(const c of Object.values(circuitProgression)) { validateProgressionConfiguration(c);expect(c.segments.at(-1)!.end).toBe(LAP_UNITS);for(const segment of c.segments){expect(segmentAt(c,segment.start).id).toBe(segment.id);expect(zonesAt(c,segment.start).length).toBeGreaterThan(0);}expect(segmentAt(c,LAP_UNITS).id).toBe(c.segments[0].id);expect(segmentAt(c,c.pit.entry,'ENTRY').kind).toBe('PIT_ENTRY');expect(segmentAt(c,c.pit.service,'LANE').kind).toBe('PIT_LANE');expect(segmentAt(c,LAP_UNITS,'EXIT').kind).toBe('PIT_EXIT'); }
    });
    it('requests, enters, services, exits and rejoins a pit route without backwards motion; reload retains the route',()=>{
        let s=advanceRace(createRace(input(3,12)),2);const id=s.input.entrants[2].entrantId;s=requestPitStop(s,id,'HARD');let sawRoute=false;
        for(let k=0;k<4;k++){const old=s;s=advanceRaceLap(s);expect(s.entrants.find(e=>e.entrantId===id)!.track!.progressMicrolaps).toBeGreaterThanOrEqual(old.entrants.find(e=>e.entrantId===id)!.track!.progressMicrolaps);sawRoute ||= s.progression!.cars[id].route!=='TRACK';expect(advanceRace(reload(s),12)).toEqual(advanceRace(s,12));}
        expect(sawRoute).toBe(true);expect(s.entrants.find(e=>e.entrantId===id)!.pit!.stops).toHaveLength(1);expect(s.progression!.cars[id].route).toBe('TRACK');
    });
    it.each(['VSC','SAFETY_CAR'] as const)('preserves distance / deficits and reload through %s and restart',mode=>{
        let s=advanceRace(createRace(input(3,15)),4);const id=s.input.entrants[2].entrantId;s=distance(s,id,2_700_000);s=neutralise(s,mode,2);
        const next=advanceRace(s,3);expect(next.incidents!.mode).toBe('GREEN');expect(next.entrants.find(e=>e.entrantId===id)!.completedLaps).toBeLessThan(next.lap);expect(advanceRace(reload(s),15)).toEqual(advanceRace(s,15));
    });
    it('persists wet / crossover weather with the same execution result',()=>{
        const i=input(4,14);i.weather={...i.weather!,timeline:[{startLap:1,rainfall:800,airTemperatureMilliC:18000},{startLap:7,rainfall:0,airTemperatureMilliC:20000}],forecast:[{arrivalMinLap:1,arrivalMaxLap:1,rainfallMin:750,rainfallMax:850},{arrivalMinLap:7,arrivalMaxLap:7,rainfallMin:0,rainfallMax:50}]};
        const s=advanceRace(createRace(i),8);expect(s.weather!.trackWater).toBeGreaterThan(0);expect(advanceRace(reload(s),14)).toEqual(advanceRace(s,14));
    });
    it('freezes retired distance / lap counts while the rest of the field remains valid',()=>{
        let s=advanceRace(createRace(input()),2);s=advanceRaceLap(forceMechanical(s,true));const retired=s.entrants.filter(e=>e.incident!.status==='RETIRED');expect(retired.length).toBeGreaterThan(0);const next=advanceRace(s,12);
        for(const e of retired)expect(next.entrants.find(x=>x.entrantId===e.entrantId)!.track!.progressMicrolaps).toBe(e.track!.progressMicrolaps);
    });
    it('matches step, batches, mixed chunks, finish and JSON reload exactly, including shuffled input order',()=>{
        const i=input(8,12),fresh=()=>createRace(i),finish=advanceRace(fresh(),12);let step=fresh();while(step.status==='RUNNING')step=advanceRaceLap(reload(step));expect(step).toEqual(finish);expect(advanceRace(advanceRace(advanceRace(fresh(),2),5),5)).toEqual(finish);expect(advanceRace(createRace({...i,entrants:[...i.entrants].reverse()}),12).entrants).toEqual(finish.entrants);
    });
    it('rejects inconsistent / noninteger / missing persisted progression and does not disclose hidden integration data',()=>{
        const s=advanceRace(createRace(input()),2);for(const n of [NaN,Infinity,-1,1.5])expect(()=>advanceRaceLap({...s,entrants:s.entrants.map((e,i)=>i?e:{...e,track:{...e.track!,progressMicrolaps:n}})})).toThrow();expect(()=>advanceRaceLap({...s,progression:undefined})).toThrow();const publicState=projectRaceState(s,s.input.entrants[0].teamId);expect(publicState).not.toHaveProperty('progression');expect(publicState.input).not.toHaveProperty('progression');expect(publicState).not.toHaveProperty('rngState');
    });
});

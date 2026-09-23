import { pitInput } from "./pits";
import { defaultCommandConfiguration, type CommandState, type ErsMode } from "../../src/simulation/race/commands/model";
import { createRace, advanceRace, advanceRaceLap } from "../../src/simulation/race/engine";
import type { RaceSimulationInput, RaceSimulationState } from "../../src/simulation/race/types";
export function commandInput(count=1): RaceSimulationInput {return {...pitInput(42,count,75),initialFuelKg:130,commands:defaultCommandConfiguration()};}
export function modes(s:RaceSimulationState,values:Partial<CommandState>,index=0):RaceSimulationState{return {...s,entrants:s.entrants.map((e,n)=>n===index?{...e,commands:{...e.commands!,...values}}:e)};}
export function battleRate(attacker:ErsMode,defender:ErsMode="NEUTRAL") {
 let passes=0;
 for(let seed=0;seed<200;seed++) {
  const i=commandInput(2);let s=createRace({...i,seed,parameters:{...i.parameters,gridOffsetMs:800},interaction:{...i.interaction!,drsActivationLap:1,opportunityIntervalLaps:1,overtakingDifficulty:30}});
  s=modes(modes(s,{ersMode:defender},0),{ersMode:attacker},1);
  const next=advanceRaceLap(s);if(next.entrants.find(e=>e.entrantId===i.entrants[1].entrantId)!.track!.passed)passes++;
 }
 return passes;
}
export function measurements() {
 const plans:Record<string,Partial<CommandState>>={Conserve:{paceMode:"CONSERVE"},Standard:{},Attack:{paceMode:"ATTACK"},FuelConserve:{fuelMode:"CONSERVE"},FuelPush:{fuelMode:"PUSH"},Harvest:{ersMode:"HARVEST"},Deploy:{ersMode:"DEPLOY"},Overtake:{ersMode:"OVERTAKE"},Aggressive:{paceMode:"ATTACK",fuelMode:"PUSH",ersMode:"OVERTAKE"},Saving:{paceMode:"CONSERVE",fuelMode:"CONSERVE",ersMode:"HARVEST"}};
 return Object.entries(plans).map(([name,mode])=>{const e=advanceRace(modes(createRace(commandInput()),mode),5).entrants[0];return {name,timeMs:e.elapsedTimeMs,wear:e.stint!.tyre.wearPermille,temp:e.stint!.tyre.temperatureMilliC,fuelUsedGrams:130000-Math.round(e.fuelMassKg*1000),energy:e.commands!.ersCharge};});
}

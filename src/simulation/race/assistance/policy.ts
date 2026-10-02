import type { RaceSimulationState } from '../types';
import { projectedFuelGrams } from '../commands/model';
import { physicalAhead,physicalBehind,LAP_UNITS } from '../progression/model';
import { tieOrderFor } from '../progression/tie-order';
/** Choices only. AI spends its own persisted store through exactly the player energy envelope. */
export function chooseAssistanceAi(s:RaceSimulationState):RaceSimulationState {
    const cars=structuredClone(s.progression!.cars),cfg=s.input.progression!.assistance!,tie=tieOrderFor(s.input.progression!);
    const entrants=s.entrants.map(e=>{
        if(s.input.entrants.find(x=>x.entrantId===e.entrantId)!.strategyController!=='DEVELOPMENT_AI'||e.incident!.status!=='RUNNING')return e;
        const p=cars[e.entrantId],a=p.assistance!,ahead=physicalAhead(s.entrants,e,cars,tie),behind=physicalBehind(s.entrants,e,cars);
        const close=(n:typeof ahead)=>!!n&&n.distance*s.input.circuit.baseLapTimeMs/LAP_UNITS<=1200&&Math.abs(n.entrant.track!.progressMicrolaps-e.track!.progressMicrolaps)<LAP_UNITS/2;
        const fighting=close(ahead)||close(behind),neutral=s.incidents!.mode!=='GREEN'||p.route!=='TRACK';
        a.policy=neutral||a.energy<cfg.capacity/4?'RECHARGE':fighting&&a.energy>cfg.capacity/2?'BOOST':'BALANCED';
        return {...e,commands:{...e.commands!,paceMode:neutral?'CONSERVE' as const:e.stint!.tyre.wearPermille>=s.input.commands!.ai.highWear?'LIGHT' as const:fighting?'PUSH' as const:'STANDARD' as const,fuelMode:projectedFuelGrams(s,e,'BALANCED')<0?'CONSERVE' as const:'BALANCED' as const,ersMode:'NEUTRAL' as const,ersCharge:0}};
    });
    return {...s,entrants,progression:{...s.progression!,cars}};
}

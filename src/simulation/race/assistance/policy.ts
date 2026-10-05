import type { RaceEntrantState, RaceSimulationState } from '../types';
import { projectedFuelGrams, type PaceMode } from '../commands/model';
import { physicalAhead,physicalBehind,LAP_UNITS } from '../progression/model';
import { tieOrderFor } from '../progression/tie-order';
import type { RacecraftConfiguration } from '../traffic/racecraft';
/** Race v8E pit-cycle lap pace (snapshotted `aiPitCyclePace`): an in-lap / out-lap is driven, not nursed. */
export const AI_PIT_CYCLE_PACE: PaceMode = 'PUSH';
/**
 * A genuine basis for `car` to attack `ahead`, `gapMs` up the road: within the attack gap and held back last lap, or on
 * a clearly fresher tyre. Race state only; identical for every car, whoever drives it.
 */
function attackBasis(rc:RacecraftConfiguration,car:RaceEntrantState,ahead:RaceEntrantState,gapMs:number) {
    return gapMs<=rc.aiAttackGapMs&&(car.track!.trafficLossMs>=rc.aiHeldEdgeMs||ahead.stint!.tyre.ageLaps-car.stint!.tyre.ageLaps>=rc.aiTyreAgeEdgeLaps);
}
/** Sprint resource limit: ATTACK only while the tyre's projected wear at the flag, at ATTACK wear, stays below its cliff. */
function attackAffordable(s:RaceSimulationState,e:RaceEntrantState) {
    const t=e.stint!.tyre,profile=s.input.tyres!.profiles[t.compound];
    if(!profile)return false;
    const perLap=Math.max(1,Math.round(profile.baseWearPerLapPermille*s.input.tyres!.tyreWearMultiplierPermille/1000*s.input.commands!.pace.ATTACK.tyreWearMultiplierPermille/1000));
    return t.wearPermille+perLap*Math.max(0,s.input.totalLaps-s.lap)<profile.cliffWear;
}
/** Choices only. AI spends its own persisted store through exactly the player energy envelope. */
export function chooseAssistanceAi(s:RaceSimulationState):RaceSimulationState {
    const cars=structuredClone(s.progression!.cars),cfg=s.input.progression!.assistance!,tie=tieOrderFor(s.input.progression!),rc=s.input.commands!.racecraft;
    // v8E local fix 2 (snapshotted racecraft; absent = the accepted policy exactly): pit-cycle laps and Sprint tactics.
    const pitCycle=rc?.aiPitCyclePace===true,sprint=rc?.aiSprintTactics===true;
    const finalLaps=sprint&&rc!.aiFinalAttackLaps!==undefined&&s.input.totalLaps-s.lap<=rc!.aiFinalAttackLaps;
    const ms=(distance:number)=>Math.round(distance*s.input.circuit.baseLapTimeMs/LAP_UNITS);
    const entrants=s.entrants.map(e=>{
        if(s.input.entrants.find(x=>x.entrantId===e.entrantId)!.strategyController!=='DEVELOPMENT_AI'||e.incident!.status!=='RUNNING')return e;
        const p=cars[e.entrantId],a=p.assistance!,ahead=physicalAhead(s.entrants,e,cars,tie),behind=physicalBehind(s.entrants,e,cars);
        const sameBand=(n:NonNullable<typeof ahead>)=>Math.abs(n.entrant.track!.progressMicrolaps-e.track!.progressMicrolaps)<LAP_UNITS/2;
        const close=(n:typeof ahead)=>!!n&&n.distance*s.input.circuit.baseLapTimeMs/LAP_UNITS<=1200&&sameBand(n);
        // Pit cycle: the pit route is speed-limited physics, not a Race neutralisation for the lap choice; a car in the
        // lane is in no fight. Its next lap is an in-lap or out-lap while it is committed (the EXIT car already runs its
        // fresh tyre and races normally).
        const lane=pitCycle&&p.route!=='TRACK'&&p.route!=='EXIT',cycle=pitCycle&&p.compound!==null&&p.route!=='EXIT';
        const fighting=!lane&&(close(ahead)||close(behind)),neutral=s.incidents!.mode!=='GREEN'||(!pitCycle&&p.route!=='TRACK');
        // Sprint: who has a genuine basis to attack the car ahead, and who is under a genuine threat from the car behind.
        const attacker=sprint&&!lane&&!!ahead&&sameBand(ahead)&&attackBasis(rc!,e,ahead.entrant,ms(ahead.distance));
        const threatened=sprint&&!lane&&!!behind&&sameBand(behind)&&ms(behind.distance)<=rc!.aiDefendGapMs&&attackBasis(rc!,behind.entrant,e,ms(behind.distance));
        // Energy. Accepted thresholds (BOOST above ½, RECHARGE below ¼). Sprint: the attacker stays BALANCED, keeping its
        // charge for Overtake Mode (deployed automatically in the window); only a genuinely threatened defender BOOSTs.
        a.policy=neutral||a.energy<cfg.capacity/4?'RECHARGE'
            :sprint?(!attacker&&threatened&&a.energy>cfg.capacity/2?'BOOST':'BALANCED')
            :fighting&&a.energy>cfg.capacity/2?'BOOST':'BALANCED';
        const paceMode:PaceMode=neutral?'CONSERVE':cycle?AI_PIT_CYCLE_PACE:e.stint!.tyre.wearPermille>=s.input.commands!.ai.highWear?'LIGHT'
            :finalLaps&&attacker&&attackAffordable(s,e)?'ATTACK':fighting?'PUSH':'STANDARD';
        return {...e,commands:{...e.commands!,paceMode,fuelMode:projectedFuelGrams(s,e,'BALANCED')<0?'CONSERVE' as const:'BALANCED' as const,ersMode:'NEUTRAL' as const,ersCharge:0}};
    });
    return {...s,entrants,progression:{...s.progression!,cars}};
}

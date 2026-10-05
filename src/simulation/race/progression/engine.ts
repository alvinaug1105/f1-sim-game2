import type { RaceEntrantState, RaceSimulationState } from '../types';
import { calculateLapTime } from '../engine';
import { createSeededRandom } from '../../core/random';
import { advanceLegacyProgressionLap } from './legacy';
import { chooseAssistanceAi, AI_PIT_CYCLE_PACE } from '../assistance/policy';
import { energyStep, qualify, clearEntitlement, refreshAssistance, deploys, recoverByDistance } from '../assistance/model';
import { commandLapEffects } from '../commands/model';
import { committedStops } from '../pits/model';
import { getTyreProfile, type TyreState } from '../tyres/model';
import { advanceWeather, advanceWeatherTyre, waterPenaltyMs } from '../weather/model';
import { followingEffects, passProbability, attackEdge, type OvertakeCause } from '../traffic/model';
import { lateRaceAttackWindow, progressionHeldRelease, EMPTY_HELD_LEDGER, attackOpen, attackCadence, heldLossAllowed, circuitPassEdge, type HeldLossLedger } from '../traffic/racecraft';
import { driverRiskPpm, mechanicalRiskPpm, effectivePitLaneLoss, validateIncidentState, type RaceEvent, type IncidentKind, type RaceControlMode } from '../incidents/model';
import { closeRetiredStints } from '../incidents/engine';
import { classifyProgress, physicalAhead, zonesAt, localProgress, LAP_UNITS, validateProgressionState, type CarProgression } from './model';
import { tieOrderFor } from './tie-order';
import { energyModelFor, hasV8eSemantics } from './revision';
import { enforceFinalClassification } from '../regulations/tyres';
import { freshTyreTemperatureMilliC } from '../tyres/fresh';
/** Integration uses integer milliseconds and nanolaps/ms, carrying the sub-microlap remainder (0..999). */
const QUANTUM_MS = 100;
const emptyTrack = (e: RaceEntrantState) => ({ ...e.track!, drsEligible: false, drsBenefitMs: 0, dirtyAirMs: 0, trafficLossMs: 0, attempted: false, passed: false });
/**
 * Whether a completed physical pass is an on-track OVERTAKE. Revision ≥ 5 (v8E): only TRACK vs TRACK — once either car
 * is committed to the pit route (ENTRY / LANE / SERVICE / EXIT, including a transition in the same slice, since routes
 * are read after movement) the order change is a pit-cycle change: no OVERTAKE event or cause. Earlier revisions keep
 * their accepted (route-blind) behaviour.
 */
export function passCreditable(v8e: boolean, attacker: CarProgression['route'], defender: CarProgression['route']): boolean {
    return !v8e || (attacker === 'TRACK' && defender === 'TRACK');
}
/** v8E: the cause from the attacker's actual contribution at the attack (priority: Overtake Mode, Boost, tyre, pace). */
export function attackCause(e: RaceEntrantState, d: RaceEntrantState, p: Pick<CarProgression, "assistance">, q: Pick<CarProgression, "assistance">): OvertakeCause {
    const electrical = p.assistance!.electricalDeltaMs - q.assistance!.electricalDeltaMs;
    if (electrical > 0 && p.assistance!.overtake === 'ACTIVE') return 'OVERTAKE_MODE';
    if (electrical > 0 && p.assistance!.policy === 'BOOST') return 'BOOST';
    return passCause(e, d);
}
function passCause(e: RaceEntrantState, d: RaceEntrantState): OvertakeCause {
    if (e.stint!.tyre.compound === d.stint!.tyre.compound && d.stint!.tyre.ageLaps - e.stint!.tyre.ageLaps >= 8) return 'TYRE';
    return 'PACE';
}
/**
 * v8 only. One public checkpoint is the next leader lap crossing. Each car moves on the SAME integer race clock,
 * completes its own laps, burns its own lap resources and can remain in a pit phase across checkpoints. The final
 * flag lets each still-running car reach its next crossing (lapped finishers retain their shorter race distance).
 */
export function advanceProgressionLap(saved: RaceSimulationState): RaceSimulationState {
    validateProgressionState(saved); validateIncidentState(saved);
    if(saved.input.progression!.version===1)return advanceLegacyProgressionLap(saved);
    if (saved.status !== 'RUNNING' || saved.lap >= saved.input.totalLaps) throw new RangeError('Race finished');
    const lap = saved.lap + 1, input = saved.input, config = input.progression!, assistance=config.assistance!, control = saved.incidents!, neutral = control.mode !== 'GREEN';
    // Revision 2: exact ties resolve by Race-domain (classification) order, never by generated ID text.
    const tie = tieOrderFor(config);
    // Revision 3 (v8C): recovery by distance travelled after each slice's deployment; revision 2 keeps time recovery.
    const distanceRecovery = energyModelFor(config) === 'V8C';
    // Revision 5 (v8E): pit-route pass credit, actual-contribution pass cause, attack-cadence state, normalised zero.
    const v8e = hasV8eSemantics(config), racecraft = input.commands!.racecraft;
    // v8E attack cadence for THIS circuit (scaled by its overtaking difficulty when the snapshot says so; null = none).
    const difficulty = input.interaction?.overtakingDifficulty, cadence = attackCadence(racecraft, difficulty);
    const boundaries=[...new Set([0,LAP_UNITS,assistance.detection,assistance.deploymentStart,assistance.deploymentEnd,...config.segments.map(s=>s.end),...config.zones.flatMap(z=>[z.start,z.end])])].sort((a,b)=>a-b);
    const zoneTable=boundaries.slice(0,-1).map(p=>zonesAt(config,p));
    const interval=(total:number)=>{const local=localProgress(total);let lo=0,hi=boundaries.length-2;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(boundaries[mid]<=local)lo=mid;else hi=mid-1;}return lo;};
    const localZones=(total:number)=>zoneTable[interval(total)];
    const weather = advanceWeather(saved.weather!, input.weather!, lap), random = createSeededRandom(saved.rngState);
    let state = chooseAssistanceAi({ ...saved, weather });
    if (neutral) state = { ...state, entrants: state.entrants.map(e => input.entrants.find(s => s.entrantId === e.entrantId)!.strategyController === 'PLAYER' ? e : { ...e, commands: { ...e.commands!, paceMode: 'CONSERVE', fuelMode: 'CONSERVE', ersMode: 'NEUTRAL' } }) };
    let entries: RaceEntrantState[] = state.entrants.map(e => ({ ...e, track: emptyTrack(e) }));
    const cars = structuredClone(state.progression!.cars) as Record<string, CarProgression>;
    for(const e of entries) cars[e.entrantId].observations=[{atMs:saved.progression!.elapsedTimeMs,total:e.track!.progressMicrolaps,route:cars[e.entrantId].route}];
    const observe=(id:string)=>{const p=cars[id],e=entries.find(x=>x.entrantId===id)!;p.observations!.push({atMs:clock,total:e.track!.progressMicrolaps,route:p.route});};
    // Fuel and pace retain their shared mechanics; legacy ERS slots are inert in revision 2.
    const commands={...input.commands!,baseRecovery:0,ers:{...input.commands!.ers,NEUTRAL:{...input.commands!.ers.NEUTRAL,deltaMs:0,consumption:0,recoveryPermille:0}}};
    const grid = [...input.entrants].sort((a,b) => a.gridPosition - b.gridPosition);
    const events: RaceEvent[] = [...control.events];
    const emit = (event: Omit<RaceEvent,'sequence'|'lap'>) => events.push({ ...event, sequence: events.length+1, lap });
    let clock = saved.progression!.elapsedTimeMs;
    const sourceOf = (id: string) => input.entrants.find(e => e.entrantId === id)!;
    const indexOf = (id: string) => entries.findIndex(e => e.entrantId === id);
    const active = (e: RaceEntrantState) => e.incident!.status === 'RUNNING';
    const neutralProfile = neutral ? input.incidents![control.mode as 'VSC'|'SAFETY_CAR'] : null;
    const retire = (id: string, kind: IncidentKind | 'FUEL_STARVATION') => {
        const i = indexOf(id), e = entries[i]; if (e.incident!.status === 'RETIRED') return;
        emit({ type: 'RETIREMENT', entrantIds: [id], kind, severity: 'MAJOR', timeLossMs: 0 });
        entries[i] = { ...e, incident: { ...e.incident!, status: 'RETIRED', retiredLap: lap, retirementOrder: events.length }, pit: { ...e.pit!, pendingCompound: null, stints: closeRetiredStints(e.pit!.stints, e.completedLaps, e.stint!.tyre) }, track: emptyTrack(e) };
        cars[id] = { ...cars[id], route: 'TRACK', compound: null, pitEntryLap: null, delayMs: 0, lappedAheadId: null, passingId: null, ...(v8e ? { passingCause: null } : {}) };
    };
    // Retain one consistency draw-pair per car's own lap, in fixed grid order at shared boundaries.
    const plan = (id: string, fresh: boolean) => {
        const e = entries[indexOf(id)], p = cars[id]; if (!active(e)) return;
        const source = sourceOf(id);
        const r = calculateLapTime({ ...source, circuit: input.circuit, parameters: input.parameters, fuelMassKg: e.fuelMassKg, tyre: { state: e.stint!.tyre, profile: getTyreProfile(input.tyres!, e.stint!.tyre.compound) } }, fresh ? random : { next: () => .5 });
        if (fresh) { p.variationMs = v8e && Object.is(r.variationMs,-0) ? 0 : r.variationMs; p.lapCommands = { ...e.commands! }; }
        const effects = commandLapEffects({ ...e, commands: p.lapCommands! }, input.fuelBurnPerLapKg * (neutralProfile ? neutralProfile.fuelMultiplierPermille/1000 : 1), commands, neutral || p.route !== 'TRACK' || Boolean(p.compound));
        if (effects.starved && input.commands!.racecraft?.fuelStarvationRetirement === true) { retire(id,'FUEL_STARVATION'); return; }
        p.commandMs = neutral ? 0 : effects.commandMs;
        p.freeLapMs = neutralProfile ? Math.round(input.circuit.baseLapTimeMs*neutralProfile.lapMultiplierPermille/1000) : Math.max(1000,r.lapTimeMs-r.variationMs+p.variationMs+effects.deltaMs+e.incident!.mechanicalPenaltyMs+waterPenaltyMs(e.stint!.tyre.compound,weather.trackWater,input.weather!));
        p.expectedLapMs = Math.max(1000,p.freeLapMs-(neutral ? 0 : p.variationMs));
        entries[indexOf(id)] = { ...e, track: { ...e.track!, potentialLapTimeMs: p.freeLapMs } };
    };
    // Policy sees current public weather / current Race Control and the same reduced pit cost as v7.
    const policyState = { ...state, input: { ...input, pits: { ...input.pits!, pitLaneLossMs: effectivePitLaneLoss(state) } }, entrants: entries.filter(active) };
    const stops = committedStops({ ...policyState, input: { ...policyState.input, entrants: input.entrants.filter(e => policyState.entrants.some(x => x.entrantId === e.entrantId)) } });
    for (const source of grid) {
        const i = indexOf(source.entrantId), e = entries[i], p = cars[source.entrantId];
        if (!active(e)) continue;
        p.lappedAheadId = null;
        if (neutral) { p.passingId = null; if (v8e) p.passingCause = null; }
        const compound = stops.get(e.entrantId);
        if (compound && p.route === 'TRACK' && !p.compound) {
            p.compound = compound; p.pitEntryLap = e.completedLaps + (localProgress(e.track!.progressMicrolaps) >= config.pit.entry ? 1 : 0);
            entries[i] = { ...e, pit: { ...e.pit!, pendingCompound: null, commandRevision: e.pit!.commandRevision+1 } };
            // v8E pit cycle (snapshotted racecraft): an AI car committed at THIS checkpoint runs its next lap — its out-lap,
            // or its in-lap when already past pit entry — on the pit-cycle pace, not the worn-tyre mode just chosen for it.
            if (racecraft?.aiPitCyclePace === true && !neutral && source.strategyController === 'DEVELOPMENT_AI') entries[i] = { ...entries[i], commands: { ...entries[i].commands!, paceMode: AI_PIT_CYCLE_PACE } };
        }
        plan(source.entrantId,p.freeLapMs === 0);
    }
    const finishTargets = new Map<string,number>();
    // Race v8D: each car's held-following ledger for this checkpoint (owed / given up; capped per checkpoint).
    const heldLoss = new Map<string,HeldLossLedger>();
    const heldCapUnits = Math.round((input.commands?.racecraft?.progressionHeldFollowingLossMaxMs ?? 0)*LAP_UNITS/input.circuit.baseLapTimeMs);
    let flagged = false, iterations = 0;
    const completeLap = (id: string) => {
        const i = indexOf(id), e = entries[i], p = cars[id];
        const actual = Math.max(1,clock-p.lapStartedAtMs), completedLaps = Math.floor(e.track!.progressMicrolaps/LAP_UNITS);
        const effects = commandLapEffects({...e,commands:p.lapCommands!},input.fuelBurnPerLapKg*(neutralProfile ? neutralProfile.fuelMultiplierPermille/1000 : 1),commands,neutral || p.route !== 'TRACK' || Boolean(p.compound));
        const pace = input.commands!.pace[p.lapCommands!.paceMode];
        const tyreConfig = { ...input.tyres!, tyreWearMultiplierPermille: Math.round(input.tyres!.tyreWearMultiplierPermille*(neutralProfile ? neutralProfile.wearMultiplierPermille : pace.tyreWearMultiplierPermille)/1000), tyreEnergyMultiplierPermille: Math.round(input.tyres!.tyreEnergyMultiplierPermille*(neutralProfile ? neutralProfile.energyMultiplierPermille : pace.tyreEnergyMultiplierPermille)/1000) };
        const oldTyre = advanceWeatherTyre(e.stint!.tyre,tyreConfig,weather,input.weather!);
        let next: RaceEntrantState = { ...e, completedLaps, elapsedTimeMs: clock, lastLapTimeMs: actual, bestLapTimeMs: Math.min(e.bestLapTimeMs ?? actual,actual), fuelMassKg: effects.fuelMassKg, commands: { ...e.commands!, ersCharge: effects.commands.ersCharge }, stint: { ...e.stint!, tyre: oldTyre } };
        if (p.route === 'LANE' && p.compound) {
            const tyre: TyreState = { compound: p.compound, ageLaps: 0, wearPermille: 0, temperatureMilliC: freshTyreTemperatureMilliC(input, p.compound) };
            const number = e.stint!.number+1;
            next = { ...next, stint: { number, startedAtLap: completedLaps, tyre }, pit: { ...e.pit!, stops: [...e.pit!.stops,{ number: e.pit!.stops.length+1, lap: completedLaps, oldCompound: e.stint!.tyre.compound, newCompound: p.compound, pitLaneLossMs: p.pitLossMs-p.stationaryMs, stationaryTimeMs: p.stationaryMs, totalLossMs: p.pitLossMs }], stints: [...e.pit!.stints.map(s => s.endLap === null ? { ...s,endLap: completedLaps,endingTyre: oldTyre } : s),{ number,startLap: completedLaps,endLap: null,startingTyre: tyre,endingTyre: null }] } };
            p.route = 'EXIT';
        }
        if (flagged && completedLaps >= finishTargets.get(id)!) next = { ...next,incident: { ...next.incident!,status: 'FINISHED' } };
        entries[i] = next; observe(id); p.lapStartedAtMs = clock; p.remainder = 0;
        if (active(next)) plan(id,true);
    };
    while (true) {
        if (++iterations > 100000) throw new RangeError('v8 progression did not reach checkpoint');
        const running = entries.filter(active);
        if (!running.length) break;
        // No overshoot across lap, pit-entry/service/exit boundaries. All cars share this same elapsed time slice.
        let dt = QUANTUM_MS;
        const movement = new Map<string,{ rate: number; ahead: RaceEntrantState | null; distance: number; gapMs: number; effects: ReturnType<typeof followingEffects> }>();
        // v8E Safety Car train: each car's catch-up toward its own train slot (distance behind the leader minus one queue
        // interval per running car ahead), from the current slice's actual distances only.
        const train = control.mode==='SAFETY_CAR' && input.incidents!.scTrainCatchupPermille!==undefined ? [...running].sort((a,b)=>b.track!.progressMicrolaps-a.track!.progressMicrolaps||a.position-b.position) : null;
        const scTrainCatchupMs = (e: RaceEntrantState) => {
            const rank = train!.findIndex(x=>x.entrantId===e.entrantId), behindMs = Math.round((train![0].track!.progressMicrolaps-e.track!.progressMicrolaps)*input.circuit.baseLapTimeMs/LAP_UNITS);
            const excess = behindMs - rank*input.incidents!.queueIntervalMs;
            return excess>0 ? Math.min(input.incidents!.maxCompressionMs,Math.round(excess*input.incidents!.scTrainCatchupPermille!/1000)) : 0;
        };
        for (const e of running) {
            const p = cars[e.entrantId];let near:{entrant:RaceEntrantState;distance:number}|null=null;
            // Nearest car ahead on track; an exact distance tie uses the Race's frozen tie rule.
            if(p.route==='TRACK')for(const peer of entries) {if(peer.entrantId===e.entrantId||peer.incident!.status!=='RUNNING'||cars[peer.entrantId].route!=='TRACK')continue;const distance=(localProgress(peer.track!.progressMicrolaps)-localProgress(e.track!.progressMicrolaps)+LAP_UNITS)%LAP_UNITS;if((distance>0||peer.position<e.position)&&(!near||distance<near.distance||(distance===near.distance&&tie(peer,near.entrant)<0)))near={entrant:peer,distance};}
            const gapMs = near ? Math.round(near.distance*input.circuit.baseLapTimeMs/LAP_UNITS) : Infinity;
            const zone = localZones(e.track!.progressMicrolaps);
            const interaction = { ...input.interaction!, drsZoneCount: 0 };
            const effects = !neutral && p.route === 'TRACK' && zone.some(z=>z.kind==='DIRTY_AIR') ? followingEffects(Number.isFinite(gapMs) ? gapMs : null,lap,interaction) : { drsEligible:false,dirtyAirMs:0,drsBenefitMs:0 };
            const straight=zone.some(z=>z.kind==='ASSISTANCE'),safe=!neutral&&p.route==='TRACK'&&weather.trackWater<=assistance.maxWater&&!p.launchDelayMs&&!p.delayMs;
            const electrical=energyStep({...p.assistance!},assistance,{dt:QUANTUM_MS,lap:e.completedLaps,progress:localProgress(e.track!.progressMicrolaps),straight,safe});
            let duration = p.freeLapMs+effects.dirtyAirMs-electrical;
            if(p.route!=='TRACK')duration+=Math.round((p.pitLossMs-p.stationaryMs)*LAP_UNITS/(LAP_UNITS+config.pit.exit-config.pit.entry));
            if (control.mode==='SAFETY_CAR' && near && gapMs>input.incidents!.queueIntervalMs && input.incidents!.scTrainCatchupPermille!==undefined) duration -= scTrainCatchupMs(e);
            else if (control.mode==='SAFETY_CAR' && near && gapMs>input.incidents!.queueIntervalMs && gapMs<input.circuit.baseLapTimeMs/3) duration -= Math.min(input.incidents!.maxCompressionMs,Math.round((gapMs-input.incidents!.queueIntervalMs)*input.incidents!.compressionPermille/1000));
            const rate = Math.max(1,Math.round(LAP_UNITS*1000/Math.max(1000,duration)));
            movement.set(e.entrantId,{rate,ahead:near?.entrant??null,distance:near?.distance??LAP_UNITS,gapMs,effects});
            // v8E attack cadence: after an attempt the battle re-arms once the gap has re-opened (or there is no car ahead).
            if (cadence && p.attackArmed === false && (!near || gapMs >= cadence.rearmGapMs)) p.attackArmed = true;
            if (p.launchDelayMs || p.delayMs) dt = Math.min(dt,p.launchDelayMs || p.delayMs);
            else {
                const local = localProgress(e.track!.progressMicrolaps);
                let boundary = LAP_UNITS-local;
                if(p.route==='TRACK')boundary=Math.min(boundary,boundaries[interval(e.track!.progressMicrolaps)+1]-local);
                if (p.compound && p.route==='TRACK' && e.completedLaps===p.pitEntryLap && local<config.pit.entry) boundary = Math.min(boundary,config.pit.entry-local);
                if(p.route==='ENTRY'&&local<config.pit.segments[0].end)boundary=Math.min(boundary,config.pit.segments[0].end-local);
                if ((p.route==='ENTRY'||p.route==='LANE') && local<config.pit.service) boundary = Math.min(boundary,config.pit.service-local);
                if (p.route==='EXIT' && local<config.pit.exit) boundary = Math.min(boundary,config.pit.exit-local);
                dt = Math.min(dt,Math.max(1,Math.ceil((boundary*1000-p.remainder)/rate)));
            }
        }
        // Attempt ordering is original grid order; no draw is consumed for distant / pit / retired cars.
        for (const source of grid) {
            const i = indexOf(source.entrantId), e = entries[i], p = cars[source.entrantId], m = movement.get(e.entrantId);
            if (!m || neutral || p.route!=='TRACK' || p.launchDelayMs || p.delayMs || !attackOpen(racecraft,p,lap,clock,difficulty) || p.passedByLap===lap || !m.ahead || !localZones(e.track!.progressMicrolaps).some(z=>z.kind==='PASSING'||z.kind==='BRAKING')) continue;
            const d = m.ahead, defender = cars[d.entrantId];
            if (defender.launchDelayMs || defender.delayMs || defender.passedByLap===lap) continue;
            const lapping = e.track!.progressMicrolaps-d.track!.progressMicrolaps>LAP_UNITS/2;
            const blueFlag = lapping && localZones(e.track!.progressMicrolaps).some(z=>z.kind==='BLUE_FLAG');
            const { edge } = input.commands!.racecraft ? attackEdge(defender.expectedLapMs-p.expectedLapMs+p.assistance!.electricalDeltaMs-defender.assistance!.electricalDeltaMs,defender.commandMs-p.commandMs,input.commands!.racecraft) : { edge: defender.expectedLapMs-p.expectedLapMs };
            // Race v8D late-Race window (revision-4 racecraft only): ordinary on-track racing between two TRACK cars, judged
            // by the attacker's own distance. Lapping / blue flags keep their own gate; neutralised running never gets here.
            const window = lapping || defender.route!=='TRACK' ? null : lateRaceAttackWindow(input.commands!.racecraft,input.interaction!,e.completedLaps,input.totalLaps);
            const threshold = lapping ? config.lapping.thresholdMs : window ? window.attackThresholdMs : input.interaction!.attackThresholdMs;
            if (blueFlag && m.gapMs<=threshold) p.lappedAheadId = d.entrantId;
            if (m.gapMs>threshold || edge<(window ? window.minimumPaceAdvantageMs : input.interaction!.minimumPaceAdvantageMs)) continue;
            // v8E local fix 2: the circuit's difficulty also governs how much of a genuine pace edge converts (ordinary
            // racing only; lapping keeps its own resistance rule). The attack gate above still uses the raw edge.
            const ordinary = passProbability(lapping ? edge : circuitPassEdge(racecraft,edge,difficulty),source.interaction!,sourceOf(d.entrantId).interaction!,source.car.performance-sourceOf(d.entrantId).car.performance,m.effects.drsEligible,input.interaction!);
            const probability = blueFlag ? Math.min(990,1000-Math.round((1000-ordinary)*config.lapping.resistancePermille/1000)) : ordinary;
            const draw = random.next(), success = draw*1000<probability;
            if (v8e) { p.attacksThisLap = p.attemptedLap===lap ? p.attacksThisLap!+1 : 1; p.lastAttackAtMs = clock; p.attackArmed = false;
                // The cause is the attacker's ACTUAL contribution at this attack (electrical delta over the defender's
                // with Overtake Mode active / Boost policy deploying), else tyre or pace — never just a selected policy.
                p.passingCause = success && !lapping ? attackCause(e,d,p,defender) : null; }
            p.attemptedLap = lap; p.passingId = success ? d.entrantId : null; p.lappingPass = lapping;
            p.delayMs += success ? lapping ? config.lapping.passingCostMs : input.interaction!.minimumGapMs : lapping ? config.lapping.failedCostMs : Math.max(input.interaction!.minimumGapMs,Math.round(draw*(input.commands!.racecraft?.failedAttackLossMaxMs??300)));
            entries[i] = { ...e,track:{ ...e.track!,attempted:true,passed:false } };
        }
        const deltas = new Map<string,number>(), deploying = new Map<string,boolean>();
        for (const e of running) {
            const p = cars[e.entrantId], m = movement.get(e.entrantId)!;
            if(p.launchDelayMs||p.delayMs) { p.assistance!.aero='SAFE';p.assistance!.electricalDeltaMs=0;clearEntitlement(p.assistance!); }
            if (p.launchDelayMs) { p.launchDelayMs=Math.max(0,p.launchDelayMs-dt); deltas.set(e.entrantId,0); continue; }
            if (p.delayMs) { p.delayMs=Math.max(0,p.delayMs-dt); deltas.set(e.entrantId,0); continue; }
            const zone=localZones(e.track!.progressMicrolaps),context={dt,lap:e.completedLaps,progress:localProgress(e.track!.progressMicrolaps),straight:zone.some(z=>z.kind==='ASSISTANCE'),safe:!neutral&&p.route==='TRACK'&&weather.trackWater<=assistance.maxWater};
            energyStep(p.assistance!,assistance,context);
            if(distanceRecovery)deploying.set(e.entrantId,deploys(p.assistance!,context));
            const units = dt*m.rate+p.remainder;
            deltas.set(e.entrantId,Math.floor(units/1000)); p.remainder=units%1000;
        }
        // Local no-pass resistance uses a forward circular gap, never a timing-table neighbour or equal-lap gate.
        for (const e of [...running].sort((a,b)=>localProgress(b.track!.progressMicrolaps)-localProgress(a.track!.progressMicrolaps)||a.position-b.position)) {
            const p = cars[e.entrantId], m = movement.get(e.entrantId)!;
            let delta = deltas.get(e.entrantId)!;
            const defender = m.ahead;
            if (p.route==='TRACK' && defender && p.passingId!==defender.entrantId) {
                const floor = Math.max(1,Math.round(input.interaction!.minimumGapMs*LAP_UNITS/input.circuit.baseLapTimeMs));
                const allowed = Math.max(0,m.distance+(deltas.get(defender.entrantId)??0)-floor);
                const held = Math.max(0,delta-allowed); delta = Math.min(delta,allowed);
                let lostMs = Math.round(held*input.circuit.baseLapTimeMs/LAP_UNITS);
                // Race v8D (revision-4 racecraft only): a car held at the floor in green running that has not attempted a
                // pass this lap (a failed attack already costs its own delay) owes part of the pace it could not use and
                // gives it up as a real drop-back, so it falls off the floor instead of riding it exactly. Movement is only
                // reduced (never negative); no draw is consumed; Active Aero / Overtake / Boost state is untouched.
                if (held && !neutral && heldLossAllowed(racecraft,p,lap,clock,difficulty)) {
                    const release = progressionHeldRelease(input.commands!.racecraft,heldLoss.get(e.entrantId)??EMPTY_HELD_LEDGER,held,floor,heldCapUnits,delta);
                    heldLoss.set(e.entrantId,release.ledger);
                    if (release.extraUnits) { delta -= release.extraUnits; lostMs += Math.round(release.extraUnits*input.circuit.baseLapTimeMs/LAP_UNITS); }
                }
                if (held) entries[indexOf(e.entrantId)] = { ...entries[indexOf(e.entrantId)],track:{ ...entries[indexOf(e.entrantId)].track!,trafficLossMs:entries[indexOf(e.entrantId)].track!.trafficLossMs+lostMs } };
            }
            deltas.set(e.entrantId,delta);
        }
        clock += dt;
        for (const source of grid) {
            const i = indexOf(source.entrantId), e = entries[i], p = cars[source.entrantId], m = movement.get(e.entrantId);
            if (!m) continue;
            const oldTotal = e.track!.progressMicrolaps, oldLocal = localProgress(oldTotal), delta = deltas.get(e.entrantId)!;
            let total = oldTotal+delta; const oldRoute=p.route;
            // Detection is a shared-clock boundary, including millisecond rounding.
            if(p.route==='TRACK'&&oldLocal<assistance.detection&&total>=e.completedLaps*LAP_UNITS+assistance.detection) total=Math.min(total,e.completedLaps*LAP_UNITS+assistance.detection);
            // Exact boundaries discard only the last sub-microlap rounding overshoot; never backwards movement.
            if (Math.floor(total/LAP_UNITS)>Math.floor(oldTotal/LAP_UNITS)) total=(Math.floor(oldTotal/LAP_UNITS)+1)*LAP_UNITS;
            if (p.compound && p.route==='TRACK' && e.completedLaps===p.pitEntryLap && oldLocal<=config.pit.entry && localProgress(total)>=config.pit.entry) { total=e.completedLaps*LAP_UNITS+config.pit.entry; p.route='ENTRY'; p.remainder=0;p.stationaryMs=0;p.pitLossMs=effectivePitLaneLoss(state);clearEntitlement(p.assistance!);p.assistance!.aero='SAFE';p.assistance!.electricalDeltaMs=0; }
            if (p.route==='ENTRY' && localProgress(total)>=config.pit.segments[0].end) p.route='LANE';
            if (p.route==='LANE' && oldLocal<config.pit.service && localProgress(total)>=config.pit.service) {
                total=e.completedLaps*LAP_UNITS+config.pit.service; p.route='SERVICE'; p.remainder=0;
                p.stationaryMs=input.pits!.stationaryBaseMs+Math.round((2*random.next()-1)*input.pits!.stationaryVariationMs);
                p.pitLossMs=effectivePitLaneLoss(state)+p.stationaryMs; p.delayMs+=p.stationaryMs;
            }
            if (p.route==='SERVICE' && p.delayMs===0) p.route='LANE';
            if (p.route==='EXIT' && localProgress(total)>=config.pit.exit) { p.route='TRACK'; p.compound=null; p.pitEntryLap=null; p.remainder=0; }
            entries[i] = { ...e,track:{ ...e.track!,...m.effects,progressMicrolaps:total } };
            // v8C: energy recovered for the distance actually travelled in this slice, after its deployment.
            if(deploying.has(e.entrantId))recoverByDistance(p.assistance!,assistance,total-oldTotal,deploying.get(e.entrantId)!);
            if(oldRoute!==p.route)observe(e.entrantId);

        }
        for(const e of entries.filter(active)) {
            const old=running.find(x=>x.entrantId===e.entrantId),p=cars[e.entrantId];if(!old)continue;
            const before=old.track!.progressMicrolaps,after=e.track!.progressMicrolaps,line=(Math.floor(before/LAP_UNITS)+(assistance.detection===0?1:0))*LAP_UNITS+assistance.detection;
            if(before<line&&after>=line) { const near=p.route==='TRACK'?physicalAhead(entries,e,cars,tie):null;qualify(p.assistance!,assistance,Math.floor(line/LAP_UNITS),near?Math.round(near.distance*input.circuit.baseLapTimeMs/LAP_UNITS):null,near?after-near.entrant.track!.progressMicrolaps:LAP_UNITS,!neutral&&p.route==='TRACK'&&weather.trackWater<=assistance.maxWater); }
        }
        // Record passes only after actual movement of BOTH cars; boundary clamping must not invent a pass.
        for (const source of grid) {
            const i=indexOf(source.entrantId),e=entries[i],p=cars[e.entrantId],m=movement.get(e.entrantId);
            if (!m) continue;
            if (p.passingId && m.ahead?.entrantId===p.passingId && e.track!.progressMicrolaps-running.find(x=>x.entrantId===e.entrantId)!.track!.progressMicrolaps>m.distance+(entries[indexOf(p.passingId)].track!.progressMicrolaps-running.find(x=>x.entrantId===p.passingId)!.track!.progressMicrolaps)) {
                const d = entries[indexOf(p.passingId)];
                // v8E: once either car is committed to the pit route (e.g. the defender turned into pit entry in this
                // slice) the order change is a pit-cycle change, not an on-track pass: no OVERTAKE event or cause.
                if (!passCreditable(v8e,p.route,cars[p.passingId].route)) { p.passingId=null; p.passingCause=null; p.lappedAheadId=null; continue; }
                if (p.lappingPass) p.completedLappingPasses++;
                else { emit({type:'OVERTAKE',entrantIds:[e.entrantId,p.passingId],kind:null,severity:null,timeLossMs:0,cause:v8e?(p.passingCause ?? passCause(e,d)):p.assistance!.electricalDeltaMs>0?(p.assistance!.overtake==='ACTIVE'?'OVERTAKE_MODE':'BOOST'):passCause(e,d)}); entries[i]={...entries[i],track:{...entries[i].track!,overtakesCompleted:e.track!.overtakesCompleted+1,passed:true,attempted:true}}; }
                cars[p.passingId].passedByLap=lap; p.passingId=null; if (v8e) p.passingCause=null; p.lappedAheadId=null;
            }
        }
        for (const source of grid) {
            const e=entries[indexOf(source.entrantId)];
            if (active(e) && Math.floor(e.track!.progressMicrolaps/LAP_UNITS)>e.completedLaps) completeLap(e.entrantId);
        }
        entries=classifyProgress(entries,input.circuit.baseLapTimeMs,tie);
        if (!flagged && entries.some(e=>e.incident!.status!=='RETIRED' && e.completedLaps>=lap)) {
            if (lap<input.totalLaps) break;
            flagged=true;
            for (const e of entries.filter(active)) {
                if (e.completedLaps>=input.totalLaps) entries[indexOf(e.entrantId)]={...e,incident:{...e.incident!,status:'FINISHED'}};
                else finishTargets.set(e.entrantId,e.completedLaps+1);
            }
        }
        if (flagged && !entries.some(active)) break;
    }
    // Existing incident stream contract: six draws per ORIGINAL grid slot per world checkpoint, including retirees.
    const incidentRandom=createSeededRandom(control.rngState), affected=new Set<string>();
    let trigger: RaceControlMode='GREEN',duration=0;
    for (const source of grid) {
        const [error,kindRoll,severityRoll,mechanical,outcome,durationRoll]=Array.from({length:6},()=>incidentRandom.next());
        const e=entries[indexOf(source.entrantId)]; if (neutral || e.incident!.status==='RETIRED' || affected.has(e.entrantId)) continue;
        let kind:IncidentKind|null=null,severity:RaceEvent['severity']='MINOR';
        const near=physicalAhead(entries,e,cars,tie), ahead=near && near.distance*input.circuit.baseLapTimeMs/LAP_UNITS<=1000 ? near.entrant : null;
        const context={...state,entrants:entries,weather};
        if (error*1e6<driverRiskPpm(context,{...e,commands:cars[e.entrantId].lapCommands??e.commands,position:ahead?2:1,intervalToAheadMs:ahead?Math.round(near!.distance*input.circuit.baseLapTimeMs/LAP_UNITS):null},source)) {
            kind=(['DRIVER_MISTAKE','LOCK_UP','SPIN','CONTACT'] as const)[Math.floor(kindRoll*4)];
            if (kind==='CONTACT' && (!ahead || affected.has(ahead.entrantId) || cars[e.entrantId].route!=='TRACK')) kind='DRIVER_MISTAKE';
            severity=severityRoll*1000<input.incidents!.majorPermille?'MAJOR':severityRoll*1000<input.incidents!.majorPermille+input.incidents!.moderatePermille?'MODERATE':'MINOR';
        } else if (mechanical*1e6<mechanicalRiskPpm(context,source)) { kind=severityRoll*1000<input.incidents!.mechanicalRetirementPermille?'MECHANICAL_RETIREMENT':'MECHANICAL_PROBLEM'; severity=kind==='MECHANICAL_RETIREMENT'?'MAJOR':'MODERATE'; }
        if (!kind) continue;
        const ids=kind==='CONTACT'?[e.entrantId,ahead!.entrantId]:[e.entrantId],range=input.incidents!.losses[kind];
        const loss=Math.round((range.minimumMs+kindRoll*(range.maximumMs-range.minimumMs))*(severity==='MODERATE'?1.5:1));
        emit({type:'INCIDENT',entrantIds:ids,kind,severity,timeLossMs:loss});
        for (const id of ids) { affected.add(id); cars[id].delayMs+=loss; const i=indexOf(id); entries[i]={...entries[i],incident:{...entries[i].incident!,mechanicalPenaltyMs:kind==='MECHANICAL_PROBLEM'?Math.min(10000,entries[i].incident!.mechanicalPenaltyMs+input.incidents!.mechanicalPenaltyMs):entries[i].incident!.mechanicalPenaltyMs}}; }
        if (severity==='MAJOR') { retire(e.entrantId,kind); if (kind==='CONTACT'&&outcome*1000<input.incidents!.doubleContactRetirementPermille) retire(ahead!.entrantId,kind); }
        const candidate:RaceControlMode=severity==='MAJOR'&&kind!=='MECHANICAL_RETIREMENT'&&outcome*1000<input.incidents!.scMajorPermille?'SAFETY_CAR':outcome*1000<(severity==='MAJOR'?input.incidents!.vscRetirementPermille:input.incidents!.vscMinorPermille)?'VSC':'GREEN';
        if(candidate!=='GREEN'&&(trigger==='GREEN'||candidate==='SAFETY_CAR')) { trigger=candidate; const profile=input.incidents![candidate]; duration=profile.minLaps+Math.floor(durationRoll*(profile.maxLaps-profile.minLaps+1)); }
    }
    let nextControl={...control,rngState:incidentRandom.getState(),events};
    if (neutral) {
        nextControl.remainingLaps--;
        if(nextControl.remainingLaps===0) { emit({type:control.mode==='VSC'?'VSC_END':'SAFETY_CAR_END',entrantIds:[],kind:null,severity:null,timeLossMs:0}); nextControl={...nextControl,mode:'GREEN',startedLap:null,drsDelay:control.mode==='SAFETY_CAR'?input.incidents!.drsRestartLaps:control.drsDelay}; }
    } else {
        nextControl.drsDelay=Math.max(0,control.drsDelay-1);
        if(trigger!=='GREEN'&&lap<input.totalLaps) { nextControl={...nextControl,mode:trigger,startedLap:lap,remainingLaps:duration}; emit({type:trigger==='VSC'?'VSC_START':'SAFETY_CAR_START',entrantIds:[],kind:null,severity:null,timeLossMs:0}); }
    }
    const finished=lap===input.totalLaps;
    if(finished) entries=entries.map(e=>e.incident!.status==='RETIRED'?e:{...e,incident:{...e.incident!,status:'FINISHED'},pit:{...e.pit!,pendingCompound:null,stints:e.pit!.stints.map(s=>s.endLap===null&&s.startLap<e.completedLaps?{...s,endLap:e.completedLaps,endingTyre:e.stint!.tyre}:s)}});
    for (const e of entries) { const p=cars[e.entrantId];
        if(nextControl.mode!=='GREEN'||e.incident!.status!=='RUNNING'||p.route!=='TRACK') { clearEntitlement(p.assistance!);p.assistance!.aero='SAFE';p.assistance!.electricalDeltaMs=0; }
        refreshAssistance(p.assistance!,assistance,{lap:e.completedLaps,progress:localProgress(e.track!.progressMicrolaps),straight:localZones(e.track!.progressMicrolaps).some(z=>z.kind==='ASSISTANCE'),safe:nextControl.mode==='GREEN'&&e.incident!.status==='RUNNING'&&p.route==='TRACK'&&weather.trackWater<=assistance.maxWater});
        observe(e.entrantId); if (p.passingId && !entries.some(x=>x.entrantId===p.passingId&&x.incident!.status==='RUNNING')) { p.passingId=null; if (v8e) p.passingCause=null; } }
    let next:RaceSimulationState={...saved,lap,status:finished?'FINISHED':'RUNNING',weather,rngState:random.getState(),incidents:nextControl,progression:{elapsedTimeMs:clock,cars},entrants:classifyProgress(entries,input.circuit.baseLapTimeMs,tie,finished)};
    // v8C: the regulation is enforced once, at the flag, from the actual final tyre history (no random draw).
    if (finished && config.regulation) {
        const { entrants, record } = enforceFinalClassification(next, subset => classifyProgress(subset,input.circuit.baseLapTimeMs,tie,true));
        next = { ...next, entrants, progression: { ...next.progression!, classification: record } };
    }
    validateProgressionState(next); validateIncidentState(next);
    return next;
}

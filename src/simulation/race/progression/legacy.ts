import type { RaceEntrantState, RaceSimulationState } from '../types';
import { calculateLapTime } from '../engine';
import { createSeededRandom } from '../../core/random';
import { chooseAiCommands } from '../commands/policy';
import { commandLapEffects } from '../commands/model';
import { committedStops } from '../pits/model';
import { getTyreProfile, type TyreState } from '../tyres/model';
import { advanceWeather, advanceWeatherTyre, waterPenaltyMs } from '../weather/model';
import { followingEffects, passProbability, attackEdge, type OvertakeCause } from '../traffic/model';
import { driverRiskPpm, mechanicalRiskPpm, effectivePitLaneLoss, validateIncidentState, type RaceEvent, type IncidentKind, type RaceControlMode } from '../incidents/model';
import { closeRetiredStints } from '../incidents/engine';
import { classifyProgress, physicalAhead, zonesAt, localProgress, LAP_UNITS, validateProgressionState, type CarProgression } from './model';
/** Integration uses integer milliseconds and nanolaps/ms, carrying the sub-microlap remainder (0..999). */
const QUANTUM_MS = 100;
const emptyTrack = (e: RaceEntrantState) => ({ ...e.track!, drsEligible: false, drsBenefitMs: 0, dirtyAirMs: 0, trafficLossMs: 0, attempted: false, passed: false });
function passCause(e: RaceEntrantState, d: RaceEntrantState): OvertakeCause {
    if (e.stint!.tyre.compound === d.stint!.tyre.compound && d.stint!.tyre.ageLaps - e.stint!.tyre.ageLaps >= 8) return 'TYRE';
    return ['OVERTAKE','DEPLOY'].includes(e.commands!.ersMode) ? 'ERS' : e.track!.drsEligible ? 'DRS' : 'PACE';
}
/**
 * v8 only. One public checkpoint is the next leader lap crossing. Each car moves on the SAME integer race clock,
 * completes its own laps, burns its own lap resources and can remain in a pit phase across checkpoints. The final
 * flag lets each still-running car reach its next crossing (lapped finishers retain their shorter race distance).
 */
export function advanceLegacyProgressionLap(saved: RaceSimulationState): RaceSimulationState {
    validateProgressionState(saved); validateIncidentState(saved);
    if (saved.status !== 'RUNNING' || saved.lap >= saved.input.totalLaps) throw new RangeError('Race finished');
    const lap = saved.lap + 1, input = saved.input, config = input.progression!, control = saved.incidents!, neutral = control.mode !== 'GREEN';
    const weather = advanceWeather(saved.weather!, input.weather!, lap), random = createSeededRandom(saved.rngState);
    let state = chooseAiCommands({ ...saved, weather });
    if (neutral) state = { ...state, entrants: state.entrants.map(e => input.entrants.find(s => s.entrantId === e.entrantId)!.strategyController === 'PLAYER' ? e : { ...e, commands: { ...e.commands!, paceMode: 'CONSERVE', fuelMode: 'CONSERVE', ersMode: 'HARVEST' } }) };
    let entries: RaceEntrantState[] = state.entrants.map(e => ({ ...e, track: emptyTrack(e) }));
    const cars = structuredClone(saved.progression!.cars) as Record<string, CarProgression>;
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
        cars[id] = { ...cars[id], route: 'TRACK', compound: null, pitEntryLap: null, delayMs: 0, lappedAheadId: null, passingId: null };
    };
    // Retain one consistency draw-pair per car's own lap, in fixed grid order at shared boundaries.
    const plan = (id: string, fresh: boolean) => {
        const e = entries[indexOf(id)], p = cars[id]; if (!active(e)) return;
        const source = sourceOf(id);
        const r = calculateLapTime({ ...source, circuit: input.circuit, parameters: input.parameters, fuelMassKg: e.fuelMassKg, tyre: { state: e.stint!.tyre, profile: getTyreProfile(input.tyres!, e.stint!.tyre.compound) } }, fresh ? random : { next: () => .5 });
        if (fresh) { p.variationMs = r.variationMs; p.lapCommands = { ...e.commands! }; }
        const effects = commandLapEffects({ ...e, commands: p.lapCommands! }, input.fuelBurnPerLapKg * (neutralProfile ? neutralProfile.fuelMultiplierPermille/1000 : 1), input.commands!, neutral || p.route !== 'TRACK' || Boolean(p.compound));
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
        if (neutral) p.passingId = null;
        const compound = stops.get(e.entrantId);
        if (compound && p.route === 'TRACK' && !p.compound) {
            p.compound = compound; p.pitEntryLap = e.completedLaps + (localProgress(e.track!.progressMicrolaps) >= config.pit.entry ? 1 : 0);
            entries[i] = { ...e, pit: { ...e.pit!, pendingCompound: null, commandRevision: e.pit!.commandRevision+1 } };
        }
        plan(source.entrantId,p.freeLapMs === 0);
    }
    const finishTargets = new Map<string,number>();
    let flagged = false, iterations = 0;
    const completeLap = (id: string) => {
        const i = indexOf(id), e = entries[i], p = cars[id];
        const actual = Math.max(1,clock-p.lapStartedAtMs), completedLaps = Math.floor(e.track!.progressMicrolaps/LAP_UNITS);
        const effects = commandLapEffects({...e,commands:p.lapCommands!},input.fuelBurnPerLapKg*(neutralProfile ? neutralProfile.fuelMultiplierPermille/1000 : 1),input.commands!,neutral || p.route !== 'TRACK' || Boolean(p.compound));
        const pace = input.commands!.pace[p.lapCommands!.paceMode];
        const tyreConfig = { ...input.tyres!, tyreWearMultiplierPermille: Math.round(input.tyres!.tyreWearMultiplierPermille*(neutralProfile ? neutralProfile.wearMultiplierPermille : pace.tyreWearMultiplierPermille)/1000), tyreEnergyMultiplierPermille: Math.round(input.tyres!.tyreEnergyMultiplierPermille*(neutralProfile ? neutralProfile.energyMultiplierPermille : pace.tyreEnergyMultiplierPermille)/1000) };
        const oldTyre = advanceWeatherTyre(e.stint!.tyre,tyreConfig,weather,input.weather!);
        let next: RaceEntrantState = { ...e, completedLaps, elapsedTimeMs: clock, lastLapTimeMs: actual, bestLapTimeMs: Math.min(e.bestLapTimeMs ?? actual,actual), fuelMassKg: effects.fuelMassKg, commands: { ...e.commands!, ersCharge: effects.commands.ersCharge }, stint: { ...e.stint!, tyre: oldTyre } };
        if (p.route === 'LANE' && p.compound) {
            const tyre: TyreState = { compound: p.compound, ageLaps: 0, wearPermille: 0, temperatureMilliC: input.pits!.newTyreTemperatureMilliC };
            const number = e.stint!.number+1;
            next = { ...next, stint: { number, startedAtLap: completedLaps, tyre }, pit: { ...e.pit!, stops: [...e.pit!.stops,{ number: e.pit!.stops.length+1, lap: completedLaps, oldCompound: e.stint!.tyre.compound, newCompound: p.compound, pitLaneLossMs: p.pitLossMs-p.stationaryMs, stationaryTimeMs: p.stationaryMs, totalLossMs: p.pitLossMs }], stints: [...e.pit!.stints.map(s => s.endLap === null ? { ...s,endLap: completedLaps,endingTyre: oldTyre } : s),{ number,startLap: completedLaps,endLap: null,startingTyre: tyre,endingTyre: null }] } };
            p.route = 'EXIT';
        }
        if (flagged && completedLaps >= finishTargets.get(id)!) next = { ...next,incident: { ...next.incident!,status: 'FINISHED' } };
        entries[i] = next; p.lapStartedAtMs = clock; p.remainder = 0;
        if (active(next)) plan(id,true);
    };
    while (true) {
        if (++iterations > 100000) throw new RangeError('v8 progression did not reach checkpoint');
        const running = entries.filter(active);
        if (!running.length) break;
        // No overshoot across lap, pit-entry/service/exit boundaries. All cars share this same elapsed time slice.
        let dt = QUANTUM_MS;
        const movement = new Map<string,{ rate: number; ahead: RaceEntrantState | null; distance: number; gapMs: number; effects: ReturnType<typeof followingEffects> }>();
        for (const e of running) {
            const p = cars[e.entrantId], near = p.route === 'TRACK' ? physicalAhead(entries,e,cars) : null;
            const gapMs = near ? Math.round(near.distance*input.circuit.baseLapTimeMs/LAP_UNITS) : Infinity;
            const zone = zonesAt(config,e.track!.progressMicrolaps);
            const interaction = { ...input.interaction!, drsZoneCount: neutral || control.drsDelay>0 || weather.drsState==='DRS_DISABLED_WET' || !zone.some(z=>z.kind==='ASSISTANCE') ? 0 : input.interaction!.drsZoneCount };
            const effects = !neutral && p.route === 'TRACK' && zone.some(z=>z.kind==='DIRTY_AIR') ? followingEffects(Number.isFinite(gapMs) ? gapMs : null,lap,interaction) : { drsEligible:false,dirtyAirMs:0,drsBenefitMs:0 };
            let duration = p.freeLapMs+effects.dirtyAirMs-effects.drsBenefitMs;
            if (control.mode==='SAFETY_CAR' && near && gapMs>input.incidents!.queueIntervalMs && gapMs<input.circuit.baseLapTimeMs/3) duration -= Math.min(input.incidents!.maxCompressionMs,Math.round((gapMs-input.incidents!.queueIntervalMs)*input.incidents!.compressionPermille/1000));
            const rate = Math.max(1,Math.round(LAP_UNITS*1000/Math.max(1000,duration)));
            movement.set(e.entrantId,{rate,ahead:near?.entrant??null,distance:near?.distance??LAP_UNITS,gapMs,effects});
            if (p.launchDelayMs || p.delayMs) dt = Math.min(dt,p.launchDelayMs || p.delayMs);
            else {
                const local = localProgress(e.track!.progressMicrolaps);
                let boundary = LAP_UNITS-local;
                if (p.compound && p.route==='TRACK' && e.completedLaps===p.pitEntryLap && local<config.pit.entry) boundary = Math.min(boundary,config.pit.entry-local);
                if ((p.route==='ENTRY'||p.route==='LANE') && local<config.pit.service) boundary = Math.min(boundary,config.pit.service-local);
                if (p.route==='EXIT' && local<config.pit.exit) boundary = Math.min(boundary,config.pit.exit-local);
                dt = Math.min(dt,Math.max(1,Math.ceil((boundary*1000-p.remainder)/rate)));
            }
        }
        // Attempt ordering is original grid order; no draw is consumed for distant / pit / retired cars.
        for (const source of grid) {
            const i = indexOf(source.entrantId), e = entries[i], p = cars[source.entrantId], m = movement.get(e.entrantId);
            if (!m || neutral || p.route!=='TRACK' || p.launchDelayMs || p.delayMs || p.attemptedLap===lap || p.passedByLap===lap || !m.ahead || !zonesAt(config,e.track!.progressMicrolaps).some(z=>z.kind==='PASSING'||z.kind==='BRAKING')) continue;
            const d = m.ahead, defender = cars[d.entrantId];
            if (defender.launchDelayMs || defender.delayMs || defender.passedByLap===lap) continue;
            const lapping = e.track!.progressMicrolaps-d.track!.progressMicrolaps>LAP_UNITS/2;
            const blueFlag = lapping && zonesAt(config,e.track!.progressMicrolaps).some(z=>z.kind==='BLUE_FLAG');
            const { edge } = input.commands!.racecraft ? attackEdge(defender.expectedLapMs-p.expectedLapMs,defender.commandMs-p.commandMs,input.commands!.racecraft) : { edge: defender.expectedLapMs-p.expectedLapMs };
            const threshold = lapping ? config.lapping.thresholdMs : input.interaction!.attackThresholdMs;
            if (blueFlag && m.gapMs<=threshold) p.lappedAheadId = d.entrantId;
            if (m.gapMs>threshold || edge<input.interaction!.minimumPaceAdvantageMs) continue;
            const ordinary = passProbability(edge,source.interaction!,sourceOf(d.entrantId).interaction!,source.car.performance-sourceOf(d.entrantId).car.performance,m.effects.drsEligible,input.interaction!);
            const probability = blueFlag ? Math.min(990,1000-Math.round((1000-ordinary)*config.lapping.resistancePermille/1000)) : ordinary;
            const draw = random.next(), success = draw*1000<probability;
            p.attemptedLap = lap; p.passingId = success ? d.entrantId : null; p.lappingPass = lapping;
            p.delayMs += success ? lapping ? config.lapping.passingCostMs : input.interaction!.minimumGapMs : lapping ? config.lapping.failedCostMs : Math.max(input.interaction!.minimumGapMs,Math.round(draw*(input.commands!.racecraft?.failedAttackLossMaxMs??300)));
            entries[i] = { ...e,track:{ ...e.track!,attempted:true,passed:false } };
        }
        const deltas = new Map<string,number>();
        for (const e of running) {
            const p = cars[e.entrantId], m = movement.get(e.entrantId)!;
            if (p.launchDelayMs) { p.launchDelayMs=Math.max(0,p.launchDelayMs-dt); deltas.set(e.entrantId,0); continue; }
            if (p.delayMs) { p.delayMs=Math.max(0,p.delayMs-dt); deltas.set(e.entrantId,0); continue; }
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
                if (held) entries[indexOf(e.entrantId)] = { ...entries[indexOf(e.entrantId)],track:{ ...entries[indexOf(e.entrantId)].track!,trafficLossMs:entries[indexOf(e.entrantId)].track!.trafficLossMs+Math.round(held*input.circuit.baseLapTimeMs/LAP_UNITS) } };
            }
            deltas.set(e.entrantId,delta);
        }
        clock += dt;
        for (const source of grid) {
            const i = indexOf(source.entrantId), e = entries[i], p = cars[source.entrantId], m = movement.get(e.entrantId);
            if (!m) continue;
            const oldTotal = e.track!.progressMicrolaps, oldLocal = localProgress(oldTotal), delta = deltas.get(e.entrantId)!;
            let total = oldTotal+delta;
            // Exact boundaries discard only the last sub-microlap rounding overshoot; never backwards movement.
            if (Math.floor(total/LAP_UNITS)>Math.floor(oldTotal/LAP_UNITS)) total=(Math.floor(oldTotal/LAP_UNITS)+1)*LAP_UNITS;
            if (p.compound && p.route==='TRACK' && e.completedLaps===p.pitEntryLap && oldLocal<=config.pit.entry && localProgress(total)>=config.pit.entry) { total=e.completedLaps*LAP_UNITS+config.pit.entry; p.route='ENTRY'; p.remainder=0; }
            if (p.route==='ENTRY' && localProgress(total)>=config.pit.segments[0].end) p.route='LANE';
            if (p.route==='LANE' && oldLocal<config.pit.service && localProgress(total)>=config.pit.service) {
                total=e.completedLaps*LAP_UNITS+config.pit.service; p.route='SERVICE'; p.remainder=0;
                p.stationaryMs=input.pits!.stationaryBaseMs+Math.round((2*random.next()-1)*input.pits!.stationaryVariationMs);
                p.pitLossMs=effectivePitLaneLoss(state)+p.stationaryMs; p.delayMs+=p.pitLossMs;
            }
            if (p.route==='SERVICE' && p.delayMs===0) p.route='LANE';
            if (p.route==='EXIT' && localProgress(total)>=config.pit.exit) { p.route='TRACK'; p.compound=null; p.pitEntryLap=null; p.remainder=0; }
            entries[i] = { ...e,track:{ ...e.track!,...m.effects,progressMicrolaps:total } };

        }
        // Record passes only after actual movement of BOTH cars; boundary clamping must not invent a pass.
        for (const source of grid) {
            const i=indexOf(source.entrantId),e=entries[i],p=cars[e.entrantId],m=movement.get(e.entrantId);
            if (!m) continue;
            if (p.passingId && m.ahead?.entrantId===p.passingId && e.track!.progressMicrolaps-running.find(x=>x.entrantId===e.entrantId)!.track!.progressMicrolaps>m.distance+(entries[indexOf(p.passingId)].track!.progressMicrolaps-running.find(x=>x.entrantId===p.passingId)!.track!.progressMicrolaps)) {
                const d = entries[indexOf(p.passingId)];
                if (p.lappingPass) p.completedLappingPasses++;
                else { emit({type:'OVERTAKE',entrantIds:[e.entrantId,p.passingId],kind:null,severity:null,timeLossMs:0,cause:passCause(e,d)}); entries[i]={...entries[i],track:{...entries[i].track!,overtakesCompleted:e.track!.overtakesCompleted+1,passed:true,attempted:true}}; }
                cars[p.passingId].passedByLap=lap; p.passingId=null; p.lappedAheadId=null;
            }
        }
        for (const source of grid) {
            const e=entries[indexOf(source.entrantId)];
            if (active(e) && Math.floor(e.track!.progressMicrolaps/LAP_UNITS)>e.completedLaps) completeLap(e.entrantId);
        }
        entries=classifyProgress(entries,input.circuit.baseLapTimeMs);
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
        const near=physicalAhead(entries,e,cars), ahead=near && near.distance*input.circuit.baseLapTimeMs/LAP_UNITS<=1000 ? near.entrant : null;
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
    for (const e of entries) { const p=cars[e.entrantId]; if (p.passingId && !entries.some(x=>x.entrantId===p.passingId&&x.incident!.status==='RUNNING')) p.passingId=null; }
    const next:RaceSimulationState={...saved,lap,status:finished?'FINISHED':'RUNNING',weather,rngState:random.getState(),incidents:nextControl,progression:{elapsedTimeMs:clock,cars},entrants:classifyProgress(entries,input.circuit.baseLapTimeMs,finished)};
    validateProgressionState(next); validateIncidentState(next);
    return next;
}

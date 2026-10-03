import { circuitLayouts, fallbackLayout, layoutForCircuit } from './circuit-layouts';
import { prepareCircuitPath } from '../../game/domain/circuit-geometry';
import type { CircuitMapLayout } from '../../game/domain/circuit-layout';
import { LAP_UNITS, type ProgressionConfiguration, type LocalSegment, type InteractionZone } from '../../simulation/race/progression/model';
/**
 * Foundation segment catalogue derived from the existing distance-normalised racing-direction geometry. This is
 * content preparation, not simulator circuit-name branching. It can be replaced/overridden by authored database
 * segments later; each new Race freezes the chosen catalogue. Zones are coarse management abstractions, not FIA
 * assistance zones or a new assistance rule. Uniform distance sampling avoids source-vertex-density bias.
 */
export function progressionForLayout(layout: CircuitMapLayout): ProgressionConfiguration {
    const path = prepareCircuitPath(layout), count = 64;
    const segments: LocalSegment[] = Array.from({ length: count }, (_, i) => {
        const p = (i + .5) / count, a = path.sample(p - .012), b = path.sample(p), c = path.sample(p + .012);
        const before = Math.atan2(b.y-a.y,b.x-a.x), after = Math.atan2(c.y-b.y,c.x-b.x);
        const bend = Math.abs(Math.atan2(Math.sin(after-before),Math.cos(after-before)));
        return { id: `section-${i}`, kind: bend < .12 ? 'STRAIGHT' : bend < .4 ? 'FAST' : bend < .9 ? 'MEDIUM' : 'SLOW', start: Math.floor(i*LAP_UNITS/count), end: Math.floor((i+1)*LAP_UNITS/count) };
    });
    const zones: InteractionZone[] = segments.flatMap((s,i) => [
        { id: `air-${i}`, kind: 'DIRTY_AIR' as const, start: s.start, end: s.end },
        { id: `blue-${i}`, kind: 'BLUE_FLAG' as const, start: s.start, end: s.end },
        ...(s.kind === 'STRAIGHT' || s.kind === 'FAST' ? [{ id: `pass-${i}`, kind: 'PASSING' as const, start: s.start, end: s.end }, { id: `assist-${i}`, kind: 'ASSISTANCE' as const, start: s.start, end: s.end }] : [{ id: `brake-${i}`, kind: 'BRAKING' as const, start: s.start, end: s.end }]),
    ]);
    return { version: 1, resolution: LAP_UNITS, segments, zones,
        // Coarse pit route aligned to the existing start/finish; no claim of surveyed pit-lane geometry.
        pit: { entry: 920000, service: 970000, exit: 40000, segments: [
            { id: 'pit-entry', kind: 'PIT_ENTRY', start: 920000, end: 940000 },
            { id: 'pit-lane-in', kind: 'PIT_LANE', start: 940000, end: 970000 },
            { id: 'pit-lane-out', kind: 'PIT_LANE', start: 970000, end: LAP_UNITS },
            { id: 'pit-exit', kind: 'PIT_EXIT', start: 0, end: 40000 },
        ] }, lapping: { thresholdMs: 1500, resistancePermille: 100, passingCostMs: 120, failedCostMs: 160 } };
}
export const circuitProgression: Readonly<Record<string, ProgressionConfiguration>> = Object.fromEntries(Object.entries(circuitLayouts).map(([id, layout]) => [id, progressionForLayout(layout)]));
export const fallbackProgression = progressionForLayout(fallbackLayout);
export function progressionForCircuit(sourceCircuitId?: string | null) { return sourceCircuitId ? circuitProgression[sourceCircuitId] ?? progressionForLayout(layoutForCircuit(sourceCircuitId)) : fallbackProgression; }

/** v8B content is prepared once, then frozen in each new Race. Approximate parallel pit lanes, not surveyed maps. */
export function progressionBForLayout(layout: CircuitMapLayout): ProgressionConfiguration {
    const legacy=progressionForLayout(layout),path=prepareCircuitPath(layout),{entry,service,exit}=legacy.pit;
    const anchors=[entry,930000,940000,950000,960000,service,980000,990000,1000000,1010000,1020000,1030000,1000000+exit];
    const points=anchors.map(progress=>{const p=path.sample(progress/LAP_UNITS),f=(progress-entry)/(LAP_UNITS+exit-entry),offset=.025*Math.sin(Math.PI*f);return {progress,x:p.x-p.tangentY*offset,y:p.y+p.tangentX*offset};});
    const straights=legacy.segments.filter(s=>s.kind==='STRAIGHT'||s.kind==='FAST');
    // Longest contiguous straight/fast run selects the local electrical window; topology preserves circuit personality.
    const runs: {start:number;end:number}[]=[];
    for(const s of straights) { const last=runs.at(-1);if(last?.end===s.start)last.end=s.end;else runs.push({start:s.start,end:s.end}); }
    const deployment=[...runs].sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start)[0]??{start:0,end:15625};
    return {...legacy,version:2,pit:{...legacy.pit,geometry:{points,service}},assistance:{capacity:1000000,initialCharge:700000,detection:(deployment.start-5000+LAP_UNITS)%LAP_UNITS,deploymentStart:deployment.start,deploymentEnd:deployment.end,thresholdMs:1000,maxWater:350,straightDeltaMs:0,boostDeltaMs:400,overtakeDeltaMs:600,deploymentPerSecond:{RECHARGE:0,BALANCED:2000,BOOST:8000},recoveryPerSecond:{RECHARGE:5000,BALANCED:1500,BOOST:500},overtakePerSecond:10000}};
}
export const circuitProgressionB: Readonly<Record<string,ProgressionConfiguration>>=Object.fromEntries(Object.entries(circuitLayouts).map(([id,layout])=>[id,progressionBForLayout(layout)]));
export const fallbackProgressionB=progressionBForLayout(fallbackLayout);
export function progressionBForCircuit(id?:string|null) { return id?circuitProgressionB[id]??progressionBForLayout(layoutForCircuit(id)):fallbackProgressionB; }

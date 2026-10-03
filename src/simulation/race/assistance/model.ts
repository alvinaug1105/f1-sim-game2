/**
 * Progression revisions 2 (v8B) and 3 (v8C). Integer energy units; one million units represents a full store.
 * Revision 2 recovers per second of non-deploying running (`recoveryPerSecond`). Revision 3 recovers per distance
 * travelled while not deploying (`recoveryPerMillilap`, recoveryPerSecond all zero) and never in BOOST — see
 * `recoverByDistance`.
 */
export const ENERGY_POLICIES = ['RECHARGE','BALANCED','BOOST'] as const;
export type EnergyPolicy = typeof ENERGY_POLICIES[number];
export interface AssistanceConfiguration {
    capacity: number; initialCharge: number; detection: number; deploymentStart: number; deploymentEnd: number;
    thresholdMs: number; maxWater: number; straightDeltaMs: number; boostDeltaMs: number; overtakeDeltaMs: number;
    deploymentPerSecond: Record<EnergyPolicy,number>; recoveryPerSecond: Record<EnergyPolicy,number>; overtakePerSecond: number;
    /** Revision 3 only: energy units recovered per 1/1000 lap travelled while not deploying. */
    recoveryPerMillilap?: Record<EnergyPolicy,number>;
}
export interface AssistanceState {
    energy: number; policy: EnergyPolicy; deploymentRemainder: number; recoveryRemainder: number;
    qualifiedLap: number | null; validUseLap: number | null; expiresAfterLap: number | null;
    aero: 'CORNER' | 'STRAIGHT' | 'SAFE'; overtake: 'NOT_ELIGIBLE' | 'AVAILABLE' | 'ACTIVE';
    used: number; recovered: number; electricalDeltaMs: number;
}
export function initialAssistance(c: AssistanceConfiguration): AssistanceState {
    return { energy:c.initialCharge,policy:'BALANCED',deploymentRemainder:0,recoveryRemainder:0,qualifiedLap:null,validUseLap:null,expiresAfterLap:null,aero:'CORNER',overtake:'NOT_ELIGIBLE',used:0,recovered:0,electricalDeltaMs:0 };
}
const int = (n:number,lo:number,hi:number) => { if (!Number.isSafeInteger(n)||n<lo||n>hi) throw new RangeError('Invalid v8B assistance integer'); };
export function validateAssistanceConfiguration(c:AssistanceConfiguration,model:'V8B'|'V8C'='V8B') {
    if (!c) throw new RangeError('Missing v8B assistance');
    if (model==='V8B'&&c.recoveryPerMillilap!==undefined) throw new RangeError('v8B cannot acquire v8C energy accounting');
    if (model==='V8C') {
        // Distance recovery replaces time recovery; BOOST is a pure depletion mode; RECHARGE is the primary recovery mode.
        if (!c.recoveryPerMillilap||ENERGY_POLICIES.some(p=>c.recoveryPerSecond[p]!==0)) throw new RangeError('v8C energy must recover by distance only');
        for(const p of ENERGY_POLICIES) int(c.recoveryPerMillilap[p],0,Math.floor(c.capacity/1000));
        if (c.recoveryPerMillilap.BOOST!==0||c.recoveryPerMillilap.RECHARGE<=c.recoveryPerMillilap.BALANCED||c.deploymentPerSecond.RECHARGE!==0) throw new RangeError('Contradictory v8C energy policies');
    }
    int(c.capacity,1,10000000); int(c.initialCharge,0,c.capacity); int(c.detection,0,999999);
    int(c.deploymentStart,0,999999); int(c.deploymentEnd,c.deploymentStart+1,1000000); int(c.thresholdMs,1,10000); int(c.maxWater,0,1000);
    for(const n of [c.straightDeltaMs,c.boostDeltaMs,c.overtakeDeltaMs]) int(n,0,1000);
    for(const p of ENERGY_POLICIES) { int(c.deploymentPerSecond[p],0,c.capacity); int(c.recoveryPerSecond[p],0,c.capacity); }
    int(c.overtakePerSecond,0,c.capacity);
}
export function validateAssistance(s:AssistanceState,c:AssistanceConfiguration,totalLaps:number) {
    if (!s||!ENERGY_POLICIES.includes(s.policy)||!['CORNER','STRAIGHT','SAFE'].includes(s.aero)||!['NOT_ELIGIBLE','AVAILABLE','ACTIVE'].includes(s.overtake)) throw new RangeError('Invalid v8B assistance state');
    int(s.energy,0,c.capacity); int(s.deploymentRemainder,0,999); int(s.recoveryRemainder,0,999);
    for(const n of [s.used,s.recovered]) int(n,0,c.capacity);
    int(s.electricalDeltaMs,0,1000);
    if(s.qualifiedLap===null) { if(s.validUseLap!==null||s.expiresAfterLap!==null||s.overtake!=='NOT_ELIGIBLE') throw new RangeError('Contradictory entitlement'); }
    else { int(s.qualifiedLap,0,totalLaps); int(s.validUseLap!,s.qualifiedLap,s.qualifiedLap+1); if(s.expiresAfterLap!==s.validUseLap!+1) throw new RangeError('Invalid entitlement expiry'); }
}
export function clearEntitlement(s:AssistanceState) { s.qualifiedLap=null;s.validUseLap=null;s.expiresAfterLap=null;s.overtake='NOT_ELIGIBLE'; }
/** Lapping and unlapping do not qualify: only the same race-distance lap band (less than half a lap apart). */
export function qualify(s:AssistanceState,c:AssistanceConfiguration,lap:number,gapMs:number|null,distanceDifference:number,safe:boolean) {
    if(!safe) { clearEntitlement(s); return; }
    if(gapMs!==null && gapMs<=c.thresholdMs && Math.abs(distanceDifference)<500000) {
        s.qualifiedLap=lap;s.validUseLap=lap+(c.deploymentStart<c.detection?1:0);s.expiresAfterLap=s.validUseLap+1;s.overtake='AVAILABLE';
    } else clearEntitlement(s);
}
export interface EnergyContext { dt:number; lap:number; progress:number; straight:boolean; safe:boolean }
/** Debit from starting energy, scale benefit by actual debit, THEN recover. Never add two full electrical bonuses. */
export function energyStep(s:AssistanceState,c:AssistanceConfiguration,x:EnergyContext) {
    int(x.dt,1,100); const safe=x.safe;
    if(!safe || (s.expiresAfterLap!==null && x.lap>=s.expiresAfterLap)) clearEntitlement(s);
    s.aero=!safe?'SAFE':x.straight?'STRAIGHT':'CORNER';
    const eligible=s.validUseLap===x.lap && s.qualifiedLap!==null;
    const over=eligible&&x.progress>=c.deploymentStart&&x.progress<c.deploymentEnd;
    const deploy=safe&&x.straight&&s.policy!=='RECHARGE';
    const rate=deploy ? over?Math.max(c.deploymentPerSecond[s.policy],c.overtakePerSecond):c.deploymentPerSecond[s.policy] : 0;
    const debit=rate*x.dt+s.deploymentRemainder, requested=Math.floor(debit/1000);
    s.deploymentRemainder=debit%1000; s.used=Math.min(s.energy,requested); s.energy-=s.used;
    s.electricalDeltaMs=requested ? Math.round((over?c.overtakeDeltaMs:c.boostDeltaMs)*s.used/requested*(over?1:c.deploymentPerSecond[s.policy]/Math.max(1,c.deploymentPerSecond.BOOST))) : 0;
    s.overtake=eligible?(over&&s.used>0?'ACTIVE':'AVAILABLE'):'NOT_ELIGIBLE';
    const recovery=(!deploy?c.recoveryPerSecond[s.policy]:0)*x.dt+s.recoveryRemainder;
    s.recoveryRemainder=recovery%1000; s.recovered=Math.min(c.capacity-s.energy,Math.floor(recovery/1000));s.energy+=s.recovered;
    return s.electricalDeltaMs+(s.aero==='STRAIGHT'?c.straightDeltaMs:0);
}
/** Current observable effects at a checkpoint; no extra deployment or recovery. */
export function refreshAssistance(s:AssistanceState,c:AssistanceConfiguration,x:Omit<EnergyContext,'dt'>) {
    if(!x.safe||(s.expiresAfterLap!==null&&x.lap>=s.expiresAfterLap))clearEntitlement(s);
    s.aero=!x.safe?'SAFE':x.straight?'STRAIGHT':'CORNER';
    const eligible=s.qualifiedLap!==null && s.validUseLap!==null && x.lap<=s.validUseLap;
    const active=x.safe&&x.straight&&x.lap===s.validUseLap&&x.progress>=c.deploymentStart&&x.progress<c.deploymentEnd&&s.used>0&&s.policy!=='RECHARGE';
    s.overtake=eligible?active?'ACTIVE':'AVAILABLE':'NOT_ELIGIBLE';
    if(!x.safe||!x.straight)s.electricalDeltaMs=0;
}
/** Policy deploys in this slice context (the same rule `energyStep` applies). */
export function deploys(s:Pick<AssistanceState,'policy'>,x:Pick<EnergyContext,'straight'|'safe'>) { return x.safe&&x.straight&&s.policy!=='RECHARGE'; }
/**
 * Revision 3 recovery, applied AFTER the slice's deployment and movement: integer units per distance actually travelled
 * while not deploying (pit lane and SC/VSC included — deterministic and bounded by distance, so slower or neutralised
 * running never multiplies recovery). Nothing is recovered while deploying, and BOOST never recovers.
 */
export function recoverByDistance(s:AssistanceState,c:AssistanceConfiguration,microlaps:number,deploying:boolean) {
    int(microlaps,0,1000000);
    const rate=deploying?0:c.recoveryPerMillilap![s.policy];
    const recovery=rate*microlaps+s.recoveryRemainder;
    s.recoveryRemainder=recovery%1000; s.recovered=Math.min(c.capacity-s.energy,Math.floor(recovery/1000)); s.energy+=s.recovered;
}

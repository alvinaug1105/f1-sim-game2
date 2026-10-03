import {describe,it,expect} from 'vitest';
import {createRace,advanceRace,advanceRaceLap} from '../src/simulation/race/engine';
import {progressionBForCircuit,circuitProgressionB,progressionForCircuit} from '../src/data/seed/circuit-progression';
import {circuitLayouts} from '../src/data/seed/circuit-layouts';
import {prepareCircuitPath} from '../src/game/domain/circuit-geometry';
import {samplePitRoute} from '../src/game/domain/pit-geometry';
import {energyStep,qualify,initialAssistance,clearEntitlement,validateAssistance,ENERGY_POLICIES} from '../src/simulation/race/assistance/model';
import {validateProgressionState,validateProgressionConfiguration,physicalAhead} from '../src/simulation/race/progression/model';
import {racecraftInput} from './helpers/racecraft';
import {neutralise} from './helpers/incidents';
import {requestPitStop} from '../src/simulation/race/pits/model';
import {projectRaceState} from '../src/features/race/projection';
import {chooseAssistanceAi} from '../src/simulation/race/assistance/policy';
import {raceBubbleScale,clampBadgeCenter,RaceMarkerPacks,RACE_BUBBLE} from '../src/features/race/viewer/marker-packs';
import {RaceMotion} from '../src/features/race/viewer/motion';
import {translate} from '../src/i18n/catalog';
const suzuka='00000000-0000-4000-8000-000000000301';
const input=(n=4,laps=8)=>({...racecraftInput({count:n,laps}),progression:progressionBForCircuit(suzuka)});
const cfg=progressionBForCircuit(suzuka).assistance!;
const context={dt:100,lap:0,progress:cfg.deploymentStart,straight:true,safe:true};
const reload=<T>(s:T):T=>JSON.parse(JSON.stringify(s));
describe('v8B revision and content',()=>{
 it('keeps v8A historical content/state and rejects mixed revision payloads',()=>{
  const a=createRace({...input(),progression:progressionForCircuit(suzuka)}),b=createRace(input());
  expect(a.simulationVersion).toBe(8);expect(a.input.progression!.version).toBe(1);expect(b.input.progression!.version).toBe(2);
  expect(()=>validateProgressionState({...a,input:{...a.input,progression:b.input.progression}})).toThrow();
  expect(()=>validateProgressionState({...b,input:{...b.input,progression:a.input.progression}})).toThrow();
  expect(()=>validateProgressionConfiguration({...b.input.progression!,version:3 as 2})).toThrow();
  expect(()=>advanceRaceLap({...b,entrants:b.entrants.map(e=>({...e,commands:{...e.commands!,ersMode:'DEPLOY'}}))})).toThrow();
 });
 it('supplies all 24 distinct pit paths with exact joins, service anchor and ordered finite points, including Suzuka',()=>{
  expect(Object.keys(circuitProgressionB)).toHaveLength(24);expect(circuitLayouts[suzuka].id.toLowerCase()).toContain('suzuka');
  const profiles=new Set<string>();
  for(const [id,c] of Object.entries(circuitProgressionB)) {
   validateProgressionConfiguration(c);const g=c.pit.geometry!,path=prepareCircuitPath(circuitLayouts[id]);
   expect(samplePitRoute(g,c.pit.entry)).toMatchObject({x:path.sample(c.pit.entry/1e6).x,y:path.sample(c.pit.entry/1e6).y});
   expect(samplePitRoute(g,c.pit.exit).x).toBeCloseTo(path.sample(c.pit.exit/1e6).x,10);
   expect(Math.hypot(samplePitRoute(g,c.pit.service).x-path.sample(c.pit.service/1e6).x,samplePitRoute(g,c.pit.service).y-path.sample(c.pit.service/1e6).y)).toBeGreaterThan(.01);
   for(const p of [c.pit.entry,940000,c.pit.service,990000,10000,c.pit.exit])expect(Number.isFinite(samplePitRoute(g,p).x)).toBe(true);
   profiles.add(JSON.stringify(c.assistance));
  }
  expect(profiles.size).toBeGreaterThan(10);
 });
});
describe('v8B assistance envelope',()=>{
 it.each([999,1000,1001])('qualifies the local threshold at %i ms inclusively',gap=>{
  const a=initialAssistance(cfg);qualify(a,cfg,2,gap,-10000,true);expect(a.qualifiedLap!==null).toBe(gap<=1000);
 });
 it.each([null,2000])('does not qualify absent/distant neighbours (%s)',gap=>{const a=initialAssistance(cfg);qualify(a,cfg,1,gap,0,true);expect(a.overtake).toBe('NOT_ELIGIBLE');});
 it('rejects lapping / unlapping and control/pit/low-grip contexts, expires and survives reload',()=>{
  for(const difference of [-1000000,1000000,500000]){const a=initialAssistance(cfg);qualify(a,cfg,1,100,difference,true);expect(a.qualifiedLap).toBeNull();}
  let a=initialAssistance(cfg);qualify(a,cfg,1,100,1000,true);a=reload(a);validateAssistance(a,cfg,8);
  energyStep(a,cfg,{...context,lap:a.validUseLap!,straight:false});expect(a.overtake).toBe('AVAILABLE');
  energyStep(a,cfg,{...context,lap:a.validUseLap!});expect(a.overtake).toBe('ACTIVE');
  energyStep(a,cfg,{...context,lap:a.expiresAfterLap!});expect(a.overtake).toBe('NOT_ELIGIBLE');
  qualify(a,cfg,1,100,0,true);energyStep(a,cfg,{...context,safe:false});expect(a.qualifiedLap).toBeNull();expect(a.aero).toBe('SAFE');
 });
 it('Active Aero uses local straights for every car independently of eligibility, with conservative zero baseline bonus',()=>{
  const a=initialAssistance(cfg);a.policy='RECHARGE';expect(energyStep(a,cfg,context)).toBe(0);expect(a.aero).toBe('STRAIGHT');expect(a.overtake).toBe('NOT_ELIGIBLE');energyStep(a,cfg,{...context,straight:false});expect(a.aero).toBe('CORNER');
 });
 it.each([1000000,1000,1,0])('debits actual start-of-step energy (%i), scales benefit and recovers only afterward',charge=>{
  const a=initialAssistance(cfg);a.policy='BOOST';a.energy=charge;const starting=a.energy,delta=energyStep(a,cfg,context);expect(a.used).toBeLessThanOrEqual(starting);expect(a.energy).toBe(starting-a.used+a.recovered);expect(a.energy).toBeGreaterThanOrEqual(0);expect(delta).toBe(charge===0?0:Math.round(cfg.boostDeltaMs*Math.min(charge,800)/800));
 });
 it.each(ENERGY_POLICIES)('accounts for %s, capacity bounds and non-simultaneous recovery',policy=>{
  const a=initialAssistance(cfg);a.policy=policy;a.energy=cfg.capacity;for(let n=0;n<100;n++)energyStep(a,cfg,{...context,straight:n%2===0});validateAssistance(a,cfg,8);expect(a.energy).toBeLessThanOrEqual(cfg.capacity);
 });
 it('cannot sustain permanent full Boost and combines Overtake/Boost into a single envelope',()=>{
  const a=initialAssistance(cfg);a.policy='BOOST';for(let n=0;n<2000;n++)energyStep(a,cfg,context);expect(a.energy).toBe(0);expect(a.electricalDeltaMs).toBe(0);
  const b=initialAssistance(cfg);b.policy='BOOST';qualify(b,cfg,0,500,0,true);const delta=energyStep(b,cfg,{...context,lap:b.validUseLap!});expect(b.used).toBe(1000);expect(delta).toBe(cfg.overtakeDeltaMs);expect(delta).toBeLessThan(cfg.overtakeDeltaMs+cfg.boostDeltaMs);clearEntitlement(b);expect(b.overtake).toBe('NOT_ELIGIBLE');
 });
 it('AI uses its own store and the same local threat rules without refill',()=>{
  const s=createRace({...input(),entrants:input().entrants.map(e=>({...e,strategyController:'DEVELOPMENT_AI' as const}))});
  for(const p of Object.values(s.progression!.cars))p.assistance!.energy=0;
  const ai=chooseAssistanceAi(s);expect(Object.values(ai.progression!.cars).every(p=>p.assistance!.policy==='RECHARGE'&&p.assistance!.energy===0)).toBe(true);expect(chooseAssistanceAi(reload(s))).toEqual(ai);
 });
});
describe('v8B integration and observable presentation',()=>{
 it('records entry/lane/service/exit/rejoin on the shared clock and replays stationary service with no extrapolation',()=>{
  let s=createRace(input());const id=s.input.entrants[0].entrantId;s=requestPitStop(s,id,'HARD');
  const next=advanceRaceLap(s),second=advanceRaceLap(next),trace=[...next.progression!.cars[id].observations!,...second.progression!.cars[id].observations!];expect(trace.map(o=>o.route)).toEqual(expect.arrayContaining(['TRACK','ENTRY','LANE','SERVICE']));
  const service=trace.findIndex(o=>o.route==='SERVICE');expect(trace[service+1].total).toBe(trace[service].total);expect(trace[service+1].atMs-trace[service].atMs).toBeGreaterThanOrEqual(second.progression!.cars[id].stationaryMs);
  const after=advanceRace(next,3);expect(after.progression!.cars[id].route).toBe('TRACK');expect(after.entrants.find(e=>e.entrantId===id)!.pit!.stops).toHaveLength(1);expect(advanceRace(reload(next),3)).toEqual(after);
  const m=new RaceMotion([{id:'a',progress:.92,retired:false,route:'ENTRY'}]);m.reconcile([{id:'a',progress:1.04,retired:false,route:'TRACK',observations:[{atMs:0,total:920000,route:'ENTRY'},{atMs:200,total:970000,route:'SERVICE'},{atMs:600,total:970000,route:'LANE'},{atMs:1000,total:1040000,route:'TRACK'}]}],1);m.configure('playing',1000);for(let t=0;t<=400;t+=20)m.frame(t);expect(m.progress('a')).toBe(.97);expect(m.route('a')).toBe('SERVICE');m.configure('paused',1000);m.frame(1000);expect(m.progress('a')).toBe(.97);
 });
 it('retains the last drawn position and remaining service history when a newer checkpoint arrives mid-replay',()=>{
  const m=new RaceMotion([{id:'a',progress:.92,retired:false,route:'ENTRY',observations:[{atMs:0,total:920000,route:'ENTRY'}]}]);
  m.reconcile([{id:'a',progress:1.04,retired:false,route:'TRACK',observations:[{atMs:0,total:920000,route:'ENTRY'},{atMs:200,total:970000,route:'SERVICE'},{atMs:600,total:970000,route:'LANE'},{atMs:1000,total:1040000,route:'TRACK'}]}],1);m.configure('playing',1000);for(let t=0;t<=400;t+=20)m.frame(t);
  const before=m.progress('a');expect(before).toBe(.97);
  m.reconcile([{id:'a',progress:2,retired:false,route:'TRACK',observations:[{atMs:1000,total:1040000,route:'TRACK'},{atMs:2000,total:2000000,route:'TRACK'}]}],2);m.frame(500);expect(m.progress('a')).toBe(before);expect(m.route('a')).toBe('SERVICE');
  let old=before;for(let t=520;t<=1600;t+=20){m.frame(t);expect(m.progress('a')).toBeGreaterThanOrEqual(old);expect(m.progress('a')).toBeLessThanOrEqual(2);old=m.progress('a');}expect(m.progress('a')).toBe(2);
 });
 it.each(['VSC','SAFETY_CAR'] as const)('persists %s pit routing with disabled assistance and deterministic restart',mode=>{
  let s=neutralise(createRace(input()),mode,2);s=requestPitStop(s,s.input.entrants[0].entrantId,'HARD');const n=advanceRaceLap(s);expect(n.entrants.every(e=>!e.track!.drsEligible)).toBe(true);expect(Object.values(n.progression!.cars).every(p=>p.assistance!.aero==='SAFE'&&p.assistance!.overtake==='NOT_ELIGIBLE')).toBe(true);expect(advanceRace(reload(n),3)).toEqual(advanceRace(n,3));
 });
 it('uses same-clock detection boundaries, validates every checkpoint, chunks and shuffled input deterministically',()=>{
  const i=input(4,5);const s=createRace(i);s.progression!.cars[i.entrants[0].entrantId].assistance!.policy='BOOST';
  const a=advanceRace(s,5),b=advanceRace(advanceRace(reload(s),2),3);expect(b).toEqual(a);validateProgressionState(a);expect(a.incidents!.events.every(e=>!e.cause||!['DRS','ERS'].includes(e.cause))).toBe(true);
  const reversed=advanceRace(createRace({...i,entrants:[...i.entrants].reverse()}),2);expect(reversed.entrants).toEqual(advanceRace(createRace(i),2).entrants);
 });
 it('detects a line one microlap after the start rather than skipping it in a 100ms period',()=>{
  const i=input(2,4);i.progression={...i.progression,assistance:{...cfg,detection:1,deploymentStart:1000,deploymentEnd:20000}};
  const s=advanceRaceLap(createRace(i)),id=i.entrants[1].entrantId;expect(s.progression!.cars[id].assistance!.qualifiedLap).toBe(0);expect(s.progression!.cars[id].assistance!.validUseLap).toBe(0);
 });
 it('treats a start/finish detection line as the new lap boundary, without qualifying a stationary grid',()=>{
  const i=input(2,4);i.progression={...i.progression,assistance:{...cfg,thresholdMs:10000,detection:0,deploymentStart:1000,deploymentEnd:20000}};
  const initial=createRace(i);expect(Object.values(initial.progression!.cars).every(c=>c.assistance!.qualifiedLap===null)).toBe(true);
  const s=advanceRace(initial,2),id=i.entrants[1].entrantId;expect(s.progression!.cars[id].assistance!.qualifiedLap).toBe(1);
 });
 it('whitelists only own energy and current effects; route traces contain observed past positions only',()=>{
  const s=advanceRace(createRace(input()),1),team=s.input.entrants[0].teamId,v=projectRaceState(s,team),text=JSON.stringify(v);
  for(const key of ['rngState','"seed"','deploymentRemainder','recoveryRemainder','qualifiedLap','validUseLap','expiresAfterLap','lapCommands','freeLapMs','passingId','timeline'])expect(text).not.toContain(key);
  for(const e of v.entrants) {const own=s.input.entrants.find(x=>x.entrantId===e.entrantId)!.teamId===team;expect(Boolean(e.assistance)).toBe(own);for(const o of e.track!.routeHistory!)expect(o.atMs).toBeLessThanOrEqual(s.progression!.elapsedTimeMs);}
  const pitId=s.input.entrants[1].entrantId;s.progression!.cars[pitId].route='LANE';expect(physicalAhead(s.entrants,s.entrants[0],s.progression!.cars)?.entrant.entrantId).not.toBe(pitId);
 });
 it('keeps 390px field/player/selected glyph floors, bounded targets and priority drawing without altering progress',()=>{
  // Circular bubbles keep a stable on-screen size: 22 px on a 341 px phone map, 23 px on a tablet-width map, 26 px on
  // a desktop map; the abbreviation stays at least 8 px.
  const diameter=(scale:number)=>2*RACE_BUBBLE.r*scale*raceBubbleScale(scale);
  expect(diameter(.341)).toBeCloseTo(22);expect(diameter(.5)).toBeCloseTo(23);expect(diameter(1.4)).toBeCloseTo(26);expect(diameter(.7)).toBeCloseTo(26);
  expect(8.8*.341*raceBubbleScale(.341)).toBeGreaterThanOrEqual(8);
  const center=clampBadgeCenter(-100,9999,1000,650,3);expect(center).toEqual({x:51,y:599});
  const cars=Array.from({length:22},(_,n)=>({id:String(n),progress:n*.001,x:100+n*2,y:100,nx:0,ny:1,tier:n<2?n:3}));const p=new RaceMarkerPacks(3).frame(cars,2000,16,true);for(const c of cars){expect(p.get(c.id)!.x).toBe(c.x);expect(Math.abs(p.get(c.id)!.offset)).toBeLessThanOrEqual(108);}
  expect(translate('zh-TW','assistance.overtake.ACTIVE')).toBe('啟用中');expect(translate('en','viewer.overtakeCause.BOOST')).toBe('Boost');
 });
});

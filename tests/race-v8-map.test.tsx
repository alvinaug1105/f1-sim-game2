import React from 'react';
import { describe,it,expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/provider';
import { TrackMap,raceMapCanvas } from '../src/features/race/viewer/track-map';
import { RaceMotion } from '../src/features/race/viewer/motion';
import { RACE_BUBBLE,BADGE,MarkerPacks } from '../src/features/race/viewer/marker-packs';
import { anchorRaceMarker,raceTrackStyle } from '../src/features/race/viewer/race-map-style';
import { timingRows,entrantProgress } from '../src/features/race/viewer/model';
import { viewerData } from './helpers/viewer';
import { projectRaceView } from '../src/features/race/projection';
import { createRace,advanceRace } from '../src/simulation/race/engine';
import { progressionForCircuit } from '../src/data/seed/circuit-progression';
import { circuitLayouts } from '../src/data/seed/circuit-layouts';
import { pointAtProgress,circuitProjection } from '../src/game/domain/circuit-geometry';
import { translate } from '../src/i18n/catalog';
describe('v8 Race map presentation',()=>{
 it('maps canonical authoritative total progress directly, wraps geometry and does not invent distance from times',()=>{
  const d=viewerData(22),s=createRace({...d.state!.input,progression:progressionForCircuit(d.circuit.sourceCircuitId)}),view=projectRaceView({...d,state:s});
  const e=view.state!.entrants[0];expect(entrantProgress({...e,elapsedTimeMs:999999,track:{...e.track!,progressMicrolaps:2820000}},view.state!)).toBe(2.82);
  const suzuka=circuitLayouts['00000000-0000-4000-8000-000000000301'];expect(pointAtProgress(suzuka,.82)).toEqual(pointAtProgress(suzuka,2.82));
 });
 it('fits all production geometries with one scale, less canvas padding and no distorted aspect ratio',()=>{
  for(const layout of Object.values(circuitLayouts)){const canvas=raceMapCanvas(layout),project=circuitProjection(layout.points,canvas.width,canvas.height,canvas.padding),a=project({x:0,y:0}),b=project({x:.1,y:.1});expect(b.x-a.x).toBeCloseTo(b.y-a.y,8);expect(canvas.padding).toBe(16);expect(canvas.height).toBeGreaterThanOrEqual(340);expect(canvas.height).toBeLessThanOrEqual(760);}
 });
 it('renders 22 compact identities, selected / player shape cues, keyboard controls, lapped and retired state',()=>{
  const d=viewerData(22),view=projectRaceView(d),rows=timingRows(view).map((r,n)=>({...r,lapsDown:n===21?2:0,status:r.status}));
  const html=renderToStaticMarkup(<I18nProvider initialLocale="en"><TrackMap layout={circuitLayouts[d.circuit.sourceCircuitId!]} rows={rows} selected={rows[0].id} onSelect={()=>{}} speed={1} reduceMotion={false} raceViewer authoritative/></I18nProvider>);
  expect(html.match(/data-car=/g)).toHaveLength(22);expect(html.match(/<circle class="driver-bubble"/g)).toHaveLength(22);expect(html).not.toContain('driver-badge');expect(html.match(/class="player-ring"/g)).toHaveLength(2);expect(html.match(/class="selected-ring"/g)).toHaveLength(1);expect(html).toContain('stroke-dasharray="2.6 2"');expect(html).toContain('2 lap(s) down');expect(html.match(/role="button"/g)).toHaveLength(22);expect(Math.PI*RACE_BUBBLE.r**2).toBeLessThan(BADGE.w*BADGE.h*.6);const retired=renderToStaticMarkup(<I18nProvider><TrackMap layout={circuitLayouts[d.circuit.sourceCircuitId!]} rows={rows.map((r,n)=>n===20?{...r,status:'RETIRED'}:r)} selected={rows[0].id} onSelect={()=>{}} speed={1} reduceMotion={false} raceViewer authoritative/></I18nProvider>);expect(retired.match(/data-car=/g)).toHaveLength(21);expect(retired).not.toContain(`data-car="${rows[20].id}"`);
 });
 it('interpolates authoritative checkpoints smoothly with no extrapolation, lap-wrap reversal or motion after retirement',()=>{
  const motion=new RaceMotion([{id:'a',progress:2.98,retired:false},{id:'b',progress:1.7,retired:false}]);motion.reconcile([{id:'a',progress:3.4,retired:false},{id:'b',progress:1.9,retired:false}],1);motion.configure('playing',1000);let previous=2.98;for(let now=0;now<=1000;now+=20){motion.frame(now);expect(motion.progress('a')).toBeGreaterThanOrEqual(previous);expect(motion.progress('a')).toBeLessThanOrEqual(3.4);previous=motion.progress('a');}expect(motion.progress('a')).toBe(3.4);const stopped=motion.progress('b');motion.reconcile([{id:'a',progress:4.4,retired:false},{id:'b',progress:2.1,retired:true}],2);for(let now=1100;now<=2200;now+=20)motion.frame(now);expect(motion.progress('b')).toBe(stopped);
 });
 it('keeps label staggering track-local across unrelated crossing geometry and provides both locales',()=>{
  const pack=new MarkerPacks(),positions=pack.frame([{id:'a',progress:.1,x:10,y:10,nx:0,ny:1,tier:0},{id:'b',progress:.6,x:10,y:10,nx:0,ny:1,tier:1}],1500,16,true);expect(positions.get('b')!.offset).toBe(0);expect(translate('en','viewer.lapsDown',{count:'2'})).toBe('2 lap(s) down');expect(translate('zh-TW','viewer.lapsDown',{count:'2'})).toBe('落後 2 圈');
 });
 it('keeps a 22-car train exactly on the racing line: overlap allowed, no lateral lanes, no crossing-branch repulsion',()=>{
  const style=raceTrackStyle(2*RACE_BUBBLE.r);
  const cars=Array.from({length:22},(_,n)=>({x:n*6,y:100,tangentX:1,tangentY:0}));
  for(const c of cars)expect(anchorRaceMarker(c,0,style.corridor)).toEqual({x:c.x,y:c.y});
  // A car on a crossing branch at the same screen point is placed at its own sample, untouched by the other.
  const crossing={x:cars[0].x,y:cars[0].y,tangentX:0,tangentY:1};expect(anchorRaceMarker(crossing,0,style.corridor)).toEqual({x:crossing.x,y:crossing.y});
 });
 it('projects current local segments / pit route / lap deficit without exposing integration plans',()=>{
  const d=viewerData(),s=advanceRace(createRace({...d.state!.input,progression:progressionForCircuit(d.circuit.sourceCircuitId)}),4),v=projectRaceView({...d,state:s});expect(v.state!.entrants.every(e=>e.track?.local?.segmentId)).toBe(true);const text=JSON.stringify(v);for(const hidden of ['lapCommands','freeLapMs','launchDelayMs','passingId','remainder','rngState','"seed"'])expect(text).not.toContain(hidden);
 });
});

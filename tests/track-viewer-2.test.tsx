// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n/provider';
import { TrackMap } from '../src/features/race/viewer/track-map';
import { boundCamera, focusCamera, overviewCamera, panCamera, settleCamera, zoomCamera } from '../src/features/race/viewer/track-camera';
import { placeTrackLabels } from '../src/features/race/viewer/track-labels';
import { environmentDetail, geographicTrackFrame } from '../src/features/race/viewer/environment-geometry';
import { trackEnvironments, orientEnvironment } from '../src/features/race/viewer/track-environment';
import environmentData from '../src/features/race/viewer/environment-data.json';
import suzuka from '../src/data/seed/geometry/suzuka.json';
import { circuitLayouts } from '../src/data/seed/circuit-layouts';
import { circuitProjection, normalizeCircuitPoints, orientLayout, projectCoordinates } from '../src/game/domain/circuit-geometry';
import { timingRows } from '../src/features/race/viewer/model';
import { viewerView } from './helpers/viewer';

const SUZUKA='00000000-0000-4000-8000-000000000301';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null=null, host: HTMLDivElement | null=null, now=0, queue=new Map<number, FrameRequestCallback>(), sequence=0;
beforeEach(()=>{ now=0;queue=new Map();vi.spyOn(performance,'now').mockImplementation(()=>now);vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{queue.set(++sequence,cb);return sequence});vi.stubGlobal('cancelAnimationFrame',(id:number)=>queue.delete(id)); });
afterEach(()=>{act(()=>root?.unmount());host?.remove();root=null;host=null;vi.restoreAllMocks();vi.unstubAllGlobals();});
function frames(n=65){for(let i=0;i<n;i++){now+=16;const callbacks=[...queue.values()];queue.clear();act(()=>callbacks.forEach(cb=>cb(now)));}}
const rows=timingRows(viewerView(22)).map((r,i)=>({...r,progress:16.21+i*.001,routeHistory:undefined,route:'TRACK' as const}));
function markup(layout=circuitLayouts[SUZUKA], classic=false, locale:'en'|'zh-TW'='en') {return <I18nProvider initialLocale={locale}><TrackMap layout={layout} rows={rows} selected={rows[0].id} onSelect={()=>{}} speed={8} reduceMotion={false} checkpoint={16} authoritative raceViewer={!classic} environment={trackEnvironments[layout.id]}/></I18nProvider>}
function mount(){host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(markup()));frames();return host;}
function click(name:string){const button=[...host!.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name||b.textContent===name)!;act(()=>button.click());frames();return button;}

describe('Track Viewer 2.0 camera and labels',()=>{
 it('bounds arbitrary pan/zoom and recovers overview without progress input',()=>{let camera=overviewCamera();for(let i=0;i<20;i++)camera=zoomCamera(camera,1.35);expect(camera.zoom).toBe(4);camera=panCamera(camera,100,-100);expect(camera.center).toEqual({x:.875,y:.125});expect(boundCamera({...camera,zoom:NaN}).zoom).toBe(1);expect(zoomCamera(camera,.01)).toEqual(overviewCamera());});
 it('focus clamps to a recoverable frame; reduced motion applies the target in one frame',()=>{const target=focusCamera({mode:'focus',zoom:2.4,center:{x:.5,y:.5}},{x:.9,y:.1});const reduced=settleCamera(overviewCamera(),target,16,true);expect(reduced).toEqual({camera:target,pending:false});const smooth=settleCamera(overviewCamera(),target,16,false);expect(smooth.pending).toBe(true);expect(smooth.camera.zoom).toBeGreaterThan(1);expect(smooth.camera.zoom).toBeLessThan(2.4);});
 it('places selected and own callouts independently without moving dense anchors',()=>{const anchors=[{id:'selected',x:150,y:70,selected:true,player:true,width:76},{id:'own',x:151,y:70,selected:false,player:true,width:76},{id:'ai',x:150,y:70,selected:false,player:false,width:76}];const before=JSON.stringify(anchors),labels=placeTrackLabels(anchors,300,150);expect(labels.size).toBe(2);expect(labels.get('selected')).not.toEqual(labels.get('own'));expect(labels.has('ai')).toBe(false);expect(JSON.stringify(anchors)).toBe(before);expect(placeTrackLabels(anchors,30,30).size).toBe(0);});
 it('camera, environment and paused resize preserve every marker anchor and the public rows',()=>{mount();const before=JSON.stringify(rows),anchors=()=>[...host!.querySelectorAll('[data-car]')].map(e=>[e.getAttribute('data-car'),e.getAttribute('transform'),e.getAttribute('data-visual-progress')]);const initial=anchors();const node=host!.querySelector('[data-car]');click('Driver focus');expect(host!.querySelector('svg.circuit-map')!.getAttribute('data-camera')).toBe('focus');click('Pan right');click('Zoom in');click('Environment');expect(host!.querySelector('.track-environment')).toBeNull();expect(anchors()).toEqual(initial);act(()=>root!.render(markup({...circuitLayouts[SUZUKA],points:[...circuitLayouts[SUZUKA].points]})));frames();expect(host!.querySelector('[data-car]')).toBe(node);expect(anchors()).toEqual(initial);click('Reset view');expect(host!.querySelector('svg.circuit-map')!.getAttribute('data-zoom')).toBe('1');expect(JSON.stringify(rows)).toBe(before);});
 it('8x committed progress stays monotonic through focus, pause, resize and reset',()=>{
   mount(); const next=rows.map(r=>({...r,progress:r.progress+1})), frozen=JSON.stringify(next);
   const render=(motion:'playing'|'paused',layout=circuitLayouts[SUZUKA])=>act(()=>root!.render(<I18nProvider initialLocale="en"><TrackMap layout={layout} rows={next} selected={rows[0].id} onSelect={()=>{}} speed={8} reduceMotion={false} checkpoint={17} motion={motion} authoritative raceViewer environment={trackEnvironments.suzuka}/></I18nProvider>));
   const progress=()=>rows.map(r=>Number(host!.querySelector<SVGGElement>(`[data-car="${r.id}"]`)!.dataset.visualProgress));
   render('playing');frames(5);const moving=progress();expect(moving[0]).toBeGreaterThan(rows[0].progress);expect(moving[0]).toBeLessThan(next[0].progress);
   render('paused');frames(1);const paused=progress();click('Driver focus');expect(progress()).toEqual(paused);
   render('paused',{...circuitLayouts[SUZUKA],points:[...circuitLayouts[SUZUKA].points]});frames(1);expect(progress()).toEqual(paused);
   click('Reset view');expect(progress()).toEqual(paused);render('playing');let previous=paused;for(let i=0;i<25;i++){frames(1);const current=progress();current.forEach((p,j)=>{expect(p).toBeGreaterThanOrEqual(previous[j]);expect(p).toBeLessThanOrEqual(next[j].progress)});previous=current;}
   expect(progress()).toEqual(next.map(r=>r.progress));expect(JSON.stringify(next)).toBe(frozen);
 });
});
describe('geographic context and all-circuit compatibility',()=>{
 it('projects actual coordinates through the track frame, retaining the original normalized geometry',()=>{const raw=suzuka.features[0].geometry.coordinates, transform=geographicTrackFrame(raw,0), reference=normalizeCircuitPoints(projectCoordinates(raw));raw.slice(0,-1).forEach((p,i)=>{expect(transform(p).x).toBeCloseTo(reference[i].x,12);expect(transform(p).y).toBeCloseTo(reference[i].y,12)});});
 it('transforms features with the exact companion transform and uniform viewport scale',()=>{const layout=circuitLayouts[SUZUKA],environment=trackEnvironments.suzuka, oriented=orientLayout(layout,35), changed=orientEnvironment(environment,oriented.transform)!;expect(changed.features[0].points).toEqual(oriented.transform(environment.features[0].points));const project=circuitProjection([...oriented.layout.points,...changed.features[0].points],900,650,40),a=project({x:0,y:0}),b=project({x:1,y:1});expect(b.x-a.x).toBeCloseTo(b.y-a.y,10);expect(environment).toBe(trackEnvironments.suzuka);});
 it('keeps per-feature provenance and license for the four original vector profiles',()=>{expect(environmentData.profiles).toHaveLength(4);expect(environmentData.license).toContain('odbl');for(const p of environmentData.profiles)for(const f of p.features){expect(f.provenance.sourceURL).toMatch(/^https:\/\/www.openstreetmap.org\/way\//);expect(f.provenance.licenseOrUsageBasis).toContain('ODbL');expect(f.provenance.reviewedAt).toBe('2026-10-08');expect(f.coordinates.length).toBeGreaterThan(2);}});
 it('limits detail by drawable size',()=>{expect(environmentDetail(1800,220)).toBe('LOW');expect(environmentDetail(700,300)).toBe('MEDIUM');expect(environmentDetail(1100,600)).toBe('HIGH');});
 it.each(Object.values(circuitLayouts).map(l=>[l.id,l] as const))('renders %s without stretching or requiring an environment',(_,layout)=>{const before=JSON.stringify(layout),html=renderToStaticMarkup(markup(layout));expect(html.match(/class="driver-bubble"/g)).toHaveLength(22);expect(html).not.toMatch(/NaN|Infinity/);expect(html).toContain('Reset view');expect(html).toContain(trackEnvironments[layout.id]?'Stylized venue context':'environment not yet researched');expect(JSON.stringify(layout)).toBe(before);});
 it('keeps classic Practice/Qualifying maps outside the Race camera and scenery system',()=>{const html=renderToStaticMarkup(markup(circuitLayouts[SUZUKA],true));expect(html).not.toContain('track-tools');expect(html).not.toContain('track-environment');expect(html.match(/class="driver-badge"/g)).toHaveLength(22);});
 it('provides Traditional Chinese camera/context strings',()=>{const html=renderToStaticMarkup(markup(circuitLayouts[SUZUKA],false,'zh-TW'));expect(html).toContain('重設視角');expect(html).toContain('跟隨車手');expect(html).not.toContain('trackViewer.');});
});

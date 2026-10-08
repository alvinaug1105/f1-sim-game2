// @vitest-environment happy-dom
import React, { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { I18nProvider } from '../src/i18n/provider';
import { circuitLayouts } from '../src/data/seed/circuit-layouts';
import { drawnPitLane } from '../src/data/seed/circuit-pit-lanes';
import { racePitRoute } from '../src/game/domain/pit-geometry';
import { orientLayout } from '../src/game/domain/circuit-geometry';
import { trackEnvironments, orientEnvironment } from '../src/features/race/viewer/track-environment';
import ThreeViewer from '../src/features/race/prototype/three-viewer';
import { createRenderer } from '../src/features/race/prototype/webgl';
import type { PrototypeReplay, SceneGeometry } from '../src/features/race/prototype/model';
import replayJSON from '../src/features/race/prototype/replay.json';

vi.mock('../src/features/race/prototype/webgl',()=>({createRenderer:vi.fn()}));
const replay=replayJSON as PrototypeReplay,layout=circuitLayouts['00000000-0000-4000-8000-000000000301'];
const geometry:SceneGeometry={layout,pit:racePitRoute(drawnPitLane('00000000-0000-4000-8000-000000000301')!,replay.pitAnchors),environment:trackEnvironments.suzuka};
type FakeRenderer=ReturnType<typeof fakeRenderer>;
function fakeRenderer(){return {outputColorSpace:'',toneMapping:0,toneMappingExposure:0,shadowMap:{enabled:false,type:0,autoUpdate:true,needsUpdate:false},info:{render:{calls:100,triangles:2000},memory:{geometries:60,textures:0}},debug:{onShaderError:()=>{}},setSize:vi.fn(),setPixelRatio:vi.fn(),getPixelRatio:()=>1.5,render:vi.fn(),renderLists:{dispose:vi.fn()},dispose:vi.fn(),forceContextLoss:vi.fn()};}
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement,now=0,id=0,queue=new Map<number,FrameRequestCallback>(),renderers:FakeRenderer[]=[],canvases:HTMLCanvasElement[]=[],intersect:(e:{isIntersecting:boolean}[])=>void;
const failure=vi.fn();
beforeEach(()=>{
    now=0;queue=new Map();renderers=[];canvases=[];failure.mockReset();
    vi.spyOn(performance,'now').mockImplementation(()=>now);
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:1000,height:650,x:0,y:0,top:0,left:0,bottom:650,right:1000,toJSON:()=>({})});
    vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{queue.set(++id,cb);return id;});vi.stubGlobal('cancelAnimationFrame',(i:number)=>queue.delete(i));
    vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
    vi.stubGlobal('IntersectionObserver',class{constructor(cb:typeof intersect){intersect=cb;}observe(){}disconnect(){}});
    vi.mocked(createRenderer).mockImplementation(canvas=>{canvases.push(canvas);const renderer=fakeRenderer();renderers.push(renderer);return renderer as unknown as NonNullable<ReturnType<typeof createRenderer>>;});
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
function frames(count=1){for(let i=0;i<count;i++){now+=16;const callbacks=[...queue.values()];queue.clear();act(()=>callbacks.forEach(cb=>cb(now)));}}
function render(checkpoint=0,playing=false,geo=geometry,reduced=false){act(()=>root.render(<StrictMode><I18nProvider initialLocale="en"><ThreeViewer geometry={geo} rows={replay.frames[checkpoint].rows} checkpoint={checkpoint} selected={replay.frames[0].rows[0].id} onSelect={()=>{}} playing={playing} speed={8} reduced={reduced} angled onFailure={failure}/></I18nProvider></StrictMode>));frames();}
const progress=()=>Number(host.querySelector<HTMLElement>('[data-three-host]')!.dataset.progress);
function click(name:string){act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent===name||b.getAttribute('aria-label')===name)!.click());frames(65);}

describe('GPU scene lifecycle, using a renderer double rather than pretending to test a GPU',()=>{
    it('uses fresh canvases across Strict Mode remounts and stops the paused loop',()=>{
        render();frames(5);expect(renderers).toHaveLength(2);expect(new Set(canvases).size).toBe(2);expect(canvases[0].isConnected).toBe(false);expect(canvases[1].isConnected).toBe(true);
        expect(renderers[0].dispose).toHaveBeenCalledTimes(1);expect(renderers[0].forceContextLoss).toHaveBeenCalledTimes(1);expect(queue.size).toBe(0);expect(failure).not.toHaveBeenCalled();
        act(()=>root.unmount());expect(canvases.every(c=>!c.isConnected)).toBe(true);expect(renderers[1].dispose).toHaveBeenCalledTimes(1);expect(queue.size).toBe(0);
    });
    it('preserves mid-checkpoint paused progress through responsive reorientation, focus and reset',()=>{
        render();render(1,true);frames(6);render(1,false);const paused=progress();expect(paused).toBeGreaterThan(replay.frames[0].rows[0].progress);expect(paused).toBeLessThan(replay.frames[1].rows[0].progress);
        const oriented=orientLayout(layout,45),rotated={layout:oriented.layout,pit:{...geometry.pit,points:oriented.transform(geometry.pit.points)},environment:orientEnvironment(geometry.environment,oriented.transform)!};
        render(1,false,rotated);expect(progress()).toBe(paused);click('Driver focus');expect(progress()).toBe(paused);click('Reset view');expect(progress()).toBe(paused);
        render(1,true,rotated);let previous=paused;for(let i=0;i<30;i++){frames();expect(progress()).toBeGreaterThanOrEqual(previous);previous=progress();}expect(progress()).toBe(replay.frames[1].rows[0].progress);
    });
    it('keeps static scene resources through checkpoints, and suspends when offscreen',()=>{
        render();const count=renderers.length;render(1,true);expect(renderers).toHaveLength(count);
        act(()=>intersect([{isIntersecting:false}]));const paused=progress();frames(10);expect(progress()).toBe(paused);expect(queue.size).toBe(0);
        act(()=>intersect([{isIntersecting:true}]));frames(5);expect(progress()).toBeGreaterThanOrEqual(paused);
    });
    it('suspends on document visibility without catching up hidden wall-clock time',()=>{
        render();render(1,true);frames(5);const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);
        act(()=>document.dispatchEvent(new Event('visibilitychange')));const stopped=progress();now+=10000;frames(10);expect(queue.size).toBe(0);expect(progress()).toBe(stopped);
        hidden.mockReturnValue(false);act(()=>document.dispatchEvent(new Event('visibilitychange')));frames();expect(progress()).toBe(stopped);frames(2);expect(progress()).toBeGreaterThan(stopped);
    });
    it('drains the last checkpoint to its exact public endpoint and stops rendering',()=>{
        render();render(11,true);frames(70);expect(progress()).toBe(replay.frames[11].rows[0].progress);expect(queue.size).toBe(0);
    });
    it('uses one-frame reduced movement and reduced camera settlement',()=>{render();render(1,true,geometry,true);expect(progress()).toBe(replay.frames[1].rows[0].progress);click('Driver focus');expect(queue.size).toBe(0);});
    it('notifies SVG fallback on unavailable WebGL, render failure and actual context-loss event',()=>{
        vi.mocked(createRenderer).mockReturnValueOnce(null);render();expect(failure).toHaveBeenCalled();
        failure.mockClear();act(()=>host.querySelector('canvas')!.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));expect(failure).toHaveBeenCalledTimes(1);expect(queue.size).toBe(0);
        failure.mockClear();renderers.at(-1)!.render.mockImplementation(()=>{throw Error('GPU lost');});render(1,true);expect(failure).toHaveBeenCalledTimes(1);expect(queue.size).toBe(0);
    });
});

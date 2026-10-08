// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { I18nProvider } from '../src/i18n/provider';
import SuzukaComparison, { SvgPreview } from '../src/features/race/prototype/comparison';
import { circuitLayouts } from '../src/data/seed/circuit-layouts';
import type { PrototypeReplay } from '../src/features/race/prototype/model';
import replayJSON from '../src/features/race/prototype/replay.json';
vi.mock('next/dynamic',()=>({default:()=>({onFailure}:{onFailure:()=>void})=>React.createElement('button',{onClick:onFailure},'GPU failure probe')}));
vi.mock('next/link',()=>({default:({href,children}:{href:string;children:React.ReactNode})=>React.createElement('a',{href},children)}));
const replay=replayJSON as PrototypeReplay,layout=circuitLayouts['00000000-0000-4000-8000-000000000301'];
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement,now=0,id=0,queue=new Map<number,FrameRequestCallback>(),intersect:(e:{isIntersecting:boolean}[])=>void;
beforeEach(()=>{
    now=0;queue=new Map();localStorage.clear();vi.spyOn(performance,'now').mockImplementation(()=>now);
    vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{queue.set(++id,cb);return id;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>queue.delete(id));
    vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('IntersectionObserver',class{constructor(cb:typeof intersect){intersect=cb;}observe(){}disconnect(){}});
    vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No prototype network actions permitted');}));
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
function frames(n=1){for(let i=0;i<n;i++){now+=16;const pending=[...queue.values()];queue.clear();act(()=>pending.forEach(cb=>cb(now)));}}
function click(name:string){act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent===name)!.click());frames();}
function mount(){act(()=>root.render(<I18nProvider initialLocale="en"><SuzukaComparison replay={replay}/></I18nProvider>));frames();}
it('suspends the unchanged SVG baseline while its prototype pane is offscreen',()=>{
    const show=(index:number)=>act(()=>root.render(<I18nProvider initialLocale="en"><SvgPreview layout={layout} rows={replay.frames[index].rows} selected={replay.frames[0].rows[0].id} onSelect={()=>{}} speed={8} reduceMotion={false} checkpoint={index} motion="playing" authoritative raceViewer/></I18nProvider>));
    show(0);frames();show(1);frames(5);act(()=>intersect([{isIntersecting:false}]));frames();
    const read=()=>host.querySelector('[data-car="pit-entrant-0"]')!.getAttribute('data-visual-progress'),stopped=read();frames(50);expect(read()).toBe(stopped);expect(queue.size).toBe(0);
    act(()=>intersect([{isIntersecting:true}]));frames(25);expect(Number(read())).toBeGreaterThan(Number(stopped));
});
it('lets the final public checkpoint settle exactly, then stops the SVG RAF loop',()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});mount();click('Play replay');
    for(let i=0;i<11;i++){act(()=>vi.advanceTimersByTime(2400));frames();}
    expect(host.querySelector('[data-prototype]')!.getAttribute('data-checkpoint')).toBe('11');expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Replay complete')!.disabled).toBe(true);
    frames(180);expect(host.querySelector('[data-car="pit-entrant-0"]')!.getAttribute('data-visual-progress')).toBe('27');expect(queue.size).toBe(0);
});
it('retains public data, car selection and translated UI through GPU fallback and locale changes',()=>{
    const before=JSON.stringify(replay);mount();click('ANTP2Your car');click('GPU failure probe');
    expect(host.querySelector('[role="status"]')!.textContent).toContain('GPU viewer unavailable');expect(host.querySelectorAll('svg.circuit-map')).toHaveLength(2);
    const selected=host.querySelector('[data-prototype]')!.getAttribute('data-selected'),select=host.querySelector<HTMLSelectElement>('#interface-language')!;
    act(()=>{select.value='zh-TW';select.dispatchEvent(new Event('change',{bubbles:true}));});frames();
    expect(host.querySelector('h1')!.textContent).toContain('賽道實驗');expect(host.querySelector('[data-prototype]')!.getAttribute('data-selected')).toBe(selected);expect(JSON.stringify(replay)).toBe(before);expect(fetch).not.toHaveBeenCalled();
});

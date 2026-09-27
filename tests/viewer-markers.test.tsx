// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { TrackMap, type MapRow } from '../src/features/race/viewer/track-map';
import { layoutForCircuit } from '../src/data/seed/circuit-layouts';
import { I18nProvider } from '../src/i18n/provider';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('integrated badges retain identity, PIT/retirement, selection and keyboard accessibility',()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),select=vi.fn();
 const rows:MapRow[]=Array.from({length:22},(_,i)=>({id:`c${i}`,progress:-i*.01,name:`Driver ${i}`,team:'Team',color:i%2?'#ffffff':'#000000',abbreviation:`D${i}`,player:i<2,status:i===3?'RETIRED':'RUNNING',pitting:i===2,entrant:{position:i+1}}));
 try {
  act(()=>root.render(<I18nProvider><TrackMap layout={layoutForCircuit()} rows={rows} selected="c0" onSelect={select} speed={1} reduceMotion={false}/></I18nProvider>));
  const badges=[...host.querySelectorAll<SVGGElement>('[data-car]')];expect(badges).toHaveLength(22);
  for(const badge of badges){expect(badge.getAttribute('tabindex')).toBe('0');expect(badge.getAttribute('aria-label')).toContain('Driver');expect(badge.querySelector('.driver-badge')).not.toBeNull();}
  expect(host.querySelector('[data-car="c0"]')?.getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('[data-car="c1"] .teammate-mark')).not.toBeNull();expect(host.querySelector('[data-car="c2"] .pit-mark')?.textContent).toBe('PIT');expect(host.querySelector('[data-car="c3"] .retired-mark')).not.toBeNull();
  const ai=host.querySelector('[data-car="c4"]')!;
  act(()=>{ai.dispatchEvent(new MouseEvent('click',{bubbles:true}));ai.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));ai.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));});
  expect(select.mock.calls).toEqual([['c4'],['c4'],['c4']]);expect(host.querySelector('[data-label],.tag-connector')).toBeNull();
 } finally {act(()=>root.unmount());host.remove();}
});

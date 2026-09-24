"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CircuitMapLayout } from "../../../game/domain/circuit-layout";
import { pointAtProgress, interpolateProgress, type timingRows } from "./model";
import { useI18n } from "../../../i18n/provider";
type Rows = ReturnType<typeof timingRows>;
const subscribeMotion = (notify: () => void) => { const media = window.matchMedia('(prefers-reduced-motion: reduce)'); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify); };
const getMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function TrackMap({ layout, rows, selected, onSelect, speed, reduceMotion }: {
    layout: CircuitMapLayout;
    rows: Rows;
    selected: string;
    onSelect: (id: string) => void;
    speed: number;
    reduceMotion: boolean;
}) {
    const { t } = useI18n(), svg = useRef<SVGSVGElement>(null), previous = useRef(new Map<string, number>()), systemReduced = useSyncExternalStore(subscribeMotion, getMotion, () => false);
    useEffect(() => {
        const from = previous.current;
        previous.current = new Map(rows.map(r => [r.id, r.progress]));
        const elements = svg.current?.querySelectorAll<SVGGElement>('[data-car], [data-label]');
        const byId = new Map(rows.map(r => [r.id, r]));
        let frame = 0, start: number | null = null;
        const draw = (now: number) => {
            if (start === null)
                start = now;
            const fraction = systemReduced || reduceMotion ? 1 : Math.min(1, (now - start) / (1600 / speed));
            elements?.forEach(element => { const r = byId.get(element.dataset.car ?? element.dataset.label!)!, progress = interpolateProgress(from.get(r.id) ?? r.progress, r.progress, fraction, r.status === 'RETIRED'); const p = pointAtProgress(layout, progress); element.setAttribute('transform', `translate(${p.x * 1000} ${p.y * 650})`); });
            if (fraction < 1)
                frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frame);
    }, [rows, layout, speed, reduceMotion, systemReduced]);
    const path = layout.points.map((p, i) => `${i ? 'L' : 'M'}${p.x * 1000},${p.y * 650}`).join(' ') + ' Z', start = pointAtProgress(layout, 0), occupied: {
        x: number;
        y: number;
    }[] = [];
    const markerPoints = rows.map(r => { const p = pointAtProgress(layout, r.progress); return {x:p.x*1000,y:p.y*650}; });
    const labels = rows.map(r => {
        const p = pointAtProgress(layout, r.progress), x = p.x * 1000, y = p.y * 650;
        let label = { x: x + 35, y: y - 28 };
        const offsets = Array.from({ length: 12 }, (_, iy) => Array.from({ length: 9 }, (_, ix) => [70 + ix * 105 - x, 30 + iy * 50 - y])).flat().sort((a, b) => Math.hypot(...a as [
            number,
            number
        ]) - Math.hypot(...b as [
            number,
            number
        ]));
        for (const [dx, dy] of offsets) {
            const candidate = { x: Math.max(70, Math.min(930, x + dx)), y: Math.max(30, Math.min(620, y + dy)) };
            if (!occupied.some(q => Math.abs(q.x - candidate.x) < 100 && Math.abs(q.y - candidate.y) < 40) && !markerPoints.some(q => Math.abs(q.x-candidate.x)<75 && Math.abs(q.y-candidate.y)<50)) {
                label = candidate;
                break;
            }
        }
        occupied.push(label);
        return { dx: label.x - x, dy: label.y - y };
    });
    return <svg ref={svg} className="circuit-map" viewBox="0 0 1000 650" aria-label={t('viewer.map')} role="group">
  <defs><pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#242c32" strokeWidth="1"/></pattern></defs>
  <rect width="1000" height="650" fill="url(#map-grid)" opacity=".55"/>
  <path d={path} fill="none" stroke="#070b0e" strokeWidth="40" strokeLinejoin="round"/>
  <path d={path} fill="none" stroke="#53606c" strokeWidth="26" strokeLinejoin="round"/>
  <path d={path} fill="none" stroke="#a6b4bf" strokeWidth="1.5" strokeDasharray="5 13" opacity=".4"/>
  <g transform={`translate(${start.x * 1000} ${start.y * 650})`}><path d="M -20 -15 L 20 15" stroke="white" strokeWidth="8"/><text x="-45" y="45" fill="#c6d1d8" fontSize="18">{t('viewer.startFinish')}</text></g>
  {rows.map(r => {
            const p = pointAtProgress(layout, r.progress);
            return <g key={r.id} data-car={r.id} transform={`translate(${p.x * 1000} ${p.y * 650})`} role="button" tabIndex={0} aria-label={`${r.name} · ${t(`incident.${r.status}`)}`} aria-pressed={r.id === selected} onClick={() => onSelect(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(r.id);
            } }} className={`map-car ${r.status === 'RETIRED' ? 'retired' : ''}`}>
   <title>{r.name} · {r.team} · {t('race.position')} {r.entrant.position}</title>
   <circle r={r.id === selected ? 22 : 14} fill={r.color} stroke={r.id === selected ? 'white' : '#11181d'} strokeWidth="5"/>
   {r.id === selected && <circle r="29" fill="none" stroke="white" strokeDasharray="5 5" strokeWidth="2"/>}
   {r.status === 'RETIRED' && <path d="M -10 -10 L 10 10 M -10 10 L 10 -10" stroke="#111" strokeWidth="5"/>}
  </g>;
        })}
  {rows.map((r,i)=>{const p=pointAtProgress(layout,r.progress),label=labels[i];return <g key={r.id} data-label={r.id} aria-hidden="true" pointerEvents="none" transform={`translate(${p.x*1000} ${p.y*650})`} opacity={r.status==='RETIRED'?.45:1}>
   <path d={`M 0 0 L ${label.dx} ${label.dy}`} stroke={r.color} strokeWidth="1.5" opacity=".6"/>
   <rect x={label.dx - 44} y={label.dy - 18} width="88" height="36" rx="6" fill="#101a22" stroke={r.id === selected ? 'white' : r.color} strokeWidth="2"/>
   <text x={label.dx} y={label.dy + 7} textAnchor="middle" fill="white" fontSize="23" fontWeight="700">{r.abbreviation}</text>
   {r.pitting && <text x={label.dx} y={label.dy + 36} textAnchor="middle" fill="#e8c86b" fontSize="20">{t('viewer.pit')}</text>}
</g>;})}
 </svg>;
}

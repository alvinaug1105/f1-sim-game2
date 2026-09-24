"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CircuitMapLayout } from '../../../game/domain/circuit-layout';
import { prepareCircuitPath, circuitProjection } from '../../../game/domain/circuit-geometry';
import type { timingRows } from './model';
import { RaceMotion, checkpointDuration, type MotionMode } from './motion';
import { useI18n } from '../../../i18n/provider';
type Rows = ReturnType<typeof timingRows>;
const subscribeMotion = (notify: () => void) => { const media = window.matchMedia('(prefers-reduced-motion: reduce)'); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify); };
const getMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const targets = (rows: Rows) => rows.map(r => ({ id: r.id, progress: r.progress, retired: r.status === 'RETIRED' }));
/** One loop for the entire field. React handles checkpoints/selection, never individual frames. */
export function TrackMap({ layout, rows, selected, onSelect, speed, reduceMotion, motion = 'paused', checkpoint = 0, control = 'GREEN', skipping = false, latencyMs = 0 }: {
    layout: CircuitMapLayout; rows: Rows; selected: string; onSelect: (id: string) => void;
    speed: number; reduceMotion: boolean; motion?: MotionMode; checkpoint?: number; control?: string; skipping?: boolean; latencyMs?: number;
}) {
    const { t } = useI18n(), svg = useRef<SVGSVGElement>(null);
    const systemReduced = useSyncExternalStore(subscribeMotion, getMotion, () => false);
    const path = useMemo(() => prepareCircuitPath(layout), [layout]);
    const project = useMemo(() => circuitProjection(layout.points), [layout]);
    const [timeline] = useState(() => new RaceMotion(targets(rows), checkpoint));
    // Stable React transform props prevent selection/locale/checkpoint renders overwriting RAF transforms.
    const [initial] = useState(() => new Map(rows.map(r => [r.id, project(path.sample(r.progress))])));
    const wake = useRef<() => void>(() => {});
    useEffect(() => {
        const root = svg.current!;
        const cars = [...root.querySelectorAll<SVGGElement>('[data-car]')];
        const labels = [...root.querySelectorAll<SVGGElement>('[data-label]')];
        const drawn = new Map<string, { x: number; y: number }>();
        let frame = 0, disposed = false, previousTime: number | null = null;
        let frames = 0, workTotal = 0, workMax = 0, intervalTotal = 0, intervalMax = 0;
        const draw = (now: number) => {
            frame = 0;
            if (disposed) return;
            const started = performance.now();
            timeline.frame(now);
            const samples = cars.map(el => { const progress = timeline.progress(el.dataset.car!); const sample = path.sample(progress); return { progress, sample, ...project(sample) }; });
            const occupied: { x: number; y: number }[] = [];
            cars.forEach((el, i) => {
                const p = samples[i];
                // Fixed identity lanes separate close packs laterally, never by fake longitudinal progress.
                const close = samples.some((q, j) => i !== j && Math.hypot(q.x - p.x, q.y - p.y) < 24);
                const offset = close ? ((i % 5) - 2) * 5 : 0;
                const stopped = el.classList.contains('retired') ? drawn.get(el.dataset.car!) : undefined;
                const x = stopped?.x ?? p.x - p.sample.tangentY * offset, y = stopped?.y ?? p.y + p.sample.tangentX * offset;
                drawn.set(el.dataset.car!, { x, y });
                el.setAttribute('transform', `translate(${x} ${y})`);
                el.dataset.visualProgress = String(p.progress);
                el.dataset.lateralOffset = String(offset);
                const label = labels[i];
                if (!label) return;
                // Labels are placed independently of progress; leader lines always anchor to their car.
                let best = { x: Math.min(948, Math.max(52, x + 45)), y: Math.min(624, Math.max(26, y - 35)) }, score = Infinity;
                for (let row = 0; row < 12; row++) for (let col = 0; col < 9; col++) {
                    const candidate = { x: 65 + col * 108, y: 30 + row * 52 };
                    const distance = Math.hypot(candidate.x - x, candidate.y - y);
                    if (distance >= score || occupied.some(q => Math.abs(q.x - candidate.x) < 99 && Math.abs(q.y - candidate.y) < 44) || samples.some(q => Math.abs(q.x - candidate.x) < 55 && Math.abs(q.y - candidate.y) < 28)) continue;
                    best = candidate; score = distance;
                }
                occupied.push(best);
                label.setAttribute('transform', `translate(${best.x} ${best.y})`);
                label.querySelector('path')?.setAttribute('d', `M ${x - best.x} ${y - best.y} L 0 0`);
            });
            // Read-only development instrumentation used by the real-browser verification harness.
            if (process.env.NODE_ENV !== 'production') {
                const work = performance.now() - started;
                frames++; workTotal += work; workMax = Math.max(workMax, work);
                if (previousTime !== null) { intervalTotal += now - previousTime; intervalMax = Math.max(intervalMax, now - previousTime); }
                root.dataset.frames = String(frames); root.dataset.meanFrameWorkMs = String(workTotal / frames); root.dataset.maxFrameWorkMs = String(workMax);
                root.dataset.meanFrameIntervalMs = String(intervalTotal / Math.max(1, frames - 1)); root.dataset.maxFrameIntervalMs = String(intervalMax);
            }
            previousTime = now;
            if (timeline.pending) frame = requestAnimationFrame(draw);
            else previousTime = null;
        };
        wake.current = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };
        wake.current();
        return () => { disposed = true; cancelAnimationFrame(frame); wake.current = () => {}; };
    }, [timeline, path, project]);
    useEffect(() => {
        timeline.reconcile(targets(rows), checkpoint);
        timeline.configure(motion, checkpointDuration(speed, control, skipping) + latencyMs, reduceMotion || systemReduced);
        wake.current();
    }, [timeline, rows, checkpoint, motion, speed, control, skipping, latencyMs, reduceMotion, systemReduced]);
    const d = layout.points.map((p, i) => { const q = project(p); return `${i ? 'L' : 'M'}${q.x},${q.y}`; }).join(' ') + ' Z';
    const startSample = path.sample(0), start = project(startSample), angle = Math.atan2(startSample.tangentY, startSample.tangentX) * 180 / Math.PI;
    return <svg ref={svg} className="circuit-map" viewBox="0 0 1000 650" aria-label={t('viewer.map')} role="group" data-layout={layout.id} data-checkpoint={checkpoint} data-motion={motion}>
        <defs><pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#242c32" strokeWidth="1"/></pattern></defs>
        <rect width="1000" height="650" fill="url(#map-grid)" opacity=".55"/>
        <path d={d} fill="none" stroke="#070b0e" strokeWidth="30" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#53606c" strokeWidth="18" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#a6b4bf" strokeWidth="1.5" strokeDasharray="5 13" opacity=".4"/>
        <g transform={`translate(${start.x} ${start.y})`}><path transform={`rotate(${angle})`} d="M 0 -14 L 0 14" stroke="white" strokeWidth="6"/><text x="-35" y="40" fill="#c6d1d8" fontSize="18">{t('viewer.startFinish')}</text></g>
        {rows.map(r => { const p = initial.get(r.id) ?? start; return <g key={r.id} data-car={r.id} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`${r.name} · ${t(`incident.${r.status}`)}`} aria-pressed={r.id === selected} onClick={() => onSelect(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }} className={`map-car ${r.status === 'RETIRED' ? 'retired' : ''}`}>
            <title>{`${r.name} · ${r.team} · ${t('race.position')} ${r.entrant.position}`}</title>
            <circle r={r.id === selected ? 13 : 9} fill={r.color} stroke={r.id === selected ? 'white' : '#11181d'} strokeWidth="3"/>
            {r.id === selected && <circle r="18" fill="none" stroke="white" strokeDasharray="4 4" strokeWidth="2"/>}
            {r.status === 'RETIRED' && <path d="M -6 -6 L 6 6 M -6 6 L 6 -6" stroke="#111" strokeWidth="3"/>}
        </g>; })}
        {rows.map(r => { const p = initial.get(r.id) ?? start; return <g key={r.id} data-label={r.id} aria-hidden="true" pointerEvents="none" transform={`translate(${p.x} ${p.y})`} opacity={r.status === 'RETIRED' ? .45 : 1}>
            <path d="M 0 0" stroke={r.color} strokeWidth="1.2" opacity=".6"/>
            <rect x="-44" y="-18" width="88" height="36" rx="6" fill="#101a22" stroke={r.id === selected ? 'white' : r.color} strokeWidth="2"/>
            <text y="7" textAnchor="middle" fill="white" fontSize="23" fontWeight="700">{r.abbreviation}</text>
            {r.pitting && <text x="35" y="-22" textAnchor="middle" fill="#e8c86b" fontSize="18">{t('viewer.pit')}</text>}
        </g>; })}
    </svg>;
}

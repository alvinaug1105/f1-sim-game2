"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CircuitMapLayout } from '../../../game/domain/circuit-layout';
import { prepareCircuitPath, circuitProjection } from '../../../game/domain/circuit-geometry';
import type { timingRows } from './model';
import { RaceMotion, checkpointDuration, type MotionMode } from './motion';
import { useI18n } from '../../../i18n/provider';
import { placeLabels, LABEL_TIER, LABEL_SIZE, type Rect, type SlotMemory } from './labels';
type Rows = ReturnType<typeof timingRows>;
const subscribeMotion = (notify: () => void) => { const media = window.matchMedia('(prefers-reduced-motion: reduce)'); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify); };
const getMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const targets = (rows: Rows) => rows.map(r => ({ id: r.id, progress: r.progress, retired: r.status === 'RETIRED' }));
/** One loop for the entire field. React handles checkpoints/selection, never individual frames. */
const MAP_BOUNDS: Rect = { x: 4, y: 4, w: 992, h: 642 };
/** Labels are separate from markers: every car keeps a marker, only prioritised cars get a label (see labels.ts). */
export function TrackMap({ layout, rows, selected, onSelect, speed, reduceMotion, motion = 'paused', checkpoint = 0, control = 'GREEN', skipping = false, latencyMs = 0, tiers }: {
    layout: CircuitMapLayout; rows: Rows; selected: string; onSelect: (id: string) => void;
    speed: number; reduceMotion: boolean; motion?: MotionMode; checkpoint?: number; control?: string; skipping?: boolean; latencyMs?: number;
    tiers?: ReadonlyMap<string, number>;
}) {
    const { t } = useI18n(), svg = useRef<SVGSVGElement>(null);
    const systemReduced = useSyncExternalStore(subscribeMotion, getMotion, () => false);
    const path = useMemo(() => prepareCircuitPath(layout), [layout]);
    const project = useMemo(() => circuitProjection(layout.points), [layout]);
    const [timeline] = useState(() => new RaceMotion(targets(rows), checkpoint));
    // Stable React transform props prevent selection/locale/checkpoint renders overwriting RAF transforms.
    const [initial] = useState(() => new Map(rows.map(r => [r.id, project(path.sample(r.progress))])));
    const wake = useRef<() => void>(() => {});
        const startSample = path.sample(0), start = project(startSample), angle = Math.atan2(startSample.tangentY, startSample.tangentX) * 180 / Math.PI;
    const startText = t('viewer.startFinish');
    // START / FINISH line and text are a reserved region labels may not cover.
    const reserved = useMemo<Rect[]>(() => [{ x: start.x - 40, y: start.y + 22, w: Math.max(60, startText.length * 11) + 10, h: 24 }, { x: start.x - 16, y: start.y - 16, w: 32, h: 32 }], [start.x, start.y, startText]);
    const labelTierMap = useMemo(() => new Map(rows.map(r => [r.id, tiers?.get(r.id) ?? (r.id === selected ? LABEL_TIER.SELECTED : LABEL_TIER.FIELD)])), [rows, tiers, selected]);
    const tierOf = (id: string) => labelTierMap.get(id) ?? LABEL_TIER.FIELD;
    const placement = useRef({ tiers: labelTierMap, reserved });
    useEffect(() => {
        const root = svg.current!;
        const cars = [...root.querySelectorAll<SVGGElement>('[data-car]')];
        const drawn = new Map<string, { x: number; y: number }>();
        const slots = new Map<string, SlotMemory>();
        let frame = 0, disposed = false, previousTime: number | null = null;
        let frames = 0, workTotal = 0, workMax = 0, intervalTotal = 0, intervalMax = 0;
        const draw = (now: number) => {
            frame = 0;
            if (disposed) return;
            const started = performance.now();
            timeline.frame(now);
            const samples = cars.map(el => { const progress = timeline.progress(el.dataset.car!); const sample = path.sample(progress); return { progress, sample, ...project(sample) }; });
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
            });
            // Deterministic sticky placement: previous slots persist through passing markers; low-priority labels hide when no slot is valid.
            const { tiers: current, reserved: blocked } = placement.current;
            const placed = placeLabels(cars.map(el => ({ id: el.dataset.car!, tier: current.get(el.dataset.car!) ?? LABEL_TIER.FIELD, ...drawn.get(el.dataset.car!)! })), { bounds: MAP_BOUNDS, reserved: blocked, markers: [...drawn.values()], previous: slots });
            // Label elements follow React's priority set, so they are looked up per frame (markers never change).
            for (const label of root.querySelectorAll<SVGGElement>('[data-label]')) {
                const id = label.dataset.label!, at = placed.get(id), car = drawn.get(id);
                if (!at || !car) { slots.delete(id); label.setAttribute('visibility', 'hidden'); label.dataset.placed = '0'; continue; }
                slots.set(id, at.memory);
                label.setAttribute('visibility', 'visible'); label.dataset.placed = '1';
                label.setAttribute('transform', `translate(${at.x} ${at.y})`);
                label.querySelector('path')?.setAttribute('d', `M ${car.x - at.x} ${car.y - at.y} L 0 0`);
            }
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
    // Selection/priority/locale changes re-place labels once, even while paused; they never move cars.
    useEffect(() => { placement.current = { tiers: labelTierMap, reserved }; wake.current(); }, [labelTierMap, reserved]);
    const d = layout.points.map((p, i) => { const q = project(p); return `${i ? 'L' : 'M'}${q.x},${q.y}`; }).join(' ') + ' Z';
    const byTier = [...rows].sort((a, b) => tierOf(b.id) - tierOf(a.id)); // Highest priority drawn last (on top).
    return <svg ref={svg} className="circuit-map" viewBox="0 0 1000 650" aria-label={t('viewer.map')} role="group" data-layout={layout.id} data-checkpoint={checkpoint} data-motion={motion}>
        <defs><pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#242c32" strokeWidth="1"/></pattern></defs>
        <rect width="1000" height="650" fill="url(#map-grid)" opacity=".55"/>
        <path d={d} fill="none" stroke="#070b0e" strokeWidth="30" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#53606c" strokeWidth="18" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#a6b4bf" strokeWidth="1.5" strokeDasharray="5 13" opacity=".4"/>
        {rows.map(r => { const p = initial.get(r.id) ?? start, tier = tierOf(r.id), chosen = r.id === selected; return <g key={r.id} data-car={r.id} data-tier={tier} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`${r.name} · ${t('race.position')} ${r.entrant.position} · ${t(`incident.${r.status}`)}${r.player ? ` · ${t('viewer.player')}` : ''}`} aria-pressed={chosen} onClick={() => onSelect(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }} className={`map-car ${r.status === 'RETIRED' ? 'retired' : ''} ${r.player ? 'player' : ''} ${chosen ? 'selected' : ''}`}>
            <title>{`${r.name} · ${r.team} · ${t('race.position')} ${r.entrant.position}`}</title>
            <circle r="15" fill="transparent"/>
            {chosen && <circle r="19" fill="none" stroke="white" strokeDasharray="4 4" strokeWidth="2.5"/>}
            <circle r={chosen ? 12 : r.player ? 10 : 8} fill={r.color} stroke={chosen || r.player ? 'white' : '#0d1418'} strokeWidth={chosen ? 3 : r.player ? 2 : 2.5}/>
            {r.player && !chosen && <circle r="3" fill="white"/>}
            {r.status === 'RETIRED' && <path d="M -6 -6 L 6 6 M -6 6 L 6 -6" stroke="#111" strokeWidth="3"/>}
        </g>; })}
        <g className="start-finish" transform={`translate(${start.x} ${start.y})`} pointerEvents="none"><path transform={`rotate(${angle})`} d="M 0 -14 L 0 14" stroke="white" strokeWidth="6"/><text x="-35" y="40" fill="#dfe8ee" fontSize="18" fontWeight="600" stroke="#0b1116" strokeWidth="4" paintOrder="stroke">{startText}</text></g>
        {byTier.filter(r => tierOf(r.id) < LABEL_TIER.FIELD).map(r => { const p = initial.get(r.id) ?? start, tier = tierOf(r.id), size = LABEL_SIZE[tier], chosen = tier === LABEL_TIER.SELECTED; return <g key={r.id} data-label={r.id} data-tier={tier} className={`map-label tier-${tier}`} aria-hidden="true" pointerEvents="none" visibility="hidden" transform={`translate(${p.x} ${p.y})`} opacity={r.status === 'RETIRED' ? .5 : tier >= LABEL_TIER.LEADER ? .88 : 1}>
            <path d="M 0 0" stroke={chosen ? 'white' : r.color} strokeWidth={chosen ? 1.8 : 1.2} opacity=".7"/>
            <rect x={-size.w / 2} y={-size.h / 2} width={size.w} height={size.h} rx="5" fill={chosen ? '#f4f8fa' : '#101a22'} stroke={chosen ? r.color : r.player ? 'white' : r.color} strokeWidth={chosen ? 3 : r.player ? 1.6 : 1.4}/>
            {r.player && <rect x={-size.w / 2 + 3} y={-size.h / 2 + 3} width="4" height={size.h - 6} rx="1" fill={r.color}/>}
            <text y={chosen ? 7 : tier === LABEL_TIER.PLAYER ? 6 : 5} textAnchor="middle" fill={chosen ? '#0b1116' : 'white'} fontSize={chosen ? 20 : tier === LABEL_TIER.PLAYER ? 17 : 14} fontWeight={tier <= LABEL_TIER.PLAYER ? 800 : 650}>{r.abbreviation}</text>
            {r.pitting && <text x={size.w / 2 - 6} y={-size.h / 2 - 4} textAnchor="middle" fill="#e8c86b" fontSize="14" fontWeight="700" stroke="#0b1116" strokeWidth="3" paintOrder="stroke">{t('viewer.pit')}</text>}
        </g>; })}
    </svg>;
}

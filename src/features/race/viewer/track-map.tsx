"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CircuitMapLayout } from '../../../game/domain/circuit-layout';
import { prepareCircuitPath, circuitProjection } from '../../../game/domain/circuit-geometry';
import type { timingRows } from './model';
import { RaceMotion, checkpointDuration, type MotionMode } from './motion';
import { useI18n } from '../../../i18n/provider';
import { pathLength, startFinishReserve, LABEL_TIER } from './labels';
import { prepareVisualSpeed } from './speed-profile';
import { MarkerPacks, BADGE, badgeText } from './marker-packs';
/**
 * What the map needs from a row (Race timing rows satisfy it structurally; Practice builds its own). `hidden` cars are
 * in the garage: kept in the motion model so they re-emerge smoothly, but not drawn, focusable or labelled.
 */
export interface MapRow {
    id: string; progress: number; status: ReturnType<typeof timingRows>[number]['status']; name: string; team: string; player: boolean;
    color: string; abbreviation: string; pitting: boolean; entrant: { position: number }; hidden?: boolean;
}
type Rows = readonly MapRow[];
const subscribeMotion = (notify: () => void) => { const media = window.matchMedia('(prefers-reduced-motion: reduce)'); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify); };
const getMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const targets = (rows: readonly MapRow[]) => rows.map(r => ({ id: r.id, progress: r.progress, retired: r.status === 'RETIRED' }));
/** One loop for the entire field. React handles checkpoints/selection, never individual frames. */

/** Every visible car is an integrated identity badge. */
export function TrackMap({ layout, rows, selected, onSelect, speed, reduceMotion, motion = 'paused', checkpoint = 0, control = 'GREEN', skipping = false, latencyMs = 0, tiers }: {
    layout: CircuitMapLayout; rows: Rows; selected: string; onSelect: (id: string) => void;
    speed: number; reduceMotion: boolean; motion?: MotionMode; checkpoint?: number; control?: string; skipping?: boolean; latencyMs?: number;
    tiers?: ReadonlyMap<string, number>;
}) {
    const { t } = useI18n(), svg = useRef<SVGSVGElement>(null);
    const systemReduced = useSyncExternalStore(subscribeMotion, getMotion, () => false);
    const path = useMemo(() => prepareCircuitPath(layout), [layout]);
    const project = useMemo(() => circuitProjection(layout.points), [layout]);
    const profiles = useMemo(() => ({ green: prepareVisualSpeed(path), neutral: prepareVisualSpeed(path, .3) }), [path]);
    const timeline = useMemo(() => new RaceMotion(targets(rows), checkpoint, profiles), [profiles]); // eslint-disable-line react-hooks/exhaustive-deps
    // Stable React transform props prevent selection/locale/checkpoint renders overwriting RAF transforms.
    const [initial] = useState(() => new Map(rows.map(r => [r.id, project(path.sample(r.progress))])));
    const wake = useRef<() => void>(() => {});
    const startSample = path.sample(0), start = project(startSample), angle = Math.atan2(startSample.tangentY, startSample.tangentX) * 180 / Math.PI;
    const startText = t('viewer.startFinish');
    const reserved = useMemo(() => startFinishReserve(start, startText).slice(0,1), [start.x, start.y, startText]); // eslint-disable-line react-hooks/exhaustive-deps
    const [badgeScale, setBadgeScale] = useState(1);
    useEffect(() => {
        const observer = new ResizeObserver(entries => { const width=entries[0]?.contentRect.width; if(width) setBadgeScale(Math.max(1, Math.min(1.8, 750/width))); });
        observer.observe(svg.current!); return () => observer.disconnect();
    }, []);
    const labelTierMap = useMemo(() => new Map(rows.map(r => [r.id, r.id === selected ? LABEL_TIER.SELECTED : r.player ? LABEL_TIER.PLAYER : tiers?.get(r.id) ?? LABEL_TIER.FIELD])), [rows, tiers, selected]);
    const tierOf = (id: string) => labelTierMap.get(id) ?? LABEL_TIER.FIELD;
    const placement = useRef({ tiers: labelTierMap, paused: motion === 'paused', reduced: reduceMotion || systemReduced, badgeScale, reserved });
    useEffect(() => {
        const root = svg.current!;
        const all = [...root.querySelectorAll<SVGGElement>('[data-car]')];
        const packs = new MarkerPacks();
        // Projected lap length supplies the along-track neighbourhood scale.
        const at = (progress: number) => project(path.sample(progress)), lapLength = pathLength(at);
        let frame = 0, disposed = false, previousTime: number | null = null;
        let frames = 0, workTotal = 0, workMax = 0, intervalTotal = 0, intervalMax = 0;
        const draw = (now: number) => {
            frame = 0;
            if (disposed) return;
            const started = performance.now();
            timeline.frame(now);
            // Hidden (garage) cars take no part in lanes or label placement; the set is read per frame from React's attributes.
            const cars = all.filter(el => el.dataset.hidden !== '1');
            const samples = cars.map(el => { const progress = timeline.progress(el.dataset.car!); const sample = path.sample(progress), before = path.sample(progress-.0015), after = path.sample(progress+.0015);
                const dx=after.x-before.x, dy=after.y-before.y, length=Math.hypot(dx,dy)||1;
                return { progress, sample: {...sample,tangentX:dx/length,tangentY:dy/length}, ...project(sample) }; });
            const offsets = packs.frame(cars.map((el,i) => ({ id: el.dataset.car!, progress: samples[i].progress,
                x: samples[i].x, y: samples[i].y, nx: -samples[i].sample.tangentY, ny: samples[i].sample.tangentX,
                tier: placement.current.tiers.get(el.dataset.car!) ?? LABEL_TIER.FIELD, retired: el.classList.contains('retired') })), lapLength,
                placement.current.paused || previousTime === null ? 0 : Math.max(0, Math.min(50,now-previousTime)), placement.current.reduced && !placement.current.paused, placement.current.badgeScale, placement.current.reserved);
            cars.forEach((el,i) => {
                const p = offsets.get(el.dataset.car!)!;
                el.setAttribute('transform', `translate(${p.x} ${p.y})`);
                el.dataset.visualProgress = String(samples[i].progress);
                el.dataset.lateralOffset = String(p.offset);
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
            if (timeline.pending || (!placement.current.paused && !placement.current.reduced && packs.pending)) frame = requestAnimationFrame(draw);
            else previousTime = null;
        };
        wake.current = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };
        wake.current();
        return () => { disposed = true; cancelAnimationFrame(frame); wake.current = () => {}; };
    }, [timeline, path, project]);
    useEffect(() => {
        timeline.reconcile(targets(rows), checkpoint, control);
        timeline.configure(motion, checkpointDuration(speed, control, skipping) + latencyMs, reduceMotion || systemReduced);
        wake.current();
    }, [timeline, rows, checkpoint, motion, speed, control, skipping, latencyMs, reduceMotion, systemReduced]);
    // Priority, locale and resize changes wake the shared renderer; paused longitudinal motion stays frozen.
    useEffect(() => { placement.current = { tiers: labelTierMap, paused: motion === 'paused', reduced: reduceMotion || systemReduced, badgeScale, reserved }; wake.current(); }, [labelTierMap, motion, reduceMotion, systemReduced, badgeScale, reserved]);
    const d = layout.points.map((p, i) => { const q = project(p); return `${i ? 'L' : 'M'}${q.x},${q.y}`; }).join(' ') + ' Z';
    const byTier = [...rows].sort((a, b) => tierOf(b.id) - tierOf(a.id)); // Highest priority drawn last (on top).
    return <svg ref={svg} className="circuit-map" viewBox="0 0 1000 650" aria-label={t('viewer.map')} role="group" data-layout={layout.id} data-checkpoint={checkpoint} data-motion={motion}>
        <defs><pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#242c32" strokeWidth="1"/></pattern></defs>
        <rect width="1000" height="650" fill="url(#map-grid)" opacity=".55"/>
        <path d={d} fill="none" stroke="#070b0e" strokeWidth="30" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#53606c" strokeWidth="18" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#a6b4bf" strokeWidth="1.5" strokeDasharray="5 13" opacity=".4"/>
        {byTier.map(r => { const p = initial.get(r.id) ?? start, tier = tierOf(r.id), chosen = r.id === selected; return <g key={r.id} data-car={r.id} data-tier={tier} data-hidden={r.hidden ? '1' : '0'} visibility={r.hidden ? 'hidden' : undefined} aria-hidden={r.hidden || undefined} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={r.hidden ? -1 : 0} aria-label={`${r.name} · ${t('race.position')} ${r.entrant.position} · ${t(`incident.${r.status}`)}${r.player ? ` · ${t('viewer.player')}` : ''}`} aria-pressed={chosen} onClick={() => onSelect(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }} className={`map-car ${r.hidden ? 'in-garage' : ''} ${r.status === 'RETIRED' ? 'retired' : ''} ${r.player ? 'player' : ''} ${chosen ? 'selected' : ''}`}>
            <title>{`${r.name} · ${r.team} · ${t('race.position')} ${r.entrant.position}`}</title>
            <g transform={`scale(${badgeScale})`}>
            <rect x={-BADGE.w/2-4} y={-BADGE.h/2-4} width={BADGE.w+8} height={BADGE.h+8} rx="8" fill="transparent"/>
            {chosen && <rect className="selected-ring" x={-BADGE.w/2-3} y={-BADGE.h/2-3} width={BADGE.w+6} height={BADGE.h+6} rx="7" fill="none" stroke="white" strokeWidth="2"/>}
            <rect className="driver-badge" x={-BADGE.w/2} y={-BADGE.h/2} width={BADGE.w} height={BADGE.h} rx="5" fill={r.color} stroke={r.player ? '#ffffff' : '#101820'} strokeWidth={r.player ? 2 : 1.5}/>
            <text textAnchor="middle" y="5" fill={badgeText(r.color)} fontSize="16" fontWeight="800">{r.abbreviation}</text>
            {r.player && !chosen && <path className="teammate-mark" d="M -8 10 L 8 10" stroke={badgeText(r.color)} strokeWidth="2"/>}
            {r.status === 'RETIRED' && <path className="retired-mark" d="M 18 -16 L 25 -9 M 18 -9 L 25 -16" stroke="#fff" strokeWidth="2"/>}
            {r.pitting && <text className="pit-mark" x="0" y="-17" textAnchor="middle" fill="#e8c86b" fontSize="11" fontWeight="800" stroke="#0b1116" strokeWidth="3" paintOrder="stroke">{t('viewer.pit')}</text>}
            </g>
        </g>; })}
        <g className="start-finish" transform={`translate(${start.x} ${start.y})`} pointerEvents="none"><path transform={`rotate(${angle})`} d="M 0 -14 L 0 14" stroke="white" strokeWidth="6"/><text x="-35" y="40" fill="#dfe8ee" fontSize="18" fontWeight="600" stroke="#0b1116" strokeWidth="4" paintOrder="stroke">{startText}</text></g>
    </svg>;
}

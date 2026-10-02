"use client";
import { samplePitRoute,type PitRouteGeometry } from '../../../game/domain/pit-geometry';
import type { RouteFrame } from './motion';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CircuitMapLayout, MapPoint } from '../../../game/domain/circuit-layout';
import { prepareCircuitPath, circuitProjection } from '../../../game/domain/circuit-geometry';
import type { timingRows } from './model';
import { RaceMotion, checkpointDuration, type MotionMode } from './motion';
import { useI18n } from '../../../i18n/provider';
import { pathLength, LABEL_TIER } from './labels';
import { prepareVisualSpeed } from './speed-profile';
import { MarkerPacks, RaceMarkerPacks, BADGE, RACE_BUBBLE, badgeText, raceBubbleScale, clampBadgeCenter } from './marker-packs';
import { gridDisplay, gridSlot, type GridSlot } from './grid-markers';
/**
 * What the map needs from a row (Race timing rows satisfy it structurally; Practice builds its own). `hidden` cars are
 * in the garage: kept in the motion model so they re-emerge smoothly, but not drawn, focusable or labelled.
 */
export interface MapRow {
    route?:RouteFrame['route'];routeHistory?:readonly RouteFrame[];id: string; progress: number; status: ReturnType<typeof timingRows>[number]['status']; name: string; team: string; player: boolean;
    color: string; abbreviation: string; pitting: boolean; entrant: { position: number }; gridPosition?: number; hidden?: boolean; lapsDown?: number;
}
type Rows = readonly MapRow[];
const subscribeMotion = (notify: () => void) => { const media = window.matchMedia('(prefers-reduced-motion: reduce)'); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify); };
const getMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const targets = (rows: readonly MapRow[]) => rows.map(r => ({ id: r.id, progress: r.progress, retired: r.status === 'RETIRED',route:r.route,observations:r.routeHistory }));
/** Tallest Race canvas (viewBox units) for phone-width maps, where a portrait-oriented circuit may use the height. */
export const COMPACT_MAP_MAX_HEIGHT = 1290;
/**
 * Aspect-aware canvas fitting the circuit and its pit lane; the projection still uses one scale on both axes. Phone-width
 * maps (`compact`) may grow taller so a portrait-oriented circuit is not squeezed into a strip.
 */
export function raceMapCanvas(layout: CircuitMapLayout, compact = false, extra: readonly MapPoint[] = []) {
    const points=[...layout.points,...extra],xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const ratio=(Math.max(...ys)-Math.min(...ys))/(Math.max(...xs)-Math.min(...xs)||1);
    return { width: 1000, height: Math.round(Math.max(340,Math.min(compact ? COMPACT_MAP_MAX_HEIGHT : 760,968*ratio+32))), padding: 16 };
}
/** One loop for the entire field. React handles checkpoints/selection, never individual frames. */

/**
 * Every visible car is an integrated identity marker. Race viewer: a circular team-colour bubble with the abbreviation
 * inside (live-timing map style), a white outer ring for the player's cars, a strong ring for the selected car and a
 * dashed border for a lapped car. Practice / Qualifying keep the classic badge.
 */
export function TrackMap({ layout, rows, selected, onSelect, speed, reduceMotion, motion = 'paused', checkpoint = 0, control = 'GREEN', skipping = false, latencyMs = 0, startingGrid = false, tiers, authoritative = false, raceViewer = false, pitRoute, compact = false }: {
    layout: CircuitMapLayout; rows: Rows; selected: string; onSelect: (id: string) => void;
    speed: number; reduceMotion: boolean; motion?: MotionMode; checkpoint?: number; control?: string; skipping?: boolean; latencyMs?: number; startingGrid?: boolean;
    tiers?: ReadonlyMap<string, number>; authoritative?: boolean; raceViewer?: boolean;pitRoute?:PitRouteGeometry;
    /** Phone-width Race map: taller canvas allowance (orientation is chosen by the caller). */
    compact?: boolean;
}) {
    const { t, format } = useI18n(), svg = useRef<SVGSVGElement>(null);
    const systemReduced = useSyncExternalStore(subscribeMotion, getMotion, () => false);
    const MAP = useMemo(() => raceViewer ? raceMapCanvas(layout, compact, pitRoute?.points) : { width: 900, height: 650, padding: 40 },[layout, raceViewer, compact, pitRoute]);
    const [screenScale,setScreenScale]=useState(1);
    useEffect(()=>{if(!raceViewer)return;const root=svg.current!;const update=()=>setScreenScale(root.getBoundingClientRect().width/MAP.width);update();const observer=new ResizeObserver(update);observer.observe(root);return()=>observer.disconnect();},[raceViewer,MAP.width]);
    // Race bubbles keep a stable on-screen diameter (no tier-dependent growth; rings carry player/selected identity).
    const packScale=raceViewer?raceBubbleScale(screenScale,MAP.width):1;
    const path = useMemo(() => prepareCircuitPath(layout), [layout]);
    const project = useMemo(() => circuitProjection(pitRoute?[...layout.points,...pitRoute.points]:layout.points, MAP.width, MAP.height, MAP.padding), [layout, MAP,pitRoute]);
    const lapLength = useMemo(() => pathLength(progress => project(path.sample(progress))), [path, project]);
    const profiles = useMemo(() => ({ green: prepareVisualSpeed(path), neutral: prepareVisualSpeed(path, .3) }), [path]);
    const timeline = useMemo(() => new RaceMotion(targets(rows), checkpoint, authoritative ? undefined : profiles), [profiles, authoritative]); // eslint-disable-line react-hooks/exhaustive-deps
    const [grid] = useState(() => startingGrid && checkpoint === 0
        ? new Map(rows.map(r => [r.id, gridSlot(r.gridPosition ?? r.entrant.position, r.progress, lapLength)] as const))
        : new Map<string, GridSlot>());
    // Stable React transform props prevent selection/locale/checkpoint renders overwriting RAF transforms.
    const [initial] = useState(() => new Map(rows.map(r => {
        const slot = grid.get(r.id), sample = pitRoute&&r.route&&r.route!=='TRACK'?samplePitRoute(pitRoute,(slot?.progress??r.progress)%1*1e6):path.sample(slot?.progress ?? r.progress), point = project(sample);
        return [r.id, { x: point.x - sample.tangentY * (slot?.lateral ?? 0), y: point.y + sample.tangentX * (slot?.lateral ?? 0) }] as const;
    })));
    const wake = useRef<() => void>(() => {});
    const startSample = path.sample(0), start = project(startSample), angle = Math.atan2(startSample.tangentY, startSample.tangentX) * 180 / Math.PI;
    const startText = t('viewer.startFinish');
    const startTextX = Math.max(55, Math.min(MAP.width - 55, start.x)) - start.x;
    const startTextY = start.y > MAP.height - 45 ? -24 : 32;
    const labelTierMap = useMemo(() => new Map(rows.map(r => [r.id, r.id === selected ? LABEL_TIER.SELECTED : r.player ? LABEL_TIER.PLAYER : tiers?.get(r.id) ?? LABEL_TIER.FIELD])), [rows, tiers, selected]);
    const tierOf = (id: string) => labelTierMap.get(id) ?? LABEL_TIER.FIELD;
    const placement = useRef({ tiers: labelTierMap, paused: motion === 'paused', reduced: reduceMotion || systemReduced, checkpoint });
    useEffect(() => {
        const root = svg.current!;
        const all = [...root.querySelectorAll<SVGGElement>('[data-car]')];
        const packs = raceViewer ? new RaceMarkerPacks(packScale) : new MarkerPacks();
        let frame = 0, disposed = false, previousTime: number | null = null;
        let frames = 0, workTotal = 0, workMax = 0, intervalTotal = 0, intervalMax = 0;
        const draw = (now: number) => {
            frame = 0;
            if (disposed) return;
            const started = performance.now();
            timeline.frame(now);
            // Garage cars remain in the motion model but do not draw or affect local staggering.
            const cars = all.filter(el => el.dataset.hidden !== '1');
            const samples = cars.map(el => { const liveProgress = timeline.progress(el.dataset.car!);
                const slot = grid.get(el.dataset.car!), display = slot ? gridDisplay(slot, liveProgress, placement.current.checkpoint) : { progress: liveProgress, lateral: 0 };
                const progress = display.progress,route=timeline.route(el.dataset.car!);
                const sample = pitRoute&&route!=='TRACK'?samplePitRoute(pitRoute,(progress%1)*1e6):path.sample(progress);
                const before = path.sample(progress-.0015), after = path.sample(progress+.0015);
                const dx=after.x-before.x, dy=after.y-before.y, length=Math.hypot(dx,dy)||1;
                return { progress, lateral: display.lateral, sample: route!=='TRACK'?sample:{...sample,tangentX:dx/length,tangentY:dy/length}, ...project(sample) }; });
            const offsets = packs.frame(cars.map((el,i) => ({ id: el.dataset.car!, progress: samples[i].progress,
                x: samples[i].x - samples[i].sample.tangentY * samples[i].lateral,
                y: samples[i].y + samples[i].sample.tangentX * samples[i].lateral,
                nx: -samples[i].sample.tangentY, ny: samples[i].sample.tangentX,
                tier: placement.current.tiers.get(el.dataset.car!) ?? LABEL_TIER.FIELD, retired: el.classList.contains('retired') })), lapLength,
                placement.current.paused || previousTime === null ? 0 : Math.max(0, Math.min(50,now-previousTime)), placement.current.reduced && !placement.current.paused);
            cars.forEach((el,i) => {
                const offset = offsets.get(el.dataset.car!)!;
                const p = raceViewer?{...offset,...clampBadgeCenter(offset.x,offset.y,MAP.width,MAP.height,packScale)}:offset;
                el.dataset.visualRoute=timeline.route(el.dataset.car!);
                el.setAttribute('transform', `translate(${p.x} ${p.y})`);
                el.dataset.visualProgress = String(samples[i].progress);
                el.dataset.lateralOffset = String(samples[i].lateral + p.offset);
                el.dataset.grid = grid.has(el.dataset.car!) && placement.current.checkpoint === 0 ? '1' : '0';
                const tether=el.querySelector('.track-anchor');
                // A short anchor line only for a bubble pushed out to an outer lane (well clear of its track position).
                if(tether){tether.setAttribute('x2',String(samples[i].x-p.x));tether.setAttribute('y2',String(samples[i].y-p.y));tether.setAttribute('opacity',Math.hypot(samples[i].x-p.x,samples[i].y-p.y)>2*RACE_BUBBLE.r*packScale*1.1?'.55':'0');}
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
    }, [timeline, path, project, grid, lapLength, raceViewer,pitRoute,packScale,MAP]);
    useEffect(() => {
        timeline.reconcile(targets(rows), checkpoint, control);
        timeline.configure(motion, checkpointDuration(speed, control, skipping) + latencyMs, reduceMotion || systemReduced);
        wake.current();
    }, [timeline, rows, checkpoint, motion, speed, control, skipping, latencyMs, reduceMotion, systemReduced]);
    // Priority, locale and resize changes wake the shared renderer; paused longitudinal motion stays frozen.
    useEffect(() => { placement.current = { tiers: labelTierMap, paused: motion === 'paused', reduced: reduceMotion || systemReduced, checkpoint }; wake.current(); }, [labelTierMap, motion, reduceMotion, systemReduced, checkpoint]);
    const d = layout.points.map((p, i) => { const q = project(p); return `${i ? 'L' : 'M'}${q.x},${q.y}`; }).join(' ') + ' Z';
    const byTier = rows.filter(r => !authoritative || r.status !== 'RETIRED').sort((a, b) => tierOf(b.id) - tierOf(a.id) || a.id.localeCompare(b.id)); // Highest priority drawn last.
    return <svg ref={svg} className="circuit-map" viewBox={`0 0 ${MAP.width} ${MAP.height}`} aria-label={t('viewer.map')} role="group" data-layout={layout.id} data-checkpoint={checkpoint} data-motion={motion}>
        <defs><pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#242c32" strokeWidth="1"/></pattern></defs>
        <rect width={MAP.width} height={MAP.height} fill="url(#map-grid)" opacity=".55"/>
        <path d={d} fill="none" stroke="#070b0e" strokeWidth="30" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#53606c" strokeWidth="18" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#a6b4bf" strokeWidth="1.5" strokeDasharray="5 13" opacity=".4"/>
        {pitRoute&&(()=>{const pd=pitRoute.points.map((p,i)=>{const q=project(p);return `${i?'L':'M'}${q.x},${q.y}`;}).join(' '),g=project(samplePitRoute(pitRoute,pitRoute.service));
            // Secondary to the racing line: a slim muted lane with a dark casing and a small garage tick (no colour-only meaning).
            return <g className="pit-lane" pointerEvents="none"><path d={pd} fill="none" stroke="#070b0e" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round"/><path className="pit-route" d={pd} fill="none" stroke="#8a98a4" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"/><circle className="pit-garage" cx={g.x} cy={g.y} r="4.5" fill="#0b1116" stroke="#c9d3db" strokeWidth="1.5"><title>{t('viewer.pit')}</title></circle></g>;})()}
        {raceViewer
            // Race map: a compact chequered line across the track (no text label that could cover nearby bubbles).
            ? <g className="start-finish compact" transform={`translate(${start.x} ${start.y}) rotate(${angle})`} pointerEvents="none" role="img" aria-label={startText}><title>{startText}</title>
                <rect x="-3.5" y="-15" width="7" height="30" fill="#0b1116"/>{[-15,-9,-3,3,9].map((y,i)=><g key={y}><rect x="-3.5" y={y} width="3.5" height="6" fill={i%2?'#0b1116':'#f2f5f7'}/><rect x="0" y={y} width="3.5" height="6" fill={i%2?'#f2f5f7':'#0b1116'}/></g>)}</g>
            : <g className="start-finish" transform={`translate(${start.x} ${start.y})`} pointerEvents="none"><path transform={`rotate(${angle})`} d="M 0 -12 L 0 12" stroke="white" strokeWidth="4"/><text x={startTextX} y={startTextY} textAnchor="middle" fill="#dfe8ee" fontSize="13" fontWeight="700" stroke="#0b1116" strokeWidth="3" paintOrder="stroke">{startText}</text></g>}
        {byTier.map(r => { const p = initial.get(r.id) ?? start, tier = tierOf(r.id), chosen = r.id === selected; return <g key={r.id} data-car={r.id} data-tier={tier} data-hidden={r.hidden ? '1' : '0'} visibility={r.hidden ? 'hidden' : undefined} aria-hidden={r.hidden || undefined} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={r.hidden ? -1 : 0} aria-label={`${r.name} · ${t('race.position')} ${r.entrant.position} · ${t(`incident.${r.status}`)}${r.player ? ` · ${t('viewer.player')}` : ''}${r.lapsDown ? ` · ${t('viewer.lapsDown', { count: format.number(r.lapsDown) })}` : ''}`} aria-pressed={chosen} onClick={() => onSelect(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }} className={`map-car ${r.hidden ? 'in-garage' : ''} ${r.status === 'RETIRED' ? 'retired' : ''} ${r.player ? 'player' : ''} ${chosen ? 'selected' : ''} ${r.lapsDown ? 'lapped' : ''}`}>
            <title>{`${r.name} · ${r.team} · ${t('race.position')} ${r.entrant.position}`}</title>
            {raceViewer && <line className="track-anchor" x1="0" y1="0" x2="0" y2="0" stroke={r.color} strokeWidth="1" opacity="0" pointerEvents="none"/>}
            {raceViewer ? <g className="badge-content bubble" transform={`scale(${packScale})`}>
            <circle className="hit-area" r={RACE_BUBBLE.r+5} fill="transparent"/>
            {chosen && <circle className="selected-ring" r={RACE_BUBBLE.r+5} fill="none" stroke="#ffffff" strokeWidth="2.6"/>}
            {r.player && <circle className="player-ring" r={RACE_BUBBLE.r+2.3} fill="#0b1116" stroke="#ffffff" strokeWidth="1.5"/>}
            <circle className="driver-bubble" r={RACE_BUBBLE.r} fill={r.color} stroke={r.lapsDown ? '#f1dc9a' : '#0b1116'} strokeWidth={r.lapsDown ? 1.6 : 1.2} strokeDasharray={r.lapsDown ? '2.6 2' : undefined}/>
            <text className="bubble-label" textAnchor="middle" dominantBaseline="central" y="0.4" fill={badgeText(r.color)} fontSize="8.8" fontWeight="800" letterSpacing="-0.3">{r.abbreviation}</text>
            {r.status === 'RETIRED' && <path className="retired-mark" d="M 8 -13 L 13 -8 M 8 -8 L 13 -13" stroke="#fff" strokeWidth="1.8"/>}
            {r.pitting && <text className="pit-mark" x="0" y={-(RACE_BUBBLE.r+6)} textAnchor="middle" fill="#e8c86b" fontSize="7.5" fontWeight="800" stroke="#0b1116" strokeWidth="2.2" paintOrder="stroke">{t('viewer.pit')}</text>}
            </g> : <g className="badge-content">
            <rect x={-BADGE.w/2-4} y={-BADGE.h/2-4} width={BADGE.w+8} height={BADGE.h+8} rx={16} fill="transparent"/>
            {chosen && <rect className="selected-ring" x={-BADGE.w/2-3} y={-BADGE.h/2-3} width={BADGE.w+6} height={BADGE.h+6} rx={15} fill="none" stroke="white" strokeWidth="2"/>}
            <rect className="driver-badge" x={-BADGE.w/2} y={-BADGE.h/2} width={BADGE.w} height={BADGE.h} rx={BADGE.h/2} fill={r.color} stroke={r.player ? '#ffffff' : '#101820'} strokeWidth={r.player ? 1.8 : 1.4} strokeDasharray={r.lapsDown ? '3 2' : undefined}/>
            <text textAnchor="middle" y={4.5} fill={badgeText(r.color)} fontSize={14} fontWeight="800">{r.abbreviation}</text>
            {!!r.lapsDown && <text className="lapped-mark" x="13" y="-9" textAnchor="end" fill="#e4d195" fontSize="8" stroke="#0b1116" strokeWidth="2" paintOrder="stroke">−{format.number(r.lapsDown)}</text>}
            {r.status === 'RETIRED' && <path className="retired-mark" d="M 14 -17 L 20 -11 M 14 -11 L 20 -17" stroke="#fff" strokeWidth="1.8"/>}
            {r.pitting && <text className="pit-mark" x="0" y="-16" textAnchor="middle" fill="#e8c86b" fontSize="9" fontWeight="800" stroke="#0b1116" strokeWidth="2.5" paintOrder="stroke">{t('viewer.pit')}</text>}
            </g>}
        </g>; })}

    </svg>;
}

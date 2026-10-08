"use client";
import { samplePitRoute,type PitRouteGeometry } from '../../../game/domain/pit-geometry';
import type { RouteFrame } from './motion';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CircuitMapLayout, MapPoint } from '../../../game/domain/circuit-layout';
import { prepareCircuitPath, circuitProjection } from '../../../game/domain/circuit-geometry';
import type { timingRows } from './model';
import { RaceMotion, checkpointDuration, type MotionMode } from './motion';
import { useI18n } from '../../../i18n/provider';
import { pathLength, LABEL_TIER } from './labels';
import { prepareVisualSpeed } from './speed-profile';
import { MarkerPacks, BADGE, RACE_BUBBLE, badgeText, raceBubbleScale } from './marker-packs';
import { anchorRaceMarker, effectiveSvgScale, nextScreenScale, raceDrawOrder, raceMapPadding, raceTrackStyle, svgNumber, svgPath } from './race-map-style';
import { gridDisplay, gridSlot, type GridSlot } from './grid-markers';
import { environmentDetail, type EnvironmentDetail } from './environment-geometry';
import { TrackEnvironmentLayer, type TrackEnvironment } from './track-environment';
import { boundCamera, cameraPoint, focusCamera, overviewCamera, panCamera, settleCamera, type TrackCamera } from './track-camera';
import { placeTrackLabels } from './track-labels';
import { TrackCameraControls } from './track-camera-controls';
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
export function raceMapCanvas(layout: CircuitMapLayout, compact = false, extra: readonly MapPoint[] = [], padding = 16) {
    const points=[...layout.points,...extra],xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const ratio=(Math.max(...ys)-Math.min(...ys))/(Math.max(...xs)-Math.min(...xs)||1);
    return { width: 1000, height: Math.round(Math.max(340,Math.min(compact ? COMPACT_MAP_MAX_HEIGHT : 760,(1000-2*padding)*ratio+2*padding))), padding };
}
/** One loop for the entire field. React handles checkpoints/selection, never individual frames. */

/**
 * Race anchors remain true route samples: quiet field dots, own-car rings and selected shape cues, with separate
 * collision-aware callouts. Practice / Qualifying keep their accepted classic badges and packing behavior.
 */
export function TrackMap({ layout, rows, selected, onSelect, speed, reduceMotion, motion = 'paused', checkpoint = 0, control = 'GREEN', skipping = false, latencyMs = 0, startingGrid = false, tiers, authoritative = false, raceViewer = false, pitRoute, compact = false, environment, expanded = false, onExpand }: {
    layout: CircuitMapLayout; rows: Rows; selected: string; onSelect: (id: string) => void;
    speed: number; reduceMotion: boolean; motion?: MotionMode; checkpoint?: number; control?: string; skipping?: boolean; latencyMs?: number; startingGrid?: boolean;
    tiers?: ReadonlyMap<string, number>; authoritative?: boolean; raceViewer?: boolean;pitRoute?:PitRouteGeometry;
    /** Phone-width Race map: taller canvas allowance (orientation is chosen by the caller). */
    compact?: boolean;
    environment?: TrackEnvironment; expanded?: boolean; onExpand?: () => void;
}) {
    const { t, format } = useI18n(), svg = useRef<SVGSVGElement>(null);
    const systemReduced = useSyncExternalStore(subscribeMotion, getMotion, () => false);
    const [screenScale,setScreenScale]=useState(1);
    const [detail, setDetail] = useState<EnvironmentDetail>('LOW'), [scenery, setScenery] = useState(true);
    const [camera, setCamera] = useState<TrackCamera>(overviewCamera);
    const cameraConfig = useRef(camera), cameraLive = useRef<TrackCamera>(overviewCamera());
    const identity = useRef({ selected, players: new Set(rows.filter(r => r.player).map(r => r.id)), screenScale });
    const drag = useRef<{ x: number; y: number; camera: TrackCamera } | null>(null);
    // Scenery never reframes the track when toggled. Far forests/water are clipped by the canvas, not fitted as giant extents.
    const environmentExtent = useMemo(() => environment?.features.filter(f => !['FOREST', 'WATER'].includes(f.kind)).flatMap(f => f.points).filter(p => p.x >= -.08 && p.x <= 1.08 && p.y >= -.08 && p.y <= 1.08) ?? [], [environment]);
    const fitPoints = useMemo(() => [...layout.points, ...(pitRoute?.points ?? []), ...environmentExtent], [layout, pitRoute, environmentExtent]);
    // Race bubbles keep a stable on-screen diameter (no tier-dependent growth; rings carry player/selected identity). The
    // size class follows the drawn map width (effective scale × 1000 viewBox units).
    const packScale=raceViewer?raceBubbleScale(screenScale,1000):1;
    // Padding fits a selected bubble at the canvas edge, so no marker is ever clamped away from its route.
    const MAP = useMemo(() => raceViewer ? raceMapCanvas(layout, compact, [...(pitRoute?.points ?? []), ...environmentExtent], raceMapPadding(packScale) + (environment ? 12 : 0)) : { width: 900, height: 650, padding: 40 },[layout, raceViewer, compact, pitRoute, packScale, environmentExtent, environment]);
    // Bubble size follows the ACTUAL rendered scale (uniform meet fit: the smaller of width and height ratio), so a portrait
    // viewBox in a height-capped box keeps the intended on-screen size. Client-only state; the server renders scale 1.
    useEffect(()=>{if(!raceViewer)return;const root=svg.current!;const update=()=>{const box=root.getBoundingClientRect();setScreenScale(previous=>nextScreenScale(previous,effectiveSvgScale(box,MAP)));const effective=effectiveSvgScale(box,MAP) ?? 0;setDetail(environmentDetail(MAP.width*effective,MAP.height*effective));};update();const observer=new ResizeObserver(update);observer.observe(root);return()=>observer.disconnect();},[raceViewer,MAP]);
    const style = raceTrackStyle(2 * RACE_BUBBLE.r * packScale);
    const path = useMemo(() => prepareCircuitPath(layout), [layout]);
    const project = useMemo(() => circuitProjection(fitPoints, MAP.width, MAP.height, MAP.padding), [fitPoints, MAP]);
    const lapLength = useMemo(() => pathLength(progress => project(path.sample(progress))), [path, project]);
    const profiles = useMemo(() => ({ green: prepareVisualSpeed(path), neutral: prepareVisualSpeed(path, .3) }), [path]);
    // Motion state is separate from presentation geometry. The authoritative (v8) timeline is created once per map and
    // never depends on the drawn path, so a responsive re-orientation / re-fit re-projects the SAME live progress instead
    // of rebuilding motion from the checkpoint. Practice / Qualifying keep their path-derived visual speed profiles.
    const [authoritativeTimeline] = useState(() => authoritative ? new RaceMotion(targets(rows), checkpoint) : null);
    const timeline = useMemo(() => authoritativeTimeline ?? new RaceMotion(targets(rows), checkpoint, profiles), [authoritativeTimeline, profiles]); // eslint-disable-line react-hooks/exhaustive-deps
    // The starting-grid decision and grid order are frozen at mount; slot spacing follows the current screen lap length.
    const [gridSeed] = useState(() => startingGrid && checkpoint === 0 ? rows.map(r => ({ id: r.id, position: r.gridPosition ?? r.entrant.position, progress: r.progress })) : []);
    const grid = useMemo(() => new Map<string, GridSlot>(gridSeed.map(g => [g.id, gridSlot(g.position, g.progress, lapLength)] as const)), [gridSeed, lapLength]);
    // Stable React transform props prevent selection/locale/checkpoint renders overwriting RAF transforms.
    const [initial] = useState(() => new Map(rows.map(r => {
        const slot = grid.get(r.id), sample = pitRoute&&r.route&&r.route!=='TRACK'?samplePitRoute(pitRoute,(slot?.progress??r.progress)%1*1e6):path.sample(slot?.progress ?? r.progress), point = project(sample);
        return [r.id, raceViewer ? anchorRaceMarker({ ...sample, ...point }, slot?.lateral ?? 0, style.corridor) : { x: point.x - sample.tangentY * (slot?.lateral ?? 0), y: point.y + sample.tangentX * (slot?.lateral ?? 0) }] as const;
    })));
    const wake = useRef<() => void>(() => {});
    const startSample = path.sample(0), start = project(startSample), angle = Math.atan2(startSample.tangentY, startSample.tangentX) * 180 / Math.PI;
    const startText = t('viewer.startFinish');
    const startTextX = Math.max(55, Math.min(MAP.width - 55, start.x)) - start.x;
    const startTextY = start.y > MAP.height - 45 ? -24 : 32;
    const labelTierMap = useMemo(() => new Map(rows.map(r => [r.id, r.id === selected ? LABEL_TIER.SELECTED : r.player ? LABEL_TIER.PLAYER : tiers?.get(r.id) ?? LABEL_TIER.FIELD])), [rows, tiers, selected]);
    const tierOf = (id: string) => labelTierMap.get(id) ?? LABEL_TIER.FIELD;
    const placement = useRef({ tiers: labelTierMap, paused: motion === 'paused', reduced: reduceMotion || systemReduced, checkpoint });
    // Layout effect: when geometry changes (resize, re-orientation, re-fit) the current live progress is re-projected before
    // the browser paints, so no frame shows markers at the previous projection.
    useLayoutEffect(() => {
        const root = svg.current!;
        const all = [...root.querySelectorAll<SVGGElement>('[data-car]')];
        const cameraGroup = root.querySelector<SVGGElement>('[data-map-camera]');
        const fixed = [...root.querySelectorAll<SVGGElement>('[data-screen-fixed]')];
        const strokes = [...root.querySelectorAll<SVGElement>('[data-map-stroke]')];
        const densityNote = root.closest('.track-viewer')?.querySelector<HTMLElement>('[data-density-note]');
        // Race viewer: no collision packing at all (markers sit on their route sample; overlap is allowed).
        const packs = raceViewer ? null : new MarkerPacks();
        let frame = 0, disposed = false, previousTime: number | null = null;
        let frames = 0, workTotal = 0, workMax = 0, intervalTotal = 0, intervalMax = 0;
        const draw = (now: number) => {
            frame = 0;
            if (disposed) return;
            const started = performance.now();
            timeline.frame(now);
            // Garage cars remain in the motion model but do not draw or affect local staggering.
            const cars = all.filter(el => el.dataset.hidden !== '1' && root.contains(el));
            const samples = cars.map(el => { const liveProgress = timeline.progress(el.dataset.car!);
                const slot = grid.get(el.dataset.car!), display = slot ? gridDisplay(slot, liveProgress, placement.current.checkpoint) : { progress: liveProgress, lateral: 0 };
                const progress = display.progress,route=timeline.route(el.dataset.car!);
                const sample = pitRoute&&route!=='TRACK'?samplePitRoute(pitRoute,(progress%1)*1e6):path.sample(progress);
                const before = path.sample(progress-.0015), after = path.sample(progress+.0015);
                const dx=after.x-before.x, dy=after.y-before.y, length=Math.hypot(dx,dy)||1;
                return { progress, lateral: display.lateral, sample: route!=='TRACK'?sample:{...sample,tangentX:dx/length,tangentY:dy/length}, ...project(sample) }; });
            const offsets = !packs ? new Map(cars.map((el,i) => [el.dataset.car!, { ...anchorRaceMarker({ ...samples[i].sample, x: samples[i].x, y: samples[i].y }, samples[i].lateral, style.corridor), offset: 0 }])) : packs.frame(cars.map((el,i) => ({ id: el.dataset.car!, progress: samples[i].progress,
                x: samples[i].x - samples[i].sample.tangentY * samples[i].lateral,
                y: samples[i].y + samples[i].sample.tangentX * samples[i].lateral,
                nx: -samples[i].sample.tangentY, ny: samples[i].sample.tangentX,
                tier: placement.current.tiers.get(el.dataset.car!) ?? LABEL_TIER.FIELD, retired: el.classList.contains('retired') })), lapLength,
                placement.current.paused || previousTime === null ? 0 : Math.max(0, Math.min(50,now-previousTime)), placement.current.reduced && !placement.current.paused);
            cars.forEach((el,i) => {
                const offset = offsets.get(el.dataset.car!)!;
                const p = offset;
                el.dataset.visualRoute=timeline.route(el.dataset.car!);
                el.setAttribute('transform', `translate(${p.x} ${p.y})`);
                el.dataset.visualProgress = String(samples[i].progress);
                el.dataset.lateralOffset = String(samples[i].lateral + p.offset);
                el.dataset.grid = grid.has(el.dataset.car!) && placement.current.checkpoint === 0 ? '1' : '0';
            });
            let cameraPending = false;
            if (raceViewer && cameraGroup) {
                const wanted = cameraConfig.current, chosen = cars.findIndex(el => el.dataset.car === identity.current.selected);
                const p = chosen >= 0 ? offsets.get(identity.current.selected) : null;
                const target = wanted.mode === 'focus' ? p ? focusCamera(wanted, { x: p.x / MAP.width, y: p.y / MAP.height }) : overviewCamera() : wanted;
                const settled = settleCamera(cameraLive.current, target, previousTime === null ? 16 : now - previousTime, placement.current.reduced);
                cameraLive.current = settled.camera; cameraPending = settled.pending;
                const cam = settled.camera, tx = MAP.width / 2 - cam.center.x * MAP.width * cam.zoom, ty = MAP.height / 2 - cam.center.y * MAP.height * cam.zoom;
                cameraGroup.setAttribute('transform', `translate(${tx} ${ty}) scale(${cam.zoom})`);
                root.dataset.camera = target.mode; root.dataset.zoom = String(cam.zoom);
                fixed.forEach(el => el.setAttribute('transform', `scale(${el.dataset.screenFixed === 'marker' ? packScale / cam.zoom : 1 / cam.zoom})`));
                strokes.forEach(el => el.setAttribute('stroke-width', String(Number(el.dataset.mapStroke) / cam.zoom)));
                const scale = identity.current.screenScale, anchors = cars.map(el => {
                    const id = el.dataset.car!, point = cameraPoint(offsets.get(id)!, cam, MAP.width, MAP.height);
                    return { id, x: point.x * scale, y: point.y * scale, selected: id === identity.current.selected, player: identity.current.players.has(id), width: 76 };
                });
                const labels = placeTrackLabels(anchors, MAP.width * scale, MAP.height * scale);
                if (densityNote) densityNote.hidden = !anchors.some((a, i) => anchors.some((b, j) => j > i && Math.hypot(a.x - b.x, a.y - b.y) < 9));
                cars.forEach(el => { const label = el.querySelector<SVGGElement>('[data-map-label]'); if (!label) return;
                    const position = labels.get(el.dataset.car!); label.style.display = position ? '' : 'none';
                    if (position) label.setAttribute('transform', `translate(${position.x / (packScale * scale)} ${position.y / (packScale * scale)})`);
                });
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
            if (timeline.pending || cameraPending || (packs && !placement.current.paused && !placement.current.reduced && packs.pending)) frame = requestAnimationFrame(draw);
            else previousTime = null;
        };
        wake.current = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };
        draw(performance.now());
        return () => { disposed = true; cancelAnimationFrame(frame); wake.current = () => {}; };
    }, [timeline, path, project, grid, lapLength, raceViewer,pitRoute,style.corridor,MAP,packScale]);
    useEffect(() => {
        timeline.reconcile(targets(rows), checkpoint, control);
        timeline.configure(motion, checkpointDuration(speed, control, skipping) + latencyMs, reduceMotion || systemReduced);
        wake.current();
    }, [timeline, rows, checkpoint, motion, speed, control, skipping, latencyMs, reduceMotion, systemReduced]);
    // Priority, locale and resize changes wake the shared renderer; paused longitudinal motion stays frozen.
    useEffect(() => { placement.current = { tiers: labelTierMap, paused: motion === 'paused', reduced: reduceMotion || systemReduced, checkpoint }; wake.current(); }, [labelTierMap, motion, reduceMotion, systemReduced, checkpoint]);
    useLayoutEffect(() => { cameraConfig.current = camera; identity.current = { selected, players: new Set(rows.filter(r => r.player).map(r => r.id)), screenScale }; wake.current(); }, [camera, selected, rows, screenScale]);
    const changeCamera = (next: TrackCamera) => { const bounded = boundCamera(next); cameraConfig.current = bounded; setCamera(bounded); wake.current(); };
    // Canonical display numbers: identical server and client attribute strings (see race-map-style.ts).
    const d = svgPath(layout.points.map(project), true);
    const byTier = raceViewer
        ? raceDrawOrder(rows.filter(r => !authoritative || r.status !== 'RETIRED').map(r => ({ id: r.id, position: r.entrant.position, player: r.player, retired: r.status === 'RETIRED' })), selected).map(id => rows.find(r => r.id === id)!)
        : rows.filter(r => !authoritative || r.status !== 'RETIRED').sort((a, b) => tierOf(b.id) - tierOf(a.id) || a.id.localeCompare(b.id)); // Highest priority drawn last.
    const neutralised = control === 'SAFETY_CAR' || control === 'VSC';
    const mapSvg = <svg ref={svg} className="circuit-map" viewBox={`0 0 ${MAP.width} ${MAP.height}`} aria-label={t('viewer.map')} role="group" data-layout={layout.id} data-checkpoint={checkpoint} data-motion={motion} data-control={raceViewer ? control : undefined}
        onPointerDown={e => { if (!raceViewer || e.pointerType !== 'mouse' || cameraLive.current.zoom <= 1 || (e.target as Element).closest('[data-car]')) return; drag.current = { x: e.clientX, y: e.clientY, camera: cameraLive.current }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { const start = drag.current; if (!start) return; const box = e.currentTarget.getBoundingClientRect(); const scale = effectiveSvgScale(box, MAP) ?? 1; changeCamera(panCamera(start.camera, (start.x - e.clientX) / (scale * MAP.width), (start.y - e.clientY) / (scale * MAP.height))); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {raceViewer && <rect width={MAP.width} height={MAP.height} className="track-ground" aria-hidden="true"/>}
        <g data-map-camera={raceViewer ? '' : undefined}>
        {raceViewer ? <>
            {scenery && <TrackEnvironmentLayer environment={environment} detail={detail} project={project}/>}
            {/* Pit lane first: the racing line overlays its joins, so entry and exit read as branches of the circuit. */}
            {pitRoute && (() => { const pd = svgPath(pitRoute.points.map(project)), g = project(samplePitRoute(pitRoute, pitRoute.service));
                return <g className="pit-lane" pointerEvents="none"><path d={pd} fill="none" stroke="#04070a" data-map-stroke={style.pitCasing} strokeWidth={svgNumber(style.pitCasing)} strokeLinejoin="round" strokeLinecap="round"/><path className="pit-route" d={pd} fill="none" stroke="#76848f" data-map-stroke={style.pitSurface} strokeWidth={svgNumber(style.pitSurface)} strokeLinejoin="round" strokeLinecap="round"/><circle className="pit-garage" cx={svgNumber(g.x)} cy={svgNumber(g.y)} r={svgNumber(style.pitCasing * .55)} fill="#0b1116" stroke="#c9d3db" data-map-stroke={style.edge} strokeWidth={svgNumber(style.edge)}><title>{t('viewer.pit')}</title></circle></g>; })()}
            {/* Racing line: dark casing, light kerb edge, darker surface (amber edge under Safety Car / VSC as a supplementary cue). */}
            <g className="race-track" pointerEvents="none">
                <path className="track-shadow" d={d} transform="translate(1 3)" fill="none" stroke="#061219" data-map-stroke={style.casing + 3 * packScale} strokeWidth={svgNumber(style.casing + 3 * packScale)} strokeLinejoin="round" opacity=".65"/>
                <path d={d} fill="none" stroke="#04070a" data-map-stroke={style.casing} strokeWidth={svgNumber(style.casing)} strokeLinejoin="round"/>
                <path className="track-edge" d={d} fill="none" stroke={neutralised ? '#c9a227' : '#55687e'} data-map-stroke={style.surface} strokeWidth={svgNumber(style.surface)} strokeLinejoin="round"/>
                <path className="track-surface" d={d} fill="none" stroke="#1d2a3a" data-map-stroke={style.surface - 2 * style.edge} strokeWidth={svgNumber(style.surface - 2 * style.edge)} strokeLinejoin="round"/>
            </g>
            {/* Compact chequered line across the track; no text label over the field. */}
            <g className="start-finish compact" transform={`translate(${svgNumber(start.x)} ${svgNumber(start.y)}) rotate(${svgNumber(angle)})`} pointerEvents="none" role="img" aria-label={startText}><title>{startText}</title>
                <g data-screen-fixed="unit">{(() => { const cell = style.startWidth / 2, n = Math.max(4, Math.round(style.startLength / cell)), top = -n * cell / 2;
                    return <><rect x={svgNumber(-cell - .75)} y={svgNumber(top - .75)} width={svgNumber(2 * cell + 1.5)} height={svgNumber(n * cell + 1.5)} fill="#04070a"/>{Array.from({ length: n }, (_, i) => <g key={i}><rect x={svgNumber(-cell)} y={svgNumber(top + i * cell)} width={svgNumber(cell)} height={svgNumber(cell)} fill={i % 2 ? '#04070a' : '#f2f5f7'}/><rect x="0" y={svgNumber(top + i * cell)} width={svgNumber(cell)} height={svgNumber(cell)} fill={i % 2 ? '#f2f5f7' : '#04070a'}/></g>)}</>; })()}</g></g>
        </> : <>
        <defs><pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#16212e" strokeWidth="1"/></pattern></defs>
        <rect width={MAP.width} height={MAP.height} fill="url(#map-grid)" opacity=".55"/>
        <path d={d} fill="none" stroke="#070b0e" strokeWidth="30" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#3a4d63" strokeWidth="18" strokeLinejoin="round"/>
        <path d={d} fill="none" stroke="#a6b4bf" strokeWidth="1.5" strokeDasharray="5 13" opacity=".4"/>
        <g className="start-finish" transform={`translate(${svgNumber(start.x)} ${svgNumber(start.y)})`} pointerEvents="none"><path transform={`rotate(${svgNumber(angle)})`} d="M 0 -12 L 0 12" stroke="white" strokeWidth="4"/><text x={svgNumber(startTextX)} y={startTextY} textAnchor="middle" fill="#dfe8ee" fontSize="13" fontWeight="700" stroke="#0b1116" strokeWidth="3" paintOrder="stroke">{startText}</text></g>
        </>}
        {byTier.map(r => { const p = initial.get(r.id) ?? start, tier = tierOf(r.id), chosen = r.id === selected; return <g key={r.id} data-car={r.id} data-tier={tier} data-hidden={r.hidden ? '1' : '0'} visibility={r.hidden ? 'hidden' : undefined} aria-hidden={r.hidden || undefined} transform={`translate(${svgNumber(p.x)} ${svgNumber(p.y)})`} role="button" tabIndex={r.hidden ? -1 : 0} aria-label={`${r.name} · ${t('race.position')} ${r.entrant.position} · ${t(`incident.${r.status}`)}${r.player ? ` · ${t('viewer.player')}` : ''}${r.lapsDown ? ` · ${t('viewer.lapsDown', { count: format.number(r.lapsDown) })}` : ''}`} aria-pressed={chosen} onClick={() => onSelect(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }} className={`map-car ${r.hidden ? 'in-garage' : ''} ${r.status === 'RETIRED' ? 'retired' : ''} ${r.player ? 'player' : ''} ${chosen ? 'selected' : ''} ${r.lapsDown ? 'lapped' : ''}`}>
            <title>{`${r.name} · ${r.team} · ${t('race.position')} ${r.entrant.position}`}</title>
            {raceViewer ? <g className="badge-content bubble" data-screen-fixed="marker" transform={`scale(${svgNumber(packScale)})`}>
            <circle className="hit-area" r={RACE_BUBBLE.r+5} fill="transparent"/>
            {chosen && <><circle className="selected-ring" r="11" fill="none" stroke="#f5a524" strokeWidth="2.2"/><path className="selection-ticks" d="M-14,-4 v-5 h5 M14,4 v5 h-5" stroke="#f5a524" strokeWidth="2" fill="none"/></>}
            {r.player && <circle className="player-ring" r="9" fill="#0b1116" stroke="#ffffff" strokeWidth="1.5"/>}
            <circle className="driver-bubble" r={chosen || r.player ? 6.7 : 4.6} fill={r.color} stroke={r.lapsDown ? '#f1dc9a' : '#dce7ea'} strokeWidth={r.lapsDown ? 1.6 : .8} strokeDasharray={r.lapsDown ? '2.6 2' : undefined}/>
            {(chosen || r.player) && <g data-map-label="" className="track-car-label" transform="translate(14 -30)"><rect width="72" height="24" rx="4" fill={chosen ? '#f5a524' : '#101c26'} stroke={chosen ? '#f5a524' : '#708a94'} strokeWidth="1"/><text x="6" y="16" fontSize="11" fontWeight="700" fill={chosen ? '#101010' : '#eaf1f3'}>{r.abbreviation}<tspan x="47" fontSize="10">{t('trackViewer.position', { position: format.number(r.entrant.position) })}</tspan></text></g>}
            {r.status === 'RETIRED' && <path className="retired-mark" d="M 8 -13 L 13 -8 M 8 -8 L 13 -13" stroke="#fff" strokeWidth="1.8"/>}
            {r.pitting && <text className="pit-mark" x="0" y={RACE_BUBBLE.r+12} textAnchor="middle" fill="#f5a524" fontSize="7.5" fontWeight="800" stroke="#0b1116" strokeWidth="2.2" paintOrder="stroke">{t('viewer.pit')}</text>}
            </g> : <g className="badge-content">
            <rect x={-BADGE.w/2-4} y={-BADGE.h/2-4} width={BADGE.w+8} height={BADGE.h+8} rx={16} fill="transparent"/>
            {chosen && <rect className="selected-ring" x={-BADGE.w/2-3} y={-BADGE.h/2-3} width={BADGE.w+6} height={BADGE.h+6} rx={15} fill="none" stroke="#f5a524" strokeWidth="2"/>}
            <rect className="driver-badge" x={-BADGE.w/2} y={-BADGE.h/2} width={BADGE.w} height={BADGE.h} rx={BADGE.h/2} fill={r.color} stroke={r.player ? '#ffffff' : '#101820'} strokeWidth={r.player ? 1.8 : 1.4} strokeDasharray={r.lapsDown ? '3 2' : undefined}/>
            <text textAnchor="middle" y={4.5} fill={badgeText(r.color)} fontSize={14} fontWeight="800">{r.abbreviation}</text>
            {!!r.lapsDown && <text className="lapped-mark" x="13" y="-9" textAnchor="end" fill="#e4d195" fontSize="8" stroke="#0b1116" strokeWidth="2" paintOrder="stroke">−{format.number(r.lapsDown)}</text>}
            {r.status === 'RETIRED' && <path className="retired-mark" d="M 14 -17 L 20 -11 M 14 -11 L 20 -17" stroke="#fff" strokeWidth="1.8"/>}
            {r.pitting && <text className="pit-mark" x="0" y="-16" textAnchor="middle" fill="#f5a524" fontSize="9" fontWeight="800" stroke="#0b1116" strokeWidth="2.5" paintOrder="stroke">{t('viewer.pit')}</text>}
            </g>}
        </g>; })}

        </g>
    </svg>;
    if (!raceViewer) return mapSvg;
    const available = rows.some(r => r.id === selected && !r.hidden && (!authoritative || r.status !== 'RETIRED'));
    return <div className="track-viewer" data-environment={scenery && environment ? detail : 'OFF'}>
        <TrackCameraControls camera={!available && camera.mode === 'focus' ? overviewCamera() : camera} onChange={changeCamera} available={available} scenery={scenery} onScenery={() => setScenery(value => !value)} expanded={expanded} onExpand={onExpand}/>
        <div className="track-canvas">{mapSvg}</div>
        <div className="track-caption"><span>{t(environment ? 'trackViewer.contextNote' : 'trackViewer.fallbackNote')}</span><span data-density-note="" hidden>{t('trackViewer.denseNote')}</span>{scenery && environment && <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{t('trackViewer.attribution')}</a>}</div>
    </div>;
}

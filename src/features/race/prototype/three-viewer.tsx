'use client';
import * as THREE from 'three';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RaceMotion, checkpointDuration } from '../viewer/motion';
import type { MapRow } from '../viewer/track-map';
import { boundCamera, focusCamera, overviewCamera, panCamera, settleCamera, type TrackCamera } from '../viewer/track-camera';
import { TrackCameraControls } from '../viewer/track-camera-controls';
import { placeTrackLabels } from '../viewer/track-labels';
import { useI18n } from '../../../i18n/provider';
import { sampleCar, cappedPixelRatio, type SceneGeometry } from './model';
import { buildSuzukaScene } from './scene';
import { createRenderer } from './webgl';
import styles from './prototype.module.css';
export interface ThreeViewerProps { geometry: SceneGeometry; rows: readonly MapRow[]; selected: string; onSelect: (id: string) => void; checkpoint: number; playing: boolean; speed: number; reduced: boolean; angled: boolean; onFailure: () => void }
const targets = (rows: readonly MapRow[]) => rows.map(r => ({ id: r.id, progress: r.progress, retired: r.status === 'RETIRED', route: r.route, observations: r.routeHistory }));
export default function ThreeViewer(props: ThreeViewerProps) {
    const { t, format } = useI18n();
    const host = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null), labels = useRef<HTMLDivElement>(null), wake = useRef<() => void>(() => {}), lose = useRef<() => void>(() => {});
    const [camera, setCamera] = useState<TrackCamera>(overviewCamera), [scenery, setScenery] = useState(true), [stats, setStats] = useState({ frames: 0, cpu: 0, max: 0, interval: 0, calls: 0, triangles: 0, objects: 0, geometries: 0, textures: 0, init: 0, first: 0, dpr: 1 });
    const [timeline] = useState(() => new RaceMotion(targets(props.rows), props.checkpoint));
    const input = useRef({ ...props, camera, scenery });
    useLayoutEffect(() => { input.current = { ...props, camera, scenery }; wake.current(); }, [props, camera, scenery]);
    useEffect(() => {
        const root = host.current!, mount = surface.current!, labelRoot = labels.current!, initial = input.current, begun = performance.now();
        // Each effect owns a fresh canvas. Strict Mode cleanup loses only its own context,
        // never the canvas used by the next setup. Motion survives geometry/viewport rebuilds.
        root.dataset.ready = 'false'; root.dataset.disposed = 'false';
        const element = document.createElement('canvas'); element.setAttribute('aria-hidden', 'true'); mount.append(element);
        const renderer = createRenderer(element);
        if (!renderer) { element.remove(); initial.onFailure(); return; }
        let world: ReturnType<typeof buildSuzukaScene>;
        try { world = buildSuzukaScene(initial.geometry, initial.rows); }
        catch { renderer.dispose(); renderer.forceContextLoss(); element.remove(); initial.onFailure(); return; }
        renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
        const ortho = new THREE.OrthographicCamera(-600, 600, 400, -400, .1, 3000);
        ortho.up.set(0, 0, -1);
        const objects = world.scene.getObjectsByProperty('isObject3D', true).length;
        let frame = 0, disposed = false, visible = true, previous: number | null = null, live = overviewCamera(), width = 1, height = 1, viewHeight = 1000, lastTilt: boolean | null = null;
        let frames = 0, sum = 0, max = 0, intervals = 0, intervalCount = 0, reportAt = 0, first = 0;
        const v = new THREE.Vector3(), lastScreen = new Map<string, { x: number; y: number }>();
        const init = performance.now() - begun;
        const fit = () => {
            const angled = input.current.angled, tilt = angled ? Math.PI / 6 : 0;
            ortho.position.set(0, Math.cos(tilt) * 1200, Math.sin(tilt) * 1200); ortho.lookAt(0, 0, 0); ortho.updateMatrixWorld();
            let spanX = 0, spanY = 0;
            world.bounds.forEach(p => { v.set((p.x - .5) * 1000, 28, (p.y - .5) * 1000).applyMatrix4(ortho.matrixWorldInverse); spanX = Math.max(spanX, Math.abs(v.x)); spanY = Math.max(spanY, Math.abs(v.y)); });
            viewHeight = Math.max(spanY * 2 + 70, (spanX * 2 + 70) / (width / height));
            ortho.left = -viewHeight * width / height / 2; ortho.right = -ortho.left; ortho.top = viewHeight / 2; ortho.bottom = -ortho.top; lastTilt = angled;
        };
        const resize = () => { root.dataset.ready = 'false'; const box = root.getBoundingClientRect(); width = Math.max(1, box.width); height = Math.max(1, box.height); renderer.setPixelRatio(cappedPixelRatio(window.devicePixelRatio, width)); renderer.setSize(width, height, false); root.dataset.detail = world.setDetail(width, height); renderer.shadowMap.enabled = width >= 600; renderer.shadowMap.needsUpdate = true; fit(); request(); };
        const draw = (now: number) => {
            frame = 0; if (disposed || document.hidden || !visible) return;
            const start = performance.now(), p = input.current;
            timeline.reconcile(targets(p.rows), p.checkpoint); timeline.configure(p.playing ? 'playing' : 'paused', checkpointDuration(p.speed), p.reduced); timeline.frame(now);
            if (p.angled !== lastTilt) fit();
            const row = p.rows.find(r => r.id === p.selected), chosen = row && row.status !== 'RETIRED' ? sampleCar(p.geometry, timeline.progress(row.id), timeline.route(row.id)) : null;
            const wanted = p.camera.mode === 'focus' ? chosen ? focusCamera(p.camera, { x: chosen.x / 1000 + .5, y: chosen.z / 1000 + .5 }) : overviewCamera() : p.camera;
            const settled = settleCamera(live, wanted, previous === null ? 16 : now - previous, p.reduced); live = settled.camera;
            const tilt = p.angled ? Math.PI / 6 : 0, cx = (live.center.x - .5) * 1000, cz = (live.center.y - .5) * 1000;
            ortho.position.set(cx, Math.cos(tilt) * 1200, cz + Math.sin(tilt) * 1200); ortho.lookAt(cx, 0, cz); ortho.zoom = live.zoom; ortho.updateProjectionMatrix(); ortho.updateMatrixWorld();
            world.environment.visible = p.scenery;
            const anchors: { id: string; x: number; y: number; selected: boolean; player: boolean; width: number }[] = [];
            lastScreen.clear();
            p.rows.forEach(r => {
                const marker = world.markers.get(r.id)!; marker.visible = r.status !== 'RETIRED' && !r.hidden; if (!marker.visible) return;
                const sample = sampleCar(p.geometry, timeline.progress(r.id), timeline.route(r.id)), own = r.player || r.id === p.selected;
                const scale = viewHeight / height / live.zoom * (own ? 5.5 : 3.1);
                marker.position.set(sample.x, sample.y + 1.1, sample.z); marker.rotation.y = -sample.angle; marker.scale.set(scale, 1.2, scale);
                marker.userData.ring.visible = r.player; marker.userData.select.visible = r.id === p.selected; marker.userData.nose.visible = own;
                v.copy(marker.position).project(ortho); const point = { x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2 }; lastScreen.set(r.id, point);
                if (own) anchors.push({ id: r.id, ...point, selected: r.id === p.selected, player: r.player, width: 72 });
                marker.userData.progress = timeline.progress(r.id); marker.userData.route = timeline.route(r.id);
            });
            const placements = placeTrackLabels(anchors, width, height);
            [...labelRoot.querySelectorAll<HTMLElement>('[data-label]')].forEach(el => { const placement = placements.get(el.dataset.label!); el.hidden = !placement; if (placement) { const anchor = lastScreen.get(el.dataset.label!)!; el.style.transform = `translate(${anchor.x + placement.x}px,${anchor.y + placement.y}px)`; } });
            try { renderer.render(world.scene, ortho); } catch { suspend(); input.current.onFailure(); return; }
            const cpu = performance.now() - start; if (!frames) { first = performance.now() - begun; root.dataset.navigationMs = String(performance.now()); } frames++; sum += cpu; max = Math.max(max, cpu); if (previous !== null) { intervals += now - previous; intervalCount++; } previous = now;
            root.dataset.camera = wanted.mode; root.dataset.zoom = live.zoom.toFixed(4); root.dataset.progress = String(timeline.progress(p.selected)); root.dataset.route = timeline.route(p.selected); root.dataset.ready = 'true'; root.dataset.cars = String([...world.markers.values()].filter(m => m.visible).length);
            const metrics = { frames, cpu: sum / frames, max, interval: intervalCount ? intervals / intervalCount : 0, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, objects, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, init, first, dpr: renderer.getPixelRatio() };
            root.dataset.metrics = JSON.stringify(metrics);
            if (!reportAt || now - reportAt > 1000) { setStats(metrics); reportAt = now; }
            if (timeline.pending || settled.pending) request(); else previous = null;
        };
        function request() { if (!disposed && !document.hidden && visible && !frame) frame = requestAnimationFrame(draw); }
        const suspend = () => { cancelAnimationFrame(frame); frame = 0; previous = null; timeline.configure('paused', checkpointDuration(input.current.speed), input.current.reduced); };
        const visibility = () => { if (document.hidden) suspend(); else request(); };
        const observer = new ResizeObserver(resize); observer.observe(root);
        const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (!visible) suspend(); else request(); }); intersection.observe(root);
        const lost = (event: Event) => { event.preventDefault(); suspend(); input.current.onFailure(); };
        element.addEventListener('webglcontextlost', lost); document.addEventListener('visibilitychange', visibility);
        let drag: { x: number; y: number; camera: TrackCamera } | null = null, moved = false;
        const down = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; moved = false; drag = { x: e.clientX, y: e.clientY, camera: live }; element.setPointerCapture(e.pointerId); };
        const move = (e: PointerEvent) => { if (!drag || live.zoom <= 1) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) < 4) return; moved = true; setCamera(panCamera(drag.camera, -dx * viewHeight / height / live.zoom / 1000, -dy * viewHeight / height / live.zoom / Math.cos(input.current.angled ? Math.PI / 6 : 0) / 1000)); };
        const up = (e: PointerEvent) => { if (!moved) { const box = root.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top; const target = [...lastScreen].map(([id, p]) => ({ id, distance: Math.hypot(x - p.x, y - p.y) })).filter(p => p.distance <= 14).sort((a, b) => a.distance - b.distance)[0]; if (target) input.current.onSelect(target.id); } drag = null; };
        element.addEventListener('pointerdown', down); element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up);
        renderer.debug.onShaderError = () => { throw new Error('Prototype shader compilation failed'); };
        wake.current = request; lose.current = () => renderer.forceContextLoss(); resize();
        return () => { disposed = true; suspend(); wake.current = () => {}; lose.current = () => {}; observer.disconnect(); intersection.disconnect(); document.removeEventListener('visibilitychange', visibility); element.removeEventListener('webglcontextlost', lost); element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up); world.dispose(); renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); element.remove(); root.dataset.disposed = 'true'; };
    }, [props.geometry, timeline]);
    const available = props.rows.some(r => r.id === props.selected && r.status !== 'RETIRED');
    return <div className={styles.three}>
        <TrackCameraControls camera={camera} onChange={next => setCamera(boundCamera(next))} available={available} scenery={scenery} onScenery={() => setScenery(v => !v)} expanded={false}/>
        <div ref={host} className={styles.canvas} data-three-host><div ref={surface} className={styles.surface}/><div ref={labels} className={styles.labels}>{props.rows.filter(r => r.player || r.id === props.selected).map(r => <button key={r.id} data-label={r.id} className={r.id === props.selected ? styles.selectedLabel : ''} onClick={() => props.onSelect(r.id)} aria-label={`${r.name} · P${r.entrant.position}`}><strong>{r.abbreviation}</strong><span>P{r.entrant.position}</span></button>)}</div><span className={styles.north} aria-hidden="true">N ↑</span></div>
        <details className={styles.metrics}><summary>{t('prototype.metrics')}</summary><p>{t('prototype.metricsNote')}</p><dl>{Object.entries(stats).map(([key, value]) => <div key={key}><dt>{t(`prototype.metric.${key}` as Parameters<typeof t>[0])}</dt><dd>{format.number(value, { maximumFractionDigits: 2 })}</dd></div>)}</dl><button type="button" onClick={() => lose.current()}>{t('prototype.contextLoss')}</button></details>
    </div>;
}

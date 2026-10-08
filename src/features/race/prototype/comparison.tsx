'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useI18n, LanguageSelector, LocalizedPageTitle } from '../../../i18n/provider';
import { circuitLayouts } from '../../../data/seed/circuit-layouts';
import { drawnPitLane } from '../../../data/seed/circuit-pit-lanes';
import { racePitRoute } from '../../../game/domain/pit-geometry';
import { compactRotation, orientLayout } from '../../../game/domain/circuit-geometry';
import { trackEnvironments, orientEnvironment } from '../viewer/track-environment';
import { TrackMap } from '../viewer/track-map';
import { checkpointDuration } from '../viewer/motion';
import type { PrototypeReplay } from './model';
import styles from './prototype.module.css';
const ThreeViewer = dynamic(() => import('./three-viewer'), { ssr: false });
const CIRCUIT = '00000000-0000-4000-8000-000000000301';
const subscribeViewport = (notify: () => void) => { const media = matchMedia('(max-width: 560px)'); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify); };
const subscribeReduced = (notify: () => void) => { const media = matchMedia('(prefers-reduced-motion: reduce)'); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify); };
/** Preview-only visibility wrapper. The accepted SVG implementation stays unchanged. */
export function SvgPreview(props: Parameters<typeof TrackMap>[0]) {
    const host = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(true);
    useEffect(() => {
        let intersecting = true;
        const update = () => setVisible(intersecting && !document.hidden);
        const observer = new IntersectionObserver(entries => { intersecting = entries[0].isIntersecting; update(); });
        observer.observe(host.current!); document.addEventListener('visibilitychange', update); update();
        return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
    }, []);
    return <div ref={host} className={styles.svgPane}><TrackMap {...props} motion={visible ? props.motion : 'paused'}/></div>;
}
export class RendererBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export default function SuzukaComparison({ replay }: { replay: PrototypeReplay }) {
    const { t, format } = useI18n();
    const [view, setView] = useState('both'), [scenario, setScenario] = useState('replay'), [index, setIndex] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [reduced, setReduced] = useState(false), [angled, setAngled] = useState(true), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
    const [selected, setSelected] = useState(replay.frames[0].rows.find(r => r.player)!.id);
    const compact = useSyncExternalStore(subscribeViewport, () => matchMedia('(max-width: 560px)').matches, () => false);
    const systemReduced = useSyncExternalStore(subscribeReduced, () => matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);
    const geometry = useMemo(() => { const source = circuitLayouts[CIRCUIT], oriented = orientLayout(source, compact ? compactRotation(source.points) : 0), originalPit = racePitRoute(drawnPitLane(CIRCUIT)!, replay.pitAnchors); return { layout: oriented.layout, pit: { ...originalPit, points: oriented.transform(originalPit.points) }, environment: orientEnvironment(trackEnvironments.suzuka, oriented.transform)! }; }, [compact, replay.pitAnchors]);
    const frame = scenario === 'replay' ? replay.frames[index] : replay.cases[scenario];
    const selectedRow = frame.rows.find(r => r.id === selected)!;
    useEffect(() => {
        // Stop advancing checkpoints at the end, but let each existing motion model
        // drain its final interpolation. A timer must not freeze the slower renderer.
        if (!playing || scenario !== 'replay' || index >= replay.frames.length - 1) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const schedule = () => { if (!document.hidden) timer = setTimeout(() => { setIndex(i => Math.min(replay.frames.length - 1, i + 1)); }, checkpointDuration(speed)); };
        const change = () => { clearTimeout(timer); schedule(); }; document.addEventListener('visibilitychange', change); schedule();
        return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', change); };
    }, [playing, scenario, index, speed, replay.frames.length]);
    const failure = useCallback(() => setFailed(true), []);
    const svg = () => <SvgPreview layout={geometry.layout} pitRoute={geometry.pit} environment={geometry.environment} rows={frame.rows} selected={selected} onSelect={setSelected} speed={speed} reduceMotion={reduced || systemReduced} motion={playing ? 'playing' : 'paused'} checkpoint={index} authoritative raceViewer compact/>;
    return <main className={styles.page} data-prototype data-scenario={scenario} data-checkpoint={index} data-selected={selected}>
        <LocalizedPageTitle titleKey="prototype.title"/>
        <header className={styles.header}><div><p>{t('prototype.eyebrow')}</p><h1>{t('prototype.title')}</h1><span>{t('prototype.subtitle')}</span></div><LanguageSelector/></header>
        <section className={styles.toolbar} aria-label={t('prototype.comparison')}>
            <div role="group" aria-label={t('prototype.renderer')}>{['both','svg','three'].map(option => <button key={option} aria-pressed={view === option} onClick={() => setView(option)}>{t(`prototype.view.${option}` as Parameters<typeof t>[0])}</button>)}</div>
            <label>{t('prototype.scenario')}<select value={scenario} onChange={e => { setPlaying(false); setIndex(0); setScenario(e.target.value); }}>{['replay', ...Object.keys(replay.cases)].map(option => <option key={option} value={option}>{t(`prototype.case.${option}` as Parameters<typeof t>[0])}</option>)}</select></label>
            <strong>{t('prototype.lap', { lap: frame.lap, total: 53 })}</strong>
            <button disabled={scenario !== 'replay' || index === replay.frames.length - 1} onClick={() => setPlaying(v => !v)}>{t(index === replay.frames.length - 1 ? 'prototype.complete' : playing ? 'prototype.pause' : 'prototype.play')}</button>
            <button onClick={() => { setPlaying(false); setIndex(0); setAttempt(v => v + 1); }}>{t('prototype.restart')}</button>
            <label>{t('prototype.speed')}<select value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[1,2,4,8].map(s => <option key={s} value={s}>{format.number(s)}×</option>)}</select></label>
            <label className={styles.check}><input type="checkbox" checked={reduced || systemReduced} disabled={systemReduced} onChange={e => setReduced(e.target.checked)}/>{t('prototype.reduced')}</label>
        </section>
        <p className={styles.notice}>{t(scenario === 'replay' ? 'prototype.replayNote' : 'prototype.fixtureNote')}</p>
        <section className={`${styles.comparison} ${view !== 'both' ? styles.single : ''}`} aria-label={t('prototype.comparison')}>
            {view !== 'three' && <article className={styles.panel}><div className={styles.panelTitle}><h2>{t('prototype.svg')}</h2><span>{t('prototype.reference')}</span></div><div key={`${scenario}-${attempt}`}>{svg()}</div></article>}
            {view !== 'svg' && <article className={styles.panel}><div className={styles.panelTitle}><h2>{t('prototype.three')}</h2><button aria-pressed={!angled} onClick={() => setAngled(v => !v)}>{t(angled ? 'prototype.overhead' : 'prototype.angled')}</button></div>
                {failed ? <><p role="status" className={styles.notice}>{t('prototype.fallback')}</p>{svg()}<button onClick={() => { setFailed(false); setAttempt(v => v + 1); }}>{t('prototype.retry')}</button></> : <RendererBoundary key={`${scenario}-${attempt}`} fallback={<><p role="status">{t('prototype.fallback')}</p>{svg()}</>}><ThreeViewer geometry={geometry} rows={frame.rows} checkpoint={index} selected={selected} onSelect={setSelected} speed={speed} playing={playing} reduced={reduced || systemReduced} angled={angled} onFailure={failure}/></RendererBoundary>}
            </article>}
        </section>
        <div className={styles.context} aria-live="polite"><strong>{selectedRow.abbreviation} · P{selectedRow.entrant.position}</strong><span>{selectedRow.name}</span><span>{t(selectedRow.status === 'RETIRED' ? 'prototype.retired' : selectedRow.pitting ? 'prototype.pit' : 'prototype.running')}</span>{selectedRow.lapsDown ? <span>{t('prototype.lapped', { laps: selectedRow.lapsDown })}</span> : null}{frame.critical === selected && <strong className={styles.warning}>{t('prototype.critical')}</strong>}</div>
        <details className={styles.identities} open><summary>{t('trackViewer.carList')}</summary><div role="group" aria-label={t('prototype.carSelection')}>{frame.rows.map(r => <button key={r.id} aria-pressed={selected === r.id} className={r.player ? styles.own : ''} onClick={() => setSelected(r.id)}><span style={{ background: r.color }} aria-hidden="true"/><strong>{r.abbreviation}</strong><span>P{r.entrant.position}</span>{r.player && <small>{t('prototype.own')}</small>}{r.status === 'RETIRED' && <small>{t('prototype.retired')}</small>}{r.pitting && <small>{t('prototype.pit')}</small>}{frame.critical === r.id && <small className={styles.warning}>{t('prototype.critical')}</small>}</button>)}</div></details>
        <footer className={styles.footer}><p>{t('prototype.approximation')}</p><a href="https://www.openstreetmap.org/copyright">{t('trackViewer.attribution')}</a><button onClick={() => setFailed(true)}>{t('prototype.lowPower')}</button><Link href="/">{t('prototype.leave')}</Link></footer>
    </main>;
}

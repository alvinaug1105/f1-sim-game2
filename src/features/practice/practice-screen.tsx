"use client";
import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { useI18n, LocalizedPageTitle } from '../../i18n/provider';
import { layoutForCircuit } from '../../data/seed/circuit-layouts';
import { PlaybackController, PLAYBACK_SPEEDS, type PlaybackSnapshot } from '../race/viewer/playback';
import { TrackMap, type MapRow } from '../race/viewer/track-map';
import { LABEL_TIER } from '../race/viewer/labels';
import { waterBand } from '../../simulation/practice/model';
import type { PracticeErrorCode } from '../../game/domain/practice-repository';
import { practiceAdvanceAction, practiceCommandAction, practiceRemainderAction, practiceSimulateAction, practiceStartAction, type PracticeActionResult } from './actions';
import { practiceAdapter, PRACTICE_SEEK_LIMIT, type PracticeAttention, type PracticeAttentionMemory, type PracticeCommandInfo } from './playback';
import type { PracticeView } from './view-model';
import { ConfirmButton, PracticeDriverPanel, PracticeSummary, PracticeTiming, sessionClock, type PracticeUiCommand } from './components';
type Controller = PlaybackController<PracticeView, PracticeAttentionMemory, PracticeAttention, PracticeCommandInfo>;
type Snapshot = PlaybackSnapshot<PracticeAttention, PracticeCommandInfo>;
const weekendHref = (v: PracticeView) => `/career/${v.careerId}/events/${v.eventId}`;
function unwrap(result: PracticeActionResult) { if (!result.view) throw new Error(result.error ?? 'PERSISTENCE_FAILED'); return result.view; }
export function PracticeScreen({ initial }: { initial: PracticeView }) {
    const [view, setView] = useState(initial);
    return view.status === 'NOT_STARTED' ? <PracticeStart view={view} onView={setView}/> : <PracticeOperations key={view.sessionId} initial={view}/>;
}
/** Header shared by both screens: back link, event, and the weekend's session tabs (text + glyph status). */
function PracticeHeader({ view }: { view: PracticeView }) {
    const { t } = useI18n();
    const glyph = { LOCKED: '🔒︎', AVAILABLE: '○', IN_PROGRESS: '▶', COMPLETED: '✓', SKIPPED: '–' } as const;
    return <header className="ops-header practice-header"><div>
        <Link className="ops-back" href={weekendHref(view)}>← {t('practice.back')}</Link>
        <p className="eyebrow">{t(`progression.${view.sessionType}`)}</p>
        <h1>{view.eventName} <span className="ops-muted">· {view.circuitName}</span></h1></div>
        <nav aria-label={t('progression.sessions')} className="session-tabs"><ol>{view.sessions.map(s => {
            const practice = s.type.startsWith('PRACTICE'), current = s.id === view.sessionId, reachable = practice && s.status !== 'LOCKED' && s.status !== 'SKIPPED';
            const label = <><span aria-hidden="true">{glyph[s.status]} </span>{t(`progression.${s.type}`)}<span className="sr-only"> · {t(`progression.${s.status}`)}</span></>;
            return <li key={s.id} className={`session-tab status-${s.status} ${current ? 'current' : ''}`}>{reachable && !current ? <Link href={`${weekendHref(view)}/practice/${s.id}`}>{label}</Link> : <span aria-current={current ? 'page' : undefined}>{label}</span>}</li>;
        })}</ol></nav>
    </header>;
}
function PracticeStart({ view, onView }: { view: PracticeView; onView: (v: PracticeView) => void }) {
    const { t } = useI18n(), [pending, start] = useTransition(), [error, setError] = useState<PracticeErrorCode | null>(null);
    const available = view.sessionStatus === 'AVAILABLE';
    const run = (action: () => Promise<PracticeActionResult>) => start(async () => { const result = await action(); if (result.view) onView(result.view); setError(result.error); });
    return <div className="race-ops practice-ops">
        <LocalizedPageTitle titleKey="practice.title"/>
        <PracticeHeader view={view}/>
        <section className="ops-panel practice-start"><div className="ops-panel-title"><h2>{t(`progression.${view.sessionType}`)}</h2><span className="status-pill">{t(`progression.${view.sessionStatus}`)}</span></div>
            <div className="summary-body">
                <p>{t(available ? 'practice.ready' : view.sessionStatus === 'SKIPPED' ? 'practice.skipped' : 'practice.unavailable')}</p>
                {available && <><p className="ops-muted">{t('practice.intro')}</p>
                    <div className="setup-actions">
                        <button disabled={pending} onClick={() => run(() => practiceStartAction(view.careerId, view.eventId, view.sessionId))}>{t('practice.start')}</button>
                        <ConfirmButton className="ops-secondary" disabled={pending} label={t('practice.simulateSession')} confirmText={t('practice.simulateSessionConfirm')} confirmLabel={t('practice.confirm')} onConfirm={() => run(() => practiceSimulateAction(view.careerId, view.eventId, view.sessionId))}/>
                    </div></>}
                {pending && <p role="status">{t('progression.pending')}</p>}
                {error && <p role="alert">{t(`practice.error.${error}`)}</p>}
                <Link className="text-link" href={weekendHref(view)}>{t('practice.back')}</Link>
            </div>
        </section>
    </div>;
}
function PracticeBar({ controller, playback, view, onRemainder }: { controller: Controller; playback: Snapshot; view: PracticeView; onRemainder: () => void }) {
    const { t, format, locale } = useI18n(), done = playback.phase === 'finished';
    const who = (id: string | null) => view.entrants.find(e => e.entrantId === id)?.abbreviation ?? '';
    const w = view.weather, percent = (n: number) => format.percentage(n / 1000, { maximumFractionDigits: 0 });
    const next = view.forecast[0];
    let line: string | null = null, tone = 'none';
    if (playback.error) line = null;
    else if (playback.reason === 'FINISH') { line = t('practice.reason.FINISH'); tone = 'finish'; }
    else if (playback.reason === 'COMMAND' || playback.confirmation) { const c = playback.confirmation; line = c ? `${who(c.entrantId)} — ${t(`practice.confirm.${c.kind}`)}` : t('viewer.reason.COMMAND'); tone = 'command'; }
    else if (playback.reason === 'LIMIT') { line = t('practice.reason.LIMIT', { minutes: format.number(PRACTICE_SEEK_LIMIT * view.stepMs / 60_000) }); tone = 'stopped'; }
    else if (playback.reason && playback.attention) { line = t(`practice.reason.${playback.attention.reason}`, { driver: who(playback.attention.entrantId) }); tone = 'stopped'; }
    return <div className="race-bar practice-bar">
        <div className="race-bar-top">
            <div className="race-clock"><span>{t('practice.clock')}</span><strong>{sessionClock(Math.min(view.elapsedMs, view.durationMs), locale)}<small> / {sessionClock(view.durationMs, locale)}</small></strong>
                <span className="control-state" role="status"><span aria-hidden="true">{view.status === 'FINISHED' ? '■' : view.elapsedMs >= view.durationMs ? '⚑' : '●'}</span> {t(view.status === 'FINISHED' ? 'practice.finished' : view.elapsedMs >= view.durationMs ? 'practice.chequered' : 'practice.remaining', { time: sessionClock(view.durationMs - view.elapsedMs, locale) })}</span></div>
            {w && <section className="weather-strip" aria-label={t('weather.title')}>
                <span>{t(w.rainfallIntensity === 0 ? 'weather.dry' : w.rainfallIntensity < 650 ? 'weather.light' : 'weather.heavy')}</span>
                <span>{t('weather.water')} {percent(w.trackWater)} ({t(['weather.dry', 'weather.damp', 'weather.wet'][waterBand(w)] as 'weather.dry')})</span>
                <span>{t('weather.air')} {format.number(w.airTemperatureMilliC / 1000, { style: 'unit', unit: 'celsius', maximumFractionDigits: 0 })}</span>
                <span>{t('weather.track')} {format.number(w.trackTemperatureMilliC / 1000, { style: 'unit', unit: 'celsius', maximumFractionDigits: 0 })}</span>
                <span title={t('weather.uncertainty')}>{t('weather.forecast')}: {next ? t('practice.forecastWindow', { from: format.number(next.fromMinute), to: format.number(next.toMinute), min: percent(next.rainfallMin), max: percent(next.rainfallMax) }) : t('prep.noRain')}</span>
            </section>}
        </div>
        <section className="playback-bar" aria-label={t('viewer.playback')}>
            <div className="playback-buttons">
                <button className="play-toggle" onClick={playback.playing ? controller.pause : controller.play} disabled={done}><span aria-hidden="true">{playback.playing ? '❚❚ ' : '▶ '}</span>{t(playback.playing ? 'viewer.pause' : 'viewer.play')}</button>
                <button className="ops-secondary" onClick={() => void controller.step()} disabled={playback.busy || done}>{t('practice.step', { seconds: format.number(view.stepMs / 1000) })}</button>
                <div role="group" aria-label={t('viewer.speed')}>{PLAYBACK_SPEEDS.map(speed => <button className="speed-button" key={speed} onClick={() => controller.setSpeed(speed)} aria-pressed={playback.speed === speed} disabled={done}>{format.number(speed)}×</button>)}</div>
                <button className="ops-secondary" onClick={controller.skip} disabled={done || playback.skipping} aria-pressed={playback.skipping}><span aria-hidden="true">▶▶ </span>{t('practice.nextEvent')}</button>
                <ConfirmButton className="ops-secondary" disabled={done || playback.busy} label={t('practice.simulateRemainder')} confirmText={t('practice.simulateRemainderConfirm')} confirmLabel={t('practice.confirm')} onConfirm={onRemainder}/>
            </div>
            <div className="viewer-settings">
                <label><input type="checkbox" checked={playback.autoPause} onChange={e => controller.setAutoPause(e.target.checked)} disabled={done}/>{t('viewer.autoPause')}</label>
                <span role="status" className={`playback-phase phase-${playback.phase}`}>{playback.busy && !done ? t('viewer.saving') : t(`practice.phase.${playback.phase}`, { speed: format.number(playback.speed) })}</span>
            </div>
            <div className="race-status-line">
                <p className={`attention-line attention-${tone}`} role="status" aria-live="polite">{line && <><span aria-hidden="true">{tone === 'finish' ? '■ ' : tone === 'command' ? '✓ ' : '⚑ '}</span>{line}</>}</p>
                {playback.error && <p role="alert" className="attention-line attention-error">{t(`practice.error.${playback.error as PracticeErrorCode}`, {})}</p>}
            </div>
        </section>
    </div>;
}
function PracticeOperations({ initial }: { initial: PracticeView }) {
    const { t } = useI18n();
    const [view, setView] = useState(initial);
    const ids = [initial.careerId, initial.eventId, initial.sessionId] as const;
    const [controller] = useState<Controller>(() => new PlaybackController(initial, practiceAdapter, async v => { const next = unwrap(await practiceAdvanceAction(...ids, v.elapsedMs)); setView(next); return next; }));
    const playback = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    useEffect(() => () => controller.pause(), [controller]);
    const [selected, setSelected] = useState(() => initial.entrants.find(e => e.own)?.entrantId ?? initial.entrants[0].entrantId);
    const [reduceMotion, setReduceMotion] = useState(false);
    const layout = layoutForCircuit(view.sourceCircuitId), chosen = view.entrants.find(e => e.entrantId === selected) ?? view.entrants[0];
    // Map rows keep a stable order (entrant id) so markers never re-key when the classification changes.
    const rows = useMemo<MapRow[]>(() => [...view.entrants].sort((a, b) => a.entrantId.localeCompare(b.entrantId)).map(e => ({ id: e.entrantId, progress: e.distance, status: 'RUNNING', name: e.name, team: e.team, player: e.player, color: e.color, abbreviation: e.abbreviation, pitting: false, entrant: { position: e.position }, hidden: e.location === 'GARAGE' })), [view]);
    const tiers = useMemo(() => new Map(rows.map(r => [r.id, r.hidden ? LABEL_TIER.FIELD : r.id === chosen.entrantId ? LABEL_TIER.SELECTED : r.player ? LABEL_TIER.PLAYER : r.entrant.position <= 3 && view.entrants.find(e => e.entrantId === r.id)?.bestLapMs ? LABEL_TIER.LEADER : LABEL_TIER.FIELD])), [rows, chosen.entrantId, view.entrants]);
    const send = (entrantId: string, revision: number, command: PracticeUiCommand) => {
        void controller.command(async v => { const next = unwrap(await practiceCommandAction(...ids, v.elapsedMs, { ...command, entrantId, revision })); setView(next); return next; }, { entrantId, kind: command.kind });
    };
    const remainder = () => { void controller.command(async v => { const next = unwrap(await practiceRemainderAction(...ids, v.elapsedMs)); setView(next); return next; }, null); };
    return <div className="race-ops practice-ops">
        <LocalizedPageTitle titleKey="practice.title"/>
        <PracticeHeader view={view}/>
        <PracticeBar controller={controller} playback={playback} view={view} onRemainder={remainder}/>
        {view.status === 'FINISHED' && <PracticeSummary view={view} weekendHref={weekendHref(view)}/>}
        <div className="ops-grid">
            <PracticeTiming view={view} selected={chosen.entrantId} onSelect={setSelected}/>
            <div className="map-column"><section className="ops-panel track-panel"><div className="ops-panel-title"><h2>{t('viewer.track')}</h2><span className="ops-muted">{t(layout.metadata?.realGeometry ? 'viewer.realGeometry' : 'viewer.schematic')}</span></div>
                <TrackMap key={layout.id} layout={layout} rows={rows} selected={chosen.entrantId} onSelect={setSelected} speed={playback.speed} reduceMotion={reduceMotion} motion={playback.motion} checkpoint={view.step} skipping={playback.skipping} latencyMs={playback.latencyMs} tiers={tiers}/>
                <p className="map-notice">{t('practice.mapNote')} <label><input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)}/>{t('viewer.reduceMotion')}</label></p></section>
            </div>
            <PracticeDriverPanel key={chosen.entrantId} view={view} e={chosen} busy={playback.busy} send={send}/>
        </div>
    </div>;
}

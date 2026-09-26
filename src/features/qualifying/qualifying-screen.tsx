"use client";
import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { useI18n, LocalizedPageTitle } from '../../i18n/provider';
import { formatRaceTime } from '../../i18n/race-time';
import { layoutForCircuit } from '../../data/seed/circuit-layouts';
import { PlaybackController, PLAYBACK_SPEEDS, type PlaybackSnapshot } from '../race/viewer/playback';
import { TrackMap, type MapRow } from '../race/viewer/track-map';
import { LABEL_TIER } from '../race/viewer/labels';
import { waterBand } from '../../simulation/practice/model';
import type { QualifyingErrorCode } from '../../game/domain/qualifying-repository';
import { ConfirmButton, sessionClock } from '../practice/components';
import {
    qualifyingAdvanceAction, qualifyingCommandAction, qualifyingContinueAction, qualifyingRemainderAction, qualifyingSimulateAction, qualifyingStartAction,
    type QualifyingActionResult,
} from './actions';
import { qualifyingAdapter, type QualifyingAttention, type QualifyingAttentionMemory, type QualifyingCommandInfo } from './playback';
import type { QualifyingView } from './view-model';
import { PhaseCompletePanel, QualifyingDriverPanel, QualifyingSummary, QualifyingTower, type QualifyingUiCommand } from './components';
import { nextSessionPath, phaseKey, textKey } from './labels';
import { sessionHref } from '../career/session-links';
type Controller = PlaybackController<QualifyingView, QualifyingAttentionMemory, QualifyingAttention, QualifyingCommandInfo>;
type Snapshot = PlaybackSnapshot<QualifyingAttention, QualifyingCommandInfo>;
const weekendHref = (v: QualifyingView) => `/career/${v.careerId}/events/${v.eventId}`;
function unwrap(result: QualifyingActionResult) { if (!result.view) throw new Error(result.error ?? 'PERSISTENCE_FAILED'); return result.view; }
export function QualifyingScreen({ initial }: { initial: QualifyingView }) {
    const [view, setView] = useState(initial);
    if (view.status === 'NOT_STARTED' || view.status === 'LEGACY_COMPLETED') return <QualifyingStart view={view} onView={setView}/>;
    // One controller per phase: a completed phase is "finished" for its controller; Continue mounts the next one.
    return <QualifyingOperations key={`${view.phase}:${view.phaseComplete}:${view.status}`} initial={view} onView={setView}/>;
}
function QualifyingHeader({ view }: { view: QualifyingView }) {
    const { t } = useI18n();
    const glyph = { LOCKED: '🔒︎', AVAILABLE: '○', IN_PROGRESS: '▶', COMPLETED: '✓', SKIPPED: '–' } as const;
    return <header className="ops-header practice-header"><div>
        <Link className="ops-back" href={weekendHref(view)}>← {t('practice.back')}</Link>
        <p className="eyebrow">{t(`progression.${view.kind}`)}</p>
        <h1>{view.eventName} <span className="ops-muted">· {view.circuitName}</span></h1></div>
        <nav aria-label={t('progression.sessions')} className="session-tabs"><ol>{view.sessions.map(s => {
            const current = s.type === view.kind, reachable = s.status !== 'LOCKED' && s.status !== 'SKIPPED';
            const href = sessionHref(weekendHref(view), s);
            const label = <><span aria-hidden="true">{glyph[s.status as keyof typeof glyph]} </span>{t(`progression.${s.type as 'QUALIFYING'}`)}<span className="sr-only"> · {t(`progression.${s.status as 'AVAILABLE'}`)}</span></>;
            return <li key={s.id} className={`session-tab status-${s.status} ${current ? 'current' : ''}`}>{reachable && !current && href ? <Link href={href}>{label}</Link> : <span aria-current={current ? 'page' : undefined}>{label}</span>}</li>;
        })}</ol></nav>
    </header>;
}
function QualifyingStart({ view, onView }: { view: QualifyingView; onView: (v: QualifyingView) => void }) {
    const { t } = useI18n(), [pending, start] = useTransition(), [error, setError] = useState<QualifyingErrorCode | null>(null);
    const available = view.sessionStatus === 'AVAILABLE' || view.legacyInProgress;
    const run = (action: () => Promise<QualifyingActionResult>) => start(async () => { const result = await action(); if (result.view) onView(result.view); setError(result.error); });
    const message = view.status === 'LEGACY_COMPLETED' ? 'qualifying.legacyCompleted' : view.legacyInProgress ? 'qualifying.legacyInProgress' : textKey(view.kind, available ? 'ready' : 'unavailable');
    return <div className="race-ops practice-ops qualifying-ops">
        <LocalizedPageTitle titleKey={textKey(view.kind, 'title')}/>
        <QualifyingHeader view={view}/>
        <section className="ops-panel practice-start"><div className="ops-panel-title"><h2>{t(`progression.${view.kind}`)}</h2><span className="status-pill">{t(`progression.${view.sessionStatus}`)}</span></div>
            <div className="summary-body">
                <p>{t(message)}</p>
                {available && <><p className="ops-muted">{t(textKey(view.kind, 'intro'))}</p>
                    <div className="setup-actions">
                        <button disabled={pending} onClick={() => run(() => qualifyingStartAction(view.careerId, view.eventId, view.kind))}>{t(view.legacyInProgress ? 'practice.resume' : textKey(view.kind, 'manage'))}</button>
                        <ConfirmButton className="ops-secondary" disabled={pending} label={t(textKey(view.kind, 'simulate'))} confirmText={t(textKey(view.kind, 'simulateConfirm'))} confirmLabel={t('practice.confirm')} onConfirm={() => run(() => qualifyingSimulateAction(view.careerId, view.eventId, view.kind))}/>
                    </div></>}
                {view.status === 'LEGACY_COMPLETED' && <Link className="button-link" href={`${weekendHref(view)}/${nextSessionPath(view.kind)}`}>{t(textKey(view.kind, 'continueToRace'))}</Link>}
                {pending && <p role="status">{t('progression.pending')}</p>}
                {error && <p role="alert">{t(`qualifying.error.${error}`)}</p>}
                <Link className="text-link" href={weekendHref(view)}>{t('practice.back')}</Link>
            </div>
        </section>
    </div>;
}
function QualifyingBar({ controller, playback, view, onRemainder }: { controller: Controller; playback: Snapshot; view: QualifyingView; onRemainder: () => void }) {
    const { t, format, locale } = useI18n(), done = playback.phase === 'finished';
    const who = (id: string | null) => view.entrants.find(e => e.entrantId === id)?.abbreviation ?? '';
    const w = view.weather, percent = (n: number) => format.percentage(n / 1000, { maximumFractionDigits: 0 });
    const remaining = view.phaseDurationMs - view.phaseElapsedMs, next = view.forecast[0], frozen = view.phaseComplete || view.status === 'FINISHED';
    const cutoffCar = view.cutoff === null ? null : view.entrants.find(e => e.position === view.cutoff && e.eliminatedIn === null);
    let line: string | null = null, tone = 'none';
    if (playback.error) line = null;
    else if (view.status === 'FINISHED') { line = t(textKey(view.kind, 'finished')); tone = 'finish'; }
    else if (view.phaseComplete) { line = t('qualifying.phaseComplete', { phase: t(phaseKey(view.kind, view.phase)) }); tone = 'finish'; }
    else if (playback.reason === 'COMMAND' || playback.confirmation) { const c = playback.confirmation; line = c ? `${who(c.entrantId)} — ${t(`practice.confirm.${c.kind}`)}` : t('viewer.reason.COMMAND'); tone = 'command'; }
    else if (playback.reason === 'LIMIT') { line = t('qualifying.reason.LIMIT'); tone = 'stopped'; }
    else if (playback.reason && playback.attention) { const a = playback.attention; line = t(`qualifying.reason.${a.reason}`, { driver: who(a.entrantId), time: a.lapMs ? formatRaceTime(a.lapMs, locale) : '' }); tone = 'stopped'; }
    return <div className="race-bar practice-bar qualifying-bar">
        <div className="race-bar-top">
            <div className="race-clock"><span>{t(phaseKey(view.kind, view.phase))}</span><strong>{sessionClock(Math.max(0, remaining), locale)}</strong>
                <span className="control-state" role="status"><span aria-hidden="true">{frozen ? '■' : remaining <= 0 ? '⚑' : '●'}</span> {frozen ? t('qualifying.frozen') : t(remaining <= 0 ? 'qualifying.flag' : 'qualifying.remaining')}</span></div>
            <section className="weather-strip" aria-label={t('weather.title')}>
                {cutoffCar && <span className="cutoff-info">{t('qualifying.cutoffAt', { position: format.number(view.cutoff!) })}: <strong>{cutoffCar.bestMs === null ? t('race.noTime') : formatRaceTime(cutoffCar.bestMs, locale)}</strong></span>}
                {w && <span>{t(w.rainfallIntensity === 0 ? 'weather.dry' : w.rainfallIntensity < 650 ? 'weather.light' : 'weather.heavy')} · {t('weather.water')} {percent(w.trackWater)} ({t((['weather.dry', 'weather.damp', 'weather.wet'] as const)[waterBand(w)])})</span>}
                {view.grip && <span>{t('qualifying.grip')}: <strong>{t(`qualifying.grip.${view.grip}`)}</strong></span>}
                {view.traffic && <span>{t('qualifying.traffic')}: <strong>{t(`qualifying.traffic.${view.traffic}`)}</strong></span>}
                <span title={t('weather.uncertainty')}>{t('weather.forecast')}: {next ? t('practice.forecastWindow', { from: format.number(next.fromMinute), to: format.number(next.toMinute), min: percent(next.rainfallMin), max: percent(next.rainfallMax) }) : t('prep.noRain')}</span>
            </section>
        </div>
        <section className="playback-bar" aria-label={t('viewer.playback')}>
            {done ? null : <>
                <div className="playback-buttons">
                    <button className="play-toggle" onClick={playback.playing ? controller.pause : controller.play}><span aria-hidden="true">{playback.playing ? '❚❚ ' : '▶ '}</span>{t(playback.playing ? 'viewer.pause' : 'viewer.play')}</button>
                    <button className="ops-secondary" onClick={() => void controller.step()} disabled={playback.busy}>{t('practice.step', { seconds: format.number(view.stepMs / 1000) })}</button>
                    <div role="group" aria-label={t('viewer.speed')}>{PLAYBACK_SPEEDS.map(speed => <button className="speed-button" key={speed} onClick={() => controller.setSpeed(speed)} aria-pressed={playback.speed === speed}>{format.number(speed)}×</button>)}</div>
                    <button className="ops-secondary" onClick={controller.skip} disabled={playback.skipping} aria-pressed={playback.skipping}><span aria-hidden="true">▶▶ </span>{t('practice.nextEvent')}</button>
                    <ConfirmButton className="ops-secondary" disabled={playback.busy} label={t('practice.simulateRemainder')} confirmText={t(textKey(view.kind, 'remainderConfirm'))} confirmLabel={t('practice.confirm')} onConfirm={onRemainder}/>
                </div>
                <div className="viewer-settings">
                    <label><input type="checkbox" checked={playback.autoPause} onChange={e => controller.setAutoPause(e.target.checked)}/>{t('viewer.autoPause')}</label>
                    <span role="status" className={`playback-phase phase-${playback.phase}`}>{playback.busy ? t('viewer.saving') : t(`practice.phase.${playback.phase}`, { speed: format.number(playback.speed) })}</span>
                </div>
            </>}
            <div className="race-status-line">
                <p className={`attention-line attention-${tone}`} role="status" aria-live="polite">{line && <><span aria-hidden="true">{tone === 'finish' ? '■ ' : tone === 'command' ? '✓ ' : '⚑ '}</span>{line}</>}</p>
                {playback.error && <p role="alert" className="attention-line attention-error">{t(`qualifying.error.${playback.error as QualifyingErrorCode}`, {})}</p>}
            </div>
        </section>
    </div>;
}
function QualifyingOperations({ initial, onView }: { initial: QualifyingView; onView: (v: QualifyingView) => void }) {
    const { t } = useI18n();
    const [view, setLocal] = useState(initial);
    const setView = (v: QualifyingView) => { setLocal(v); onView(v); };
    const ids = [initial.careerId, initial.eventId, initial.kind] as const;
    const [controller] = useState<Controller>(() => new PlaybackController(initial, qualifyingAdapter, async v => { const next = unwrap(await qualifyingAdvanceAction(...ids, v.sessionElapsedMs)); setView(next); return next; }));
    const playback = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    useEffect(() => () => controller.pause(), [controller]);
    const [selected, setSelected] = useState(() => initial.entrants.find(e => e.player && e.eliminatedIn === null)?.entrantId ?? initial.entrants.find(e => e.player)?.entrantId ?? initial.entrants[0].entrantId);
    const [reduceMotion, setReduceMotion] = useState(false), [pending, startContinue] = useTransition(), [continueError, setContinueError] = useState<QualifyingErrorCode | null>(null);
    const layout = layoutForCircuit(view.sourceCircuitId), chosen = view.entrants.find(e => e.entrantId === selected) ?? view.entrants[0];
    // Map rows keep a stable order (entrant id) so markers never re-key when the classification changes.
    const rows = useMemo<MapRow[]>(() => [...view.entrants].sort((a, b) => a.entrantId.localeCompare(b.entrantId)).map(e => ({ id: e.entrantId, progress: e.distance, status: 'RUNNING', name: e.name, team: e.team, player: e.player, color: e.color, abbreviation: e.abbreviation, pitting: false, entrant: { position: e.position }, hidden: e.location === 'GARAGE' })), [view]);
    const tiers = useMemo(() => new Map(view.entrants.map(e => {
        const onTrack = e.location !== 'GARAGE';
        const tier = !onTrack ? LABEL_TIER.FIELD : e.entrantId === chosen.entrantId ? LABEL_TIER.SELECTED : e.player ? LABEL_TIER.PLAYER
            : view.cutoff !== null && (e.position === view.cutoff || e.position === view.cutoff + 1) && e.eliminatedIn === null ? LABEL_TIER.BATTLE
                : e.position === 1 && e.bestMs !== null ? LABEL_TIER.LEADER : LABEL_TIER.FIELD;
        return [e.entrantId, tier];
    })), [view, chosen.entrantId]);
    const send = (entrantId: string, revision: number, command: QualifyingUiCommand) => {
        void controller.command(async v => { const next = unwrap(await qualifyingCommandAction(...ids, v.sessionElapsedMs, { ...command, entrantId, revision })); setView(next); return next; }, { entrantId, kind: command.kind });
    };
    const remainder = () => { void controller.command(async v => { const next = unwrap(await qualifyingRemainderAction(...ids, v.sessionElapsedMs)); setView(next); return next; }, null); };
    const continuePhase = () => startContinue(async () => { const result = await qualifyingContinueAction(...ids, view.sessionElapsedMs, view.phase); setContinueError(result.error); if (result.view) setView(result.view); });
    return <div className="race-ops practice-ops qualifying-ops">
        <LocalizedPageTitle titleKey={textKey(view.kind, 'title')}/>
        <QualifyingHeader view={view}/>
        <QualifyingBar controller={controller} playback={playback} view={view} onRemainder={remainder}/>
        {view.status === 'FINISHED' && <QualifyingSummary view={view}/>}
        {view.status === 'RUNNING' && view.phaseComplete && <PhaseCompletePanel view={view} pending={pending} onContinue={continuePhase}/>}
        {continueError && <p role="alert">{t(`qualifying.error.${continueError}`)}</p>}
        <div className="ops-grid">
            <QualifyingTower view={view} selected={chosen.entrantId} onSelect={setSelected}/>
            <div className="map-column"><section className="ops-panel track-panel"><div className="ops-panel-title"><h2>{t('viewer.track')}</h2><span className="ops-muted">{t(layout.metadata?.realGeometry ? 'viewer.realGeometry' : 'viewer.schematic')}</span></div>
                <TrackMap key={layout.id} layout={layout} rows={rows} selected={chosen.entrantId} onSelect={setSelected} speed={playback.speed} reduceMotion={reduceMotion} motion={playback.motion} checkpoint={view.step} skipping={playback.skipping} latencyMs={playback.latencyMs} tiers={tiers}/>
                <p className="map-notice">{t('practice.mapNote')} <label><input type="checkbox" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)}/>{t('viewer.reduceMotion')}</label></p></section>
            </div>
            <QualifyingDriverPanel key={chosen.entrantId} view={view} e={chosen} busy={playback.busy} send={send} onSelect={setSelected}/>
        </div>
    </div>;
}

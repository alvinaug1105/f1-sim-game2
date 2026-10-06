"use client";
import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { useI18n, LocalizedPageTitle } from '../../i18n/provider';
import { formatRaceTime } from '../../i18n/race-time';
import { layoutForCircuit } from '../../data/seed/circuit-layouts';
import { PlaybackController, type PlaybackSnapshot } from '../race/viewer/playback';
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
import { CutoffDelta, PhaseCompletePanel, QualifyingDriverPanel, QualifyingSummary, QualifyingTower, StatusChip, type QualifyingUiCommand } from './components';
import { ConditionChips, LiveClock, LiveHeader, PaneSwitch, PlaybackControls, SessionNav, rainKey, type ConditionItem } from '../live/live-frame';
import { Icon } from '../../components/ui/icon';
import { teamStyle } from '../../components/ui/team-color';
import type { CSSProperties } from 'react';
import { forecastText, nextSessionPath, phaseKey, textKey } from './labels';
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
/** Q1 → Q2 → Q3 as a stepper: completed (tick), current (ring), still to come (lock) — icon + text. */
function PhaseStepper({ view }: { view: QualifyingView }) {
    const { t } = useI18n();
    const phases = view.format.length ? view.format.map(f => f.phase) : (['Q1', 'Q2', 'Q3'] as const);
    const current = phases.indexOf(view.phase);
    return <ol className="live-phases" aria-label={t('live.phases')}>{phases.map((p, i) => {
        const state = view.status === 'FINISHED' || i < current || (i === current && view.phaseComplete) ? 'done' : i === current ? 'current' : 'locked';
        return <li key={p} data-state={state} aria-current={state === 'current' ? 'step' : undefined}><Icon name={state === 'done' ? 'check' : state === 'current' ? 'current' : 'lock'} size={12}/>{t(phaseKey(view.kind, p))}<span className="visually-hidden"> · {t(`live.phaseState.${state}`)}</span></li>;
    })}</ol>;
}
function QualifyingHeader({ view }: { view: QualifyingView }) {
    const { t } = useI18n();
    return <LiveHeader kind="QUALIFYING" kindLabel={t(`progression.${view.kind}`)} title={view.eventName} circuit={view.circuitName}
        backHref={weekendHref(view)} backLabel={t('practice.back')} badge={view.status !== 'NOT_STARTED' && view.status !== 'LEGACY_COMPLETED' ? <PhaseStepper view={view}/> : null}
        nav={<SessionNav sessions={view.sessions} isCurrent={s => s.type === view.kind} weekendHref={weekendHref(view)}/>}/>;
}
function QualifyingStart({ view, onView }: { view: QualifyingView; onView: (v: QualifyingView) => void }) {
    const { t } = useI18n(), [pending, start] = useTransition(), [error, setError] = useState<QualifyingErrorCode | null>(null);
    const available = view.sessionStatus === 'AVAILABLE' || view.legacyInProgress;
    const run = (action: () => Promise<QualifyingActionResult>) => start(async () => { const result = await action(); if (result.view) onView(result.view); setError(result.error); });
    const message = view.status === 'LEGACY_COMPLETED' ? 'qualifying.legacyCompleted' : view.legacyInProgress ? 'qualifying.legacyInProgress' : textKey(view.kind, available ? 'ready' : 'unavailable');
    return <div className="live live-qualifying live-start" data-kind="QUALIFYING">
        <LocalizedPageTitle titleKey={textKey(view.kind, 'title')}/>
        <QualifyingHeader view={view}/>
        <section className="ops-panel practice-start live-panel"><div className="ops-panel-title"><h2>{t(`progression.${view.kind}`)}</h2><span className="status-pill">{t(`progression.${view.sessionStatus}`)}</span></div>
            <div className="summary-body">
                <p>{t(message)}</p>
                {available && <><p className="ops-muted">{t(textKey(view.kind, 'intro'))}</p>
                    <div className="setup-actions">
                        <button className="live-primary" disabled={pending} onClick={() => run(() => qualifyingStartAction(view.careerId, view.eventId, view.kind))}>{t(view.legacyInProgress ? 'practice.resume' : textKey(view.kind, 'manage'))}</button>
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
function QualifyingBar({ controller, playback, view, onRemainder, selected, onSelect }: { controller: Controller; playback: Snapshot; view: QualifyingView; onRemainder: () => void; selected: string; onSelect: (id: string) => void }) {
    const { t, format, locale } = useI18n(), done = playback.phase === 'finished';
    const who = (id: string | null) => view.entrants.find(e => e.entrantId === id)?.abbreviation ?? '';
    const w = view.weather, percent = (n: number) => format.percentage(n / 1000, { maximumFractionDigits: 0 });
    const remaining = view.phaseDurationMs - view.phaseElapsedMs, next = view.forecast[0], frozen = view.phaseComplete || view.status === 'FINISHED';
    let line: string | null = null, tone = 'none';
    if (playback.error) line = null;
    else if (view.status === 'FINISHED') { line = t(textKey(view.kind, 'finished')); tone = 'finish'; }
    else if (view.phaseComplete) { line = t('qualifying.phaseComplete', { phase: t(phaseKey(view.kind, view.phase)) }); tone = 'finish'; }
    else if (playback.reason === 'COMMAND' || playback.confirmation) { const c = playback.confirmation; line = c ? `${who(c.entrantId)} — ${t(`practice.confirm.${c.kind}`)}` : t('viewer.reason.COMMAND'); tone = 'command'; }
    else if (playback.reason === 'LIMIT') { line = t('qualifying.reason.LIMIT'); tone = 'stopped'; }
    else if (playback.reason && playback.attention) { const a = playback.attention; line = t(`qualifying.reason.${a.reason}`, { driver: who(a.entrantId), time: a.lapMs ? formatRaceTime(a.lapMs, locale) : '' }); tone = 'stopped'; }
    const state = frozen ? 'FINISHED' : remaining <= 0 ? 'CHEQUERED' : 'GREEN';
    const items: ConditionItem[] = [];
    if (w) items.push({ key: 'water', icon: w.trackWater >= 100 ? 'waves' : 'drop', label: t(rainKey(w.rainfallIntensity)), value: percent(w.trackWater), note: t((['weather.dry', 'weather.damp', 'weather.wet'] as const)[waterBand(w)]), tone: waterBand(w) > 0 ? 'wet' : undefined, title: t('weather.water') });
    if (view.grip) items.push({ key: 'grip', icon: 'tyre', label: t('qualifying.grip'), value: t(`qualifying.grip.${view.grip}`) });
    if (view.traffic) items.push({ key: 'traffic', icon: 'battle', label: t('qualifying.traffic'), value: t(`qualifying.traffic.${view.traffic}`), tone: view.traffic === 'BUSY' ? 'warn' : undefined });
    const forecast: ConditionItem = { key: 'forecast', icon: 'cloud', label: t('weather.forecast'), value: next ? forecastText(next, view.kind, t, ms => sessionClock(ms, locale), percent, w?.rainfallIntensity ?? 0) : t('prep.noRain'), tone: next ? 'info' : undefined, title: t('weather.uncertainty') };
    return <div className="live-bar race-bar practice-bar qualifying-bar">
        <div className="live-bar-row">
            <LiveClock caption={t(phaseKey(view.kind, view.phase))} value={sessionClock(Math.max(0, remaining), locale)}>
                <span className="control-state live-flag" data-state={state} role="status"><Icon name={state === 'GREEN' ? 'play' : 'flag'} size={14}/>{frozen ? t('qualifying.frozen') : t(remaining <= 0 ? 'qualifying.flag' : 'qualifying.remaining')}</span>
            </LiveClock>
            <ConditionChips items={items} forecast={forecast} label={t('weather.title')}/>
        </div>
        <section className="playback-bar" aria-label={t('viewer.playback')}>
            {done ? null : <PlaybackControls playback={playback} done={done} onToggle={playback.playing ? controller.pause : controller.play} onStep={() => void controller.step()} stepLabel={t('practice.step', { seconds: format.number(view.stepMs / 1000) })}
                onSpeed={controller.setSpeed} onSkip={controller.skip} skipLabel={t('practice.nextEvent')} onAutoPause={controller.setAutoPause}
                extra={<ConfirmButton className="live-tool" disabled={playback.busy} label={t('practice.simulateRemainder')} confirmText={t(textKey(view.kind, 'remainderConfirm'))} confirmLabel={t('practice.confirm')} onConfirm={onRemainder}/>}
                status={playback.busy ? t('viewer.saving') : t(`practice.phase.${playback.phase}`, { speed: format.number(playback.speed) })}/>}
            <div className="race-status-line">
                <p className={`attention-line attention-${tone}`} role="status" aria-live="polite">{line && <><Icon name={tone === 'finish' ? 'flag' : tone === 'command' ? 'check' : 'alert'} size={14}/>{line}</>}</p>
                {playback.error && <p role="alert" className="attention-line attention-error">{t(`qualifying.error.${playback.error as QualifyingErrorCode}`, {})}</p>}
            </div>
        </section>
        <CutoffStrip view={view} selected={selected} onSelect={onSelect}/>
    </div>;
}
/**
 * The question qualifying is about — who is safe, who is at risk: the cutoff (position + the time to beat) and each
 * player car's status and margin. Each car is also the quick switch to its panel (the parent wires selection).
 */
function CutoffStrip({ view, selected, onSelect }: { view: QualifyingView; selected?: string; onSelect?: (id: string) => void }) {
    const { t, format, locale } = useI18n();
    const cutoffCar = view.cutoff === null ? null : view.entrants.find(e => e.position === view.cutoff && e.eliminatedIn === null);
    const mine = view.entrants.filter(e => e.player);
    return <div className="live-cutoff" data-live={view.cutoff !== null || undefined}>
        {cutoffCar ? <p className="live-cutoff-line cutoff-info"><Icon name="flag" size={14}/>{t('qualifying.cutoffAt', { position: format.number(view.cutoff!) })}: <strong>{cutoffCar.bestMs === null ? t('race.noTime') : formatRaceTime(cutoffCar.bestMs, locale)}</strong></p>
            : <p className="live-cutoff-line ops-muted">{t('live.noCutoff')}</p>}
        <div className="live-cutoff-cars">{mine.map(e => {
            const content = <><span className="tower-team" aria-hidden="true"/><strong className="cutoff-abbr">{e.abbreviation}</strong><span className="cutoff-pos">{t('commandCentre.position', { position: e.position })}</span><StatusChip status={e.status}/>{e.eliminatedIn === null && <CutoffDelta ms={e.cutoffDeltaMs}/>}</>;
            return onSelect ? <button key={e.entrantId} type="button" className="live-cutoff-car" aria-pressed={selected === e.entrantId} onClick={() => onSelect(e.entrantId)} style={teamStyle(e.color) as CSSProperties} title={e.name}>{content}</button>
                : <span key={e.entrantId} className="live-cutoff-car" style={teamStyle(e.color) as CSSProperties}>{content}</span>;
        })}</div>
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
    const [pane, setPane] = useState<'strategy' | 'timing' | 'track'>('strategy');
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
    return <div className="live live-qualifying" data-kind="QUALIFYING" data-pane={pane}>
        <LocalizedPageTitle titleKey={textKey(view.kind, 'title')}/>
        <QualifyingHeader view={view}/>
        <QualifyingBar controller={controller} playback={playback} view={view} onRemainder={remainder} selected={chosen.entrantId} onSelect={id => { setSelected(id); setPane('strategy'); }}/>
        {view.status === 'FINISHED' && <QualifyingSummary view={view}/>}
        {view.status === 'RUNNING' && view.phaseComplete && <PhaseCompletePanel view={view} pending={pending} onContinue={continuePhase}/>}
        {continueError && <p role="alert">{t(`qualifying.error.${continueError}`)}</p>}
        <PaneSwitch label={t('live.panes')} active={pane} onPick={setPane} panes={[{ id: 'strategy', label: t('live.pane.runs') }, { id: 'timing', label: t('live.pane.timing') }, { id: 'track', label: t('live.pane.track') }]}/>
        <div className="live-grid ops-grid">
            <div className="live-area-tower" data-pane="timing"><QualifyingTower view={view} selected={chosen.entrantId} onSelect={setSelected}/></div>
            <div className="live-area-map" data-pane="track"><section className="ops-panel track-panel live-panel"><div className="ops-panel-title live-panel-head"><h2>{t('viewer.track')}</h2><span className="ops-muted">{t(layout.metadata?.realGeometry ? 'viewer.realGeometry' : 'viewer.schematic')}</span></div>
                <TrackMap key={layout.id} layout={layout} rows={rows} selected={chosen.entrantId} onSelect={setSelected} speed={playback.speed} reduceMotion={reduceMotion} motion={playback.motion} checkpoint={view.step} skipping={playback.skipping} latencyMs={playback.latencyMs} tiers={tiers}/>
                <p className="map-notice">{t('practice.mapNote')} <label className="live-switch"><input type="checkbox" role="switch" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)}/><span className="live-switch-track" aria-hidden="true"/><span>{t('viewer.reduceMotion')}</span></label></p></section>
            </div>
            <div className="live-area-panel" data-pane="strategy"><QualifyingDriverPanel key={chosen.entrantId} view={view} e={chosen} busy={playback.busy} send={send} onSelect={setSelected}/></div>
        </div>
    </div>;
}

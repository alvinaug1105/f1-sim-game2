"use client";
import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { useI18n, LocalizedPageTitle } from '../../i18n/provider';
import { layoutForCircuit } from '../../data/seed/circuit-layouts';
import { PlaybackController, type PlaybackSnapshot } from '../race/viewer/playback';
import { TrackMap, type MapRow } from '../race/viewer/track-map';
import { LABEL_TIER } from '../race/viewer/labels';
import { waterBand } from '../../simulation/practice/model';
import type { PracticeErrorCode } from '../../game/domain/practice-repository';
import { practiceAdvanceAction, practiceCommandAction, practiceRemainderAction, practiceSimulateAction, practiceStartAction, type PracticeActionResult } from './actions';
import { practiceAdapter, PRACTICE_SEEK_LIMIT, type PracticeAttention, type PracticeAttentionMemory, type PracticeCommandInfo } from './playback';
import type { PracticeView } from './view-model';
import { ConfirmButton, LOCATION_GLYPH, PracticeDriverPanel, PracticeRunLog, PracticeSummary, PracticeSwitch, PracticeTiming, sessionClock, type PracticeUiCommand } from './components';
import { ConditionChips, LiveClock, LiveHeader, PaneSwitch, PlaybackControls, SessionNav, rainKey, type ConditionItem } from '../live/live-frame';
import { Icon } from '../../components/ui/icon';
type Controller = PlaybackController<PracticeView, PracticeAttentionMemory, PracticeAttention, PracticeCommandInfo>;
type Snapshot = PlaybackSnapshot<PracticeAttention, PracticeCommandInfo>;
const weekendHref = (v: PracticeView) => `/career/${v.careerId}/events/${v.eventId}`;
function unwrap(result: PracticeActionResult) { if (!result.view) throw new Error(result.error ?? 'PERSISTENCE_FAILED'); return result.view; }
export function PracticeScreen({ initial }: { initial: PracticeView }) {
    const [view, setView] = useState(initial);
    return view.status === 'NOT_STARTED' ? <PracticeStart view={view} onView={setView}/> : <PracticeOperations key={view.sessionId} initial={view}/>;
}
/** Header shared by both screens (UIX-B live frame): back link, event, and the weekend's sessions (icon + text status). */
function PracticeHeader({ view }: { view: PracticeView }) {
    const { t } = useI18n();
    return <LiveHeader kind="PRACTICE" kindLabel={t(`progression.${view.sessionType}`)} title={view.eventName} circuit={view.circuitName}
        backHref={weekendHref(view)} backLabel={t('practice.back')}
        nav={<SessionNav sessions={view.sessions} isCurrent={s => s.id === view.sessionId} weekendHref={weekendHref(view)}/>}/>;
}
function PracticeStart({ view, onView }: { view: PracticeView; onView: (v: PracticeView) => void }) {
    const { t } = useI18n(), [pending, start] = useTransition(), [error, setError] = useState<PracticeErrorCode | null>(null);
    const available = view.sessionStatus === 'AVAILABLE';
    const run = (action: () => Promise<PracticeActionResult>) => start(async () => { const result = await action(); if (result.view) onView(result.view); setError(result.error); });
    return <div className="live live-practice live-start" data-kind="PRACTICE">
        <LocalizedPageTitle titleKey="practice.title"/>
        <PracticeHeader view={view}/>
        <section className="ops-panel practice-start live-panel"><div className="ops-panel-title"><h2>{t(`progression.${view.sessionType}`)}</h2><span className="status-pill">{t(`progression.${view.sessionStatus}`)}</span></div>
            <div className="summary-body">
                <p>{t(available ? 'practice.ready' : view.sessionStatus === 'SKIPPED' ? 'practice.skipped' : 'practice.unavailable')}</p>
                {available && <><p className="ops-muted">{t('practice.intro')}</p>
                    <div className="setup-actions">
                        <button className="live-primary" disabled={pending} onClick={() => run(() => practiceStartAction(view.careerId, view.eventId, view.sessionId))}>{t('practice.start')}</button>
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
    const temperature = (n: number) => format.number(n / 1000, { style: 'unit', unit: 'celsius', maximumFractionDigits: 0 });
    const next = view.forecast[0];
    let line: string | null = null, tone = 'none';
    if (playback.error) line = null;
    else if (playback.reason === 'FINISH') { line = t('practice.reason.FINISH'); tone = 'finish'; }
    else if (playback.reason === 'COMMAND' || playback.confirmation) { const c = playback.confirmation; line = c ? `${who(c.entrantId)} — ${t(`practice.confirm.${c.kind}`)}` : t('viewer.reason.COMMAND'); tone = 'command'; }
    else if (playback.reason === 'LIMIT') { line = t('practice.reason.LIMIT', { minutes: format.number(PRACTICE_SEEK_LIMIT * view.stepMs / 60_000) }); tone = 'stopped'; }
    else if (playback.reason && playback.attention) { line = t(`practice.reason.${playback.attention.reason}`, { driver: who(playback.attention.entrantId) }); tone = 'stopped'; }
    const state = view.status === 'FINISHED' ? 'FINISHED' : view.elapsedMs >= view.durationMs ? 'CHEQUERED' : 'GREEN';
    const items: ConditionItem[] = w ? [
        { key: 'rain', icon: 'drop', label: t('weather.rain'), value: percent(w.rainfallIntensity), note: t(rainKey(w.rainfallIntensity)), tone: w.rainfallIntensity > 0 ? 'wet' : undefined },
        { key: 'water', icon: 'waves', label: t('weather.water'), value: percent(w.trackWater), note: t((['weather.dry', 'weather.damp', 'weather.wet'] as const)[waterBand(w)]), tone: waterBand(w) > 0 ? 'wet' : undefined },
        { key: 'air', icon: 'thermo', label: t('weather.air'), value: temperature(w.airTemperatureMilliC) },
        { key: 'track', icon: 'thermo', label: t('weather.track'), value: temperature(w.trackTemperatureMilliC) },
    ] : [];
    const forecast: ConditionItem = { key: 'forecast', icon: 'cloud', label: t('weather.forecast'), value: next ? t('practice.forecastWindow', { from: format.number(next.fromMinute), to: format.number(next.toMinute), min: percent(next.rainfallMin), max: percent(next.rainfallMax) }) : t('prep.noRain'), tone: next ? 'info' : undefined, title: t('weather.uncertainty') };
    return <div className="live-bar race-bar practice-bar">
        <div className="live-bar-row">
            <LiveClock caption={t('practice.clock')} value={sessionClock(Math.min(view.elapsedMs, view.durationMs), locale)} total={sessionClock(view.durationMs, locale)}>
                <span className="control-state live-flag" data-state={state} role="status"><Icon name={state === 'GREEN' ? 'play' : 'flag'} size={14}/>{t(view.status === 'FINISHED' ? 'practice.finished' : view.elapsedMs >= view.durationMs ? 'practice.chequered' : 'practice.remaining', { time: sessionClock(view.durationMs - view.elapsedMs, locale) })}</span>
            </LiveClock>
            {w && <ConditionChips items={items} forecast={forecast} label={t('weather.title')}/>}
        </div>
        <section className="playback-bar" aria-label={t('viewer.playback')}>
            <PlaybackControls playback={playback} done={done} onToggle={playback.playing ? controller.pause : controller.play} onStep={() => void controller.step()} stepLabel={t('practice.step', { seconds: format.number(view.stepMs / 1000) })}
                onSpeed={controller.setSpeed} onSkip={controller.skip} skipLabel={t('practice.nextEvent')} onAutoPause={controller.setAutoPause}
                extra={<ConfirmButton className="live-tool" disabled={done || playback.busy} label={t('practice.simulateRemainder')} confirmText={t('practice.simulateRemainderConfirm')} confirmLabel={t('practice.confirm')} onConfirm={onRemainder}/>}
                status={playback.busy && !done ? t('viewer.saving') : t(`practice.phase.${playback.phase}`, { speed: format.number(playback.speed) })}/>
            <div className="race-status-line">
                <p className={`attention-line attention-${tone}`} role="status" aria-live="polite">{line && <><Icon name={tone === 'finish' ? 'flag' : tone === 'command' ? 'check' : 'alert'} size={14}/>{line}</>}</p>
                {playback.error && <p role="alert" className="attention-line attention-error">{t(`practice.error.${playback.error as PracticeErrorCode}`, {})}</p>}
            </div>
        </section>
    </div>;
}
function PracticeOperations({ initial }: { initial: PracticeView }) {
    const { t, format } = useI18n();
    const [view, setView] = useState(initial);
    const ids = [initial.careerId, initial.eventId, initial.sessionId] as const;
    const [controller] = useState<Controller>(() => new PlaybackController(initial, practiceAdapter, async v => { const next = unwrap(await practiceAdvanceAction(...ids, v.elapsedMs)); setView(next); return next; }));
    const playback = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    useEffect(() => () => controller.pause(), [controller]);
    const [selected, setSelected] = useState(() => initial.entrants.find(e => e.own)?.entrantId ?? initial.entrants[0].entrantId);
    const [reduceMotion, setReduceMotion] = useState(false), [pane, setPane] = useState<'strategy' | 'timing' | 'track'>('strategy');
    const layout = layoutForCircuit(view.sourceCircuitId), chosen = view.entrants.find(e => e.entrantId === selected) ?? view.entrants[0];
    // Map rows keep a stable order (entrant id) so markers never re-key when the classification changes.
    const rows = useMemo<MapRow[]>(() => [...view.entrants].sort((a, b) => a.entrantId.localeCompare(b.entrantId)).map(e => ({ id: e.entrantId, progress: e.distance, status: 'RUNNING', name: e.name, team: e.team, player: e.player, color: e.color, abbreviation: e.abbreviation, pitting: false, entrant: { position: e.position }, hidden: e.location === 'GARAGE' })), [view]);
    const tiers = useMemo(() => new Map(rows.map(r => [r.id, r.hidden ? LABEL_TIER.FIELD : r.id === chosen.entrantId ? LABEL_TIER.SELECTED : r.player ? LABEL_TIER.PLAYER : r.entrant.position <= 3 && view.entrants.find(e => e.entrantId === r.id)?.bestLapMs ? LABEL_TIER.LEADER : LABEL_TIER.FIELD])), [rows, chosen.entrantId, view.entrants]);
    const send = (entrantId: string, revision: number, command: PracticeUiCommand) => {
        void controller.command(async v => { const next = unwrap(await practiceCommandAction(...ids, v.elapsedMs, { ...command, entrantId, revision })); setView(next); return next; }, { entrantId, kind: command.kind });
    };
    const remainder = () => { void controller.command(async v => { const next = unwrap(await practiceRemainderAction(...ids, v.elapsedMs)); setView(next); return next; }, null); };
    const onTrack = view.entrants.filter(e => e.location !== 'GARAGE');
    const counts = (['OUT_LAP', 'FLYING', 'IN_LAP'] as const).map(l => ({ l, n: onTrack.filter(e => e.location === l).length }));
    return <div className="live live-practice" data-kind="PRACTICE" data-pane={pane}>
        <LocalizedPageTitle titleKey="practice.title"/>
        <PracticeHeader view={view}/>
        <PracticeBar controller={controller} playback={playback} view={view} onRemainder={remainder}/>
        {view.status === 'FINISHED' && <PracticeSummary view={view} weekendHref={weekendHref(view)}/>}
        <PaneSwitch label={t('live.panes')} active={pane} onPick={setPane} panes={[{ id: 'strategy', label: t('live.pane.engineering') }, { id: 'timing', label: t('live.pane.timing') }, { id: 'track', label: t('live.pane.track') }]}/>
        <div className="live-grid ops-grid">
            <div className="live-area-switch" data-pane="always"><PracticeSwitch view={view} selected={chosen.entrantId} onSelect={setSelected}/></div>
            <div className="live-area-tower" data-pane="timing"><PracticeTiming view={view} selected={chosen.entrantId} onSelect={setSelected}/></div>
            <div className="live-area-map" data-pane="track"><section className="ops-panel track-panel live-panel"><div className="ops-panel-title live-panel-head"><h2>{t('viewer.track')}</h2><span className="ops-muted">{t(layout.metadata?.realGeometry ? 'viewer.realGeometry' : 'viewer.schematic')}</span></div>
                <TrackMap key={layout.id} layout={layout} rows={rows} selected={chosen.entrantId} onSelect={setSelected} speed={playback.speed} reduceMotion={reduceMotion} motion={playback.motion} checkpoint={view.step} skipping={playback.skipping} latencyMs={playback.latencyMs} tiers={tiers}/>
                <ul className="live-legend" aria-label={t('practice.where')}>{counts.map(({ l, n }) => <li key={l} data-location={l}><span aria-hidden="true">{LOCATION_GLYPH[l]}</span>{t(`practice.location.${l}`)} <strong>{format.number(n)}</strong></li>)}</ul>
                <p className="map-notice">{t('practice.mapNote')} <label className="live-switch"><input type="checkbox" role="switch" checked={reduceMotion} onChange={e => setReduceMotion(e.target.checked)}/><span className="live-switch-track" aria-hidden="true"/><span>{t('viewer.reduceMotion')}</span></label></p></section>
                <PracticeRunLog view={view}/>
            </div>
            <div className="live-area-panel" data-pane="strategy"><PracticeDriverPanel key={chosen.entrantId} view={view} e={chosen} busy={playback.busy} send={send}/></div>
        </div>
    </div>;
}

"use client";
import { useState, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useI18n, LocalizedPageTitle } from '../../../i18n/provider';
import type { RaceViewData } from '../public-view';
import { formatRaceTime } from '../../../i18n/race-time';
import { layoutForCircuit } from '../../../data/seed/circuit-layouts';
import { drawnPitLane } from '../../../data/seed/circuit-pit-lanes';
import { racePitRoute } from '../../../game/domain/pit-geometry';
import { compactRotation, orientLayout } from '../../../game/domain/circuit-geometry';
import { timingRows } from './model';
import { PlaybackController } from './playback';
import { PlaybackBar } from './playback-bar';
import { raceCheckpointAction, sprintRemainderAction, viewerAction } from './actions';
import { SprintRemainder, SprintSummary } from './sprint-panels';
import { commandInfo, type ViewerIntent } from './intents';
import { TrackMap } from './track-map';
import { DriverPanel } from './driver-panel';
import { WeatherPanel } from '../weather-panel';
import { RaceHeader, RaceClock, ConditionsStrip, RaceAlerts } from './race-header';
import { TimingTower } from './timing-tower';
import { PlayerSwitch } from './player-switch';
import { EventFeed } from './event-feed';
import { IssuesRail } from './issues-rail';
import { strategicIssues, worstSeverity } from './issues';
import { PaneSwitch } from '../../live/live-frame';
import { Icon } from '../../../components/ui/icon';
import { RaceDetails } from './race-details';
const PHONE = '(max-width: 599px)';
const subscribePhone = (notify: () => void) => { const media = window.matchMedia(PHONE); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify); };
import { controlMode, labelTiers } from './race-view';
export function RaceOperations({ initialData }: {
    initialData: RaceViewData;
}) {
    const { t, format, locale } = useI18n();
    const [data, setData] = useState(initialData);
    const [controller] = useState(() => new PlaybackController(initialData.state!, initialData.progress.career.playerTeamId, async (state) => { const result = await viewerAction(initialData.progress.career.id, initialData.eventId, state.lap, { kind: 'advance' }, initialData.kind ?? 'RACE'); if (!result.data)
        throw new Error(result.error!); setData(result.data); return result.data.state!; }));
    const playback = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    useEffect(() => () => controller.pause(), [controller]);
    // Viewer preferences (selection, gap mode, motion) are ephemeral and never touch Race state.
    const rows = useMemo(() => timingRows(data), [data]), [selected, setSelected] = useState(() => timingRows(initialData).find(r => r.player)?.id ?? initialData.state!.entrants[0].entrantId), [interval, setIntervalView] = useState(false), [reduceMotion, setReduceMotion] = useState(false);
    const s = data.state!, row = rows.find(r => r.id === selected) ?? rows[0], layout = layoutForCircuit(data.circuit.sourceCircuitId), control = controlMode(s), weather = s.weather;
    const tiers = useMemo(() => labelTiers(rows, row.id, s), [rows, row.id, s]);
    // Drawn pit lane: authored per-circuit presentation, re-parameterised by this Race's frozen authoritative anchors.
    const anchors = s.input.pitAnchors, sourceCircuitId = data.circuit.sourceCircuitId;
    const pitRoute = useMemo(() => { const lane = anchors ? drawnPitLane(sourceCircuitId) : null; return lane && anchors ? racePitRoute(lane, anchors) : undefined; }, [anchors?.entry, anchors?.service, anchors?.exit, sourceCircuitId]); // eslint-disable-line react-hooks/exhaustive-deps
    // Phone-width maps: a data-driven rigid presentation rotation when it materially enlarges the drawing (never a stretch).
    const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false);
    const map = useMemo(() => {
        const degrees = phone ? compactRotation([...layout.points, ...(pitRoute?.points ?? [])]) : 0, oriented = orientLayout(layout, degrees);
        return { layout: oriented.layout, pitRoute: pitRoute && { ...pitRoute, points: oriented.transform(pitRoute.points) } };
    }, [phone, layout, pitRoute]);
    const send = (intent: ViewerIntent) => { void controller.command(async (state) => { const result = await viewerAction(data.progress.career.id, data.eventId, state.lap, intent, data.kind ?? 'RACE'); if (!result.data)
        throw new Error(result.error!); setData(result.data); return result.data.state!; }, commandInfo(intent)); };
    const attentionId = playback.reason && playback.reason !== 'FINISH' ? playback.attention?.entrantId ?? null : null;
    // Multi-tab: a STALE answer to a command, or a returning tab whose checkpoint is behind the saved Race, gets a
    // clear notice. The server already refused the stale request, so the authoritative Race is unchanged.
    const [advancedElsewhere, setAdvancedElsewhere] = useState(false);
    const stale = advancedElsewhere || playback.error === 'STALE';
    useEffect(() => {
        const check = () => {
            if (document.visibilityState !== 'visible' || controller.getSnapshot().busy) return;
            const lap = controller.getState().lap;
            void raceCheckpointAction(initialData.progress.career.id, initialData.eventId, initialData.kind ?? 'RACE').then(saved => {
                if (saved && saved.lap !== lap && controller.getState().lap === lap && !controller.getSnapshot().busy) { controller.pause(); setAdvancedElsewhere(true); }
            });
        };
        window.addEventListener('focus', check);
        document.addEventListener('visibilitychange', check);
        return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
    }, [controller, initialData]);
    const sprint = data.kind === 'SPRINT';
    // Sprint Simulate Remainder goes through the controller's single mutation queue like every other command.
    const remainder = () => { void controller.command(async (state) => { const result = await sprintRemainderAction(data.progress.career.id, data.eventId, state.lap); if (!result.data)
        throw new Error(result.error!); setData(result.data); return result.data.state!; }, null); };
    const issues = useMemo(() => strategicIssues(rows, s), [rows, s]);
    const severity = useMemo(() => Object.fromEntries(rows.filter(r => r.player).map(r => [r.id, worstSeverity(issues, r.id)])), [rows, issues]);
    const [pane, setPane] = useState<LivePane>('strategy');
    const focus = (id: string) => { setSelected(id); setPane('strategy'); };
    const critical = issues.some(i => i.severity === 'CRITICAL');
    return <div className="live live-race" data-kind={sprint ? 'SPRINT' : 'RACE'} data-pane={pane}>
  <LocalizedPageTitle titleKey={sprint ? 'sprint.title' : 'viewer.title'}/>
  <div className="race-header-line"><RaceHeader data={data}/>{sprint && s.status === 'FINISHED' && <RaceDetails title={t('sprint.result')} className="race-sprint-result"><SprintSummary data={data} rows={rows}/></RaceDetails>}</div>
  {/* Sticky live bar: lap + Race Control, conditions, race-control tools, status line and the persistent issues rail. */}
  <div className="live-bar race-bar">
   <div className="live-bar-row"><RaceClock data={data}/><ConditionsStrip data={data}/></div>
   <PlaybackBar controller={controller} playback={playback} rows={rows} reduceMotion={reduceMotion} onReduceMotion={setReduceMotion} alerts={<RaceAlerts data={data} rows={rows}/>}
    extra={sprint && s.status === 'RUNNING' ? <SprintRemainder busy={playback.busy} onConfirm={remainder}/> : undefined}/>
   {stale && <p className="race-stale" role="alert"><Icon name="alert" size={14}/><span>{t('viewer.stale')}</span><button type="button" onClick={() => window.location.reload()}>{t('viewer.refresh')}</button></p>}
   {s.status === 'RUNNING' && <IssuesRail issues={issues} rows={rows} lap={s.lap} attention={playback.attention ?? playback.lastAttention} onSelect={focus}/>}
  </div>
  <PaneSwitch label={t('live.panes')} active={pane} onPick={setPane} panes={[
   { id: 'strategy', label: t('live.pane.strategy'), badge: critical ? <Icon name="alert" size={12} label={t('issues.severity.CRITICAL')}/> : undefined },
   { id: 'timing', label: t('live.pane.timing') }, { id: 'track', label: t('live.pane.track') }, { id: 'feed', label: t('live.pane.feed') }]}/>
  <div className="live-grid ops-grid">
   <div className="live-area-switch" data-pane="always"><PlayerSwitch state={s} rows={rows} selected={row.id} onSelect={setSelected} attentionId={attentionId} severity={severity}/></div>
   <div className="live-area-tower" data-pane="timing"><TimingTower state={s} rows={rows} selected={row.id} onSelect={focus} interval={interval} onInterval={setIntervalView} attentionId={attentionId}/></div>
   <div className="live-area-map" data-pane="track"><section className="ops-panel track-panel live-panel"><div className="ops-panel-title live-panel-head"><h2>{t('viewer.track')}</h2><span className="ops-muted">{t(layout.metadata?.realGeometry ? 'viewer.realGeometry' : 'viewer.schematic')}</span></div><TrackMap key={layout.id} layout={map.layout} rows={rows} selected={row.id} onSelect={setSelected} speed={playback.speed} reduceMotion={reduceMotion} motion={playback.motion} checkpoint={s.lap} control={control} skipping={playback.skipping} latencyMs={playback.latencyMs} startingGrid tiers={tiers} authoritative={s.simulationVersion === 8} pitRoute={map.pitRoute} compact={phone} raceViewer/><p className="map-notice">{t('viewer.interpolation')} {t('viewer.labelNote')}</p></section></div>
   <div className="live-area-feed" data-pane="feed"><EventFeed data={data}/><div className="race-secondary-tools">
    {weather && <RaceDetails title={t('weather.forecast')} className="forecast-drawer"><WeatherPanel state={s}/></RaceDetails>}
    <RaceDetails title={t('viewer.diagnostics')} className="ops-diagnostics live-diagnostics"><p>{t('race.version')}: {format.number(s.simulationVersion)}</p>{rows.map(r => <p key={r.id}>{r.name} · {t('race.total')}: {formatRaceTime(r.entrant.elapsedTimeMs, locale)} · {t('race.best')}: {r.entrant.bestLapTimeMs ? formatRaceTime(r.entrant.bestLapTimeMs, locale) : t('race.noTime')} · {t('traffic.overtakes')}: {format.number(r.entrant.track?.overtakesCompleted ?? 0)}</p>)}</RaceDetails>
   </div></div>
   <div className="live-area-panel" data-pane="strategy"><DriverPanel key={row.id} data={data} row={row} rows={rows} busy={playback.busy} send={send}/></div>
  </div>
 </div>;
}
type LivePane = 'strategy' | 'timing' | 'track' | 'feed';

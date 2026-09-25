"use client";
import { useState, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useI18n, LocalizedPageTitle } from '../../../i18n/provider';
import type { CareerRaceData } from '../../../game/domain/race-repository';
import { formatRaceTime } from '../../../i18n/race-time';
import { layoutForCircuit } from '../../../data/seed/circuit-layouts';
import { timingRows } from './model';
import { PlaybackController } from './playback';
import { PlaybackBar } from './playback-bar';
import { viewerAction } from './actions';
import { commandInfo, type ViewerIntent } from './intents';
import { TrackMap } from './track-map';
import { DriverPanel } from './driver-panel';
import { WeatherPanel } from '../weather-panel';
import { RaceHeader, RaceClock, ConditionsStrip, RaceAlerts } from './race-header';
import { TimingTower } from './timing-tower';
import { PlayerSwitch } from './player-switch';
import { EventFeed } from './event-feed';
import { controlMode, labelTiers } from './race-view';
export function RaceOperations({ initialData }: {
    initialData: CareerRaceData;
}) {
    const { t, format, locale } = useI18n();
    const [data, setData] = useState(initialData);
    const [controller] = useState(() => new PlaybackController(initialData.state!, initialData.progress.career.playerTeamId, async (state) => { const result = await viewerAction(initialData.progress.career.id, initialData.eventId, state.lap, { kind: 'advance' }); if (!result.data)
        throw new Error(result.error!); setData(result.data); return result.data.state!; }));
    const playback = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    useEffect(() => () => controller.pause(), [controller]);
    // Viewer preferences (selection, gap mode, motion) are ephemeral and never touch Race state.
    const rows = useMemo(() => timingRows(data), [data]), [selected, setSelected] = useState(() => timingRows(initialData).find(r => r.player)?.id ?? initialData.state!.entrants[0].entrantId), [interval, setIntervalView] = useState(false), [reduceMotion, setReduceMotion] = useState(false);
    const s = data.state!, row = rows.find(r => r.id === selected) ?? rows[0], layout = layoutForCircuit(data.circuit.sourceCircuitId), control = controlMode(s), weather = s.weather;
    const tiers = useMemo(() => labelTiers(rows, row.id, s), [rows, row.id, s]);
    const send = (intent: ViewerIntent) => { void controller.command(async (state) => { const result = await viewerAction(data.progress.career.id, data.eventId, state.lap, intent); if (!result.data)
        throw new Error(result.error!); setData(result.data); return result.data.state!; }, commandInfo(intent)); };
    const attentionId = playback.reason && playback.reason !== 'FINISH' ? playback.attention?.entrantId ?? null : null;
    return <div className="race-ops">
  <LocalizedPageTitle titleKey="viewer.title"/>
  <RaceHeader data={data}/>
  {/* Sticky Race bar: conditions, playback and a fixed-height status line keep Race context visible while commanding. */}
  <div className="race-bar">
   <div className="race-bar-top"><RaceClock data={data}/><ConditionsStrip data={data}/></div>
   <PlaybackBar controller={controller} playback={playback} rows={rows} reduceMotion={reduceMotion} onReduceMotion={setReduceMotion} alerts={<RaceAlerts data={data} rows={rows}/>}/>
  </div>
  <div className="ops-grid">
   <TimingTower state={s} rows={rows} selected={row.id} onSelect={setSelected} interval={interval} onInterval={setIntervalView} attentionId={attentionId}/>
   <div className="map-column"><section className="ops-panel track-panel"><div className="ops-panel-title"><h2>{t('viewer.track')}</h2><span className="ops-muted">{t(layout.metadata?.realGeometry ? 'viewer.realGeometry' : 'viewer.schematic')}</span></div><PlayerSwitch state={s} rows={rows} selected={row.id} onSelect={setSelected} attentionId={attentionId}/><TrackMap key={layout.id} layout={layout} rows={rows} selected={row.id} onSelect={setSelected} speed={playback.speed} reduceMotion={reduceMotion} motion={playback.motion} checkpoint={s.lap} control={control} skipping={playback.skipping} latencyMs={playback.latencyMs} tiers={tiers}/><p className="map-notice">{t('viewer.interpolation')} {t('viewer.labelNote')}</p></section>
   {weather && <details className="ops-panel forecast-drawer"><summary>{t('weather.forecast')}</summary><WeatherPanel state={s}/></details>}
   <EventFeed data={data}/>
   </div>
   <DriverPanel key={row.id} data={data} row={row} rows={rows} busy={playback.busy} send={send}/>
  </div>
  <details className="ops-diagnostics"><summary>{t('viewer.diagnostics')}</summary><p>{t('race.seed')}: {format.number(s.input.seed, { useGrouping: false })} · {t('race.version')}: {format.number(s.simulationVersion)}</p>{rows.map(r => <p key={r.id}>{r.name} · {t('race.total')}: {formatRaceTime(r.entrant.elapsedTimeMs, locale)} · {t('race.best')}: {r.entrant.bestLapTimeMs ? formatRaceTime(r.entrant.bestLapTimeMs, locale) : t('race.noTime')} · {t('traffic.overtakes')}: {format.number(r.entrant.track?.overtakesCompleted ?? 0)}</p>)}</details>
 </div>;
}

"use client";
import { useState } from 'react';
import { useI18n } from '../../../i18n/provider';
import type { RaceViewData } from '../public-view';
import type { timingRows } from './model';
import { controlMode, drsState, type DrsState } from './race-view';
import { forecastItems, quietForecastKey } from '../forecast-copy';
import { ConditionChips, LiveClock, LiveHeader, SessionNav, rainKey, waterKey, type ConditionItem } from '../../live/live-frame';
import { Icon, type IconName } from '../../../components/ui/icon';
type Rows = ReturnType<typeof timingRows>;
const CONTROL_ICON: Record<'GREEN' | 'VSC' | 'SAFETY_CAR' | 'FINISHED', IconName> = { GREEN: 'flag', VSC: 'alert', SAFETY_CAR: 'alert', FINISHED: 'flag' };
/** Race identity (UIX-B live frame): event, circuit, Sprint badge and the weekend's sessions. */
export function RaceHeader({ data }: { data: RaceViewData }) {
    const { t } = useI18n(), event = data.progress.events.find(e => e.id === data.eventId)!, sprint = data.kind === 'SPRINT';
    const weekendHref = `/career/${data.progress.career.id}/events/${data.eventId}`;
    const sessions = [...(event.weekend?.sessions ?? [])].sort((a, b) => a.order - b.order);
    return <LiveHeader kind={sprint ? 'SPRINT' : 'RACE'} kindLabel={t(sprint ? 'sprint.title' : 'viewer.title')} title={event.name} circuit={event.circuitName}
        backHref={weekendHref} backLabel={t('race.back')}
        badge={sprint ? <strong className="session-kind-badge live-badge-sprint">{t('live.sprintFormat')}</strong> : null}
        nav={sessions.length > 0 ? <SessionNav sessions={sessions} isCurrent={s => s.id === data.sessionId} weekendHref={weekendHref}/> : null}/>;
}
/** Lap clock + Race Control state as icon + text (never colour alone); lives in the sticky bar. */
export function RaceClock({ data }: { data: RaceViewData }) {
    const { t, format } = useI18n(), s = data.state!, control = controlMode(s), state = s.status === 'FINISHED' ? 'FINISHED' : control;
    const remaining = s.input.totalLaps - s.lap;
    return <LiveClock caption={data.kind === 'SPRINT' ? `${t('sprint.title')} · ${t('viewer.lap')}` : t('viewer.lap')} value={format.number(s.lap)} total={format.number(s.input.totalLaps)}>
        <span className={`control-state live-flag control-${state}`} data-state={state} role="status"><Icon name={CONTROL_ICON[state]} size={14}/>{t(s.status === 'FINISHED' ? 'incident.FINISHED' : s.incidents ? `incident.${control}` : 'race.running')}</span>
        {s.status === 'RUNNING' && remaining > 0 && <small className="live-clock-note">{t('live.lapsToGo', { count: format.number(remaining) })}</small>}
        {s.incidents?.endingThisLap && control !== 'GREEN' && s.status !== 'FINISHED' && <small className="live-clock-note">{t(`incident.endingThisLap.${control}`)}</small>}
    </LiveClock>;
}
/** Persistent conditions: rain, track water and temperatures as separate concepts; the forecast stays labelled as one. */
export function ConditionsStrip({ data }: { data: RaceViewData }) {
    const { t, format } = useI18n(), s = data.state!, w = s.weather, drs = drsState(s);
    const percent = (n: number) => format.percentage(n / 1000, { maximumFractionDigits: 0 });
    const temperature = (n: number) => format.number(n / 1000, { style: 'unit', unit: 'celsius', maximumFractionDigits: 1 });
    const running = !!w && s.status === 'RUNNING', next = running ? forecastItems(s.forecast, w!.rainfallIntensity)[0] : undefined;
    if (!w) return <section className="live-conditions weather-strip" aria-label={t('weather.title')}><span className="live-chip">{t('viewer.legacy')}</span></section>;
    const items: ConditionItem[] = [
        { key: 'rain', icon: 'drop', label: t('weather.rain'), value: percent(w.rainfallIntensity), note: t(rainKey(w.rainfallIntensity)), tone: w.rainfallIntensity > 0 ? 'wet' : undefined },
        { key: 'water', icon: 'waves', label: t('weather.water'), value: percent(w.trackWater), note: t(waterKey(w.trackWater)), tone: w.trackWater >= 100 ? 'wet' : undefined },
        { key: 'air', icon: 'thermo', label: t('weather.air'), value: temperature(w.airTemperatureMilliC) },
        { key: 'track', icon: 'thermo', label: t('weather.track'), value: temperature(w.trackTemperatureMilliC) },
    ];
    if (drs !== 'UNAVAILABLE' && drs !== 'FINISHED') items.push({ key: 'drs', icon: 'aero', label: t('viewer.drsShort'), value: t(`viewer.drs.${drs}`, { count: format.number(s.incidents?.drsDelay ?? 0) }), tone: drs === 'ENABLED' ? undefined : 'warn' });
    const forecast: ConditionItem | null = next
        ? { key: 'forecast', icon: 'cloud', label: t('weather.forecast'), value: t(next.label), note: t('weather.window', { from: format.number(next.window.arrivalMinLap), to: format.number(next.window.arrivalMaxLap), min: percent(next.window.rainfallMin), max: percent(next.window.rainfallMax) }), tone: 'info', title: t('weather.uncertainty') }
        : running ? { key: 'forecast', icon: 'cloud', label: t('weather.forecast'), value: t(quietForecastKey(w.rainfallIntensity)), title: t('weather.uncertainty') } : null;
    return <ConditionChips items={items} forecast={forecast} label={t('weather.title')}/>;
}
/**
 * Contextual Race-state banner: neutralisation, DRS changes and player-car PIT / RETIRED. Only shows what is true at
 * the current checkpoint; a DRS re-enable notice lasts for the checkpoint where the change was observed.
 */
export function RaceAlerts({ data, rows }: { data: RaceViewData; rows: Rows }) {
    const { t, format } = useI18n(), s = data.state!, control = controlMode(s), drs = drsState(s);
    const [seen, setSeen] = useState<{ drs: DrsState; enabledAt: number | null }>({ drs, enabledAt: null });
    if (seen.drs !== drs) setSeen({ drs, enabledAt: drs === 'ENABLED' ? s.lap : null });
    const alerts: { key: string; text: string; tone: string }[] = [];
    if (s.status === 'RUNNING' && control !== 'GREEN') alerts.push({ key: 'control', tone: `control-${control}`, text: s.incidents!.endingThisLap ? `${t(`incident.${control}`)} · ${t(`incident.endingThisLap.${control}`)}` : t(`incident.${control}`) });
    // v8E: explain the neutralisation's effect on gaps (VSC holds them; the Safety Car gathers the field into a train).
    if (s.status === 'RUNNING' && control !== 'GREEN') alerts.push({ key: 'control-note', tone: `control-${control}`, text: t(`incident.gapNote.${control}`) });
    if (s.status === 'RUNNING' && (drs === 'WET' || drs === 'RESTART')) alerts.push({ key: 'drs', tone: 'alert-drs-off', text: t(`viewer.drs.${drs}`, { count: format.number(s.incidents?.drsDelay ?? 0) }) });
    if (s.status === 'RUNNING' && drs === 'ENABLED' && seen.enabledAt === s.lap && s.lap > 0) alerts.push({ key: 'drs-on', tone: 'alert-drs-on', text: t('viewer.drsEnabledNow') });
    for (const r of rows.filter(r => r.player)) {
        if (r.status === 'RETIRED') alerts.push({ key: `ret-${r.id}`, tone: 'alert-retired', text: t('viewer.alertRetired', { driver: r.abbreviation }) });
        else if (r.pitting) alerts.push({ key: `pit-${r.id}`, tone: 'alert-pit', text: t('viewer.alertPit', { driver: r.abbreviation }) });
    }
    if (!alerts.length) return null;
    return <div className="race-alerts" role="status" aria-label={t('viewer.alerts')}>{alerts.map(a => <span key={a.key} className={`race-alert ${a.tone}`}><Icon name={a.tone.startsWith('control') ? 'alert' : a.tone === 'alert-pit' ? 'wrench' : 'info'} size={12}/>{a.text}</span>)}</div>;
}

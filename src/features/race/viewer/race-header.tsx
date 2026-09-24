"use client";
import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '../../../i18n/provider';
import type { CareerRaceData } from '../../../game/domain/race-repository';
import { forecastAt } from '../../../simulation/race/weather/model';
import type { timingRows } from './model';
import { controlMode, drsState, type DrsState } from './race-view';
type Rows = ReturnType<typeof timingRows>;
const CONTROL_GLYPH = { GREEN: '●', VSC: '◆', SAFETY_CAR: '▲' } as const;
/** Race identity, lap clock and a text + glyph Race Control state (never colour alone). */
export function RaceHeader({ data }: { data: CareerRaceData }) {
    const { t, format } = useI18n(), s = data.state!, event = data.progress.events.find(e => e.id === data.eventId)!, control = controlMode(s);
    return <header className="ops-header"><div><Link className="ops-back" href={`/career/${data.progress.career.id}/events/${data.eventId}`}>← {t('race.back')}</Link><p className="eyebrow">{t('viewer.title')}</p><h1>{event.name}</h1><p className="ops-muted">{event.circuitName}</p></div>
        <div className="race-clock"><span>{t('viewer.lap')}</span><strong>{format.number(s.lap)}<small> / {format.number(s.input.totalLaps)}</small></strong>
            <span className={`control-state control-${s.status === 'FINISHED' ? 'FINISHED' : control}`} role="status"><span aria-hidden="true">{s.status === 'FINISHED' ? '■' : CONTROL_GLYPH[control]}</span> {t(s.status === 'FINISHED' ? 'incident.FINISHED' : s.incidents ? `incident.${control}` : 'race.running')}</span>
            {s.incidents && control !== 'GREEN' && s.status !== 'FINISHED' && <small>{t('incident.remaining', { count: format.number(s.incidents.remainingLaps) })}</small>}
        </div></header>;
}
/** Persistent conditions: rain, water, temperatures and DRS state stay visible without opening the forecast. */
export function ConditionsStrip({ data }: { data: CareerRaceData }) {
    const { t, format } = useI18n(), s = data.state!, w = s.weather, drs = drsState(s);
    const percent = (n: number) => format.percentage(n / 1000, { maximumFractionDigits: 0 });
    const temperature = (n: number) => format.number(n / 1000, { style: 'unit', unit: 'celsius', maximumFractionDigits: 1 });
    const next = w && s.input.weather && s.status === 'RUNNING' ? forecastAt(s.input.weather, s.lap + 1)[0] : undefined;
    return <section className="weather-strip" aria-label={t('weather.title')}>
        {w ? <>
            <span>{t('weather.rain')} <strong>{percent(w.rainfallIntensity)}</strong> <em>{t(w.rainfallIntensity === 0 ? 'weather.dry' : w.rainfallIntensity < 650 ? 'weather.light' : 'weather.heavy')}</em></span>
            <span className={w.trackWater >= 100 ? 'wet-track' : ''}>{t('weather.water')} <strong>{percent(w.trackWater)}</strong> <em>{t(w.trackWater < 100 ? 'weather.dry' : w.trackWater < 350 ? 'weather.damp' : 'weather.wet')}</em></span>
            <span>{t('weather.air')} <strong>{temperature(w.airTemperatureMilliC)}</strong></span>
            <span>{t('weather.track')} <strong>{temperature(w.trackTemperatureMilliC)}</strong></span>
        </> : <span>{t('viewer.legacy')}</span>}
        {drs !== 'UNAVAILABLE' && drs !== 'FINISHED' && <span className={`drs-chip ${drs === 'ENABLED' ? 'drs-on' : 'drs-off'}`}>{t(`viewer.drs.${drs}`, { count: format.number(s.incidents?.drsDelay ?? 0) })}</span>}
        {next && <span className="forecast-next">{t('weather.forecast')} <strong>{t(next.rainfallMax < 200 ? 'weather.easing' : 'weather.expected')}</strong> <em>{t('weather.window', { from: format.number(next.arrivalMinLap), to: format.number(next.arrivalMaxLap), min: percent(next.rainfallMin), max: percent(next.rainfallMax) })}</em></span>}
    </section>;
}
/**
 * Contextual Race-state banner: neutralisation, DRS changes and player-car PIT / RETIRED. Only shows what is true at
 * the current checkpoint; a DRS re-enable notice lasts for the checkpoint where the change was observed.
 */
export function RaceAlerts({ data, rows }: { data: CareerRaceData; rows: Rows }) {
    const { t, format } = useI18n(), s = data.state!, control = controlMode(s), drs = drsState(s);
    const [seen, setSeen] = useState<{ drs: DrsState; enabledAt: number | null }>({ drs, enabledAt: null });
    if (seen.drs !== drs) setSeen({ drs, enabledAt: drs === 'ENABLED' ? s.lap : null });
    const alerts: { key: string; text: string; tone: string }[] = [];
    if (s.status === 'RUNNING' && control !== 'GREEN') alerts.push({ key: 'control', tone: `control-${control}`, text: `${t(`incident.${control}`)} · ${t('incident.remaining', { count: format.number(s.incidents!.remainingLaps) })}` });
    if (s.status === 'RUNNING' && (drs === 'WET' || drs === 'RESTART')) alerts.push({ key: 'drs', tone: 'alert-drs-off', text: t(`viewer.drs.${drs}`, { count: format.number(s.incidents?.drsDelay ?? 0) }) });
    if (s.status === 'RUNNING' && drs === 'ENABLED' && seen.enabledAt === s.lap && s.lap > 0) alerts.push({ key: 'drs-on', tone: 'alert-drs-on', text: t('viewer.drsEnabledNow') });
    for (const r of rows.filter(r => r.player)) {
        if (r.status === 'RETIRED') alerts.push({ key: `ret-${r.id}`, tone: 'alert-retired', text: t('viewer.alertRetired', { driver: r.abbreviation }) });
        else if (r.pitting) alerts.push({ key: `pit-${r.id}`, tone: 'alert-pit', text: t('viewer.alertPit', { driver: r.abbreviation }) });
    }
    if (!alerts.length) return null;
    return <div className="race-alerts" role="status" aria-label={t('viewer.alerts')}>{alerts.map(a => <span key={a.key} className={`race-alert ${a.tone}`}>{a.text}</span>)}</div>;
}

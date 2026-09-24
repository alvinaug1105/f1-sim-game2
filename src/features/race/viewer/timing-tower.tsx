"use client";
import { useI18n } from '../../../i18n/provider';
import { formatRaceGap } from '../../../i18n/race-time';
import type { RaceSimulationState } from '../../../simulation/race/types';
import type { timingRows } from './model';
import { controlMode, drsState } from './race-view';
type Rows = ReturnType<typeof timingRows>;
/** Authoritative, compact timing: position, identity, gap/interval, one status chip, tyre + age + stops. */
export function TimingTower({ state: s, rows, selected, onSelect, interval, onInterval }: { state: RaceSimulationState; rows: Rows; selected: string; onSelect: (id: string) => void; interval: boolean; onInterval: (interval: boolean) => void }) {
    const { t, format, locale } = useI18n(), finished = s.status === 'FINISHED', control = controlMode(s), drsOpen = drsState(s) === 'ENABLED';
    const gap = (value: number | null) => value === null ? t('race.lapped') : formatRaceGap(value, locale);
    const title = t(finished ? 'race.classification' : 'viewer.timing');
    return <section className="ops-panel timing-panel" aria-label={t('viewer.timing')}>
        <div className="ops-panel-title"><h2>{title}</h2>
            <div className="segmented" role="group" aria-label={t('viewer.gapMode')}>{[false, true].map(mode => <button key={String(mode)} className="ops-toggle" onClick={() => onInterval(mode)} aria-pressed={interval === mode}>{t(mode ? 'viewer.interval' : 'viewer.gap')}</button>)}</div>
        </div>
        {!finished && control !== 'GREEN' && <p className={`tower-context control-${control}`}>{t(`incident.${control}`)} · {t('viewer.neutralisedGaps')}</p>}
        <div className="timing-scroll"><table className="timing-tower"><caption className="sr-only">{title} · {t(interval ? 'viewer.interval' : 'viewer.gap')}</caption>
            <thead><tr><th>{t('race.position')}</th><th>{t('race.driver')}</th><th>{t(interval ? 'viewer.interval' : 'viewer.gap')}</th>{s.input.tyres && <th>{t('viewer.tyre')}</th>}</tr></thead>
            <tbody>{rows.map(r => {
                const chosen = r.id === selected, retired = r.status === 'RETIRED', stint = r.entrant.stint;
                const chip = retired ? null : r.pitting ? 'PIT' : r.status === 'FINISHED' ? 'FINISHED' : drsOpen && r.entrant.track?.drsEligible ? 'DRS' : null;
                return <tr key={r.id} className={[chosen && 'selected-row', r.player && 'player-row', retired && 'retired-row', r.pitting && 'pit-row'].filter(Boolean).join(' ')} style={r.player ? { ['--team' as string]: r.color } : undefined}>
                    <td>{format.number(r.entrant.position)}<small className={`position-change ${r.placesGained > 0 ? 'up' : r.placesGained < 0 ? 'down' : ''}`}>{retired ? '—' : r.placesGained ? `${r.placesGained > 0 ? '▲' : '▼'}${format.number(Math.abs(r.placesGained))}` : '·'}</small></td>
                    <th scope="row"><button onClick={() => onSelect(r.id)} aria-pressed={chosen} className="driver-select" style={{ borderColor: r.color }} title={r.name}><strong>{r.player && <span className="player-mark" aria-hidden="true">◆</span>}{r.abbreviation}{chosen && <span className="selected-mark" aria-hidden="true"> ◂</span>}</strong><small>{r.team}</small>{r.player && <span className="sr-only">{t('viewer.player')}</span>}</button></th>
                    <td className={retired ? 'status-out' : ''}>{retired ? t('incident.RETIRED') : r.entrant.position === 1 ? t('race.leader') : gap(interval ? r.interval : r.gap)}{chip && <small className={`row-chip chip-${chip}`}>{chip === 'PIT' ? t('viewer.pit') : chip === 'DRS' ? t('viewer.drsShort') : t('incident.FINISHED')}</small>}</td>
                    {s.input.tyres && <td>{stint ? <><span className={`tyre-token tyre-${stint.tyre.compound}`} title={t(`tyre.${stint.tyre.compound}`)}>{t(`viewer.tyre.${stint.tyre.compound}`)}</span><small>{t('viewer.ageShort', { count: format.number(stint.tyre.ageLaps) })}{r.entrant.pit && r.entrant.pit.stops.length > 0 && <> · {t('viewer.stopsShort', { count: format.number(r.entrant.pit.stops.length) })}</>}</small></> : t('race.noTime')}</td>}
                </tr>;
            })}</tbody></table></div>
        <p className="tower-note">{t('viewer.positionNote')}</p>
    </section>;
}

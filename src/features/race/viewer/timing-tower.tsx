"use client";
import type { CSSProperties } from 'react';
import { useI18n } from '../../../i18n/provider';
import { formatRaceGap, formatRaceTime } from '../../../i18n/race-time';
import type { RacePublicState } from '../public-view';
import type { timingRows } from './model';
import { controlMode, drsState, driverFlags, officialLeaderId } from './race-view';
import { FlagChips } from './flags';
type Rows = ReturnType<typeof timingRows>;
/**
 * Authoritative, compact timing (UIX-B): position + change, identity, gap/interval with one status chip, last lap,
 * tyre token + age, stops. Player rows carry a team-colour stripe and a ◆ marker (plus screen-reader text); the selected
 * row an amber outline. The whole row is one selection target; the driver button is the single keyboard control.
 */
export function TimingTower({ state: s, rows, selected, onSelect, interval, onInterval, attentionId = null }: { state: RacePublicState; rows: Rows; selected: string; onSelect: (id: string) => void; interval: boolean; onInterval: (interval: boolean) => void; attentionId?: string | null }) {
    const { t, format, locale } = useI18n(), finished = s.status === 'FINISHED', control = controlMode(s), drsOpen = drsState(s) === 'ENABLED', leaderId = officialLeaderId(s);
    const gap = (value: number | null) => value === null ? t('race.lapped') : formatRaceGap(value, locale);
    const title = t(finished ? 'race.classification' : 'viewer.timing');
    const pits = !!s.input.pits;
    return <section className="ops-panel timing-panel live-panel" aria-label={t('viewer.timing')}>
        <div className="ops-panel-title live-panel-head"><h2>{title}</h2>
            <div className="segmented" role="group" aria-label={t('viewer.gapMode')}>{[false, true].map(mode => <button key={String(mode)} className="ops-toggle" onClick={() => onInterval(mode)} aria-pressed={interval === mode}>{t(mode ? 'viewer.interval' : 'viewer.gap')}</button>)}</div>
        </div>
        {!finished && control !== 'GREEN' && <p className={`tower-context control-${control}`}>{t(`incident.${control}`)} · {t('viewer.neutralisedGaps')}</p>}
        <div className="timing-scroll"><table className="timing-tower"><caption className="sr-only">{title} · {t(interval ? 'viewer.interval' : 'viewer.gap')}</caption>
            <thead><tr><th scope="col">{t('race.position')}</th><th scope="col">{t('race.driver')}</th><th scope="col" className="num">{t(interval ? 'viewer.interval' : 'viewer.gap')}</th><th scope="col" className="col-last num">{t('viewer.lastLap')}</th>{s.input.tyres && <th scope="col">{t('viewer.tyre')}</th>}{pits && <th scope="col" className="col-stops num">{t('live.stopsShort')}</th>}</tr></thead>
            <tbody>{rows.map(r => {
                const chosen = r.id === selected, retired = r.status === 'RETIRED', dsq = r.disqualified, stint = r.entrant.stint;
                const chip = retired || dsq ? null : r.pitting ? 'PIT' : r.status === 'FINISHED' ? 'FINISHED' : drsOpen && r.entrant.track?.drsEligible ? 'DRS' : null;
                const last = r.entrant.lastLapTimeMs, best = r.entrant.bestLapTimeMs;
                return <tr key={r.id} onClick={() => onSelect(r.id)} data-entrant={r.id} className={['tower-row', chosen && 'selected-row', r.player && 'player-row', retired && 'retired-row', dsq && 'dsq-row', r.pitting && 'pit-row'].filter(Boolean).join(' ')} style={{ ['--row-team' as string]: r.color } as CSSProperties}>
                    <td className="tower-pos">{dsq ? <abbr title={t('classification.DISQUALIFIED')}>{t('classification.dsq')}</abbr> : format.number(r.entrant.position)}<small className={`position-change ${r.placesGained > 0 && !dsq ? 'up' : r.placesGained < 0 && !dsq ? 'down' : ''}`}>{retired || dsq ? '—' : r.placesGained ? `${r.placesGained > 0 ? '▲' : '▼'}${format.number(Math.abs(r.placesGained))}` : '·'}</small></td>
                    <th scope="row"><button onClick={() => onSelect(r.id)} aria-pressed={chosen} className="driver-select" title={r.name}><span className="tower-team" aria-hidden="true"/><strong>{r.player && <span className="player-mark" aria-hidden="true">◆</span>}{r.abbreviation}</strong><small>{r.team}</small>{r.player && <span className="sr-only">{t('viewer.player')}</span>}</button>{r.player && <FlagChips flags={driverFlags(r, rows, s, attentionId).filter(f => f !== 'PIT' && f !== 'RETIRED' && f !== 'FINISHED')} compact/>}</th>
                    <td className={`num tower-gap${retired || dsq ? ' status-out' : ''}`}>{dsq ? t('classification.DISQUALIFIED') : retired ? t('incident.RETIRED') : r.id === leaderId ? (chip === 'PIT' ? <span className="leader-pit">{t('viewer.leaderBadge')}<span aria-hidden="true"> · </span></span> : t('race.leader')) : gap(interval ? r.interval : r.gap)}{chip && <small className={`row-chip chip-${chip}`}>{chip === 'PIT' ? (r.id === leaderId ? t('viewer.inPitLane') : t('viewer.pit')) : chip === 'DRS' ? t('viewer.drsShort') : t('incident.FINISHED')}</small>}</td>
                    <td className="col-last num">{last === null ? t('race.noTime') : <>{formatRaceTime(last, locale)}{best !== null && last === best && <small className="pb-mark">{t('viewer.personalBest')}</small>}</>}</td>
                    {s.input.tyres && <td className="tower-tyre">{stint ? <><span className={`tyre-token tyre-${stint.tyre.compound}`} title={t(`tyre.${stint.tyre.compound}`)}>{t(`viewer.tyre.${stint.tyre.compound}`)}</span><small>{t('viewer.ageShort', { count: format.number(stint.tyre.ageLaps) })}</small></> : t('race.noTime')}</td>}
                    {pits && <td className="col-stops num">{r.entrant.pit ? <span title={t('viewer.stopsShort', { count: format.number(r.entrant.pit.stops.length) })}>{format.number(r.entrant.pit.stops.length)}</span> : t('race.noTime')}</td>}
                </tr>;
            })}</tbody></table></div>
        <p className="tower-note">{t('viewer.positionNote')}</p>
    </section>;
}

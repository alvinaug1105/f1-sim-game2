"use client";
import Link from 'next/link';
import { useI18n } from '../../../i18n/provider';
import { formatRaceGap } from '../../../i18n/race-time';
import type { CareerRaceData } from '../../../game/domain/race-repository';
import type { timingRows } from './model';
import { ConfirmButton } from '../../practice/components';
type Rows = ReturnType<typeof timingRows>;
/** Live Sprint: Simulate Remainder (confirmed) — both player cars are auto-managed to the flag on the same engine. */
export function SprintRemainder({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
    const { t } = useI18n();
    return <div className="sprint-remainder"><ConfirmButton className="ops-secondary" disabled={busy} label={t('sprint.remainder')} confirmText={t('sprint.remainderConfirm')} confirmLabel={t('practice.confirm')} onConfirm={onConfirm}/></div>;
}
/** Sprint Result: P1–P22 with gap/status and stops; player cars highlighted; the way on is Grand Prix Qualifying. */
export function SprintSummary({ data, rows }: { data: CareerRaceData; rows: Rows }) {
    const { t, format, locale } = useI18n(), winner = rows.find(r => r.entrant.position === 1);
    const ordered = [...rows].sort((a, b) => a.entrant.position - b.entrant.position), leaderLaps = ordered[0]?.entrant.completedLaps ?? 0;
    const gap = (r: Rows[number]) => r.status === 'RETIRED' ? t('incident.RETIRED')
        : r.entrant.position === 1 ? '—' : r.entrant.completedLaps < leaderLaps ? t('sprint.lapsDown', { count: format.number(leaderLaps - r.entrant.completedLaps) })
            : r.gap === null ? '—' : formatRaceGap(r.gap, locale);
    return <section className="ops-panel qualifying-summary sprint-summary" aria-labelledby="sprint-summary-title">
        <div className="ops-panel-title"><h2 id="sprint-summary-title">{t('sprint.result')}</h2>{winner && <span className="status-pill">◆ {t('sprint.winner', { driver: winner.abbreviation })}</span>}</div>
        <div className="summary-scroll"><table className="timing-tower qualifying-result">
            <caption className="sr-only">{t('sprint.result')}</caption>
            <thead><tr><th>{t('practice.posShort')}</th><th>{t('race.driver')}</th><th>{t('sprint.gap')}</th><th>{t('sprint.status')}</th><th>{t('sprint.stops')}</th></tr></thead>
            <tbody>{ordered.map(r => <tr key={r.id} className={['tower-row', r.player && 'player-row'].filter(Boolean).join(' ')} style={r.player ? { ['--team' as string]: r.color } : undefined}>
                <td>{format.number(r.entrant.position)}</td>
                <th scope="row"><strong style={{ borderColor: r.color }} className="summary-driver">{r.player && <span aria-hidden="true">◆ </span>}{r.abbreviation}</strong> <small>{r.team}</small>{r.player && <span className="sr-only">{t('viewer.player')}</span>}</th>
                <td>{gap(r)}</td><td>{t(r.status === 'RETIRED' ? 'incident.RETIRED' : 'incident.FINISHED')}</td>
                <td>{format.number(r.entrant.pit?.stops.length ?? 0)}{r.entrant.pit?.stints.length ? <small> · {r.entrant.pit.stints.map(x => t(`viewer.tyre.${x.startingTyre.compound}`)).join('–')}</small> : null}</td>
            </tr>)}</tbody>
        </table></div>
        <div className="summary-actions"><p>{t('sprint.resultNote')}</p><Link className="button-link" href={`/career/${data.progress.career.id}/events/${data.eventId}/qualifying`}>{t('sprint.continueToQualifying')}</Link></div>
    </section>;
}

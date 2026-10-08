import { useI18n } from '../../../i18n/provider';
import type { RacePublicState } from '../public-view';
import type { timingRows } from './model';
import { battleContext } from './race-view';

type Row = ReturnType<typeof timingRows>[number];
/** Classification neighbours and intervals already public in the timing tower. No predictions or hidden state. */
export function TrackContext({ row, rows, state, onStrategy, onSelect }: { row: Row; rows: readonly Row[]; state: RacePublicState; onStrategy: () => void; onSelect: (id: string) => void }) {
    const { t, format } = useI18n(), nearby = battleContext(rows, row.id, state);
    const seconds = (ms: number | null) => ms == null ? '—' : format.number(ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 3 });
    return <div className="track-context" aria-label={t('trackViewer.selectedContext')}>
        <div className="track-selected-context"><strong>{row.abbreviation} · {t('trackViewer.position', { position: format.number(row.entrant.position) })}</strong><span>{row.entrant.stint && t(`tyre.${row.entrant.stint.tyre.compound}`)} · {row.pitting && row.route ? t(`trackViewer.route.${row.route}`) : t(`incident.${row.status}`)}{row.player && row.entrant.pit?.pendingCompound ? ` · ${t('trackViewer.boxPending')}` : ''}</span></div>
        <div className="track-neighbours"><span>{t('trackViewer.ahead')}: <strong>{nearby.ahead?.abbreviation ?? '—'}</strong> {seconds(nearby.gapAheadMs)}</span><span>{t('trackViewer.behind')}: <strong>{nearby.behind?.abbreviation ?? '—'}</strong> {seconds(nearby.gapBehindMs)}</span></div>
        <button type="button" onClick={onStrategy}>{t('trackViewer.strategy')}</button>
        <details className="track-field-list" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}><summary>{t('trackViewer.carList')}</summary><ul>{rows.map(r => <li key={r.id}><button type="button" aria-pressed={r.id === row.id} onClick={() => onSelect(r.id)}>{r.abbreviation} · {t('trackViewer.position', { position: format.number(r.entrant.position) })}</button><span>{t(`incident.${r.status}`)}{r.lapsDown ? ` · ${t('viewer.lapsDown', { count: format.number(r.lapsDown) })}` : ''}</span></li>)}</ul><p>{t('trackViewer.overlapNote')}</p></details>
    </div>;
}

"use client";
import { useState } from 'react';
import { useI18n } from '../../../i18n/provider';
import { formatRaceGap } from '../../../i18n/race-time';
import type { timingRows } from './model';
import type { Attention } from './attention';
import type { IssueSeverity, StrategicIssue } from './issues';
import { Icon, type IconName } from '../../../components/ui/icon';
import { useAttentionText } from './playback-bar';
import type { TyreCompound } from '../../../simulation/race/tyres/model';
type Rows = ReturnType<typeof timingRows>;
const SEVERITY_ICON: Record<IssueSeverity, IconName> = { CRITICAL: 'alert', WARNING: 'alert', OPPORTUNITY: 'arrow', INFO: 'info' };
/** Translated one-line text of a strategic issue (shared by the rail and the driver panel). */
export function useIssueText(rows: readonly Rows[number][]) {
    const { t, format, locale } = useI18n();
    return (i: StrategicIssue) => {
        const v = i.values;
        return t(`issues.${i.kind}`, {
            driver: (i.entrantId && rows.find(r => r.id === i.entrantId)?.abbreviation) || '',
            laps: typeof v.laps === 'number' ? format.number(v.laps) : '',
            gap: typeof v.ms === 'number' ? formatRaceGap(v.ms, locale) : '',
            rival: String(v.rival ?? ''),
            kg: typeof v.kg === 'number' ? format.number(Math.abs(v.kg), { maximumFractionDigits: 1 }) : '',
            wear: typeof v.wear === 'number' ? format.percentage(v.wear / 1000, { maximumFractionDigits: 0 }) : '',
            compound: v.compound ? t(`tyre.${v.compound as TyreCompound}`) : '',
            best: v.best ? t(`viewer.family.${v.best as 'DRY'}`) : '',
            lap: typeof v.lap === 'number' ? format.number(v.lap) : '',
            count: typeof v.count === 'number' ? format.number(v.count) : '',
            mode: v.mode ? t(`incident.${v.mode as 'VSC'}`) : '',
        });
    };
}
export const SEVERITY_ICONS = SEVERITY_ICON;
/** Cards shown before the rest fold into "more". */
const VISIBLE = 4;
const LOG_LIMIT = 40;
/**
 * UX-RACE-001: the strategic issues rail. Every current issue stays on screen while its condition holds (it is
 * re-derived from each committed checkpoint), with the lap it was first seen, so a tyre-cliff or fuel warning cannot
 * flash past at 8× with auto-pause off. Acknowledging only quiets a card (it moves behind unacknowledged ones and is
 * never hidden while true); a condition that clears and returns is new again. Also keeps a log of the strategic
 * changes playback announced. Viewer state only — nothing here reaches the Race.
 */
export function IssuesRail({ issues, rows, lap, attention, onSelect }: { issues: readonly StrategicIssue[]; rows: readonly Rows[number][]; lap: number; attention: Attention | null; onSelect: (entrantId: string) => void }) {
    const { t, format } = useI18n(), describe = useAttentionText(rows);
    const [since, setSince] = useState<Readonly<Record<string, number>>>({});
    const [acked, setAcked] = useState<ReadonlySet<string>>(new Set());
    const [log, setLog] = useState<readonly Attention[]>([]);
    // First-seen lap per active condition (render-time sync: keys that cleared are dropped, new ones stamped).
    const keys = issues.map(i => i.key);
    if (keys.length !== Object.keys(since).length || keys.some(k => !(k in since))) setSince(Object.fromEntries(keys.map(k => [k, since[k] ?? lap])));
    if (attention && !log.some(a => a.lap === attention.lap && a.kind === attention.kind && a.entrantId === attention.entrantId)) setLog([attention, ...log].slice(0, LOG_LIMIT));
    const ackId = (i: StrategicIssue) => `${i.key}@${since[i.key] ?? lap}`;
    const ordered = [...issues].sort((a, b) => Number(acked.has(ackId(a))) - Number(acked.has(ackId(b))));
    const driver = (id: string | null) => (id && rows.find(r => r.id === id)?.abbreviation) || '';
    const text = useIssueText(rows);
    const card = (i: StrategicIssue) => {
        const done = acked.has(ackId(i));
        return <li key={i.key} className="issue-card" data-severity={i.severity} data-ack={done || undefined}>
            <Icon name={SEVERITY_ICON[i.severity]} size={16}/>
            <span className="issue-severity">{t(`issues.severity.${i.severity}`)}</span>
            {i.entrantId ? <button type="button" className="issue-driver" onClick={() => onSelect(i.entrantId!)} aria-label={t('issues.review', { driver: driver(i.entrantId) })}>{driver(i.entrantId)}</button> : null}
            <span className="issue-text">{text(i)}</span>
            <span className="issue-since">{t('issues.since', { lap: format.number(since[i.key] ?? lap) })}</span>
            <button type="button" className="issue-ack" aria-pressed={done} onClick={() => setAcked(s => { const n = new Set(s); if (n.has(ackId(i))) n.delete(ackId(i)); else n.add(ackId(i)); return n; })} title={t(done ? 'issues.acknowledged' : 'issues.acknowledge')}>
                <Icon name="check" size={14}/><span className="visually-hidden">{t(done ? 'issues.acknowledged' : 'issues.acknowledge')}</span>
            </button>
        </li>;
    };
    const urgent = ordered.find(i => i.severity === 'CRITICAL' && !acked.has(ackId(i)));
    return <section className="issues-rail" aria-label={t('issues.title')}>
        <p className="visually-hidden" aria-live="assertive">{urgent ? text(urgent) : ''}</p>
        {ordered.length === 0
            ? <p className="issues-clear"><Icon name="check" size={14}/>{t('issues.none')}</p>
            : <ol className="issues-list">{ordered.slice(0, VISIBLE).map(card)}</ol>}
        <div className="issues-more">
            {ordered.length > VISIBLE && <details><summary>{t('issues.more', { count: format.number(ordered.length - VISIBLE) })}</summary><ol className="issues-list">{ordered.slice(VISIBLE).map(card)}</ol></details>}
            {log.length > 0 && <details className="issues-log"><summary><Icon name="list" size={14}/>{t('issues.log', { count: format.number(log.length) })}</summary>
                <ol>{log.map(a => <li key={`${a.lap}:${a.kind}:${a.entrantId}`}><span className="event-lap">{t('incident.lap', { lap: format.number(a.lap) })}</span>{describe(a)}</li>)}</ol></details>}
        </div>
    </section>;
}

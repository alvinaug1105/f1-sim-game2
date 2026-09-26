"use client";
import { useI18n } from '../../../i18n/provider';
import type { RaceViewData } from '../public-view';
import { raceFeed, type FeedItem } from './race-view';
const RECENT = 8;
/** Structured Race records translated at render time; important items are marked by text, glyph and weight. */
export function EventFeed({ data }: { data: RaceViewData }) {
    const { t, format } = useI18n(), s = data.state!, items = raceFeed(s, data.progress.career.playerTeamId);
    const name = (id: string) => data.labels.find(l => l.entrantId === id)?.driverName ?? id;
    const seconds = (ms: number, digits = 2) => format.number(ms / 1000, { style: 'unit', unit: 'second', maximumFractionDigits: digits });
    const describe = (item: FeedItem) => item.stop
        ? <><strong>{t('pit.pitStop')}</strong> · {t('viewer.tyreChange', { old: t(`tyre.${item.stop.oldCompound}`), next: t(`tyre.${item.stop.newCompound}`) })}<p>{name(item.entrantIds[0])} · {seconds(item.stop.totalLossMs, 1)}</p></>
        : <><strong>{t(`incident.${item.event!.type}`)}</strong>{item.event!.kind && <> · {t(`incident.${item.event!.kind}`)}</>}{item.event!.entrantIds.length > 0 && <p>{item.event!.entrantIds.map(name).join(' · ')}{item.event!.timeLossMs > 0 && <> +{seconds(item.event!.timeLossMs)}</>}</p>}</>;
    const entry = (item: FeedItem) => <li key={item.key} className={`feed-${item.category} ${item.important ? 'important' : ''} ${item.player ? 'player-event' : ''}`}>
        <span className="event-lap">{t('incident.lap', { lap: format.number(item.lap) })}</span>
        <span className="feed-tag">{item.important && <span aria-hidden="true">! </span>}{t(`viewer.cat.${item.category}`)}</span>
        <div>{item.player && <span className="player-mark" aria-hidden="true">◆ </span>}{describe(item)}{item.player && <span className="sr-only"> · {t('viewer.player')}</span>}</div>
    </li>;
    return <section className="ops-panel events-panel" aria-label={t('viewer.recentEvents')}>
        <div className="ops-panel-title"><h2>{t('viewer.recentEvents')}</h2><span>{format.number(items.length)}</span></div>
        {items.length === 0 ? <p className="empty-events">{t('incident.empty')}</p> : <ol>{items.slice(0, RECENT).map(entry)}</ol>}
        {items.length > RECENT && <details><summary>{t('viewer.allEvents')}</summary><ol>{items.slice(RECENT).map(entry)}</ol></details>}
    </section>;
}

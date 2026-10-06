"use client";
import { useState } from 'react';
import { useI18n } from '../../../i18n/provider';
import type { RaceViewData } from '../public-view';
import { raceFeed, groupFeed, feedMatches, FEED_FILTERS, type FeedFilter, type FeedItem, type FeedCategory } from './race-view';
import { Icon, type IconName } from '../../../components/ui/icon';
const CATEGORY_ICON: Record<FeedCategory, IconName> = { CONTROL: 'flag', INCIDENT: 'alert', RETIREMENT: 'ban', PIT: 'wrench', OVERTAKE: 'arrow' };
const RECENT = 8;
/**
 * Race Control / event feed — "what just changed?" (UIX-B presentation). Structured Race records translated at render
 * time; player-car items and important items are marked by text, glyph and weight; filters narrow, never drop.
 */
export function EventFeed({ data }: { data: RaceViewData }) {
    const { t, format } = useI18n(), s = data.state!, [filter, setFilter] = useState<FeedFilter>('ALL');
    // v8E: simultaneous rival stops are grouped (player events never are), then the chosen category filter applies.
    const items = groupFeed(raceFeed(s, data.progress.career.playerTeamId)).filter(item => feedMatches(item, filter));
    const name = (id: string) => data.labels.find(l => l.entrantId === id)?.driverName ?? id;
    const seconds = (ms: number, digits = 2) => format.number(ms / 1000, { style: 'unit', unit: 'second', maximumFractionDigits: digits });
    const mine = new Set(s.input.entrants.filter(e => e.teamId === data.progress.career.playerTeamId).map(e => e.entrantId));
    // Player-involved pass: who passed whom, and the safe post-event cause (never probabilities or hidden pace).
    const overtake = (item: FeedItem) => { const [by, on] = item.event!.entrantIds, lost = mine.has(on) && !mine.has(by);
        return <><strong>{t(lost ? 'viewer.overtake.lost' : 'viewer.overtake.gained')}</strong> · {t(`viewer.overtakeCause.${item.event!.cause ?? 'NONE'}`)}<p>{t('viewer.overtake.detail', { by: name(by), on: name(on) })}</p></>; };
    const group = (item: FeedItem) => <><strong>{t('viewer.feedGroup', { count: format.number(item.group!.items.length), compound: t(`tyre.${item.group!.compound}`) })}</strong>
        <details><summary>{t('viewer.feedGroupDetails')}</summary><p>{item.group!.items.map(x => name(x.entrantIds[0])).join(' · ')}</p></details></>;
    const describe = (item: FeedItem) => item.group ? group(item) : item.event?.type === 'OVERTAKE' ? overtake(item) : item.stop
        ? <><strong>{t('pit.pitStop')}</strong> · {t('viewer.tyreChange', { old: t(`tyre.${item.stop.oldCompound}`), next: t(`tyre.${item.stop.newCompound}`) })}<p>{name(item.entrantIds[0])} · {seconds(item.stop.totalLossMs, 1)}</p></>
        : <><strong>{t(`incident.${item.event!.type}`)}</strong>{item.event!.kind && <> · {t(`incident.${item.event!.kind}`)}</>}{item.event!.entrantIds.length > 0 && <p>{item.event!.entrantIds.map(name).join(' · ')}{item.event!.timeLossMs > 0 && <> +{seconds(item.event!.timeLossMs)}</>}</p>}</>;
    const entry = (item: FeedItem) => <li key={item.key} className={`feed-${item.category} ${item.important ? 'important' : ''} ${item.player ? 'player-event' : ''}`}>
        <span className="event-lap">{t('incident.lap', { lap: format.number(item.lap) })}</span>
        <span className="feed-tag"><Icon name={CATEGORY_ICON[item.category]} size={12}/>{item.important && <span aria-hidden="true">! </span>}{t(`viewer.cat.${item.category}`)}</span>
        <div>{item.player && <span className="player-mark" aria-hidden="true">◆ </span>}{describe(item)}{item.player && <span className="sr-only"> · {t('viewer.player')}</span>}</div>
    </li>;
    return <section className="ops-panel events-panel live-panel" aria-label={t('viewer.recentEvents')}>
        <div className="ops-panel-title live-panel-head"><h2>{t('viewer.recentEvents')}</h2><span className="live-count">{format.number(items.length)}</span></div>
        <div className="feed-filters" role="group" aria-label={t('viewer.feedFilter')}>{FEED_FILTERS.map(f => <button key={f} className="live-filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`viewer.feedFilter.${f}`)}</button>)}</div>
        {items.length === 0 ? <p className="empty-events">{t('incident.empty')}</p> : <ol>{items.slice(0, RECENT).map(entry)}</ol>}
        {items.length > RECENT && <details><summary>{t('viewer.allEvents')}</summary><ol>{items.slice(RECENT).map(entry)}</ol></details>}
    </section>;
}

"use client";
import { useId, useState, type CSSProperties } from 'react';
import { useI18n } from '../../../i18n/provider';
import { formatRaceGap, formatRaceTime } from '../../../i18n/race-time';
import type { RacePublicState } from '../public-view';
import type { timingRows } from './model';
import { driverSnapshot, driverFlags, officialLeaderId } from './race-view';
import type { IssueSeverity } from './issues';
import { FlagChips } from './flags';
import { teamStyle } from '../../../components/ui/team-color';
type Rows = ReturnType<typeof timingRows>;
/**
 * Persistent two-car switch (UIX-B driver tabs) plus a lightweight side-by-side comparison. Viewer state only.
 * `attentionId`: player car named by the current strategic stop — flagged (text + glyph), never auto-selected.
 * Each tab carries the car's position, tyre and compact decision flags (BOX, PIT, tyre, fuel, battle, attention) and,
 * when given, its most severe current strategic issue, so both cars are monitored without switching.
 */
export function PlayerSwitch({ state: s, rows, selected, onSelect, attentionId = null, severity = {}, pitTarget, onPit }: { state: RacePublicState; rows: Rows; selected: string; onSelect: (id: string) => void; attentionId?: string | null; severity?: Readonly<Record<string, IssueSeverity | null>>; pitTarget?: string; onPit?: () => void }) {
    const { t, format, locale } = useI18n(), [open, setOpen] = useState(false), panel = useId();
    // Entry order, not race order, so the two buttons never swap places when positions change.
    const players = s.input.entrants.map(e => rows.find(r => r.id === e.entrantId)!).filter(r => r?.player);
    if (!players.length) return null;
    const snaps = players.map(r => ({ r, v: driverSnapshot(r, s) }));
    const none = t('race.noTime'), gap = (ms: number | null) => ms === null ? t('race.lapped') : formatRaceGap(ms, locale), leaderId = officialLeaderId(s);
    // Leader only by the official classification; a disqualified car shows its status, never "Leader" or a gap.
    const relative = (r: Rows[number], ms: number | null) => r.id === leaderId ? t('race.leader') : r.disqualified ? t('classification.DISQUALIFIED') : gap(ms);
    const fields: { key: string; label: string; value: (v: ReturnType<typeof driverSnapshot>, r: Rows[number]) => string; hide?: boolean }[] = [
        { key: 'position', label: t('race.position'), value: (v, r) => r.disqualified ? t('classification.dsq') : format.number(v.position) },
        { key: 'gap', label: t('viewer.gap'), value: (v, r) => relative(r, v.gapMs) },
        { key: 'interval', label: t('viewer.interval'), value: (v, r) => relative(r, v.intervalMs) },
        { key: 'tyre', label: t('viewer.tyre'), value: v => v.compound ? `${t(`tyre.${v.compound}`)} · ${t('viewer.ageShort', { count: format.number(v.tyreAge!) })}` : none, hide: !s.input.tyres },
        { key: 'wear', label: t('viewer.wear'), value: v => v.wearPermille === null ? none : format.percentage(v.wearPermille / 1000, { maximumFractionDigits: 0 }), hide: !s.input.tyres },
        { key: 'fuel', label: t('viewer.fuelDelta'), value: v => v.fuelDeltaKg === null ? none : format.number(v.fuelDeltaKg, { style: 'unit', unit: 'kilogram', signDisplay: 'exceptZero', maximumFractionDigits: 1 }), hide: !s.input.commands },
        { key: 'ers', label: t('command.ersMode'), value: v => v.ersRatio === null ? none : format.percentage(v.ersRatio, { maximumFractionDigits: 0 }), hide: !s.input.commands },
        { key: 'pace', label: t('command.paceMode'), value: v => v.paceMode ? t(`command.${v.paceMode}`) : none, hide: !s.input.commands },
        { key: 'stops', label: t('pit.stops'), value: v => v.stops === null ? none : format.number(v.stops), hide: !s.input.pits },
        { key: 'last', label: t('viewer.lastLap'), value: v => v.lastLapMs === null ? none : formatRaceTime(v.lastLapMs, locale) },
        { key: 'best', label: t('viewer.bestLap'), value: v => v.bestLapMs === null ? none : formatRaceTime(v.bestLapMs, locale) },
    ];
    return <div className="player-switch-wrap" onKeyDown={event => {
        if (event.key === 'Escape' && open) {
            event.preventDefault(); setOpen(false);
            event.currentTarget.querySelector<HTMLButtonElement>('.compare-toggle')?.focus();
        }
    }}>
        <div className="player-switch" role="group" aria-label={t('viewer.playerCars')}>
            {snaps.map(({ r, v }) => { const flags = driverFlags(r, rows, s, attentionId), worst = severity[r.id] ?? null; return <button key={r.id} onClick={() => onSelect(r.id)} aria-pressed={r.id === selected} style={teamStyle(r.color) as CSSProperties} title={r.name} className={r.id === attentionId ? 'attention' : undefined} data-severity={worst ?? undefined}>
                <span className="switch-abbr">{r.abbreviation}</span>
                <strong className="switch-pos">{r.disqualified ? t('classification.dsq') : t('commandCentre.position', { position: v.position })}</strong>
                <span className="switch-resource">{v.compound && <span className={`tyre-token tyre-${v.compound}`} title={t(`tyre.${v.compound}`)}>{t(`viewer.tyre.${v.compound}`)}</span>}{v.wearPermille !== null && <span className="switch-wear" title={t('viewer.wear')}>{format.percentage(v.wearPermille / 1000, { maximumFractionDigits: 0 })}<span className="sr-only"> {t('viewer.wear')}</span></span>}</span>
                <span className="switch-gap">{relative(r, v.gapMs)}</span>
                {worst && worst !== 'INFO' && <span className="switch-issue" data-severity={worst} title={t(`issues.severity.${worst}`)}>{t(`issues.severity.${worst}`)}</span>}
                <FlagChips flags={flags} compact/>
            </button>; })}
            <div className="player-switch-tools">{snaps.length > 1 && <button className="compare-toggle ops-secondary" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>{t('viewer.compare')}</button>}
                {pitTarget && <a className="race-pit-shortcut" href={pitTarget} onClick={onPit}>{t('viewer.strategy')}</a>}
            </div>
        </div>
        {open && snaps.length > 1 && <div className="compare-panel" id={panel}><table><caption className="sr-only">{t('viewer.comparison')}</caption>
            <thead><tr><th scope="col"><span className="sr-only">{t('viewer.comparison')}</span></th>{snaps.map(({ r }) => <th scope="col" key={r.id} style={{ borderColor: r.color }}>{r.abbreviation}</th>)}</tr></thead>
            <tbody>{fields.filter(f => !f.hide).map(f => <tr key={f.key}><th scope="row">{f.label}</th>{snaps.map(({ r, v }) => <td key={r.id}>{r.status === 'RETIRED' && f.key !== 'position' && f.key !== 'stops' ? t('incident.RETIRED') : f.value(v, r)}</td>)}</tr>)}</tbody>
        </table></div>}
    </div>;
}

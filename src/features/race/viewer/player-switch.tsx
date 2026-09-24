"use client";
import { useId, useState } from 'react';
import { useI18n } from '../../../i18n/provider';
import { formatRaceGap } from '../../../i18n/race-time';
import type { RaceSimulationState } from '../../../simulation/race/types';
import type { timingRows } from './model';
import { driverSnapshot } from './race-view';
type Rows = ReturnType<typeof timingRows>;
/** Persistent two-car switch plus a lightweight side-by-side comparison. Viewer state only; never persisted. */
/** `attentionId`: player car named by the current strategic stop — highlighted (text + glyph), never auto-selected. */
export function PlayerSwitch({ state: s, rows, selected, onSelect, attentionId = null }: { state: RaceSimulationState; rows: Rows; selected: string; onSelect: (id: string) => void; attentionId?: string | null }) {
    const { t, format, locale } = useI18n(), [open, setOpen] = useState(false), panel = useId();
    // Entry order, not race order, so the two buttons never swap places when positions change.
    const players = s.input.entrants.map(e => rows.find(r => r.id === e.entrantId)!).filter(r => r?.player);
    if (!players.length) return null;
    const snaps = players.map(r => ({ r, v: driverSnapshot(r, s) }));
    const none = t('race.noTime'), gap = (ms: number | null) => ms === null ? t('race.lapped') : formatRaceGap(ms, locale);
    const fields: { key: string; label: string; value: (v: ReturnType<typeof driverSnapshot>) => string; hide?: boolean }[] = [
        { key: 'position', label: t('race.position'), value: v => format.number(v.position) },
        { key: 'gap', label: t('viewer.gap'), value: v => v.position === 1 ? t('race.leader') : gap(v.gapMs) },
        { key: 'interval', label: t('viewer.interval'), value: v => v.position === 1 ? t('race.leader') : gap(v.intervalMs) },
        { key: 'tyre', label: t('viewer.tyre'), value: v => v.compound ? `${t(`tyre.${v.compound}`)} · ${t('viewer.ageShort', { count: format.number(v.tyreAge!) })}` : none, hide: !s.input.tyres },
        { key: 'wear', label: t('viewer.wear'), value: v => v.wearPermille === null ? none : format.percentage(v.wearPermille / 1000, { maximumFractionDigits: 0 }), hide: !s.input.tyres },
        { key: 'fuel', label: t('viewer.fuelDelta'), value: v => v.fuelDeltaKg === null ? none : format.number(v.fuelDeltaKg, { style: 'unit', unit: 'kilogram', signDisplay: 'exceptZero', maximumFractionDigits: 1 }), hide: !s.input.commands },
        { key: 'ers', label: t('command.ersMode'), value: v => v.ersRatio === null ? none : format.percentage(v.ersRatio, { maximumFractionDigits: 0 }), hide: !s.input.commands },
        { key: 'pace', label: t('command.paceMode'), value: v => v.paceMode ? t(`command.${v.paceMode}`) : none, hide: !s.input.commands },
        { key: 'stops', label: t('pit.stops'), value: v => v.stops === null ? none : format.number(v.stops), hide: !s.input.pits },
    ];
    return <div className="player-switch-wrap">
        <div className="player-switch" role="group" aria-label={t('viewer.playerCars')}>
            {snaps.map(({ r, v }) => <button key={r.id} onClick={() => onSelect(r.id)} aria-pressed={r.id === selected} style={{ borderColor: r.color }} title={r.name} className={r.id === attentionId ? 'attention' : undefined}>
                {r.id === attentionId && <span className="attention-mark"><span aria-hidden="true">⚑</span><span className="sr-only">{t('viewer.needsAttention')}</span></span>}
                <span className="switch-abbr">{r.abbreviation}{r.id === selected && <span aria-hidden="true"> ◂</span>}</span>
                <strong className="switch-pos">P{format.number(v.position)}</strong>
                {v.compound && <span className={`tyre-token tyre-${v.compound}`} title={t(`tyre.${v.compound}`)}>{t(`viewer.tyre.${v.compound}`)}</span>}
                {r.status !== 'RUNNING' ? <small className={`switch-status status-${r.status}`}>{t(`incident.${r.status}`)}</small> : r.pitting ? <small className="switch-status status-PIT">{t('viewer.pit')}</small> : null}
            </button>)}
            {snaps.length > 1 && <button className="compare-toggle ops-secondary" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>{t('viewer.compare')}</button>}
        </div>
        {open && snaps.length > 1 && <div className="compare-panel" id={panel}><table><caption className="sr-only">{t('viewer.comparison')}</caption>
            <thead><tr><th scope="col"><span className="sr-only">{t('viewer.comparison')}</span></th>{snaps.map(({ r }) => <th scope="col" key={r.id} style={{ borderColor: r.color }}>{r.abbreviation}</th>)}</tr></thead>
            <tbody>{fields.filter(f => !f.hide).map(f => <tr key={f.key}><th scope="row">{f.label}</th>{snaps.map(({ r, v }) => <td key={r.id}>{r.status === 'RETIRED' && f.key !== 'position' && f.key !== 'stops' ? t('incident.RETIRED') : f.value(v)}</td>)}</tr>)}</tbody>
        </table></div>}
    </div>;
}

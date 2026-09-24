"use client";
import { useState } from 'react';
import { formatRaceGap } from '../../../i18n/race-time';
import { useI18n } from '../../../i18n/provider';
import type { CareerRaceData } from '../../../game/domain/race-repository';
import type { timingRows } from './model';
import { PACE_MODES, FUEL_MODES, ERS_MODES, projectedFuelGrams } from '../../../simulation/race/commands/model';
import { isTyreCompound, type TyreCompound } from '../../../simulation/race/tyres/model';
import type { ViewerIntent } from './intents';
import { estimatePitWindow } from '../strategy-estimate';
export function DriverPanel({ data, row, busy, send }: {
    data: CareerRaceData;
    row: ReturnType<typeof timingRows>[number];
    busy: boolean;
    send: (intent: ViewerIntent) => void;
}) {
    const { t, format, locale } = useI18n(), e = row.entrant, s = data.state!, c = e.commands;
    const [compound, setCompound] = useState<TyreCompound>('HARD');
    const editable = row.player && s.status === 'RUNNING' && row.status !== 'RETIRED';
    const projection = c ? projectedFuelGrams(s, e) / 1000 : null, estimate = e.pit ? estimatePitWindow(s, e) : null;
    return <section className="ops-panel driver-focus" aria-label={t('viewer.selectedDriver')}>
  <div className="ops-panel-title"><span>{t('viewer.selectedDriver')}</span><span className="status-pill">{t(row.player ? 'viewer.player' : 'viewer.readOnly')}</span></div>
  <div className="driver-body"><div className="driver-condition">
  <div className="driver-identity" style={{ borderColor: row.color }}><strong className="driver-position">{format.number(e.position)}</strong><div><h2>{row.name}</h2><p>{row.team} · {t(`incident.${row.status}`)}</p></div></div>
  <p className="driver-gaps">{t('viewer.gap')}: {row.gap === null ? t('race.lapped') : formatRaceGap(row.gap, locale)} · {t('viewer.interval')}: {row.interval === null ? t('race.lapped') : formatRaceGap(row.interval, locale)}</p>
  {e.stint && <div className="tyre-focus"><span className={`tyre-token tyre-${e.stint.tyre.compound}`} title={t(`tyre.${e.stint.tyre.compound}`)}>{t(`viewer.tyre.${e.stint.tyre.compound}`)}</span><div><strong>{t(`tyre.${e.stint.tyre.compound}`)}</strong><p>{t('tyre.age')}: {format.number(e.stint.tyre.ageLaps)} · {format.number(e.stint.tyre.temperatureMilliC / 1000, { style: 'unit', unit: 'celsius', maximumFractionDigits: 1 })}</p></div><strong>{format.percentage(e.stint.tyre.wearPermille / 1000, { maximumFractionDigits: 0 })}</strong><progress max="1000" value={e.stint.tyre.wearPermille} aria-label={t('tyre.wear')}/></div>}
  {c && <div className="mode-control"><h3>{t('command.paceMode')}</h3><div className="mode-buttons">{PACE_MODES.map(mode => editable ? <button key={mode} disabled={busy || c.paceMode === mode} aria-pressed={c.paceMode === mode} onClick={() => send({ kind: 'paceMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}>{t(`command.${mode}`)}</button> : c.paceMode === mode ? <p key={mode}>{t(`command.${mode}`)}</p> : null)}</div></div>}
   </div><div className="driver-resources">{c && <>
   <div className="resource-heading"><h3>{t('race.fuel')}</h3><strong>{format.number(e.fuelMassKg, { style: 'unit', unit: 'kilogram', maximumFractionDigits: 2 })}</strong></div>
   <p className={projection !== null && projection < 0 ? 'fuel-warning' : 'ops-muted'}>{t('command.projectedFuel')}: {format.number(projection!, { style: 'unit', unit: 'kilogram', signDisplay: 'always', maximumFractionDigits: 2 })}</p>
   <div className="mode-buttons" role="group" aria-label={t('command.fuelMode')}>{FUEL_MODES.map(mode => editable ? <button key={mode} disabled={busy || c.fuelMode === mode} aria-pressed={c.fuelMode === mode} onClick={() => send({ kind: 'fuelMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}>{t(`command.${mode}`)}</button> : c.fuelMode === mode ? <p key={mode}>{t(`command.${mode}`)}</p> : null)}</div>
   <div className="resource-heading"><h3>{t('command.ersMode')}</h3><strong>{format.percentage(c.ersCharge / s.input.commands!.capacity, { maximumFractionDigits: 0 })}</strong></div><progress max={s.input.commands!.capacity} value={c.ersCharge} aria-label={t('command.energy')}/>
   <div className="mode-buttons" role="group" aria-label={t('command.ersMode')}>{ERS_MODES.map(mode => editable ? <button key={mode} disabled={busy || c.ersMode === mode} aria-pressed={c.ersMode === mode} onClick={() => send({ kind: 'ersMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}>{t(`command.${mode}`)}</button> : c.ersMode === mode ? <p key={mode}>{t(`command.${mode}`)}</p> : null)}</div>
  </>}
  {!c && <p>{t('race.fuel')}: {format.number(e.fuelMassKg, { style: 'unit', unit: 'kilogram' })}</p>}
  </div>
  {e.pit && <div className="strategy-focus"><div className="resource-heading"><h3>{t('viewer.strategy')}</h3><span>{t('pit.stint')} {format.number(e.stint!.number)} · {t('pit.stops')} {format.number(e.pit.stops.length)}</span></div>
   <p>{t('pit.loss')}: {format.number(estimate!.minimumLossMs / 1000, { maximumFractionDigits: 2 })}–{format.number(estimate!.maximumLossMs / 1000, { style: 'unit', unit: 'second', maximumFractionDigits: 2 })}</p>
   <p className={e.pit.pendingCompound ? 'pit-pending' : 'ops-muted'}>{e.pit.pendingCompound ? t('pit.requested', { compound: t(`tyre.${e.pit.pendingCompound}`), lap: format.number(s.lap + 1) }) : t(row.status === 'RETIRED' ? 'incident.RETIRED' : 'pit.onTrack')}</p>
   {editable && s.lap < s.input.totalLaps - 1 && <fieldset disabled={busy}><label>{t('pit.newTyre')}<select value={compound} onChange={event => { if (isTyreCompound(event.target.value))
            setCompound(event.target.value); }}>{Object.keys(s.input.tyres!.profiles).filter(isTyreCompound).map(value => <option value={value} key={value}>{t(`tyre.${value}`)}</option>)}</select></label><div className="pit-buttons"><button onClick={() => send({ kind: 'pit', entrantId: e.entrantId, revision: e.pit!.commandRevision, compound })}>{t('pit.box')}</button><button className="ops-secondary" disabled={!e.pit.pendingCompound} onClick={() => send({ kind: 'pit', entrantId: e.entrantId, revision: e.pit!.commandRevision, compound: null })}>{t('pit.cancel')}</button></div></fieldset>}
   <details><summary>{t('pit.history')}</summary><ul>{e.pit.stints.map(stint => <li key={stint.number}>{t('pit.stintRecord', { number: format.number(stint.number), compound: t(`tyre.${stint.startingTyre.compound}`), start: format.number(stint.startLap + 1), end: stint.endLap === null ? t('pit.open') : format.number(stint.endLap) })}</li>)}</ul><ul>{e.pit.stops.map(stop => <li key={stop.number}>{t('pit.stopRecord', { lap: format.number(stop.lap), old: t(`tyre.${stop.oldCompound}`), next: t(`tyre.${stop.newCompound}`) })} · {format.number(stop.totalLossMs / 1000, { style: 'unit', unit: 'second', maximumFractionDigits: 3 })}</li>)}</ul></details>
  </div>}
  </div>
  {editable && <p className="control-notice">{t('viewer.commandPause')}</p>}
 </section>;
}

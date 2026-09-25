"use client";
import { useState, type ReactNode } from 'react';
import { formatRaceGap, formatRaceTime } from '../../../i18n/race-time';
import { useI18n } from '../../../i18n/provider';
import type { CareerRaceData } from '../../../game/domain/race-repository';
import { timingRows } from './model';
import { PACE_MODES, FUEL_MODES, ERS_MODES, projectedFuelGrams, type PaceMode, type FuelMode, type ErsMode } from '../../../simulation/race/commands/model';
import { isTyreCompound, type TyreCompound } from '../../../simulation/race/tyres/model';
import type { ViewerIntent } from './intents';
import { estimatePitWindow } from '../strategy-estimate';
import { battleContext, drsState, tyreCondition, tyreSuitability, ersOutlook } from './race-view';
type Row = ReturnType<typeof timingRows>[number];
/** Laps-to-cliff at or below this reads as "high wear risk soon". Presentation wording only. */
const RISK_LAPS = 3;
/** Mode row: buttons for an editable player car, otherwise the active mode as read-only text. */
function Modes<T extends PaceMode | FuelMode | ErsMode>({ label, modes, active, editable, busy, onPick }: { label: string; modes: readonly T[]; active: T; editable: boolean; busy: boolean; onPick: (mode: T) => void }) {
    const { t } = useI18n();
    return <div className="mode-row"><div className="resource-heading"><h3>{label}</h3><strong className="mode-active">{t(`command.${active}`)}</strong></div>
        {editable && <div className="mode-buttons" role="group" aria-label={label}>{modes.map(mode => <button key={mode} disabled={busy || active === mode} aria-pressed={active === mode} onClick={() => onPick(mode)}>{active === mode && <span aria-hidden="true">✓ </span>}{t(`command.${mode}`)}</button>)}</div>}
    </div>;
}
function Stat({ label, children, tone }: { label: string; children: ReactNode; tone?: string }) { return <div className={`stat ${tone ?? ''}`}><span>{label}</span><strong>{children}</strong></div>; }
export function DriverPanel({ data, row, busy, send, rows }: {
    data: CareerRaceData;
    row: Row;
    busy: boolean;
    send: (intent: ViewerIntent) => void;
    rows?: readonly Row[];
}) {
    const { t, format, locale } = useI18n(), e = row.entrant, s = data.state!, c = e.commands;
    const [compound, setCompound] = useState<TyreCompound>('HARD');
    const editable = row.player && s.status === 'RUNNING' && row.status === 'RUNNING';
    const battle = battleContext(rows ?? timingRows(data), row.id, s), drs = drsState(s), condition = tyreCondition(s, e);
    const projection = c && s.input.commands ? projectedFuelGrams(s, e) / 1000 : null;
    const estimate = e.pit && e.stint && s.input.pits && s.input.tyres ? estimatePitWindow(s, e) : null;
    const gap = (ms: number | null) => ms === null ? t('race.lapped') : formatRaceGap(ms, locale);
    const kg = (n: number, sign = false) => format.number(Math.round(n * 10) / 10, { style: 'unit', unit: 'kilogram', maximumFractionDigits: 1, ...(sign ? { signDisplay: 'exceptZero' as const } : {}) });
    const status = row.status === 'RUNNING' && row.pitting ? 'PIT' : row.status;
    const neighbour = (side: 'ahead' | 'behind') => {
        const other = battle[side], ms = side === 'ahead' ? battle.gapAheadMs : battle.gapBehindMs, fight = side === 'ahead' ? battle.battleAhead : battle.battleBehind;
        return <div className={`neighbour ${fight ? 'fighting' : ''}`}><span>{t(side === 'ahead' ? 'viewer.ahead' : 'viewer.behind')}</span>{other ? <><strong style={{ borderColor: other.color }}>{other.abbreviation}</strong><em>{gap(ms)}</em><small className="neighbour-lap">{t('viewer.lastLap')} {lap(other.entrant.lastLapTimeMs)}</small></> : <strong>{t('race.noTime')}</strong>}</div>;
    };
    const lap = (ms: number | null) => ms === null ? t('race.noTime') : formatRaceTime(ms, locale);
    const suitability = e.stint && row.status === 'RUNNING' ? tyreSuitability(e.stint.tyre.compound, s.weather) : null, ers = row.status === 'RUNNING' ? ersOutlook(s, e) : null;
    const lastStop = e.pit?.stops.at(-1);
    return <section className="ops-panel driver-focus" aria-label={t('viewer.selectedDriver')}>
  <div className="ops-panel-title"><span>{t('viewer.selectedDriver')}</span><span className="status-pill">{t(row.player ? 'viewer.player' : 'viewer.readOnly')}</span></div>
  <div className="driver-body"><div className="driver-condition">
   <div className="driver-identity" style={{ borderColor: row.color }}><strong className="driver-position"><small>P</small>{format.number(e.position)}</strong><div><h2>{row.name}</h2><p><strong>{row.abbreviation}</strong>{row.number !== null && <> · #{format.number(row.number, { useGrouping: false })}</>} · {row.team}</p></div><span className={`driver-status status-${status}`}>{t(status === 'PIT' ? 'viewer.pit' : `incident.${status}`)}</span></div>
   {row.status !== 'RUNNING' && <p className={`no-commands status-${row.status}`} role="status">{row.status === 'RETIRED' ? t('viewer.noCommands.RETIRED', { lap: format.number(e.incident?.retiredLap ?? s.lap) }) : t('viewer.noCommands.FINISHED')}</p>}
   {row.status !== 'RETIRED' && <div className="gap-block">
    {(battle.battleAhead || battle.battleBehind) && <p className="battle-flag"><span aria-hidden="true">⚔ </span>{t('viewer.battle')}</p>}
    <div className="neighbours">{neighbour('ahead')}{neighbour('behind')}</div>
    <div className="lap-times"><div className="stat"><span>{t('viewer.lastLap')}</span><strong>{lap(e.lastLapTimeMs)}{e.lastLapTimeMs !== null && e.lastLapTimeMs === e.bestLapTimeMs && <small className="pb-mark">{t('viewer.personalBest')}</small>}</strong></div><div className="stat"><span>{t('viewer.bestLap')}</span><strong>{lap(e.bestLapTimeMs)}</strong></div></div>
    <p className="ops-muted">{t('viewer.toLeader')}: {e.position === 1 ? t('race.leader') : gap(row.gap)}</p>
    {drs !== 'UNAVAILABLE' && drs !== 'FINISHED' && <p className={`drs-line ${drs === 'ENABLED' && e.track?.drsEligible ? 'drs-on' : 'drs-off'}`}>{drs === 'ENABLED' ? t(e.track?.drsEligible ? 'viewer.drsEligible' : 'viewer.drsNotEligible') : t(`viewer.drs.${drs}`, { count: format.number(s.incidents?.drsDelay ?? 0) })}</p>}
   </div>}
   {e.stint && <div className="tyre-focus">
    <span className={`tyre-token tyre-${e.stint.tyre.compound}`} title={t(`tyre.${e.stint.tyre.compound}`)}>{t(`viewer.tyre.${e.stint.tyre.compound}`)}</span>
    <div><strong>{t(`tyre.${e.stint.tyre.compound}`)}</strong><p>{t('viewer.age', { count: format.number(e.stint.tyre.ageLaps) })}</p></div>
    <div className="tyre-stats"><Stat label={t('viewer.wear')} tone={condition?.wear !== 'OK' ? `warn-${condition?.wear}` : ''}>{format.percentage(e.stint.tyre.wearPermille / 1000, { maximumFractionDigits: 0 })}</Stat><Stat label={t('viewer.temp')} tone={condition?.temperature !== 'OK' ? 'warn-HIGH' : ''}>{format.number(e.stint.tyre.temperatureMilliC / 1000, { style: 'unit', unit: 'celsius', maximumFractionDigits: 0 })}</Stat></div>
    <progress max="1000" value={e.stint.tyre.wearPermille} aria-label={t('tyre.wear')}/>
    {condition && (condition.wear !== 'OK' || condition.temperature !== 'OK') && <p className="tyre-warnings">{condition.wear !== 'OK' && <span className={`warn-${condition.wear}`}>⚠ {t(`viewer.warn.${condition.wear}`)}</span>}{condition.temperature !== 'OK' && <span className="warn-HIGH">⚠ {t(`viewer.warn.${condition.temperature}`)}</span>}</p>}
    {suitability && <p className={`tyre-suitability suit-${suitability.level}`}><span aria-hidden="true">{suitability.level === 'SUITABLE' ? '● ' : suitability.level === 'MARGINAL' ? '◐ ' : '○ '}</span><strong>{t(`viewer.suit.${suitability.level}`)}</strong> · {t(`viewer.suitNote.${suitability.note}`)}</p>}
    {estimate && row.status === 'RUNNING' && s.status === 'RUNNING' && condition?.wear !== 'CRITICAL' && <p className="tyre-estimate">{estimate.lapsToCliff <= RISK_LAPS ? t('viewer.tyreLifeRisk') : t('viewer.tyreLife', { count: format.number(estimate.lapsToCliff) })}<small>{t('viewer.estimateNote')}</small></p>}
   </div>}
  </div><div className="driver-resources">{c && s.input.commands ? <>
   <div className="resource-heading"><h3>{t('race.fuel')}</h3><strong>{kg(e.fuelMassKg)}</strong></div>
   <p className={`fuel-delta ${projection! < 0 ? 'fuel-warning' : 'fuel-ok'}`}>{t('command.projectedFuel')}: <strong>{kg(projection!, true)}</strong></p>
   <Modes label={t('command.fuelMode')} modes={FUEL_MODES} active={c.fuelMode} editable={editable} busy={busy} onPick={mode => send({ kind: 'fuelMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}/>
   <div className="resource-heading"><h3>{t('command.ersMode')}</h3><strong>{format.percentage(c.ersCharge / s.input.commands.capacity, { maximumFractionDigits: 0 })}</strong></div><progress max={s.input.commands.capacity} value={c.ersCharge} aria-label={t('command.energy')}/>
   {ers && <p className="ers-outlook ops-muted">{ers.kind === 'LAPS' ? t('viewer.ersLaps', { count: format.number(ers.laps) }) : t(ers.kind === 'CHARGING' ? 'viewer.ersCharging' : 'viewer.ersSustainable')}</p>}
   <Modes label={t('viewer.ersDeployment')} modes={ERS_MODES} active={c.ersMode} editable={editable} busy={busy} onPick={mode => send({ kind: 'ersMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}/>
   <Modes label={t('command.paceMode')} modes={PACE_MODES} active={c.paceMode} editable={editable} busy={busy} onPick={mode => send({ kind: 'paceMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}/>
  </> : <div className="resource-heading"><h3>{t('race.fuel')}</h3><strong>{kg(e.fuelMassKg)}</strong></div>}
  </div>
  {e.pit && e.stint && <div className="strategy-focus"><div className="resource-heading"><h3>{t('viewer.strategy')}</h3><span>{t('pit.stint')} {format.number(e.stint.number)} · {t('pit.stops')} {format.number(e.pit.stops.length)}</span></div>
   <div className="strategy-grid"><Stat label={t('viewer.currentTyre')}>{t(`tyre.${e.stint.tyre.compound}`)}</Stat><Stat label={t('viewer.stintAge')}>{t('viewer.age', { count: format.number(e.stint.tyre.ageLaps) })}</Stat>
    {lastStop && <Stat label={t('viewer.lastStop')}>{t('incident.lap', { lap: format.number(lastStop.lap) })} · {t('viewer.tyreChange', { old: t(`viewer.tyre.${lastStop.oldCompound}`), next: t(`viewer.tyre.${lastStop.newCompound}`) })}</Stat>}
    {estimate && <Stat label={t('pit.loss')}>{format.number(estimate.minimumLossMs / 1000, { maximumFractionDigits: 1 })}–{format.number(estimate.maximumLossMs / 1000, { style: 'unit', unit: 'second', maximumFractionDigits: 1 })}</Stat>}</div>
   <p className={e.pit.pendingCompound ? 'pit-pending' : 'ops-muted'}>{e.pit.pendingCompound ? <><span aria-hidden="true">↘ </span><strong>{row.abbreviation}</strong> — </> : null}{e.pit.pendingCompound ? t('pit.requested', { compound: t(`tyre.${e.pit.pendingCompound}`), lap: format.number(s.lap + 1) }) : t(row.status === 'RETIRED' ? 'incident.RETIRED' : row.status === 'FINISHED' ? 'pit.finished' : 'pit.onTrack')}</p>
   {editable && s.lap < s.input.totalLaps - 1 && s.input.tyres && <fieldset disabled={busy}><label>{t('pit.newTyre')}<select value={compound} onChange={event => { if (isTyreCompound(event.target.value))
            setCompound(event.target.value); }}>{Object.keys(s.input.tyres.profiles).filter(isTyreCompound).map(value => <option value={value} key={value}>{t(`tyre.${value}`)}</option>)}</select></label><div className="pit-buttons"><button onClick={() => send({ kind: 'pit', entrantId: e.entrantId, revision: e.pit!.commandRevision, compound })}>{t('pit.box')}</button><button className="ops-secondary" disabled={!e.pit.pendingCompound} onClick={() => send({ kind: 'pit', entrantId: e.entrantId, revision: e.pit!.commandRevision, compound: null })}>{t('pit.cancel')}</button></div></fieldset>}
   <details><summary>{t('pit.history')}</summary><ul>{e.pit.stints.map(stint => <li key={stint.number}>{t('pit.stintRecord', { number: format.number(stint.number), compound: t(`tyre.${stint.startingTyre.compound}`), start: format.number(stint.startLap + 1), end: stint.endLap === null ? t(e.incident?.status === 'RETIRED' ? 'pit.notRaced' : 'pit.open') : format.number(stint.endLap) })}</li>)}</ul><ul>{e.pit.stops.map(stop => <li key={stop.number}>{t('pit.stopRecord', { lap: format.number(stop.lap), old: t(`tyre.${stop.oldCompound}`), next: t(`tyre.${stop.newCompound}`) })} · {format.number(stop.totalLossMs / 1000, { style: 'unit', unit: 'second', maximumFractionDigits: 3 })}</li>)}</ul></details>
  </div>}
  </div>
  {editable && <p className="control-notice">{t('viewer.commandPause')}</p>}
 </section>;
}

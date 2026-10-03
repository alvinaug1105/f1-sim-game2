"use client";
import { ENERGY_POLICIES,type EnergyPolicy } from '../../../simulation/race/assistance/model';
import { useState, type ReactNode } from 'react';
import { formatRaceGap, formatRaceTime } from '../../../i18n/race-time';
import { useI18n } from '../../../i18n/provider';
import type { RaceViewData } from '../public-view';
import { timingRows } from './model';
import { PACE_MODES, FUEL_MODES, ERS_MODES, type PaceMode, type FuelMode, type ErsMode } from '../../../simulation/race/commands/model';
import { isTyreCompound, type TyreCompound } from '../../../simulation/race/tyres/model';
import type { ViewerIntent } from './intents';
import { battleContext, drsState, fuelCritical, tyreCondition, tyreSuitability, ersOutlook } from './race-view';
import { tyreFamily } from '../../../simulation/race/tyres/family';
type Row = ReturnType<typeof timingRows>[number];
/** Laps-to-cliff at or below this reads as "high wear risk soon". Presentation wording only. */
const RISK_LAPS = 3;
/** Mode row: buttons for an editable player car, otherwise the active mode as read-only text. */
function Modes<T extends PaceMode | FuelMode | ErsMode | EnergyPolicy>({ label, modes, active, editable, busy, onPick, fuel = false }: { label: string; modes: readonly T[]; active: T; editable: boolean; busy: boolean; onPick: (mode: T) => void; fuel?: boolean }) {
    const { t } = useI18n();
    // Fuel modes have their own wording (Lean / Balanced / Rich) so they never read like the Pace modes.
    const name = (mode: T) => fuel ? t(`command.fuel.${mode as FuelMode}`) : t(`command.${mode}`);
    return <div className="mode-row"><div className="resource-heading"><h3>{label}</h3><strong className="mode-active">{name(active)}</strong></div>
        {editable && <div className="mode-buttons" role="group" aria-label={label}>{modes.map(mode => <button key={mode} disabled={busy || active === mode} aria-pressed={active === mode} onClick={() => onPick(mode)}>{active === mode && <span aria-hidden="true">✓ </span>}{name(mode)}</button>)}</div>}
    </div>;
}
/**
 * v8C dry-tyre rule (B6.3.6) for a player car: the obligation from tyres ACTUALLY used (server-derived). Information
 * only — the player may still choose any compound and accept the consequence at the flag.
 */
function TyreRule({ data, row }: { data: RaceViewData; row: Row }) {
    const { t, format } = useI18n(), s = data.state!, rule = s.input.regulation, r = row.entrant.regulation;
    if (!rule) return null;
    if (!rule.dryTyres) return <p className="tyre-rule ops-muted">{t('regulation.notApplicable')}</p>;
    // Retired cars carry no obligation (no notice at all, never a false warning).
    if (!r || r.status === 'NOT_APPLICABLE') return null;
    const tone = r.status === 'URGENT' || r.status === 'VIOLATED' ? 'rule-urgent' : r.status === 'OUTSTANDING' ? 'rule-outstanding' : 'rule-ok';
    const live = row.status === 'RUNNING' && s.status === 'RUNNING';
    return <div className={`tyre-rule ${tone}`} role={r.status === 'URGENT' ? 'alert' : undefined}>
        <div className="resource-heading"><h3>{t('regulation.title')}</h3><span aria-hidden="true">{r.status === 'SATISFIED' || r.status === 'EXEMPT' ? '✓' : '⚠'}</span></div>
        <p><strong>{t(`regulation.status.${r.status}`)}</strong></p>
        <p className="ops-muted">{r.usedDry.length ? t('regulation.used', { compounds: r.usedDry.map(c => t(`tyre.${c}`)).join(' · ') }) : t('regulation.usedNone')}</p>
        {live && (r.status === 'OUTSTANDING' || r.status === 'URGENT') && <>
            {r.deadlineLap !== null && <p className="ops-muted">{t('regulation.deadline', { lap: format.number(r.deadlineLap + 1) })}</p>}
            {row.entrant.pit?.pendingCompound && <p className="ops-muted">{t('regulation.pendingNote')}</p>}
        </>}
        {live && r.status === 'OUTSTANDING' && <p className="ops-muted">{t('regulation.requirement', { count: format.number(r.required) })}</p>}
    </div>;
}
function Stat({ label, children, tone }: { label: string; children: ReactNode; tone?: string }) { return <div className={`stat ${tone ?? ''}`}><span>{label}</span><strong>{children}</strong></div>; }
export function DriverPanel({ data, row, busy, send, rows }: {
    data: RaceViewData;
    row: Row;
    busy: boolean;
    send: (intent: ViewerIntent) => void;
    rows?: readonly Row[];
}) {
    const { t, format, locale } = useI18n(), e = row.entrant, s = data.state!, c = e.commands;
    const [compound, setCompound] = useState<TyreCompound>('HARD');
    const editable = row.player && s.status === 'RUNNING' && row.status === 'RUNNING';
    const battle = battleContext(rows ?? timingRows(data), row.id, s), drs = drsState(s), condition = tyreCondition(s, e);
    // Server-derived for the player's own cars (they read hidden fuel / ERS / pit-loss configuration).
    const projection = c && s.input.commands && e.insight?.projectedFuelGrams != null ? e.insight.projectedFuelGrams / 1000 : null;
    const estimate = e.insight?.pitEstimate ?? null;
    const gap = (ms: number | null) => ms === null ? t('race.lapped') : formatRaceGap(ms, locale);
    const kg = (n: number, sign = false) => format.number(Math.round(n * 10) / 10, { style: 'unit', unit: 'kilogram', maximumFractionDigits: 1, ...(sign ? { signDisplay: 'exceptZero' as const } : {}) });
    const status = row.status === 'RUNNING' && row.pitting ? 'PIT' : row.status;
    const neighbour = (side: 'ahead' | 'behind') => {
        const other = battle[side], ms = side === 'ahead' ? battle.gapAheadMs : battle.gapBehindMs, fight = side === 'ahead' ? battle.battleAhead : battle.battleBehind;
        return <div className={`neighbour ${fight ? 'fighting' : ''}`}><span>{t(side === 'ahead' ? 'viewer.ahead' : 'viewer.behind')}</span>{other ? <><strong style={{ borderColor: other.color }}>{other.abbreviation}</strong><em>{gap(ms)}</em><small className="neighbour-lap">{t('viewer.lastLap')} {lap(other.entrant.lastLapTimeMs)}</small></> : <strong>{t('race.noTime')}</strong>}</div>;
    };
    const lap = (ms: number | null) => ms === null ? t('race.noTime') : formatRaceTime(ms, locale);
    const suitability = e.stint && row.status === 'RUNNING' ? tyreSuitability(e.stint.tyre.compound, s) : null, ers = row.status === 'RUNNING' ? ersOutlook(e) : null;
    const lastStop = e.pit?.stops.at(-1);
    return <section className="ops-panel driver-focus" aria-label={t('viewer.selectedDriver')}>
  <div className="ops-panel-title"><span>{t('viewer.selectedDriver')}</span><span className="status-pill">{t(row.player ? 'viewer.player' : 'viewer.readOnly')}</span></div>
  <div className="driver-body"><div className="driver-condition">
   <div className="driver-identity" style={{ borderColor: row.color }}><strong className="driver-position">{row.disqualified ? t('classification.dsq') : <><small>P</small>{format.number(e.position)}</>}</strong><div><h2>{row.name}</h2><p><strong>{row.abbreviation}</strong>{row.number !== null && <> · #{format.number(row.number, { useGrouping: false })}</>} · {row.team}</p></div><span className={`driver-status status-${row.disqualified ? 'DSQ' : status}`}>{row.disqualified ? t('classification.DISQUALIFIED') : t(status === 'PIT' ? 'viewer.pit' : `incident.${status}`)}</span></div>
   {row.status !== 'RUNNING' && <p className={`no-commands status-${row.status}`} role="status">{row.status === 'RETIRED' ? t('viewer.noCommands.RETIRED', { lap: format.number(e.incident?.retiredLap ?? s.lap) }) : t('viewer.noCommands.FINISHED')}</p>}
   {row.disqualified && <p className="no-commands status-DSQ" role="status">{t('classification.reason.DRY_TYRE_SPECIFICATIONS')} {t('classification.consequence')} {(() => { const road = s.classification?.find(x => x.entrantId === row.id)?.roadPosition; return road ? t('classification.roadPosition', { position: format.number(road) }) : null; })()}</p>}
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
    <div className="tyre-stats"><Stat label={t('viewer.wear')} tone={condition?.wear !== 'OK' ? `warn-${condition?.wear}` : ''}>{e.stint.tyre.wearPermille === null ? t('race.noTime') : format.percentage(e.stint.tyre.wearPermille / 1000, { maximumFractionDigits: 0 })}</Stat><Stat label={t('viewer.temp')} tone={condition?.temperature !== 'OK' ? 'warn-HIGH' : ''}>{e.stint.tyre.temperatureMilliC === null ? t('race.noTime') : format.number(e.stint.tyre.temperatureMilliC / 1000, { style: 'unit', unit: 'celsius', maximumFractionDigits: 0 })}</Stat></div>
    {e.stint.tyre.wearPermille !== null && <progress max="1000" value={e.stint.tyre.wearPermille} aria-label={t('tyre.wear')}/>}
    {condition && (condition.wear !== 'OK' || condition.temperature !== 'OK') && <p className="tyre-warnings">{condition.wear !== 'OK' && <span className={`warn-${condition.wear}`}>⚠ {t(`viewer.warn.${condition.wear}`)}</span>}{condition.temperature !== 'OK' && <span className="warn-HIGH">⚠ {t(`viewer.warn.${condition.temperature}`)}</span>}</p>}
    {suitability && <p className={`tyre-suitability suit-${suitability.level}`}><span aria-hidden="true">{suitability.level === 'SUITABLE' ? '● ' : suitability.level === 'MARGINAL' ? '◐ ' : '○ '}</span><strong>{t(`viewer.suit.${suitability.level}`)}</strong> · {t(`viewer.suitNote.${suitability.note}`, { family: t(`viewer.family.${tyreFamily(e.stint!.tyre.compound)}`), best: t(`viewer.family.${suitability.best}`) })}</p>}
    {estimate && row.status === 'RUNNING' && s.status === 'RUNNING' && condition?.wear !== 'CRITICAL' && <p className="tyre-estimate">{estimate.lapsToCliff <= RISK_LAPS ? t('viewer.tyreLifeRisk') : t('viewer.tyreLife', { count: format.number(estimate.lapsToCliff) })}<small>{t('viewer.estimateNote')}</small></p>}
   </div>}
  </div><div className="driver-resources">{c && s.input.commands ? <>
   {s.simulationVersion === 8 && editable && <p className="ops-muted">{t((s.input.modelRevision??1)>=2?'assistance.commandTiming':'viewer.commandTiming')}</p>}
   <div className="resource-heading"><h3>{t('race.fuel')}</h3><strong>{e.fuelMassKg === null ? t('race.noTime') : kg(e.fuelMassKg)}</strong></div>
   <p className={`fuel-delta ${projection! < 0 ? 'fuel-warning' : 'fuel-ok'}`}>{t('command.projectedFuel')}: <strong>{kg(projection!, true)}</strong></p>
   {fuelCritical(s, e) && <p className="fuel-delta fuel-warning" role="status"><span aria-hidden="true">⚠ </span>{t('command.fuelCritical', { laps: format.number(e.insight!.fuelLapsRemaining!) })}</p>}
   <Modes fuel label={t('command.fuelMode')} modes={FUEL_MODES} active={c.fuelMode} editable={editable} busy={busy} onPick={mode => send({ kind: 'fuelMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}/>
   {e.assistance ? <><div className="assistance-status"><Stat label={t('assistance.aero')}>{t(`assistance.aero.${e.assistance.aero}`)}</Stat><Stat label={t('assistance.overtake')}>{t(`assistance.overtake.${e.assistance.overtake}`)}</Stat></div><div className="resource-heading"><h3>{t('command.energy')}</h3><strong>{format.percentage(e.assistance.energy/e.assistance.capacity,{maximumFractionDigits:0})}</strong></div><progress max={e.assistance.capacity} value={e.assistance.energy} aria-label={t('command.energy')}/><Modes label={t('assistance.policy')} modes={ENERGY_POLICIES} active={e.assistance.policy} editable={editable} busy={busy} onPick={mode=>send({kind:'energyPolicy',entrantId:e.entrantId,revision:c.commandRevision,mode})}/><p className="ops-muted">{t('assistance.note')}</p></> : <><div className="resource-heading"><h3>{t('command.ersMode')}</h3><strong>{format.percentage(c.ersCharge / s.input.commands.capacity, { maximumFractionDigits: 0 })}</strong></div><progress max={s.input.commands.capacity} value={c.ersCharge} aria-label={t('command.energy')}/>
   {ers && <p className="ers-outlook ops-muted">{ers.kind === 'LAPS' ? t('viewer.ersLaps', { count: format.number(ers.laps) }) : t(ers.kind === 'CHARGING' ? 'viewer.ersCharging' : 'viewer.ersSustainable')}</p>}
   <Modes label={t('viewer.ersDeployment')} modes={ERS_MODES} active={c.ersMode} editable={editable} busy={busy} onPick={mode => send({ kind: 'ersMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}/>
   </>}
   <Modes label={t('command.paceMode')} modes={PACE_MODES} active={c.paceMode} editable={editable} busy={busy} onPick={mode => send({ kind: 'paceMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}/>
  </> : e.fuelMassKg !== null ? <div className="resource-heading"><h3>{t('race.fuel')}</h3><strong>{kg(e.fuelMassKg)}</strong></div> : null}
  </div>
  {e.pit && e.stint && <div className="strategy-focus"><div className="resource-heading"><h3>{t('viewer.strategy')}</h3><span>{t('pit.stint')} {format.number(e.stint.number)} · {t('pit.stops')} {format.number(e.pit.stops.length)}</span></div>
   <div className="strategy-grid"><Stat label={t('viewer.currentTyre')}>{t(`tyre.${e.stint.tyre.compound}`)}</Stat><Stat label={t('viewer.stintAge')}>{t('viewer.age', { count: format.number(e.stint.tyre.ageLaps) })}</Stat>
    {lastStop && <Stat label={t('viewer.lastStop')}>{t('incident.lap', { lap: format.number(lastStop.lap) })} · {t('viewer.tyreChange', { old: t(`viewer.tyre.${lastStop.oldCompound}`), next: t(`viewer.tyre.${lastStop.newCompound}`) })}</Stat>}
    {estimate && <Stat label={t('pit.loss')}>{format.number(estimate.minimumLossMs / 1000, { maximumFractionDigits: 1 })}–{format.number(estimate.maximumLossMs / 1000, { style: 'unit', unit: 'second', maximumFractionDigits: 1 })}</Stat>}</div>
   {row.player && <TyreRule data={data} row={row}/>}
   <p className={e.pit.pendingCompound ? 'pit-pending' : 'ops-muted'}>{e.pit.pendingCompound ? <><span aria-hidden="true">↘ </span><strong>{row.abbreviation}</strong> — </> : null}{e.pit.committed ? t('pit.committed') : e.pit.pendingCompound ? t('pit.requested', { compound: t(`tyre.${e.pit.pendingCompound}`), lap: format.number(s.lap + 1) }) : t(row.status === 'RETIRED' ? 'incident.RETIRED' : row.status === 'FINISHED' ? 'pit.finished' : 'pit.onTrack')}</p>
   {editable && s.lap < s.input.totalLaps - 1 && s.input.tyres && <fieldset disabled={busy || e.pit.committed}><label>{t('pit.newTyre')}<select value={compound} onChange={event => { if (isTyreCompound(event.target.value))
            setCompound(event.target.value); }}>{Object.keys(s.input.tyres.profiles).filter(isTyreCompound).map(value => <option value={value} key={value}>{t(`tyre.${value}`)}{e.regulation?.satisfyingCompounds.includes(value) ? ` — ✓ ${t('regulation.meetsRule')}` : ''}</option>)}</select></label><div className="pit-buttons"><button onClick={() => send({ kind: 'pit', entrantId: e.entrantId, revision: e.pit!.commandRevision ?? 0, compound })}>{t('pit.box')}</button><button className="ops-secondary" disabled={!e.pit.pendingCompound} onClick={() => send({ kind: 'pit', entrantId: e.entrantId, revision: e.pit!.commandRevision ?? 0, compound: null })}>{t('pit.cancel')}</button></div></fieldset>}
   <details><summary>{t('pit.history')}</summary><ul>{e.pit.stints.map(stint => <li key={stint.number}>{t('pit.stintRecord', { number: format.number(stint.number), compound: t(`tyre.${stint.startingTyre.compound}`), start: format.number(stint.startLap + 1), end: stint.endLap === null ? t(e.incident?.status === 'RETIRED' ? 'pit.notRaced' : 'pit.open') : format.number(stint.endLap) })}</li>)}</ul><ul>{e.pit.stops.map(stop => <li key={stop.number}>{t('pit.stopRecord', { lap: format.number(stop.lap), old: t(`tyre.${stop.oldCompound}`), next: t(`tyre.${stop.newCompound}`) })} · {format.number(stop.totalLossMs / 1000, { style: 'unit', unit: 'second', maximumFractionDigits: 3 })}</li>)}</ul></details>
  </div>}
  </div>
  {editable && <p className="control-notice">{t('viewer.commandPause')}</p>}
 </section>;
}

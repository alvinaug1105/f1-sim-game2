"use client";
import { ENERGY_POLICIES, type EnergyPolicy } from '../../../simulation/race/assistance/model';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { formatRaceGap, formatRaceTime } from '../../../i18n/race-time';
import { useI18n } from '../../../i18n/provider';
import type { RacePublicEntrant, RaceViewData } from '../public-view';
import { timingRows } from './model';
import { PACE_MODES, FUEL_MODES, ERS_MODES, type PaceMode, type FuelMode, type ErsMode } from '../../../simulation/race/commands/model';
import { isTyreCompound, type TyreCompound } from '../../../simulation/race/tyres/model';
import type { ViewerIntent } from './intents';
import { battleContext, drsState, fuelCritical, tyreCondition, tyreSuitability, ersOutlook, officialLeaderId } from './race-view';
import { tyreFamily } from '../../../simulation/race/tyres/family';
import { strategicIssues } from './issues';
import { SEVERITY_ICONS, useIssueText } from './issues-rail';
import { Icon, type IconName } from '../../../components/ui/icon';
import { teamStyle } from '../../../components/ui/team-color';
type Row = ReturnType<typeof timingRows>[number];
/** Laps-to-cliff at or below this reads as "high wear risk soon". Presentation wording only. */
const RISK_LAPS = 3;
/** Mode row: a segmented control for an editable player car, otherwise the active mode as read-only text. */
function Modes<T extends PaceMode | FuelMode | ErsMode | EnergyPolicy>({ label, modes, active, editable, busy, onPick, fuel = false }: { label: string; modes: readonly T[]; active: T; editable: boolean; busy: boolean; onPick: (mode: T) => void; fuel?: boolean }) {
    const { t } = useI18n();
    // Fuel modes have their own wording (Lean / Balanced / Rich) so they never read like the Pace modes.
    const name = (mode: T) => fuel ? t(`command.fuel.${mode as FuelMode}`) : t(`command.${mode}`);
    return <div className="mode-row"><div className="resource-heading"><h3>{label}</h3>{!editable && <strong className="mode-active">{name(active)}</strong>}</div>
        {editable && <div className="mode-buttons live-segmented" role="group" aria-label={label}>{modes.map(mode => <button key={mode} disabled={busy || active === mode} aria-pressed={active === mode} onClick={() => onPick(mode)}>{name(mode)}</button>)}</div>}
    </div>;
}
/** A labelled section of the command panel. */
function Section({ icon, title, aside, tone, children, className = '' }: { icon: IconName; title: string; aside?: ReactNode; tone?: string; children: ReactNode; className?: string }) {
    return <section className={`dp-section ${className}`.trim()} data-tone={tone}>
        <header className="dp-section-head"><Icon name={icon} size={15}/><h3>{title}</h3>{aside}</header>
        <div className="dp-section-body">{children}</div>
    </section>;
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
        <div className="resource-heading"><h3>{t('regulation.title')}</h3><Icon name={r.status === 'SATISFIED' || r.status === 'EXEMPT' ? 'check' : 'alert'} size={14}/></div>
        <p><strong>{t(`regulation.status.${r.status}`)}</strong></p>
        <p className="ops-muted">{r.usedDry.length ? t('regulation.used', { compounds: r.usedDry.map(c => t(`tyre.${c}`)).join(' · ') }) : t('regulation.usedNone')}</p>
        {live && (r.status === 'OUTSTANDING' || r.status === 'URGENT') && <>
            {r.deadlineLap !== null && <p className="ops-muted">{t('regulation.deadline', { lap: format.number(r.deadlineLap + 1) })}</p>}
            {row.entrant.pit?.pendingCompound && <p className="ops-muted">{t('regulation.pendingNote')}</p>}
        </>}
        {live && r.status === 'OUTSTANDING' && <p className="ops-muted">{t('regulation.requirement', { count: format.number(r.required) })}</p>}
    </div>;
}
const OVERTAKE_ICON: Record<string, IconName> = { ACTIVE: 'arrow', ELIGIBLE: 'current', ELIGIBLE_NO_ENERGY: 'bolt' };
/**
 * Overtake Mode and Active Aero as two distinct cards (server-derived reasons for the player's own car). Overtake Mode
 * is a physical-eligibility system, not a push-to-pass button; Active Aero is automatic (corner / straight), never
 * DRS-gap gated and never a player command. Text plus icon, never colour alone.
 */
function AssistanceCards({ assistance: a }: { assistance: NonNullable<RacePublicEntrant['assistance']> }) {
    const { t, format } = useI18n();
    const seconds = (ms: number) => format.number(ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return <div className="dp-assist assistance-status">
        <div className="dp-assist-card" data-state={a.overtake}>
            <Icon name={OVERTAKE_ICON[a.overtakeReason ?? ''] ?? 'ban'} size={20}/>
            <div><span className="ui-label">{t('assistance.overtake')}</span><strong>{t(`assistance.overtake.${a.overtake}`)}</strong>
                {a.overtakeReason && <p className={`overtake-reason reason-${a.overtakeReason}`}>{t(`assistance.overtakeReason.${a.overtakeReason}`, { gap: a.gapAheadMs != null ? seconds(a.gapAheadMs) : '', threshold: seconds(a.overtakeThresholdMs ?? 1000) })}</p>}</div>
        </div>
        <div className="dp-assist-card" data-state={a.aero}>
            <Icon name="aero" size={20}/>
            <div><span className="ui-label">{t('assistance.aero')}</span><strong title={t('assistance.aeroHelp')}>{t(`assistance.aero.${a.aero}`)} <small className="dp-auto">{t('live.automatic')}</small></strong>
                {a.aeroReason && <p className="aero-reason">{t(`assistance.aeroReason.${a.aeroReason}`)} {t(a.aeroStraightDeltaMs ? 'assistance.aeroEffect' : 'assistance.aeroEffectBaseline', { ms: format.number(a.aeroStraightDeltaMs ?? 0) })}</p>}</div>
        </div>
    </div>;
}
function Stat({ label, children, tone }: { label: string; children: ReactNode; tone?: string }) { return <div className={`stat ${tone ?? ''}`}><span>{label}</span><strong>{children}</strong></div>; }
/** A permille / ratio value as a labelled bar with its value in text (never colour alone). */
function Bar({ value, max, label, tone }: { value: number; max: number; label: string; tone?: string }) {
    return <div className="dp-bar" data-tone={tone}><progress max={max} value={value} aria-label={label}/></div>;
}
/**
 * Selected-driver command panel (UIX-B). Hierarchy: STATUS (identity, position, state) → PROBLEM (this car's current
 * strategic issues) → DECISION (fuel, energy, pace and pit controls, with eligibility explanations) → DETAIL (history).
 * Commands are only rendered for an editable player car; rivals and finished cars are read-only (no buttons).
 */
export function DriverPanel({ data, row, busy, send, rows }: {
    data: RaceViewData;
    row: Row;
    busy: boolean;
    send: (intent: ViewerIntent) => void;
    rows?: readonly Row[];
}) {
    const { t, format, locale } = useI18n(), e = row.entrant, s = data.state!, c = e.commands;
    const [compound, setCompound] = useState<TyreCompound>('HARD');
    const all = rows ?? timingRows(data), issueText = useIssueText(all);
    const editable = row.player && s.status === 'RUNNING' && row.status === 'RUNNING';
    const battle = battleContext(all, row.id, s), drs = drsState(s), condition = tyreCondition(s, e);
    const issues = row.player ? strategicIssues(all, s).filter(i => i.entrantId === row.id && i.kind !== 'BOX_REQUESTED') : [];
    // Server-derived for the player's own cars (they read hidden fuel / ERS / pit-loss configuration).
    const projection = c && s.input.commands && e.insight?.projectedFuelGrams != null ? e.insight.projectedFuelGrams / 1000 : null;
    const estimate = e.insight?.pitEstimate ?? null;
    const gap = (ms: number | null) => ms === null ? t('race.lapped') : formatRaceGap(ms, locale);
    const lap = (ms: number | null) => ms === null ? t('race.noTime') : formatRaceTime(ms, locale);
    const kg = (n: number, sign = false) => format.number(Math.round(n * 10) / 10, { style: 'unit', unit: 'kilogram', maximumFractionDigits: 1, ...(sign ? { signDisplay: 'exceptZero' as const } : {}) });
    const status = row.status === 'RUNNING' && row.pitting ? 'PIT' : row.status;
    const neighbour = (side: 'ahead' | 'behind') => {
        const other = side === 'ahead' ? battle.ahead : battle.behind, ms = side === 'ahead' ? battle.gapAheadMs : battle.gapBehindMs, fight = side === 'ahead' ? battle.battleAhead : battle.battleBehind;
        return <div className={`neighbour ${fight ? 'fighting' : ''}`}><span className="ui-label">{t(side === 'ahead' ? 'viewer.ahead' : 'viewer.behind')}</span>{other ? <><strong style={{ borderColor: other.color }}>{other.abbreviation}</strong><em>{gap(ms)}</em>{fight && <Icon name="battle" size={13} label={t('viewer.battle')}/>}<small className="neighbour-lap">{t('viewer.lastLap')} {lap(other.entrant.lastLapTimeMs)}</small></> : <strong>{t('race.noTime')}</strong>}</div>;
    };
    const suitability = e.stint && row.status === 'RUNNING' ? tyreSuitability(e.stint.tyre.compound, s) : null, ers = row.status === 'RUNNING' ? ersOutlook(e) : null;
    const lastStop = e.pit?.stops.at(-1);
    const wearTone = condition?.wear === 'CRITICAL' ? 'bad' : condition?.wear === 'HIGH' ? 'warn' : undefined;
    return <section className="ops-panel driver-focus dp" aria-label={t('viewer.selectedDriver')} style={teamStyle(row.color) as CSSProperties}>
        <header className="dp-head driver-identity">
            <span className="dp-number" aria-hidden="true">{row.number !== null ? format.number(row.number, { useGrouping: false }) : row.abbreviation}</span>
            <div className="dp-id">
                <p className="ui-label">{row.abbreviation}{row.number !== null && <span className="visually-hidden"> · #{format.number(row.number, { useGrouping: false })}</span>} · {row.team}</p>
                <h2 className="ui-display dp-name">{row.name}</h2>
            </div>
            <strong className="dp-pos driver-position">{row.disqualified ? t('classification.dsq') : t('commandCentre.position', { position: e.position })}</strong>
        </header>
        <div className="dp-statusline">
            <span className={`driver-status status-${row.disqualified ? 'DSQ' : status}`}><Icon name={row.disqualified || status === 'RETIRED' ? 'ban' : status === 'PIT' ? 'wrench' : status === 'FINISHED' ? 'flag' : 'play'} size={12}/>{row.disqualified ? t('classification.DISQUALIFIED') : t(status === 'PIT' ? 'viewer.pit' : `incident.${status}`)}</span>
            <span className="status-pill">{t(row.player ? 'viewer.player' : 'viewer.readOnly')}</span>
            <span className="dp-leader">{t('viewer.toLeader')}: {officialLeaderId(s) === row.id ? t('race.leader') : row.disqualified ? t('classification.DISQUALIFIED') : gap(row.gap)}</span>
        </div>
        {row.status !== 'RUNNING' && <p className={`no-commands status-${row.status}`} role="status">{row.status === 'RETIRED' ? t('viewer.noCommands.RETIRED', { lap: format.number(e.incident?.retiredLap ?? s.lap) }) : t('viewer.noCommands.FINISHED')}</p>}
        {row.disqualified && <p className="no-commands status-DSQ" role="status">{t('classification.reason.DRY_TYRE_SPECIFICATIONS')} {t('classification.consequence')} {(() => { const road = s.classification?.find(x => x.entrantId === row.id)?.roadPosition; return road ? t('classification.roadPosition', { position: format.number(road) }) : null; })()}</p>}
        {issues.length > 0 && <ul className="dp-issues" aria-label={t('issues.title')}>{issues.map(i => <li key={i.key} data-severity={i.severity}><Icon name={SEVERITY_ICONS[i.severity]} size={14}/><span className="issue-severity">{t(`issues.severity.${i.severity}`)}</span><span>{issueText(i)}</span></li>)}</ul>}
        {row.status !== 'RETIRED' && <div className="dp-context gap-block">
            <div className="neighbours">{neighbour('ahead')}{neighbour('behind')}</div>
            <div className="lap-times"><Stat label={t('viewer.lastLap')}>{lap(e.lastLapTimeMs)}{e.lastLapTimeMs !== null && e.lastLapTimeMs === e.bestLapTimeMs && <small className="pb-mark">{t('viewer.personalBest')}</small>}</Stat><Stat label={t('viewer.bestLap')}>{lap(e.bestLapTimeMs)}</Stat></div>
            {drs !== 'UNAVAILABLE' && drs !== 'FINISHED' && <p className={`drs-line ${drs === 'ENABLED' && e.track?.drsEligible ? 'drs-on' : 'drs-off'}`}>{drs === 'ENABLED' ? t(e.track?.drsEligible ? 'viewer.drsEligible' : 'viewer.drsNotEligible') : t(`viewer.drs.${drs}`, { count: format.number(s.incidents?.drsDelay ?? 0) })}</p>}
        </div>}
        {e.stint && <Section icon="tyre" title={t('live.tyres')} className="tyre-focus" tone={wearTone}
            aside={<span className="dp-aside">{t('viewer.age', { count: format.number(e.stint.tyre.ageLaps) })}</span>}>
            <div className="dp-tyre">
                <span className={`tyre-token tyre-token-lg tyre-${e.stint.tyre.compound}`} title={t(`tyre.${e.stint.tyre.compound}`)}>{t(`viewer.tyre.${e.stint.tyre.compound}`)}</span>
                <div className="dp-tyre-main"><strong>{t(`tyre.${e.stint.tyre.compound}`)}</strong>
                    {suitability && <p className={`tyre-suitability suit-${suitability.level}`}><Icon name={suitability.level === 'SUITABLE' ? 'check' : suitability.level === 'MARGINAL' ? 'alert' : 'ban'} size={13}/><strong>{t(`viewer.suit.${suitability.level}`)}</strong> · {t(`viewer.suitNote.${suitability.note}`, { family: t(`viewer.family.${tyreFamily(e.stint.tyre.compound)}`), best: t(`viewer.family.${suitability.best}`) })}</p>}</div>
            </div>
            <div className="tyre-stats dp-stats"><Stat label={t('viewer.wear')} tone={condition?.wear !== 'OK' ? `warn-${condition?.wear}` : ''}>{e.stint.tyre.wearPermille === null ? t('race.noTime') : format.percentage(e.stint.tyre.wearPermille / 1000, { maximumFractionDigits: 0 })}</Stat><Stat label={t('viewer.temp')} tone={condition?.temperature !== 'OK' ? 'warn-HIGH' : ''}>{e.stint.tyre.temperatureMilliC === null ? t('race.noTime') : format.number(e.stint.tyre.temperatureMilliC / 1000, { style: 'unit', unit: 'celsius', maximumFractionDigits: 0 })}</Stat></div>
            {e.stint.tyre.wearPermille !== null && <Bar max={1000} value={e.stint.tyre.wearPermille} label={t('tyre.wear')} tone={wearTone}/>}
            {condition && (condition.wear !== 'OK' || condition.temperature !== 'OK') && <p className="tyre-warnings">{condition.wear !== 'OK' && <span className={`warn-${condition.wear}`}><Icon name="alert" size={12}/>{t(`viewer.warn.${condition.wear}`)}</span>}{condition.temperature !== 'OK' && <span className="warn-HIGH"><Icon name="thermo" size={12}/>{t(`viewer.warn.${condition.temperature}`)}</span>}</p>}
            {estimate && row.status === 'RUNNING' && s.status === 'RUNNING' && condition?.wear !== 'CRITICAL' && <p className="tyre-estimate" data-risk={estimate.lapsToCliff <= RISK_LAPS || undefined}>{estimate.lapsToCliff <= RISK_LAPS ? t('viewer.tyreLifeRisk') : estimate.paceMode ? t('viewer.tyreLifeAtPace', { count: format.number(estimate.lapsToCliff), pace: t(`command.${estimate.paceMode}`) }) : t('viewer.tyreLife', { count: format.number(estimate.lapsToCliff) })}
                {estimate.lapsToCliffMin !== undefined && estimate.lapsToCliffMax !== undefined && estimate.lapsToCliffMin !== estimate.lapsToCliffMax && <small>{t('viewer.tyreLifeRange', { min: format.number(estimate.lapsToCliffMin), max: format.number(estimate.lapsToCliffMax) })}</small>}
                <small>{t('viewer.estimateNote')}</small></p>}
        </Section>}
        <div className="driver-resources">{c && s.input.commands ? <>
            {s.simulationVersion === 8 && editable && <p className="ops-muted dp-timing-note">{t((s.input.modelRevision ?? 1) >= 2 ? 'assistance.commandTiming' : 'viewer.commandTiming')}</p>}
            <Section icon="fuel" title={t('race.fuel')} tone={fuelCritical(s, e) ? 'bad' : projection !== null && projection < 0 ? 'warn' : undefined} aside={<strong className="dp-aside-value">{e.fuelMassKg === null ? t('race.noTime') : kg(e.fuelMassKg)}</strong>}>
                <p className={`fuel-delta ${projection! < 0 ? 'fuel-warning' : 'fuel-ok'}`}>{t('command.projectedFuel')}: <strong>{kg(projection!, true)}</strong></p>
                {fuelCritical(s, e) && <p className="fuel-delta fuel-warning" role="status"><Icon name="alert" size={12}/>{t('command.fuelCritical', { laps: format.number(e.insight!.fuelLapsRemaining!) })}</p>}
                <Modes fuel label={t('command.fuelMode')} modes={FUEL_MODES} active={c.fuelMode} editable={editable} busy={busy} onPick={mode => send({ kind: 'fuelMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}/>
            </Section>
            {e.assistance ? <>
                <Section icon="bolt" title={t('command.energy')} aside={<strong className="dp-aside-value">{format.percentage(e.assistance.energy / e.assistance.capacity, { maximumFractionDigits: 0 })}</strong>}>
                    <Bar max={e.assistance.capacity} value={e.assistance.energy} label={t('command.energy')}/>
                    <Modes label={t('assistance.policy')} modes={ENERGY_POLICIES} active={e.assistance.policy} editable={editable} busy={busy} onPick={mode => send({ kind: 'energyPolicy', entrantId: e.entrantId, revision: c.commandRevision, mode })}/>
                    <p className="ops-muted">{t('assistance.note')}</p>
                </Section>
                <AssistanceCards assistance={e.assistance}/>
            </> : <Section icon="bolt" title={t('command.ersMode')} aside={<strong className="dp-aside-value">{format.percentage(c.ersCharge / s.input.commands.capacity, { maximumFractionDigits: 0 })}</strong>}>
                <Bar max={s.input.commands.capacity} value={c.ersCharge} label={t('command.energy')}/>
                {ers && <p className="ers-outlook ops-muted">{ers.kind === 'LAPS' ? t('viewer.ersLaps', { count: format.number(ers.laps) }) : t(ers.kind === 'CHARGING' ? 'viewer.ersCharging' : 'viewer.ersSustainable')}</p>}
                <Modes label={t('viewer.ersDeployment')} modes={ERS_MODES} active={c.ersMode} editable={editable} busy={busy} onPick={mode => send({ kind: 'ersMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}/>
            </Section>}
            <Section icon="gauge" title={t('command.paceMode')}>
                <Modes label={t('command.paceMode')} modes={PACE_MODES} active={c.paceMode} editable={editable} busy={busy} onPick={mode => send({ kind: 'paceMode', entrantId: e.entrantId, revision: c.commandRevision, mode })}/>
            </Section>
        </> : e.fuelMassKg !== null ? <Section icon="fuel" title={t('race.fuel')} aside={<strong className="dp-aside-value">{kg(e.fuelMassKg)}</strong>}>{null}</Section> : null}
        </div>
        {e.pit && e.stint && <Section icon="wrench" title={t('viewer.strategy')} className="strategy-focus" tone={e.pit.pendingCompound ? 'signal' : undefined}
            aside={<span className="dp-aside">{t('pit.stint')} {format.number(e.stint.number)} · {t('pit.stops')} {format.number(e.pit.stops.length)}</span>}>
            <p className={e.pit.pendingCompound ? 'pit-pending' : 'ops-muted dp-pit-state'}>{e.pit.pendingCompound ? <><Icon name="wrench" size={13}/><strong>{row.abbreviation}</strong> — </> : null}{e.pit.committed ? t('pit.committed') : e.pit.pendingCompound ? t('pit.requested', { compound: t(`tyre.${e.pit.pendingCompound}`), lap: format.number(s.lap + 1) }) : t(row.status === 'RETIRED' ? 'incident.RETIRED' : row.status === 'FINISHED' ? 'pit.finished' : 'pit.onTrack')}</p>
            {editable && s.lap < s.input.totalLaps - 1 && s.input.tyres && <fieldset className="dp-pit-form" disabled={busy || e.pit.committed}>
                <label>{t('pit.newTyre')}<select value={compound} onChange={event => { if (isTyreCompound(event.target.value)) setCompound(event.target.value); }}>{Object.keys(s.input.tyres.profiles).filter(isTyreCompound).map(value => <option value={value} key={value}>{t(`tyre.${value}`)}{e.regulation?.satisfyingCompounds.includes(value) ? ` — ✓ ${t('regulation.meetsRule')}` : ''}</option>)}</select></label>
                <div className="pit-buttons"><button className="dp-box" onClick={() => send({ kind: 'pit', entrantId: e.entrantId, revision: e.pit!.commandRevision ?? 0, compound })}>{t('pit.box')}</button><button className="ops-secondary" disabled={!e.pit.pendingCompound} onClick={() => send({ kind: 'pit', entrantId: e.entrantId, revision: e.pit!.commandRevision ?? 0, compound: null })}>{t('pit.cancel')}</button></div>
            </fieldset>}
            <div className="strategy-grid dp-stats">
                {lastStop && <Stat label={t('viewer.lastStop')}>{t('incident.lap', { lap: format.number(lastStop.lap) })} · {t('viewer.tyreChange', { old: t(`viewer.tyre.${lastStop.oldCompound}`), next: t(`viewer.tyre.${lastStop.newCompound}`) })}</Stat>}
                {estimate && <Stat label={t('pit.loss')}>{format.number(estimate.minimumLossMs / 1000, { maximumFractionDigits: 1 })}–{format.number(estimate.maximumLossMs / 1000, { style: 'unit', unit: 'second', maximumFractionDigits: 1 })}</Stat>}
                {estimate?.rejoin && editable && <Stat label={t('pit.rejoin')}>{estimate.rejoin.best === estimate.rejoin.worst ? t('pit.rejoinAt', { position: format.number(estimate.rejoin.best) }) : t('pit.rejoinRange', { best: format.number(estimate.rejoin.best), worst: format.number(estimate.rejoin.worst) })}</Stat>}
            </div>
            {estimate?.rejoin && editable && <p className="ops-muted">{t('pit.rejoinNote')}</p>}
            {row.player && <TyreRule data={data} row={row}/>}
            <details className="dp-history"><summary>{t('pit.history')}</summary><ul>{e.pit.stints.map(stint => <li key={stint.number}>{t('pit.stintRecord', { number: format.number(stint.number), compound: t(`tyre.${stint.startingTyre.compound}`), start: format.number(stint.startLap + 1), end: stint.endLap === null ? t(e.incident?.status === 'RETIRED' ? 'pit.notRaced' : 'pit.open') : format.number(stint.endLap) })}</li>)}</ul><ul>{e.pit.stops.map(stop => <li key={stop.number}>{t('pit.stopRecord', { lap: format.number(stop.lap), old: t(`tyre.${stop.oldCompound}`), next: t(`tyre.${stop.newCompound}`) })} · {format.number(stop.totalLossMs / 1000, { style: 'unit', unit: 'second', maximumFractionDigits: 3 })}</li>)}</ul></details>
        </Section>}
        {editable && <p className="control-notice">{t('viewer.commandPause')}</p>}
    </section>;
}

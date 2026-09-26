"use client";
import Link from 'next/link';
import { Fragment, useState, type ReactNode } from 'react';
import { useI18n } from '../../i18n/provider';
import { formatRaceGap, formatRaceTime } from '../../i18n/race-time';
import { QUALIFYING_COMPOUNDS, type QualifyingPhase } from '../../simulation/qualifying/model';
import { compoundFit, SETUP_DIMENSIONS } from '../../simulation/practice/model';
import type { TyreCompound } from '../../simulation/race/tyres/model';
import type { QualifyingEntrantView, QualifyingView, DriverStatus } from './view-model';
import type { QualifyingCommand } from './service';
import { nextSessionPath, phaseKey, textKey } from './labels';
/** A player command before it is addressed to a car (entrant id + command revision are added by the caller). */
export type QualifyingUiCommand = QualifyingCommand extends infer C ? C extends { entrantId: string; revision: number } ? Omit<C, 'entrantId' | 'revision'> : never : never;
const LOCATION_GLYPH = { GARAGE: '■', OUT_LAP: '↗', FLYING: '▶', IN_LAP: '↘' } as const;
const STATUS_GLYPH: Record<DriverStatus, string> = { SAFE: '✓', AT_RISK: '!', DANGER: '✕', NO_TIME: '–', ELIMINATED: '■', ADVANCED: '→', POLE: '◆', Q3: '◇' };
const FIT = ['UNSUITED', 'MARGINAL', 'SUITED'] as const;
export function StatusChip({ status }: { status: DriverStatus }) {
    const { t } = useI18n();
    return <span className={`q-status status-${status}`}><span aria-hidden="true">{STATUS_GLYPH[status]} </span>{t(`qualifying.status.${status}`)}</span>;
}
function Stat({ label, children }: { label: string; children: ReactNode }) { return <div className="stat"><span>{label}</span><strong>{children}</strong></div>; }
/** Signed cutoff delta: negative = margin inside the cutoff, positive = time still to find. */
export function CutoffDelta({ ms }: { ms: number | null }) {
    const { t, locale } = useI18n();
    if (ms === null) return null;
    return <small className={`cutoff-delta ${ms <= 0 ? 'inside' : 'outside'}`}>{t(ms <= 0 ? 'qualifying.inside' : 'qualifying.outside', { gap: formatRaceGap(Math.abs(ms), locale) })}</small>;
}
export function QualifyingTower({ view, selected, onSelect }: { view: QualifyingView; selected: string; onSelect: (id: string) => void }) {
    const { t, format, locale } = useI18n(), lap = (ms: number | null) => ms === null ? t('race.noTime') : formatRaceTime(ms, locale);
    const finished = view.status === 'FINISHED', title = finished ? t(textKey(view.kind, 'classification')) : t('qualifying.timing', { phase: t(phaseKey(view.kind, view.phase)) });
    return <section className="ops-panel timing-panel" aria-label={title}>
        <div className="ops-panel-title"><h2>{title}</h2>{view.cutoff !== null && <span className="ops-muted">{t('qualifying.cutoffAt', { position: format.number(view.cutoff) })}</span>}</div>
        <div className="timing-scroll"><table className="timing-tower qualifying-tower"><caption className="sr-only">{title}</caption>
            <thead><tr><th><span aria-hidden="true">{t('practice.posShort')}</span><span className="sr-only">{t('race.position')}</span></th><th>{t('race.driver')}</th><th>{t(finished ? 'qualifying.result' : 'race.best')}</th><th>{t('practice.where')}</th></tr></thead>
            <tbody>{view.entrants.map(e => {
                const chosen = e.entrantId === selected, out = e.eliminatedIn !== null;
                const time = finished ? e.times.Q3 ?? e.times.Q2 ?? e.times.Q1 : e.bestMs;
                return <Fragment key={e.entrantId}>
                    <tr onClick={() => onSelect(e.entrantId)} data-entrant={e.entrantId} className={['tower-row', chosen && 'selected-row', e.player && 'player-row', out && 'eliminated-row', e.location === 'GARAGE' && 'garage-row'].filter(Boolean).join(' ')} style={e.player ? { ['--team' as string]: e.color } : undefined}>
                        <td>{format.number(e.position)}</td>
                        <th scope="row"><button onClick={() => onSelect(e.entrantId)} aria-pressed={chosen} className="driver-select" style={{ borderColor: e.color }} title={e.name}><strong>{e.player && <span className="player-mark" aria-hidden="true">◆</span>}{e.abbreviation}{chosen && <span className="selected-mark" aria-hidden="true"> ◂</span>}</strong><small>{e.team}</small>{e.player && <span className="sr-only">{t('viewer.player')}</span>}</button></th>
                        <td>{out && !finished ? <small className="out-label">{t('qualifying.outIn', { phase: t(phaseKey(view.kind, e.eliminatedIn!)) })}</small> : <>{lap(time)}{!finished && e.gapMs !== null && e.gapMs > 0 && <small>{formatRaceGap(e.gapMs, locale)}</small>}{!finished && e.player && <CutoffDelta ms={e.cutoffDeltaMs}/>}</>}</td>
                        <td>{finished || out ? (e.player ? <StatusChip status={e.status}/> : e.eliminatedIn ? <small>{t('qualifying.outIn', { phase: t(phaseKey(view.kind, e.eliminatedIn)) })}</small> : null) : <>
                            <span className={`location-chip location-${e.location}`}><span aria-hidden="true">{LOCATION_GLYPH[e.location]} </span>{t(`practice.location.${e.location}`)}</span>
                            {e.player && <StatusChip status={e.status}/>}
                            {e.tyre && <small className={`tyre-token tyre-${e.tyre.compound}`} title={t(`tyre.${e.tyre.compound}`)}>{t(`viewer.tyre.${e.tyre.compound}`)}</small>}</>}</td>
                    </tr>
                    {view.cutoff !== null && e.position === view.cutoff && !out && <tr className="cutoff-row" aria-label={t('qualifying.cutoffLine', { position: format.number(view.cutoff) })}><td colSpan={4}><span aria-hidden="true">✂ </span>{t('qualifying.cutoffLine', { position: format.number(view.cutoff) })}</td></tr>}
                </Fragment>;
            })}</tbody></table></div>
        <p className="tower-note">{t('qualifying.towerNote')}</p>
    </section>;
}
/** Both player cars stay visible with their status, even when not selected; selecting never changes which car a command targets. */
export function PlayerSwitch({ view, selected, onSelect }: { view: QualifyingView; selected: string; onSelect: (id: string) => void }) {
    const { t, format } = useI18n();
    return <div className="player-switch q-player-switch" role="group" aria-label={t('viewer.playerCars')}>{view.entrants.filter(e => e.player).map(e =>
        <button key={e.entrantId} aria-pressed={e.entrantId === selected} onClick={() => onSelect(e.entrantId)} style={{ borderColor: e.color }}>
            <strong>{e.abbreviation}{e.entrantId === selected && <span aria-hidden="true"> ◂</span>}</strong> <span>P{format.number(e.position)}</span> <StatusChip status={e.status}/>
        </button>)}</div>;
}
function RunPlanner({ view, e, busy, send }: { view: QualifyingView; e: QualifyingEntrantView; busy: boolean; send: (c: QualifyingUiCommand) => void }) {
    const { t, format } = useI18n(), own = e.own!, band = view.weather ? (view.weather.trackWater < 100 ? 0 : view.weather.trackWater < 350 ? 1 : 2) : 0;
    const [compound, setCompound] = useState<TyreCompound>(band === 2 ? 'WET' : band === 1 ? 'INTERMEDIATE' : 'SOFT');
    const [push, setPush] = useState(1);
    const max = own.maxPushLaps, ready = own.readyAtMs <= view.phaseElapsedMs, laps = Math.min(push, Math.max(1, max));
    const fit = view.weather ? FIT[compoundFit(compound, view.weather)] : 'SUITED';
    return <div className="run-planner" data-testid="q-run-planner"><h3>{t('qualifying.plan')}</h3>
        {max < 1 ? <p className="ops-muted" role="status">{t('qualifying.noTimeForRun')}</p> : <>
            <label>{t('tyre.compound')}<select value={compound} onChange={ev => setCompound(ev.target.value as TyreCompound)} disabled={busy}>
                {QUALIFYING_COMPOUNDS.map(c => <option key={c} value={c}>{t(`tyre.${c}`)} · {t(`practice.fit.${view.weather ? FIT[compoundFit(c, view.weather)] : 'SUITED'}`)}</option>)}</select></label>
            <p className={`fit-note fit-${fit}`}><span aria-hidden="true">{fit === 'SUITED' ? '✓ ' : fit === 'MARGINAL' ? '~ ' : '✕ '}</span>{t(`practice.fitNote.${fit}`)}</p>
            <div className="mode-buttons" role="group" aria-label={t('qualifying.pushLaps')}>{[1, 2, 3].map(n => <button key={n} disabled={busy || n > max} aria-pressed={laps === n} onClick={() => setPush(n)}>{laps === n && <span aria-hidden="true">✓ </span>}{t('qualifying.pushCount', { count: format.number(n) })}</button>)}</div>
            <small className="ops-muted">{t('qualifying.fuelNote')}</small>
            <button className="send-out" disabled={busy || !ready} onClick={() => send({ kind: 'send', plan: { compound, pushLaps: laps } })}>{t('practice.sendOut')}</button>
            {!ready && <small role="status">{t('qualifying.garageWork')}</small>}
        </>}
    </div>;
}
export function QualifyingDriverPanel({ view, e, busy, send, onSelect }: { view: QualifyingView; e: QualifyingEntrantView; busy: boolean; send: (entrantId: string, revision: number, c: QualifyingUiCommand) => void; onSelect: (id: string) => void }) {
    const { t, format, locale } = useI18n(), own = e.own, lap = (ms: number | null) => ms === null ? t('race.noTime') : formatRaceTime(ms, locale);
    const live = view.status === 'RUNNING' && !view.phaseComplete, commandable = !!own && live && !view.autoPlayer && e.eliminatedIn === null;
    const act = (c: QualifyingUiCommand) => own && send(e.entrantId, own.commandRevision, c);
    return <section className="ops-panel driver-focus practice-driver qualifying-driver" aria-label={t('viewer.selectedDriver')}>
        <div className="ops-panel-title"><span>{t('viewer.selectedDriver')}</span><span className="status-pill">{t(own ? 'viewer.player' : 'viewer.readOnly')}</span></div>
        <div className="driver-body">
            <PlayerSwitch view={view} selected={e.entrantId} onSelect={onSelect}/>
            <div className="driver-identity" style={{ borderColor: e.color }}><strong className="driver-position"><small>P</small>{format.number(e.position)}</strong><div><h2>{e.name}</h2><p><strong>{e.abbreviation}</strong>{e.number !== null && <> · #{format.number(e.number, { useGrouping: false })}</>} · {e.team}</p></div>
                {e.eliminatedIn === null && <span className={`location-chip location-${e.location}`}><span aria-hidden="true">{LOCATION_GLYPH[e.location]} </span>{t(`practice.location.${e.location}`)}</span>}</div>
            <StatusChip status={e.status}/>
            <div className="stat-grid">
                <Stat label={t('qualifying.bestPhase', { phase: t(phaseKey(view.kind, view.phase)) })}>{lap(e.bestMs)}</Stat><Stat label={t('viewer.lastLap')}>{lap(e.lastLapMs)}{e.lastLapTraffic && <small className="traffic-note">{t('qualifying.lastLapTraffic')}</small>}</Stat>
                <Stat label={t('qualifying.cutoff')}><CutoffDelta ms={e.cutoffDeltaMs}/>{e.cutoffDeltaMs === null && t('race.noTime')}</Stat><Stat label={t('qualifying.runs')}>{format.number(e.attempts)}</Stat>
                {(['Q1', 'Q2', 'Q3'] as QualifyingPhase[]).map(p => <Stat key={p} label={t(phaseKey(view.kind, p))}>{lap(e.times[p])}</Stat>)}
            </div>
            {e.eliminatedIn !== null && <p className="no-commands" role="status">{t('qualifying.eliminatedNote', { phase: t(phaseKey(view.kind, e.eliminatedIn)), position: format.number(e.position) })}</p>}
            {!own ? <p className="ops-muted">{t('qualifying.rivalNote')}</p> : <>
                {view.autoPlayer && <p className="ops-muted" role="status">{t('practice.autoManaged')}</p>}
                {own.run && <div className="run-status"><h3>{t('qualifying.currentRun')}</h3>
                    <p>{t(`tyre.${own.run.plan.compound}`)} · {t('qualifying.pushProgress', { done: format.number(own.run.pushDone), target: format.number(own.run.plan.pushLaps) })}</p>
                    {commandable && <button disabled={busy || own.run.callIn || e.location === 'IN_LAP'} onClick={() => act({ kind: 'callIn' })}>{t(own.run.callIn || e.location === 'IN_LAP' ? 'practice.comingIn' : 'qualifying.callIn')}</button>}
                </div>}
                {commandable && e.location === 'GARAGE' && <RunPlanner key={`q-run-plan:${e.entrantId}:${own.commandRevision}`} view={view} e={e} busy={busy} send={act}/>}
                <div className="knowledge"><h3>{t('qualifying.carriedSetup')}</h3>
                    <p className="ops-muted">{t(textKey(view.kind, 'setupLocked'))}</p>
                    <dl className="setup-readout">{SETUP_DIMENSIONS.map(d => <div key={d}><dt>{t(`practice.dim.${d}`)}</dt><dd>{format.number(own.preparation.setup[d])}</dd></div>)}</dl>
                    <p>{t('practice.confidence')}: {format.percentage(own.preparation.confidence / 1000, { maximumFractionDigits: 0 })} · {t('practice.acclimatisation')}: {format.percentage(own.preparation.acclimatisation / 1000, { maximumFractionDigits: 0 })}</p>
                </div>
            </>}
        </div>
    </section>;
}
/** Between phases: frozen classification, eliminations and a single explicit Continue. */
export function PhaseCompletePanel({ view, pending, onContinue }: { view: QualifyingView; pending: boolean; onContinue: () => void }) {
    const { t } = useI18n(), next = view.phase === 'Q1' ? 'Q2' : 'Q3';
    const out = view.entrants.filter(e => e.eliminatedIn === view.phase), mine = view.entrants.filter(e => e.player);
    return <section className="ops-panel phase-complete" aria-labelledby="phase-complete-title">
        <div className="ops-panel-title"><h2 id="phase-complete-title">{t('qualifying.phaseComplete', { phase: t(phaseKey(view.kind, view.phase)) })}</h2><span className="status-pill">■ {t('qualifying.frozen')}</span></div>
        <div className="summary-body">
            <div><h3>{t('qualifying.eliminated')}</h3>{out.length ? <ol>{out.map(e => <li key={e.entrantId}><strong style={{ borderColor: e.color }}>{e.abbreviation}</strong> P{e.position}</li>)}</ol> : <p className="ops-muted">{t('qualifying.noEliminations')}</p>}</div>
            <div><h3>{t('prep.yourDrivers')}</h3><ul>{mine.map(e => <li key={e.entrantId}><strong>{e.abbreviation}</strong> P{e.position} <StatusChip status={e.status}/></li>)}</ul></div>
            <div><p>{t('qualifying.breakNote')}</p><button className="send-out" disabled={pending} onClick={onContinue}>{t('qualifying.continueTo', { phase: t(phaseKey(view.kind, next)) })}</button></div>
        </div>
    </section>;
}
/** Final classification: P1–P22 with Q1/Q2/Q3 times, phase reached, pole, and the way on to the Race. */
export function QualifyingSummary({ view }: { view: QualifyingView }) {
    const { t, format, locale } = useI18n(), lap = (ms: number | null) => ms === null ? '—' : formatRaceTime(ms, locale);
    const pole = view.entrants.find(e => e.position === 1);
    const raceHref = `/career/${view.careerId}/events/${view.eventId}/${nextSessionPath(view.kind)}`;
    return <section className="ops-panel qualifying-summary" aria-labelledby="q-summary-title">
        <div className="ops-panel-title"><h2 id="q-summary-title">{t(textKey(view.kind, 'summary'))}</h2>{pole && <span className="status-pill">◆ {t('qualifying.pole', { driver: pole.abbreviation })}</span>}</div>
        <div className="summary-scroll"><table className="timing-tower qualifying-result">
            <caption className="sr-only">{t(textKey(view.kind, 'summary'))}</caption>
            <thead><tr><th>{t('practice.posShort')}</th><th>{t('race.driver')}</th><th>{t(phaseKey(view.kind, 'Q1'))}</th><th>{t(phaseKey(view.kind, 'Q2'))}</th><th>{t(phaseKey(view.kind, 'Q3'))}</th><th>{t('qualifying.reached')}</th></tr></thead>
            <tbody>{view.entrants.map(e => <tr key={e.entrantId} className={['tower-row', e.player && 'player-row'].filter(Boolean).join(' ')} style={e.player ? { ['--team' as string]: e.color } : undefined}>
                <td>{format.number(e.position)}</td><th scope="row"><strong style={{ borderColor: e.color }} className="summary-driver">{e.player && <span aria-hidden="true">◆ </span>}{e.abbreviation}</strong> <small>{e.team}</small>{e.player && <span className="sr-only">{t('viewer.player')}</span>}</th>
                <td>{lap(e.times.Q1)}</td><td>{lap(e.times.Q2)}</td><td>{lap(e.times.Q3)}</td><td>{t(phaseKey(view.kind, e.eliminatedIn ?? 'Q3'))}</td>
            </tr>)}</tbody>
        </table></div>
        <div className="summary-actions"><p>{t(textKey(view.kind, 'gridNote'))}</p><Link className="button-link" href={raceHref}>{t(textKey(view.kind, 'continueToRace'))}</Link></div>
    </section>;
}
export { LOCATION_GLYPH };

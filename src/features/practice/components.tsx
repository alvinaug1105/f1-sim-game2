"use client";
import { useState, type ReactNode } from 'react';
import { useI18n } from '../../i18n/provider';
import type { Locale } from '../../i18n/catalog';
import { formatRaceGap, formatRaceTime } from '../../i18n/race-time';
import { PACE_EMPHASES, PRACTICE_COMPOUNDS, SETUP_DIMENSIONS, compoundFit, waterBand, type FeedbackLevel, type PaceEmphasis, type RunPlan, type Setup } from '../../simulation/practice/model';
import type { TyreCompound } from '../../simulation/race/tyres/model';
import type { PracticeEntrantView, PracticeView } from './view-model';
import type { PracticeCommand } from './service';
/** A player command before it is addressed to a car (entrant id + command revision are added by the caller). */
export type PracticeUiCommand = PracticeCommand extends infer C ? C extends { entrantId: string; revision: number } ? Omit<C, 'entrantId' | 'revision'> : never : never;
type Command = PracticeUiCommand;
/** Session clock (m:ss); hours only if ever needed. Presentation only. */
export function sessionClock(ms: number, locale: Locale) {
    const total = Math.max(0, Math.round(ms / 1000)), n = (v: number, d = 1) => new Intl.NumberFormat(locale, { minimumIntegerDigits: d, useGrouping: false }).format(v);
    return `${n(Math.floor(total / 60))}:${n(total % 60, 2)}`;
}
export const LOCATION_GLYPH = { GARAGE: '■', OUT_LAP: '↗', FLYING: '▶', IN_LAP: '↘' } as const;
const FEEDBACK_GLYPH: Record<FeedbackLevel, string> = { [-2]: '▼▼', [-1]: '▼', 0: '●', 1: '▲', 2: '▲▲' };
const FIT = ['UNSUITED', 'MARGINAL', 'SUITED'] as const;
function Stat({ label, children }: { label: string; children: ReactNode }) { return <div className="stat"><span>{label}</span><strong>{children}</strong></div>; }
/** A value in permille as a labelled bar with its percentage in text (never colour alone). */
function Meter({ label, value, hint }: { label: string; value: number; hint?: string }) {
    const { format } = useI18n();
    return <div className="practice-meter"><div><span>{label}</span><strong>{format.percentage(value / 1000, { maximumFractionDigits: 0 })}</strong></div>
        <meter min={0} max={1000} value={value} aria-label={label}/>{hint && <small>{hint}</small>}</div>;
}
/** Two-step confirmation for irreversible actions (keyboard and screen-reader friendly, no browser dialog). */
export function ConfirmButton({ label, confirmText, confirmLabel, disabled, onConfirm, className }: { label: string; confirmText: string; confirmLabel: string; disabled?: boolean; onConfirm: () => void; className?: string }) {
    const { t } = useI18n(), [asking, setAsking] = useState(false);
    if (!asking) return <button className={className} disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
    return <span className="confirm-inline" role="group" aria-label={label}><span>{confirmText}</span>
        <button disabled={disabled} onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
        <button className="ops-secondary" onClick={() => setAsking(false)}>{t('practice.cancel')}</button></span>;
}
export function PracticeTiming({ view, selected, onSelect }: { view: PracticeView; selected: string; onSelect: (id: string) => void }) {
    const { t, format, locale } = useI18n(), lap = (ms: number | null) => ms === null ? t('race.noTime') : formatRaceTime(ms, locale);
    const title = t(view.status === 'FINISHED' ? 'practice.classification' : 'practice.timing');
    return <section className="ops-panel timing-panel" aria-label={title}>
        <div className="ops-panel-title"><h2>{title}</h2><span className="ops-muted">{t('practice.byBest')}</span></div>
        <div className="timing-scroll"><table className="timing-tower practice-timing"><caption className="sr-only">{title}</caption>
            <thead><tr><th>{t('race.position')}</th><th>{t('race.driver')}</th><th>{t('race.best')}</th><th>{t('practice.laps')}</th><th>{t('practice.where')}</th></tr></thead>
            <tbody>{view.entrants.map(e => {
                const chosen = e.entrantId === selected;
                return <tr key={e.entrantId} onClick={() => onSelect(e.entrantId)} data-entrant={e.entrantId} className={['tower-row', chosen && 'selected-row', e.player && 'player-row', e.location === 'GARAGE' && 'garage-row'].filter(Boolean).join(' ')} style={e.player ? { ['--team' as string]: e.color } : undefined}>
                    <td>{e.bestLapMs === null ? '—' : format.number(e.position)}</td>
                    <th scope="row"><button onClick={() => onSelect(e.entrantId)} aria-pressed={chosen} className="driver-select" style={{ borderColor: e.color }} title={e.name}><strong>{e.player && <span className="player-mark" aria-hidden="true">◆</span>}{e.abbreviation}{chosen && <span className="selected-mark" aria-hidden="true"> ◂</span>}</strong><small>{e.team}</small>{e.player && <span className="sr-only">{t('viewer.player')}</span>}</button></th>
                    <td>{lap(e.bestLapMs)}{e.gapToBestMs !== null && e.gapToBestMs > 0 && <small>{formatRaceGap(e.gapToBestMs, locale)}</small>}{e.bestLapCompound && <small className={`tyre-token tyre-${e.bestLapCompound}`} title={t(`tyre.${e.bestLapCompound}`)}>{t(`viewer.tyre.${e.bestLapCompound}`)}</small>}</td>
                    <td>{format.number(e.lapsCompleted)}</td>
                    <td><span className={`location-chip location-${e.location}`}><span aria-hidden="true">{LOCATION_GLYPH[e.location]} </span>{t(`practice.location.${e.location}`)}</span>{e.tyre && e.location !== 'GARAGE' && <small className={`tyre-token tyre-${e.tyre.compound}`} title={t(`tyre.${e.tyre.compound}`)}>{t(`viewer.tyre.${e.tyre.compound}`)}</small>}</td>
                </tr>;
            })}</tbody></table></div>
        <p className="tower-note">{t('practice.timingNote')}</p>
    </section>;
}
/** Run planner: compound (with current-condition suitability), target laps (validated against the clock) and pace. */
function RunPlanner({ view, e, busy, send }: { view: PracticeView; e: PracticeEntrantView; busy: boolean; send: (c: Command) => void }) {
    const { t, format, locale } = useI18n(), own = e.own!, band = view.weather ? waterBand(view.weather) : 0;
    const [compound, setCompound] = useState<TyreCompound>(band === 2 ? 'WET' : band === 1 ? 'INTERMEDIATE' : 'MEDIUM');
    const [laps, setLaps] = useState(5), [pace, setPace] = useState<PaceEmphasis>('BALANCED');
    const ready = own.readyAtMs <= view.elapsedMs, max = own.maxRunLaps, chequered = view.elapsedMs >= view.durationMs;
    const valid = Number.isSafeInteger(laps) && laps >= 1 && laps <= max;
    const fit = view.weather ? FIT[compoundFit(compound, view.weather)] : 'SUITED';
    const plan: RunPlan = { compound, targetLaps: laps, pace };
    return <div className="run-planner"><h3>{t('practice.plan')}</h3>
        {chequered ? <p className="ops-muted">{t('practice.chequered')}</p> : max < 1 ? <p className="ops-muted" role="status">{t('practice.noTime')}</p> : <>
            <label>{t('tyre.compound')}<select value={compound} onChange={ev => setCompound(ev.target.value as TyreCompound)} disabled={busy}>
                {PRACTICE_COMPOUNDS.map(c => <option key={c} value={c}>{t(`tyre.${c}`)} · {t(`practice.fit.${view.weather ? FIT[compoundFit(c, view.weather)] : 'SUITED'}`)}</option>)}</select></label>
            <p className={`fit-note fit-${fit}`}><span aria-hidden="true">{fit === 'SUITED' ? '✓ ' : fit === 'MARGINAL' ? '~ ' : '✕ '}</span>{t(`practice.fitNote.${fit}`)}</p>
            <label>{t('practice.targetLaps')}<input type="number" min={1} max={max} step={1} value={Number.isFinite(laps) ? laps : ''} onChange={ev => setLaps(Math.trunc(Number(ev.target.value)))} disabled={busy} aria-describedby={`laps-${e.entrantId}`}/></label>
            <small id={`laps-${e.entrantId}`} className={valid ? 'ops-muted' : 'field-error'} role={valid ? undefined : 'alert'}>{t(valid ? 'practice.lapsFit' : 'practice.lapsInvalid', { max: format.number(max) })}</small>
            <div className="mode-buttons" role="group" aria-label={t('practice.pace')}>{PACE_EMPHASES.map(p => <button key={p} disabled={busy} aria-pressed={pace === p} onClick={() => setPace(p)}>{pace === p && <span aria-hidden="true">✓ </span>}{t(`practice.pace.${p}`)}</button>)}</div>
            <small className="ops-muted">{t(`practice.paceNote.${pace}`)}</small>
            <button className="send-out" disabled={busy || !ready || !valid} onClick={() => send({ kind: 'send', plan })}>{t('practice.sendOut')}</button>
            {!ready && <small role="status">{t('practice.garageWork', { time: sessionClock(own.readyAtMs - view.elapsedMs, locale) })}</small>}
        </>}
    </div>;
}
/** Garage-only setup editor: native range inputs (keyboard accessible), feedback shown as glyph + text next to each. */
function SetupEditor({ e, busy, editable, send }: { e: PracticeEntrantView; busy: boolean; editable: boolean; send: (c: Command) => void }) {
    const { t, format } = useI18n(), p = e.own!.preparation;
    const [draft, setDraft] = useState<Setup>(p.setup);
    const changed = SETUP_DIMENSIONS.some(d => draft[d] !== p.setup[d]);
    return <div className="setup-editor"><h3>{t('practice.setup')}</h3>
        <p className="ops-muted">{t(editable ? 'practice.setupNote' : 'practice.setupLocked')}</p>
        {!p.feedback ? <p className="ops-muted">{t('practice.noFeedback')}</p> : !p.feedbackCurrent && <p className="ops-muted" role="status">{t('practice.feedbackStale')}</p>}
        {SETUP_DIMENSIONS.map(d => {
            const level = p.feedback?.[d] ?? null;
            return <div key={d} className="setup-row">
                <label htmlFor={`setup-${e.entrantId}-${d}`}>{t(`practice.dim.${d}`)}<small>{t(`practice.dimHint.${d}`)}</small></label>
                <input id={`setup-${e.entrantId}-${d}`} type="range" min={0} max={100} step={1} value={draft[d]} disabled={!editable || busy} onChange={ev => setDraft({ ...draft, [d]: Number(ev.target.value) })} aria-valuetext={format.number(draft[d])}/>
                <output>{format.number(draft[d])}</output>
                {level !== null && <span className={`feedback-chip feedback-${level} ${p.feedbackCurrent ? '' : 'stale'}`}><span aria-hidden="true">{FEEDBACK_GLYPH[level]} </span>{t(`practice.feedback.${level}`)}</span>}
            </div>;
        })}
        {editable && <div className="setup-actions">
            <button disabled={busy || !changed} onClick={() => send({ kind: 'setup', setup: draft })}>{t('practice.applySetup')}</button>
            <button className="ops-secondary" disabled={busy || !changed} onClick={() => setDraft(p.setup)}>{t('practice.resetSetup')}</button>
        </div>}
    </div>;
}
export function PracticeDriverPanel({ view, e, busy, send }: { view: PracticeView; e: PracticeEntrantView; busy: boolean; send: (entrantId: string, revision: number, c: Command) => void }) {
    const { t, format, locale } = useI18n(), own = e.own, lap = (ms: number | null) => ms === null ? t('race.noTime') : formatRaceTime(ms, locale);
    const running = view.status === 'RUNNING', commandable = !!own && running && !view.autoPlayer;
    const act = (c: Command) => own && send(e.entrantId, own.commandRevision, c);
    return <section className="ops-panel driver-focus practice-driver" aria-label={t('viewer.selectedDriver')}>
        <div className="ops-panel-title"><span>{t('viewer.selectedDriver')}</span><span className="status-pill">{t(own ? 'viewer.player' : 'viewer.readOnly')}</span></div>
        <div className="driver-body">
            <div className="driver-identity" style={{ borderColor: e.color }}><strong className="driver-position"><small>P</small>{e.bestLapMs === null ? '—' : format.number(e.position)}</strong><div><h2>{e.name}</h2><p><strong>{e.abbreviation}</strong>{e.number !== null && <> · #{format.number(e.number, { useGrouping: false })}</>} · {e.team}</p></div><span className={`location-chip location-${e.location}`}><span aria-hidden="true">{LOCATION_GLYPH[e.location]} </span>{t(`practice.location.${e.location}`)}</span></div>
            <div className="stat-grid">
                <Stat label={t('race.best')}>{lap(e.bestLapMs)}</Stat><Stat label={t('viewer.lastLap')}>{lap(e.lastLapMs)}</Stat>
                <Stat label={t('practice.laps')}>{format.number(e.lapsCompleted)}</Stat><Stat label={t('practice.timedLaps')}>{format.number(e.timedLaps)}</Stat>
                {e.tyre && <Stat label={t('viewer.tyre')}>{t(`tyre.${e.tyre.compound}`)} · {t('viewer.ageShort', { count: format.number(e.tyre.ageLaps) })} · {format.percentage(e.tyre.wearPermille / 1000, { maximumFractionDigits: 0 })}</Stat>}
            </div>
            {!own ? <p className="ops-muted">{t('practice.rivalNote')}</p> : <>
                {view.autoPlayer && <p className="ops-muted" role="status">{t('practice.autoManaged')}</p>}
                {own.run && <div className="run-status"><h3>{t('practice.currentRun', { number: format.number(own.run.number) })}</h3>
                    <p>{t(`tyre.${own.run.plan.compound}`)} · {t(`practice.pace.${own.run.plan.pace}`)} · {t('practice.runProgress', { done: format.number(own.run.timedLaps), target: format.number(own.run.plan.targetLaps) })} · {t('race.best')} {lap(own.run.bestLapMs)}</p>
                    {commandable && <button disabled={busy || own.run.callIn || e.location === 'IN_LAP'} onClick={() => act({ kind: 'callIn' })}>{t(own.run.callIn || e.location === 'IN_LAP' ? 'practice.comingIn' : 'practice.callIn')}</button>}
                </div>}
                {e.location === 'GARAGE' && commandable && <RunPlanner key={`${own.commandRevision}`} view={view} e={e} busy={busy} send={act}/>}
                <div className="knowledge"><h3>{t('practice.knowledge')}</h3>
                    <Meter label={t('practice.confidence')} value={own.preparation.confidence} hint={t('practice.confidenceHint')}/>
                    <Meter label={t('practice.acclimatisation')} value={own.preparation.acclimatisation}/>
                    <Meter label={t('practice.reliability')} value={own.preparation.feedbackReliability} hint={t('practice.reliabilityHint', { laps: format.number(own.preparation.representativeLaps) })}/>
                    <h3>{t('practice.tyreKnowledge')}</h3>
                    {PRACTICE_COMPOUNDS.map(c => <Meter key={c} label={t(`tyre.${c}`)} value={own.preparation.tyreKnowledge[c]}/>)}
                </div>
                <SetupEditor key={own.preparation.setupRevision} e={e} busy={busy} editable={commandable && e.location === 'GARAGE'} send={act}/>
                {own.runs.length > 0 && <div className="run-history"><h3>{t('practice.runs')}</h3><ol>{own.runs.map(r => <li key={r.number}>{t('practice.runLine', { number: format.number(r.number), laps: format.number(r.timedLaps) })} · {t(`tyre.${r.plan.compound}`)} · {t(`practice.pace.${r.plan.pace}`)} · {lap(r.bestLapMs)}</li>)}</ol></div>}
            </>}
        </div>
    </section>;
}
/** End-of-session summary: classification head, the player's cars and what they learned. */
export function PracticeSummary({ view, weekendHref }: { view: PracticeView; weekendHref: string }) {
    const { t, format, locale } = useI18n(), lap = (ms: number | null) => ms === null ? t('race.noTime') : formatRaceTime(ms, locale);
    const top = view.entrants.filter(e => e.bestLapMs !== null).slice(0, 3), mine = view.entrants.filter(e => e.own);
    const next = view.sessions.find(s => s.status === 'AVAILABLE');
    return <section className="ops-panel practice-summary" aria-labelledby="practice-summary-title">
        <div className="ops-panel-title"><h2 id="practice-summary-title">{t('practice.summary', { session: t(`progression.${view.sessionType}`) })}</h2><span className="status-pill">■ {t('practice.finished')}</span></div>
        <div className="summary-body">
            <div><h3>{t('practice.fastest')}</h3><ol>{top.map(e => <li key={e.entrantId}><strong style={{ borderColor: e.color }}>{e.abbreviation}</strong> {lap(e.bestLapMs)}{e.gapToBestMs ? <small> {formatRaceGap(e.gapToBestMs, locale)}</small> : null}</li>)}</ol></div>
            <div><h3>{t('prep.yourDrivers')}</h3><ul>{mine.map(e => <li key={e.entrantId}><strong>{e.abbreviation}</strong> · P{e.bestLapMs === null ? '—' : format.number(e.position)} · {lap(e.bestLapMs)} · {t('practice.lapsCount', { count: format.number(e.lapsCompleted) })}
                <small>{t('practice.learned', { confidence: format.percentage(e.own!.preparation.confidence / 1000, { maximumFractionDigits: 0 }), acclimatisation: format.percentage(e.own!.preparation.acclimatisation / 1000, { maximumFractionDigits: 0 }) })}</small></li>)}</ul></div>
            <div><p>{t('practice.carryOver')}</p>{next && <p>{t('practice.nextAvailable', { session: t(`progression.${next.type}`) })}</p>}
                <a className="button-link" href={weekendHref}>{t('practice.continue')}</a></div>
        </div>
    </section>;
}

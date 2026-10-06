"use client";
/**
 * UIX-B shared live-session frame: one header, one sticky operations bar, one set of playback controls and one
 * conditions presentation for Practice, Qualifying, Sprint and the Grand Prix. Presentation only — every control is
 * wired by the session screen to its existing playback controller / action; nothing here changes timing or rules.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "../../i18n/provider";
import type { TranslationKey } from "../../i18n/catalog";
import { Icon, type IconName } from "../../components/ui/icon";
import { PLAYBACK_SPEEDS, type PlaybackSpeed, type PlaybackSnapshot } from "../race/viewer/playback";
import { sessionHref } from "../career/session-links";
import type { SessionStatus, SessionType } from "../../game/domain/progression";
export type LiveKind = "PRACTICE" | "QUALIFYING" | "SPRINT" | "RACE";
const SESSION_ICON: Record<string, IconName> = { LOCKED: "lock", AVAILABLE: "current", IN_PROGRESS: "play", COMPLETED: "check", SKIPPED: "chevron" };
/** Weekend session tabs: every session with its state as icon + text; the current one is not a link. */
export function SessionNav({ sessions, isCurrent, weekendHref }: {
    /** Weekend sessions in weekend order. */
    sessions: readonly { readonly id: string; readonly type: string; readonly status: SessionStatus }[];
    isCurrent: (s: { readonly id: string; readonly type: string }) => boolean;
    weekendHref: string;
}) {
    const { t } = useI18n();
    return <nav aria-label={t("progression.sessions")} className="live-sessions session-tabs"><ol>{sessions.map(s => {
        const current = isCurrent(s), reachable = s.status !== "LOCKED" && s.status !== "SKIPPED", href = sessionHref(weekendHref, s);
        const label = <><Icon name={SESSION_ICON[s.status] ?? "calendar"} size={12}/><span>{t(`progression.${s.type as SessionType}`)}</span><span className="visually-hidden"> · {t(`progression.${s.status}`)}</span></>;
        return <li key={s.id} data-status={s.status} data-current={current || undefined}>{reachable && !current && href ? <Link href={href}>{label}</Link> : <span aria-current={current ? "page" : undefined}>{label}</span>}</li>;
    })}</ol></nav>;
}
/** Session identity: back to the weekend, session kind, event name (display type) and circuit. */
export function LiveHeader({ kind, kindLabel, title, circuit, backHref, backLabel, badge, nav }: {
    kind: LiveKind; kindLabel: string; title: string; circuit: string; backHref: string; backLabel: string; badge?: ReactNode; nav?: ReactNode;
}) {
    return <header className="live-head" data-kind={kind}>
        <div className="live-head-id">
            <Link className="live-back" href={backHref}><Icon name="back" size={14}/>{backLabel}</Link>
            <div className="live-kind"><span className="ui-label">{kindLabel}</span>{badge}</div>
            <h1 className="ui-display live-title">{title} <span className="live-circuit">{circuit}</span></h1>
        </div>
        {nav}
    </header>;
}
/** A big clock / lap readout with its caption. */
export function LiveClock({ caption, value, total, children }: { caption: string; value: ReactNode; total?: ReactNode; children?: ReactNode }) {
    return <div className="live-clock race-clock"><span className="ui-label">{caption}</span><strong className="live-clock-value">{value}{total !== undefined && <small> / {total}</small>}</strong>{children}</div>;
}
export interface ConditionItem { key: string; icon: IconName; label: string; value: ReactNode; note?: ReactNode; tone?: "wet" | "warn" | "info"; title?: string }
/** Current conditions as labelled chips (each concept separate: rain, track water, temperatures). */
export function ConditionChips({ items, forecast, label }: { items: readonly ConditionItem[]; forecast?: ConditionItem | null; label: string }) {
    return <section className="live-conditions weather-strip" aria-label={label}>
        {items.map(item => <span key={item.key} className="live-chip" data-key={item.key} data-tone={item.tone} title={item.title}><Icon name={item.icon} size={15}/><span className="live-chip-text"><span className="live-chip-label">{item.label}</span><strong>{item.value}</strong>{item.note && <em>{item.note}</em>}</span></span>)}
        {forecast && <span className="live-chip live-forecast forecast-next" title={forecast.title}><Icon name={forecast.icon} size={15}/><span className="live-chip-text"><span className="live-chip-label">{forecast.label}</span><strong>{forecast.value}</strong>{forecast.note && <em>{forecast.note}</em>}</span></span>}
    </section>;
}
/** Water band wording shared by every live screen (presentation thresholds only). */
export const waterKey = (water: number): TranslationKey => water < 100 ? "weather.dry" : water < 350 ? "weather.damp" : "weather.wet";
export const rainKey = (rain: number): TranslationKey => rain === 0 ? "weather.dry" : rain < 650 ? "weather.light" : "weather.heavy";
/**
 * Race-control tools: one dominant Pause/Resume, a step, the speed selector (selected speed pressed, disabled when the
 * session is over), Next Strategic Event, optional session-specific extras and the auto-pause / reduce-motion switches.
 * Timing is entirely the controller's; these only call it.
 */
export function PlaybackControls({ playback, done, onToggle, onStep, stepLabel, onSpeed, onSkip, skipLabel, onAutoPause, reduceMotion, onReduceMotion, extra, status }: {
    playback: Pick<PlaybackSnapshot, "playing" | "busy" | "speed" | "skipping" | "autoPause" | "phase">;
    done: boolean;
    onToggle: () => void; onStep: () => void; stepLabel: string; onSpeed: (speed: PlaybackSpeed) => void; onSkip: () => void; skipLabel: string;
    onAutoPause: (value: boolean) => void; reduceMotion?: boolean; onReduceMotion?: (value: boolean) => void; extra?: ReactNode; status: ReactNode;
}) {
    const { t, format } = useI18n();
    return <div className="live-playback">
        <div className="playback-buttons">
            <button className="play-toggle" data-playing={playback.playing} onClick={onToggle} disabled={done} aria-label={t(playback.playing ? "viewer.pause" : "viewer.play")}>
                <Icon name={playback.playing ? "pause" : "play"} size={16}/><span>{t(playback.playing ? "viewer.pause" : "viewer.play")}</span>
            </button>
            <button className="live-tool" onClick={onStep} disabled={playback.busy || done}><Icon name="step" size={14}/><span className="live-tool-text">{stepLabel}</span></button>
            <div className="live-speed" role="group" aria-label={t("viewer.speed")}>{PLAYBACK_SPEEDS.map(speed => <button className="speed-button" key={speed} onClick={() => onSpeed(speed)} aria-pressed={playback.speed === speed} disabled={done}>{format.number(speed)}×</button>)}</div>
            <button className="live-tool" onClick={onSkip} disabled={done || playback.skipping} aria-pressed={playback.skipping}><Icon name="simulate" size={14}/><span className="live-tool-text">{skipLabel}</span></button>
            {extra}
        </div>
        <div className="viewer-settings">
            <label className="live-switch"><input type="checkbox" role="switch" checked={playback.autoPause} onChange={e => onAutoPause(e.target.checked)} disabled={done}/><span className="live-switch-track" aria-hidden="true"/><span className="live-switch-label">{t("viewer.autoPause")}</span><strong className="live-switch-state" aria-hidden="true">{t(playback.autoPause ? "live.on" : "live.off")}</strong></label>
            {onReduceMotion && <label className="live-switch"><input type="checkbox" role="switch" checked={!!reduceMotion} onChange={e => onReduceMotion(e.target.checked)}/><span className="live-switch-track" aria-hidden="true"/><span className="live-switch-label">{t("viewer.reduceMotion")}</span></label>}
            <span role="status" className={`playback-phase phase-${playback.phase}`}><Icon name={playback.phase === "paused" ? "pause" : playback.phase === "finished" ? "flag" : "play"} size={12}/>{status}</span>
        </div>
    </div>;
}
/** One mobile pane switcher for live screens (desktop shows every pane). */
export function PaneSwitch<P extends string>({ panes, active, onPick, label }: { panes: readonly { id: P; label: string; badge?: ReactNode }[]; active: P; onPick: (id: P) => void; label: string }) {
    return <div className="live-panes" role="group" aria-label={label}>{panes.map(p => <button key={p.id} aria-pressed={active === p.id} onClick={() => onPick(p.id)}>{p.label}{p.badge}</button>)}</div>;
}

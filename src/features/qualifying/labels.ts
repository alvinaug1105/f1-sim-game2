import type { QualifyingKind } from "../../game/domain/qualifying-repository";
import type { QualifyingPhase } from "../../simulation/qualifying/model";
import type { TranslationKey } from "../../i18n/catalog";
import type { ForecastPoint, QualifyingForecastWindow } from "./view-model";
/** Session-specific wording: Sprint Qualifying reads SQ1/SQ2/SQ3 and sets the Sprint grid; the engine is shared. */
export type KindText = "title" | "intro" | "simulate" | "simulateConfirm" | "remainderConfirm" | "open" | "resume" | "viewResults" | "simulateHint"
    | "finished" | "classification" | "summary" | "gridNote" | "continueToRace" | "setupLocked" | "manage" | "ready" | "unavailable";
export function textKey<N extends KindText>(kind: QualifyingKind, name: N) {
    return kind === "SPRINT_QUALIFYING" ? `sprintQualifying.${name}` as const : `qualifying.${name}` as const;
}
/** Display name of an internal phase: Q1/Q2/Q3, or SQ1/SQ2/SQ3 for Sprint Qualifying. */
export function phaseKey(kind: QualifyingKind, phase: QualifyingPhase) { return `qualifying.phaseLabel.${kind}.${phase}` as const; }
/** Where the finished classification leads: the Sprint (from Sprint Qualifying) or the Grand Prix. */
export function nextSessionPath(kind: QualifyingKind) { return kind === "SPRINT_QUALIFYING" ? "sprint" : "race"; }
type Translate = (key: TranslationKey, values?: Readonly<Record<string, string | number>>) => string;
/**
 * Forecast copy on the clock the player is looking at: the phase and its time remaining ("Rain likely during SQ2
 * (~9:00–3:00 remaining)"), the break before a later phase, or a span across phases. Public forecast only.
 */
export function forecastText(f: QualifyingForecastWindow, kind: QualifyingKind, t: Translate, clock: (ms: number) => string, percent: (permille: number) => string, currentRainfall = 0) {
    const phase = (p: ForecastPoint) => t(phaseKey(kind, p.phase));
    const at = (p: ForecastPoint) => p.remainingMs === null ? t("qualifying.forecast.breakBefore", { phase: phase(p) }) : t("qualifying.forecast.at", { phase: phase(p), time: clock(p.remainingMs) });
    // Easing only relative to rain that is falling now; a light window on a dry track reads as "light rain possible".
    const what = t(currentRainfall > f.rainfallMax ? "qualifying.forecast.easing" : f.rainfallMax < 200 ? "qualifying.forecast.light" : "qualifying.forecast.rain"), rain = { min: percent(f.rainfallMin), max: percent(f.rainfallMax) };
    if (f.from.phase === f.to.phase && f.from.remainingMs !== null && f.to.remainingMs !== null)
        return t("qualifying.forecast.during", { what, phase: phase(f.from), from: clock(f.from.remainingMs), to: clock(f.to.remainingMs), ...rain });
    if (f.from.phase === f.to.phase && f.from.remainingMs === null && f.to.remainingMs === null) return t("qualifying.forecast.inBreak", { what, phase: phase(f.from), ...rain });
    return t("qualifying.forecast.span", { what, from: at(f.from), to: at(f.to), ...rain });
}

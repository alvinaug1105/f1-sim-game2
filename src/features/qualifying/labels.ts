import type { QualifyingKind } from "../../game/domain/qualifying-repository";
import type { QualifyingPhase } from "../../simulation/qualifying/model";
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

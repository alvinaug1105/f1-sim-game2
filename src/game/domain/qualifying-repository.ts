import type { CareerProgress } from "./progression";
import type { PracticeRosterEntry, WeekendPreparationRecord } from "./practice-repository";
import type { QualifyingState } from "../../simulation/qualifying/model";
import type { QualifyingRuleCode } from "../../simulation/qualifying/engine";
export interface CareerQualifyingData {
    readonly progress: CareerProgress;
    readonly eventId: string;
    readonly weekendId: string;
    /** The weekend's single QUALIFYING session (Q1/Q2/Q3 are internal phases). */
    readonly sessionId: string;
    readonly state: QualifyingState | null;
    /** Career-snapshotted race drivers (entrants are created from it when Qualifying starts). */
    readonly roster: readonly PracticeRosterEntry[];
    readonly circuit: { readonly sourceCircuitId: string | null; readonly lengthMeters: number };
    /** Weekend learning carried from Practice, incl. the hidden setup target. Server-side only. */
    readonly preparations: readonly WeekendPreparationRecord[];
    /** Driver IDs in the latest completed Practice classification (Q1 no-time fallback); empty when none. */
    readonly practiceOrder: readonly string[];
}
export type QualifyingErrorCode = "NOT_FOUND" | "INVALID_ACTION" | "INVALID_INPUT" | "PERSISTENCE_FAILED" | QualifyingRuleCode;
export class QualifyingError extends Error {
    constructor(readonly code: QualifyingErrorCode, options?: ErrorOptions) { super(`Qualifying operation: ${code}`, options); }
}
export interface QualifyingChange { readonly state: QualifyingState; readonly progress: CareerProgress }
export interface CareerQualifyingRepository {
    getQualifying(careerId: string, eventId: string): Promise<CareerQualifyingData | null>;
    /** Runs `change` under the Career lock; persists the Qualifying state and progression atomically. */
    changeQualifying(careerId: string, eventId: string, change: (data: CareerQualifyingData) => QualifyingChange): Promise<CareerQualifyingData>;
}

import type { CareerProgress } from "./progression";
import type { PracticeSessionType, PracticeState, Preparation, Setup } from "../../simulation/practice/model";
import type { PracticeRuleCode } from "../../simulation/practice/engine";
export interface PracticeRosterEntry {
    readonly driverId: string;
    readonly teamId: string;
    readonly driverName: string;
    readonly teamName: string;
    readonly teamOrder: number;
    readonly abbreviation: string;
    readonly teamColor: string;
    readonly carNumber: number | null;
}
/** Weekend learning for one driver, with the hidden setup target. Server-side only. */
export interface WeekendPreparationRecord { readonly driverId: string; readonly ideal: Setup; readonly preparation: Preparation }
export interface CareerPracticeData {
    readonly progress: CareerProgress;
    readonly eventId: string;
    readonly weekendId: string;
    readonly sessionId: string;
    readonly sessionType: PracticeSessionType;
    readonly state: PracticeState | null;
    /** Career-snapshotted roster for this season (entrants are created from it when a session starts). */
    readonly roster: readonly PracticeRosterEntry[];
    /** entrantId → driverId for an existing session. */
    readonly entrantDrivers: Readonly<Record<string, string>>;
    readonly circuit: { readonly sourceCircuitId: string | null; readonly lengthMeters: number };
    readonly preparations: readonly WeekendPreparationRecord[];
}
export type PracticeErrorCode = "NOT_FOUND" | "INVALID_ACTION" | "INVALID_INPUT" | "PERSISTENCE_FAILED" | PracticeRuleCode;
export class PracticeError extends Error {
    constructor(readonly code: PracticeErrorCode, options?: ErrorOptions) { super(`Practice operation: ${code}`, options); }
}
export interface PracticeChange { readonly state: PracticeState; readonly progress: CareerProgress; readonly entrantDrivers?: Readonly<Record<string, string>> }
export interface CareerPracticeRepository {
    getPractice(careerId: string, eventId: string, sessionId: string): Promise<CareerPracticeData | null>;
    /** Runs `change` under the Career lock; persists the new state, weekend learning and progression atomically. */
    changePractice(careerId: string, eventId: string, sessionId: string, change: (data: CareerPracticeData) => PracticeChange): Promise<CareerPracticeData>;
}

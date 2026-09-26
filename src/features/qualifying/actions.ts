"use server";
import { revalidatePath } from "next/cache";
import { QualifyingError, type CareerQualifyingData, type QualifyingErrorCode, type QualifyingKind } from "../../game/domain/qualifying-repository";
import { isRunPlan, QUALIFYING_PHASES, type QualifyingPhase } from "../../simulation/qualifying/model";
import { getQualifyingRepository } from "../career/server";
import {
    advanceQualifyingSession, continueQualifyingPhase, qualifyingCommand, simulateQualifyingRemainder, simulateQualifyingSession, startQualifyingSession,
    type QualifyingCommand,
} from "./service";
import { qualifyingView, type QualifyingView } from "./view-model";
export type QualifyingActionResult = { view: QualifyingView | null; error: QualifyingErrorCode | null };
/** Every browser-facing result is the lossy view projection; authoritative state never leaves the server. */
async function run(work: () => Promise<CareerQualifyingData>, revalidate?: string): Promise<QualifyingActionResult> {
    try {
        const view = qualifyingView(await work());
        if (revalidate && view.status === "FINISHED") revalidatePath(revalidate, "layout");
        return { view, error: null };
    }
    catch (error) {
        console.error("Qualifying action failed", error);
        return { view: null, error: error instanceof QualifyingError ? error.code : "PERSISTENCE_FAILED" };
    }
}
const token = (n: unknown) => { if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new QualifyingError("INVALID_INPUT"); return n; };
const phase = (p: unknown): QualifyingPhase => { if (!QUALIFYING_PHASES.includes(p as QualifyingPhase)) throw new QualifyingError("INVALID_INPUT"); return p as QualifyingPhase; };
/** Untrusted command payload → typed command (shape only; rules are enforced by the engine). */
function parseCommand(value: unknown): QualifyingCommand {
    const c = value as Record<string, unknown> | null;
    if (!c || typeof c.entrantId !== "string" || typeof c.revision !== "number" || !Number.isSafeInteger(c.revision)) throw new QualifyingError("INVALID_INPUT");
    if (c.kind === "send" && isRunPlan(c.plan)) return { kind: "send", entrantId: c.entrantId, revision: c.revision, plan: { compound: c.plan.compound, pushLaps: c.plan.pushLaps } };
    if (c.kind === "callIn") return { kind: "callIn", entrantId: c.entrantId, revision: c.revision };
    throw new QualifyingError("INVALID_INPUT");
}
const career = (careerId: string) => `/career/${careerId}`;
/** Untrusted session kind → the repository for exactly that weekend session. */
const repo = (kind: unknown) => {
    if (kind !== "QUALIFYING" && kind !== "SPRINT_QUALIFYING") throw new QualifyingError("INVALID_INPUT");
    return getQualifyingRepository(kind as QualifyingKind);
};
export async function qualifyingStartAction(careerId: string, eventId: string, kind: unknown) {
    return run(async () => startQualifyingSession(repo(kind), careerId, eventId));
}
export async function qualifyingAdvanceAction(careerId: string, eventId: string, kind: unknown, expectedSessionElapsedMs: number) {
    return run(async () => advanceQualifyingSession(repo(kind), careerId, eventId, token(expectedSessionElapsedMs)), career(careerId));
}
export async function qualifyingCommandAction(careerId: string, eventId: string, kind: unknown, expectedSessionElapsedMs: number, command: unknown) {
    return run(async () => qualifyingCommand(repo(kind), careerId, eventId, token(expectedSessionElapsedMs), parseCommand(command)));
}
export async function qualifyingContinueAction(careerId: string, eventId: string, kind: unknown, expectedSessionElapsedMs: number, expectedPhase: unknown) {
    return run(async () => continueQualifyingPhase(repo(kind), careerId, eventId, token(expectedSessionElapsedMs), phase(expectedPhase)));
}
export async function qualifyingRemainderAction(careerId: string, eventId: string, kind: unknown, expectedSessionElapsedMs: number) {
    return run(async () => simulateQualifyingRemainder(repo(kind), careerId, eventId, token(expectedSessionElapsedMs)), career(careerId));
}
export async function qualifyingSimulateAction(careerId: string, eventId: string, kind: unknown) {
    return run(async () => simulateQualifyingSession(repo(kind), careerId, eventId), career(careerId));
}
/** Weekend page form action: Simulate Qualifying / Simulate Remainder (no plain skip exists). */
export async function qualifyingWeekendAction(_previous: { error: QualifyingErrorCode | null }, form: FormData): Promise<{ error: QualifyingErrorCode | null }> {
    const text = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)) : "";
    const careerId = text("careerId"), eventId = text("eventId"), intent = text("intent"), kind = text("kind") || "QUALIFYING";
    try {
        if (intent === "simulate") await simulateQualifyingSession(repo(kind), careerId, eventId);
        else if (intent === "remainder") await simulateQualifyingRemainder(repo(kind), careerId, eventId);
        else throw new QualifyingError("INVALID_ACTION");
    }
    catch (error) {
        console.error("Qualifying weekend action failed", error);
        return { error: error instanceof QualifyingError ? error.code : "PERSISTENCE_FAILED" };
    }
    revalidatePath(career(careerId), "layout");
    return { error: null };
}

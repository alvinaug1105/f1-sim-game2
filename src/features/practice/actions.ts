"use server";
import { revalidatePath } from "next/cache";
import { PracticeError, type PracticeErrorCode } from "../../game/domain/practice-repository";
import { isRunPlan } from "../../simulation/practice/engine";
import { isSetup } from "../../simulation/practice/model";
import { getPracticeRepository, getProgressionRepository } from "../career/server";
import {
    advancePracticeSession, practiceCommand, simulatePracticeRemainder, simulatePracticeSession, simulateRemainingPractice, startPracticeSession,
    type PracticeCommand,
} from "./service";
import { practiceView, type PracticeView } from "./view-model";
export type PracticeActionResult = { view: PracticeView | null; error: PracticeErrorCode | null };
/** Every browser-facing result is the lossy view projection; authoritative state never leaves the server. */
async function run(work: () => Promise<Parameters<typeof practiceView>[0]>): Promise<PracticeActionResult> {
    try { return { view: practiceView(await work()), error: null }; }
    catch (error) {
        console.error("Practice action failed", error);
        return { view: null, error: error instanceof PracticeError ? error.code : "PERSISTENCE_FAILED" };
    }
}
const elapsed = (n: unknown) => { if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new PracticeError("INVALID_INPUT"); return n; };
/** Untrusted command payload → typed command (shape only; rules are enforced by the engine). */
function parseCommand(value: unknown): PracticeCommand {
    const c = value as Record<string, unknown> | null;
    if (!c || typeof c.entrantId !== "string" || typeof c.revision !== "number" || !Number.isSafeInteger(c.revision)) throw new PracticeError("INVALID_INPUT");
    if (c.kind === "send" && isRunPlan(c.plan)) return { kind: "send", entrantId: c.entrantId, revision: c.revision, plan: { compound: c.plan.compound, targetLaps: c.plan.targetLaps, pace: c.plan.pace } };
    if (c.kind === "callIn") return { kind: "callIn", entrantId: c.entrantId, revision: c.revision };
    if (c.kind === "setup" && isSetup(c.setup)) return { kind: "setup", entrantId: c.entrantId, revision: c.revision, setup: { ...c.setup } };
    throw new PracticeError("INVALID_INPUT");
}
export async function practiceStartAction(careerId: string, eventId: string, sessionId: string) {
    return run(() => startPracticeSession(getPracticeRepository(), careerId, eventId, sessionId));
}
export async function practiceAdvanceAction(careerId: string, eventId: string, sessionId: string, expectedElapsedMs: number) {
    return run(async () => advancePracticeSession(getPracticeRepository(), careerId, eventId, sessionId, elapsed(expectedElapsedMs)));
}
export async function practiceCommandAction(careerId: string, eventId: string, sessionId: string, expectedElapsedMs: number, command: unknown) {
    return run(async () => practiceCommand(getPracticeRepository(), careerId, eventId, sessionId, elapsed(expectedElapsedMs), parseCommand(command)));
}
export async function practiceRemainderAction(careerId: string, eventId: string, sessionId: string, expectedElapsedMs: number) {
    const result = await run(async () => simulatePracticeRemainder(getPracticeRepository(), careerId, eventId, sessionId, elapsed(expectedElapsedMs)));
    if (result.view) revalidatePath(`/career/${careerId}`, "layout");
    return result;
}
export async function practiceSimulateAction(careerId: string, eventId: string, sessionId: string) {
    const result = await run(() => simulatePracticeSession(getPracticeRepository(), careerId, eventId, sessionId));
    if (result.view) revalidatePath(`/career/${careerId}`, "layout");
    return result;
}
/** Weekend page form actions: Simulate Session, and Simulate All Remaining Practice (explicit confirmation required). */
export async function practiceWeekendAction(_previous: { error: PracticeErrorCode | null }, form: FormData): Promise<{ error: PracticeErrorCode | null }> {
    const text = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)) : "";
    const careerId = text("careerId"), eventId = text("eventId"), intent = text("intent");
    try {
        if (intent === "simulateSession") await simulatePracticeSession(getPracticeRepository(), careerId, eventId, text("sessionId"));
        else if (intent === "simulateRemainder") await simulatePracticeRemainder(getPracticeRepository(), careerId, eventId, text("sessionId"));
        else if (intent === "simulateAll") {
            if (text("confirm") !== "yes") throw new PracticeError("INVALID_INPUT");
            await simulateRemainingPractice(getPracticeRepository(), () => getProgressionRepository().getProgress(careerId), careerId, eventId);
        }
        else throw new PracticeError("INVALID_ACTION");
    }
    catch (error) {
        console.error("Practice weekend action failed", error);
        return { error: error instanceof PracticeError ? error.code : "PERSISTENCE_FAILED" };
    }
    revalidatePath(`/career/${careerId}`, "layout");
    revalidatePath("/careers");
    return { error: null };
}

"use server";
import { revalidatePath } from "next/cache";
import {
  ProgressionError,
  type ProgressionErrorCode,
  type SessionIntent,
} from "../../game/domain/progression";
import { getProgressionRepository } from "./server";
import {
  advanceToNextEvent,
  BROWSER_SESSION_INTENTS,
  runScaffoldingAction,
} from "./progression";
export async function progressionAction(
  _previous: { error: ProgressionErrorCode | null },
  form: FormData,
): Promise<{ error: ProgressionErrorCode | null }> {
  const text = (key: string) =>
    typeof form.get(key) === "string" ? String(form.get(key)) : "";
  const careerId = text("careerId");
  const eventId = text("eventId");
  const intent = text("intent");
  try {
    const repository = getProgressionRepository();
    if (intent === "advance")
      await advanceToNextEvent(repository, careerId, eventId);
    else {
      // Practice runs only through the Practice service (manage or simulate); the browser can never skip it.
      if (!(BROWSER_SESSION_INTENTS as readonly string[]).includes(intent))
        throw new ProgressionError("INVALID_TRANSITION");
      await runScaffoldingAction(
        repository,
        careerId,
        eventId,
        text("sessionId"),
        intent as SessionIntent,
      );
    }
  } catch (error) {
    console.error("Career transition failed", error);
    return {
      error:
        error instanceof ProgressionError ? error.code : "PERSISTENCE_FAILED",
    };
  }
  revalidatePath(`/career/${careerId}`, "layout");
  revalidatePath("/careers");
  return { error: null };
}

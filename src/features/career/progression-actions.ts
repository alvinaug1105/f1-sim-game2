"use server";
import { revalidatePath } from "next/cache";
import {
  ProgressionError,
  type ProgressionErrorCode,
  type SessionIntent,
} from "../../game/domain/progression";
import { getProgressionRepository } from "./server";
import { advanceToNextEvent, runScaffoldingAction } from "./progression";
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
      const intents: readonly string[] = [
        "start",
        "skipPractice",
        "completeDevelopment",
      ];
      if (!intents.includes(intent))
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

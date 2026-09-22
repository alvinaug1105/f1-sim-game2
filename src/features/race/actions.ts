"use server";
import {
  isTyreCompound,
  type TyreCompound,
} from "../../simulation/race/tyres/model";
import { revalidatePath } from "next/cache";
import {
  RaceError,
  type RaceErrorCode,
} from "../../game/domain/race-repository";
import { getRaceRepository } from "../career/server";
import { startTyreCareerRace, advanceCareerRace } from "./service";
export async function raceAction(
  _previous: { error: RaceErrorCode | null },
  form: FormData,
): Promise<{ error: RaceErrorCode | null }> {
  const text = (key: string) =>
    typeof form.get(key) === "string" ? String(form.get(key)) : "";
  const careerId = text("careerId"),
    eventId = text("eventId"),
    intent = text("intent");
  try {
    const repository = getRaceRepository();
    if (intent === "start") {
      const choices: Record<string, TyreCompound> = {};
      for (const [key, value] of form.entries())
        if (key.startsWith("tyre:")) {
          if (!isTyreCompound(value)) throw new RaceError("INVALID_INPUT");
          choices[key.slice(5)] = value;
        }
      await startTyreCareerRace(repository, careerId, eventId, choices);
    } else if (["lap", "five", "finish"].includes(intent)) {
      const lap = Number(text("lap"));
      if (!Number.isSafeInteger(lap) || lap < 0)
        throw new RaceError("INVALID_ACTION");
      await advanceCareerRace(
        repository,
        careerId,
        eventId,
        lap,
        intent === "lap" ? 1 : intent === "five" ? 5 : "finish",
      );
    } else throw new RaceError("INVALID_ACTION");
  } catch (error) {
    console.error("Race action failed", error);
    return {
      error: error instanceof RaceError ? error.code : "PERSISTENCE_FAILED",
    };
  }
  revalidatePath(`/career/${careerId}`, "layout");
  revalidatePath("/careers");
  return { error: null };
}

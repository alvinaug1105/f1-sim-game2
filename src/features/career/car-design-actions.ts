"use server";
import { revalidatePath } from "next/cache";
import { CarDesignError, type CarDesignErrorCode } from "../../game/domain/car-design-repository";
import type { DesignPlan } from "../../game/domain/car-design-project";
import { getCarDesignRepository } from "./server";

export interface CarDesignActionState {
  readonly error: CarDesignErrorCode | null;
  readonly preview: DesignPlan | null;
  readonly startedId: string | null;
}
export async function carDesignAction(_previous: CarDesignActionState, form: FormData): Promise<CarDesignActionState> {
  const text = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)) : "";
  const careerId = text("careerId");
  try {
    const repository = getCarDesignRepository();
    if (text("intent") === "preview") {
      return { error: null, preview: await repository.preview(careerId, text("partType"), text("focus"), text("programme")), startedId: null };
    }
    if (text("intent") !== "start") throw new CarDesignError("INVALID_CHOICE");
    if (!_previous.preview) throw new CarDesignError("STALE_PREVIEW");
    // Re-evaluate under the Career row lock; client preview and statistics are never trusted.
    const started = await repository.start(careerId, text("partType"), text("focus"), text("programme"), _previous.preview);
    revalidatePath(`/career/${careerId}/car`);
    return { error: null, preview: null, startedId: started.id };
  } catch (error) {
    console.error("Car design action failed", error);
    return { error: error instanceof CarDesignError ? error.code : "PERSISTENCE_FAILED", preview: null, startedId: null };
  }
}

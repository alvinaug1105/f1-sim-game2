"use server";
import { revalidatePath } from "next/cache";
import { CarPhysicalError, type CarPhysicalErrorCode, type FitImpactView } from "../../game/domain/car-physical-repository";
import { getCarPhysicalRepository } from "./server";

export interface CarPhysicalActionState { readonly error: CarPhysicalErrorCode | null; readonly success: "manufactured" | "fitted" | null }
export async function carPhysicalAction(_previous: CarPhysicalActionState, form: FormData): Promise<CarPhysicalActionState> {
  const value = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)) : "";
  const careerId = value("careerId");
  try {
    const repository = getCarPhysicalRepository();
    if (value("intent") === "manufacture") {
      const quantity = Number(value("quantity"));
      if (!Number.isInteger(quantity)) throw new CarPhysicalError("INVALID_CHOICE");
      await repository.startManufacturing(careerId, value("designId"), quantity, value("expectedCompletionDate"));
      revalidatePath(`/career/${careerId}/car`);
      return { error: null, success: "manufactured" };
    }
    if (value("intent") === "fit") {
      let expected: FitImpactView;
      try { expected = JSON.parse(value("impact")) as FitImpactView; } catch { throw new CarPhysicalError("STALE_PREVIEW"); }
      await repository.fit(careerId, value("slot"), value("designId"), expected);
      revalidatePath(`/career/${careerId}/car`);
      return { error: null, success: "fitted" };
    }
    throw new CarPhysicalError("INVALID_CHOICE");
  } catch (error) {
    console.error("Car physical action failed", error);
    return { error: error instanceof CarPhysicalError ? error.code : "PERSISTENCE_FAILED", success: null };
  }
}

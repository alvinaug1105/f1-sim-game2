"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CareerError } from "../../game/domain/career";
import { createCareer } from "./create-career";
import { getCareerRepository } from "./server";
import type { CareerActionState } from "./form-state";
export async function createCareerAction(
  _previous: CareerActionState,
  form: FormData,
): Promise<CareerActionState> {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };
  let careerId: string;
  try {
    const career = await createCareer(getCareerRepository(), {
      name: text("name"),
      gameDatabaseId: text("gameDatabaseId"),
      seasonId: text("seasonId"),
      playerTeamId: text("playerTeamId"),
    });
    careerId = career.id;
  } catch (error) {
    console.error("Career creation failed", error);
    return {
      error: error instanceof CareerError ? error.code : "PERSISTENCE_FAILED",
    };
  }
  revalidatePath("/careers");
  redirect(`/career/${careerId}`);
}

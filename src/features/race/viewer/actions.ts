"use server";
import { getRaceRepository } from "../../career/server";
import { RaceError } from "../../../game/domain/race-repository";
import type { ViewerIntent } from "./intents";
import { applyViewerIntent } from "./service";
export async function viewerAction(careerId: string, eventId: string, lap: number, intent: ViewerIntent) {
    try {
        return { data: await applyViewerIntent(getRaceRepository(), careerId, eventId, lap, intent), error: null };
    }
    catch (error) {
        console.error("Viewer intent failed", error);
        return { data: null, error: error instanceof RaceError ? error.code : "PERSISTENCE_FAILED" as const };
    }
}

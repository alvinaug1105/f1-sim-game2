"use server";
import { getRaceRepository } from "../../career/server";
import { RaceError } from "../../../game/domain/race-repository";
import type { ViewerIntent } from "./intents";
import { applyViewerIntent } from "./service";
import { simulateCareerRaceRemainder } from "../service";
import { projectRaceView } from "../projection";
/**
 * Server actions take command intent only (expected lap, entrant, revision, mode/compound) — never Race state. The
 * server loads the authoritative saved Race, validates, runs the engine, persists, and returns the PUBLIC projection.
 */
const kindOf = (kind: unknown) => { if (kind !== "RACE" && kind !== "SPRINT") throw new RaceError("INVALID_INPUT"); return kind; };
export async function viewerAction(careerId: string, eventId: string, lap: number, intent: ViewerIntent, kind: unknown = "RACE") {
    try {
        return { data: projectRaceView(await applyViewerIntent(getRaceRepository(kindOf(kind)), careerId, eventId, lap, intent)), error: null };
    }
    catch (error) {
        console.error("Viewer intent failed", error);
        return { data: null, error: error instanceof RaceError ? error.code : "PERSISTENCE_FAILED" as const };
    }
}
/** Sprint: Simulate Remainder from the exact checkpoint (both player cars auto-managed to the flag). */
export async function sprintRemainderAction(careerId: string, eventId: string, lap: number) {
    try {
        const repository = getRaceRepository("SPRINT");
        await simulateCareerRaceRemainder(repository, careerId, eventId, lap);
        const data = await repository.getRace(careerId, eventId);
        if (!data?.state) throw new RaceError("NOT_FOUND");
        return { data: projectRaceView(data), error: null };
    }
    catch (error) {
        console.error("Sprint remainder failed", error);
        return { data: null, error: error instanceof RaceError ? error.code : "PERSISTENCE_FAILED" as const };
    }
}

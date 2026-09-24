import type { CareerRaceRepository } from "../../../game/domain/race-repository";
import { RaceError } from "../../../game/domain/race-repository";
import { advanceCareerRace, changeCareerPitRequest, setDriverPaceMode, setDriverFuelMode, setDriverErsMode } from "../service";
import type { ViewerIntent } from "./intents";
/** Application adapter only: the existing services own validation, ownership, locks and physics. */
export async function applyViewerIntent(repository: CareerRaceRepository, careerId: string, eventId: string, lap: number, intent: ViewerIntent) {
    switch (intent.kind) {
        case 'advance':
            await advanceCareerRace(repository, careerId, eventId, lap, 1);
            break;
        case 'pit':
            await changeCareerPitRequest(repository, careerId, eventId, intent.entrantId, lap, intent.revision, intent.compound);
            break;
        case 'paceMode':
            await setDriverPaceMode(repository, careerId, eventId, intent.entrantId, lap, intent.revision, intent.mode);
            break;
        case 'fuelMode':
            await setDriverFuelMode(repository, careerId, eventId, intent.entrantId, lap, intent.revision, intent.mode);
            break;
        case 'ersMode':
            await setDriverErsMode(repository, careerId, eventId, intent.entrantId, lap, intent.revision, intent.mode);
            break;
        default: throw new RaceError('INVALID_ACTION');
    }
    const data = await repository.getRace(careerId, eventId);
    if (!data?.state)
        throw new RaceError('NOT_FOUND');
    return data;
}

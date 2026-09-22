import {
  enterNextEvent,
  transitionSession,
  type CareerProgressionRepository,
  type SessionIntent,
} from "../../game/domain/progression";
export function advanceToNextEvent(
  repository: CareerProgressionRepository,
  careerId: string,
  expectedEventId: string,
) {
  return repository.transition(careerId, (state) =>
    enterNextEvent(state, expectedEventId, () => crypto.randomUUID()),
  );
}
export function runSessionAction(
  repository: CareerProgressionRepository,
  careerId: string,
  eventId: string,
  sessionId: string,
  intent: SessionIntent,
) {
  return repository.transition(careerId, (state) =>
    transitionSession(state, eventId, sessionId, intent),
  );
}

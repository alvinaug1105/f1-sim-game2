import { ProgressionError } from "../../game/domain/progression";
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

/** Browser-facing scaffolding excludes Race; its production path is the real engine. */
export function runScaffoldingAction(
  repository: CareerProgressionRepository,
  careerId: string,
  eventId: string,
  sessionId: string,
  intent: SessionIntent,
) {
  return repository.transition(careerId, (state) => {
    const session = state.events
      .find((e) => e.id === eventId)
      ?.weekend?.sessions.find((s) => s.id === sessionId);
    if (session?.type === "RACE")
      throw new ProgressionError("INVALID_TRANSITION");
    return transitionSession(state, eventId, sessionId, intent);
  });
}

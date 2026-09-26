import { ProgressionError, isPractice } from "../../game/domain/progression";
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

/** Session intents the browser progression form may send. Practice is managed or simulated, never skipped. */
export const BROWSER_SESSION_INTENTS: readonly SessionIntent[] = [];
/**
 * Browser-facing scaffolding excludes every weekend session: Practice, Qualifying and Race all run on their real
 * engines. Nothing can be skipped or fake-completed here; a player who does not manage a session simulates it.
 * The domain intents remain for internal tooling/tests via `runSessionAction` only.
 */
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
    if (
      session?.type === "RACE" ||
      session?.type === "QUALIFYING" ||
      session?.type === "SPRINT_QUALIFYING" ||
      session?.type === "SPRINT" ||
      (session && isPractice(session.type))
    )
      throw new ProgressionError("INVALID_TRANSITION");
    return transitionSession(state, eventId, sessionId, intent);
  });
}

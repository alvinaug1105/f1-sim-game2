import {
  RaceError,
  type CareerRaceRepository,
} from "../../game/domain/race-repository";
import { transitionSession } from "../../game/domain/progression";
import {
  advanceRace,
  createRace,
  SIMULATION_VERSION,
} from "../../simulation/race/engine";
import { developmentRaceInput } from "./development-profiles";
export function startCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  seed: number = crypto.getRandomValues(new Uint32Array(1))[0],
) {
  return repository.changeRace(careerId, eventId, (data) => {
    if (data.state) throw new RaceError("STALE");
    const event = data.progress.events.find((e) => e.id === eventId)!;
    const session = event.weekend!.sessions.find(
      (s) => s.id === data.sessionId,
    )!;
    if (
      event.status !== "CURRENT" ||
      event.weekend!.status !== "ACTIVE" ||
      data.progress.career.status !== "ACTIVE" ||
      !["AVAILABLE", "IN_PROGRESS"].includes(session.status)
    )
      throw new RaceError("INVALID_ACTION");
    const progress =
      session.status === "AVAILABLE"
        ? transitionSession(data.progress, eventId, session.id, "start")
        : data.progress;
    try {
      const snapshot = developmentRaceInput(data, seed, () =>
        crypto.randomUUID(),
      );
      return {
        state: createRace(snapshot.input),
        labels: snapshot.labels,
        progress,
      };
    } catch (cause) {
      throw new RaceError("INVALID_INPUT", { cause });
    }
  });
}
export function advanceCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  expectedLap: number,
  count: 1 | 5 | "finish",
) {
  if (![1, 5, "finish"].includes(count)) throw new RaceError("INVALID_ACTION");
  return repository.changeRace(careerId, eventId, (data) => {
    if (!data.state || data.state.status !== "RUNNING")
      throw new RaceError("INVALID_ACTION");
    if (data.state.simulationVersion !== SIMULATION_VERSION)
      throw new RaceError("UNSUPPORTED_VERSION");
    if (data.state.lap !== expectedLap) throw new RaceError("STALE");
    const event = data.progress.events.find((e) => e.id === eventId)!;
    const session = event.weekend!.sessions.find(
      (s) => s.id === data.sessionId,
    )!;
    if (
      session.status !== "IN_PROGRESS" ||
      event.status !== "CURRENT" ||
      data.progress.career.status !== "ACTIVE"
    )
      throw new RaceError("INVALID_ACTION");
    const state = advanceRace(
      data.state,
      count === "finish" ? data.state.input.totalLaps : count,
    );
    const progress =
      state.status === "FINISHED"
        ? transitionSession(
            data.progress,
            eventId,
            data.sessionId,
            "completeDevelopment",
          )
        : data.progress;
    return { state, labels: data.labels, progress };
  });
}

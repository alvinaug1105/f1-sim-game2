import {
  defaultTyreConfiguration,
  startingTyre,
} from "../../simulation/race/tyres/profiles";
import {
  isTyreCompound,
  type TyreCompound,
} from "../../simulation/race/tyres/model";
import {
  RaceError,
  type CareerRaceRepository,
} from "../../game/domain/race-repository";
import { transitionSession } from "../../game/domain/progression";
import {
  advanceRace,
  createRace,
  isSupportedSimulationVersion,
} from "../../simulation/race/engine";
import { developmentRaceInput } from "./development-profiles";
export function startCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  seed: number = crypto.getRandomValues(new Uint32Array(1))[0],
  tyreChoices?: Readonly<Record<string, TyreCompound>>,
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
      if (tyreChoices) {
        if (
          Object.keys(tyreChoices).some(
            (id) => !data.roster.some((e) => e.driverId === id),
          ) ||
          Object.values(tyreChoices).some((c) => !isTyreCompound(c))
        )
          throw new RaceError("INVALID_INPUT");
      }
      const input = tyreChoices
        ? {
            ...snapshot.input,
            tyres: defaultTyreConfiguration(),
            entrants: snapshot.input.entrants.map((e) => ({
              ...e,
              startingTyre: startingTyre(tyreChoices[e.driverId] ?? "MEDIUM"),
            })),
          }
        : snapshot.input;
      return {
        state: createRace(input),
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
    if (!isSupportedSimulationVersion(data.state.simulationVersion))
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

/** New production races use v2. The original entry point remains a v1 compatibility API. */
export function startTyreCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  choices: Readonly<Record<string, TyreCompound>> = {},
  seed?: number,
) {
  return startCareerRace(repository, careerId, eventId, seed, choices);
}

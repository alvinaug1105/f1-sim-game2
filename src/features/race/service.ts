import { defaultPitConfiguration } from "../../simulation/race/pits/profiles";
import { requestPitStop } from "../../simulation/race/pits/model";
import type { StrategyController } from "../../simulation/race/pits/types";
import {
  defaultInteractionConfiguration,
  developmentDriverInteraction,
} from "../../simulation/race/traffic/profiles";
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
  withTraffic = false,
  withPits = false,
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
        state: createRace(
          withTraffic
            ? {
                ...input,
                ...(withPits ? { pits: defaultPitConfiguration() } : {}),
                interaction: defaultInteractionConfiguration(),
                entrants: input.entrants.map((e) => ({
                  ...e,
                  ...(withPits
                    ? {
                        strategyController: (e.teamId ===
                        data.progress.career.playerTeamId
                          ? "PLAYER"
                          : "DEVELOPMENT_AI") as StrategyController,
                      }
                    : {}),
                  interaction: developmentDriverInteraction(),
                })),
              }
            : input,
        ),
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

/** Version-2 compatibility entry point for tyre-only races. New browser races use v4 below. */
export function startTyreCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  choices: Readonly<Record<string, TyreCompound>> = {},
  seed?: number,
) {
  return startCareerRace(repository, careerId, eventId, seed, choices);
}

/** Version-3 compatibility entry point; no pit state is added to these races. */
export function startTrafficCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  choices: Readonly<Record<string, TyreCompound>> = {},
  seed?: number,
) {
  return startCareerRace(repository, careerId, eventId, seed, choices, true);
}

/** New browser starts snapshot v4 pit mechanics and temporary non-player strategy policy. */
export function startPitCareerRace(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  choices: Readonly<Record<string, TyreCompound>> = {},
  seed?: number,
) {
  return startCareerRace(
    repository,
    careerId,
    eventId,
    seed,
    choices,
    true,
    true,
  );
}
export function changeCareerPitRequest(
  repository: CareerRaceRepository,
  careerId: string,
  eventId: string,
  entrantId: string,
  expectedLap: number,
  expectedRevision: number,
  compound: TyreCompound | null,
) {
  if (
    !Number.isSafeInteger(expectedLap) ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedLap < 0 ||
    expectedRevision < 0 ||
    (compound !== null && !isTyreCompound(compound))
  )
    throw new RaceError("INVALID_INPUT");
  return repository.changeRace(careerId, eventId, (data) => {
    const state = data.state;
    if (
      !state ||
      state.simulationVersion !== 4 ||
      state.status !== "RUNNING" ||
      data.progress.career.status !== "ACTIVE"
    )
      throw new RaceError("INVALID_ACTION");
    const event = data.progress.events.find((e) => e.id === eventId)!;
    const session = event.weekend!.sessions.find(
      (s) => s.id === data.sessionId,
    )!;
    if (event.status !== "CURRENT" || session.status !== "IN_PROGRESS")
      throw new RaceError("INVALID_ACTION");
    const entrant = state.entrants.find((e) => e.entrantId === entrantId);
    const source = state.input.entrants.find((e) => e.entrantId === entrantId);
    if (
      !entrant?.pit ||
      source?.strategyController !== "PLAYER" ||
      source.teamId !== data.progress.career.playerTeamId
    )
      throw new RaceError("INVALID_ACTION");
    if (
      state.lap !== expectedLap ||
      entrant.pit.commandRevision !== expectedRevision
    )
      throw new RaceError("STALE");
    if (state.lap >= state.input.totalLaps - 1)
      throw new RaceError("INVALID_ACTION");
    return {
      state: requestPitStop(state, entrantId, compound),
      labels: data.labels,
      progress: data.progress,
    };
  });
}

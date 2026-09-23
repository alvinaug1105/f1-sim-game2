import { validateWeatherConfiguration, validateWeatherState, type WeatherConfiguration, type WeatherState } from "../../simulation/race/weather/model";
import { validateCommandConfiguration, validateCommandState, type CommandConfiguration, type CommandState } from "../../simulation/race/commands/model";
import type {
  PitConfiguration,
  PitState,
} from "../../simulation/race/pits/types";
import { validatePitConfiguration } from "../../simulation/race/pits/profiles";
import {
  validateInteraction,
  validateDriverInteraction,
  type InteractionConfiguration,
  type TrackState,
} from "../../simulation/race/traffic/model";
import {
  validateTyreConfiguration,
  validateTyreState,
  type TyreConfiguration,
  type TyreState,
  type TyreCompound,
} from "../../simulation/race/tyres/model";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { assertContentId } from "../../game/domain/content-repository";
import {
  RaceError,
  type CareerRaceRepository,
  type CareerRaceData,
} from "../../game/domain/race-repository";
import type { RaceSimulationState } from "../../simulation/race/types";
import { loadProgress, persistProgress } from "./prisma-progression";
function validate(careerId: string, eventId: string) {
  try {
    assertContentId(careerId);
    assertContentId(eventId);
  } catch {
    throw new RaceError("NOT_FOUND");
  }
}
async function protect<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof RaceError) throw cause;
    throw new RaceError("PERSISTENCE_FAILED", { cause });
  }
}
async function read(
  tx: Prisma.TransactionClient,
  careerId: string,
  eventId: string,
): Promise<CareerRaceData | null> {
  const progress = await loadProgress(tx, careerId);
  const event = progress?.events.find((e) => e.id === eventId);
  const session = event?.weekend?.sessions.find((s) => s.type === "RACE");
  if (!progress || !event || !session) return null;
  const row = await tx.careerRaceSimulation.findUnique({
    where: { careerSessionId: session.id },
    include: {
      entrants: {
        orderBy: { gridPosition: "asc" },
        include: {
          stintHistory: { orderBy: { number: "asc" } },
          pitStops: { orderBy: { number: "asc" } },
        },
      },
      tyreProfiles: true,
      interactionProfile: true,
      pitProfile: true,
      commandProfile: true,
      weatherProfile: true,
    },
  });
  const circuit = await tx.careerCircuit.findUniqueOrThrow({
    where: { id: event.careerCircuitId },
  });
  const roster = row
    ? []
    : await tx.careerSeasonDriverEntry.findMany({
        where: {
          careerId,
          careerSeasonId: event.careerSeasonId,
          role: "RACE_DRIVER",
        },
        include: { driver: true, teamEntry: { include: { team: true } } },
        orderBy: [
          { teamEntry: { entryOrder: "asc" } },
          { carNumber: "asc" },
          { id: "asc" },
        ],
      });
  let tyres: TyreConfiguration | undefined;
  if (
    row?.simulationVersion === 2 ||
    row?.simulationVersion === 3 ||
    (row?.simulationVersion === 4 || (row?.simulationVersion === 5 || row?.simulationVersion === 6))
  ) {
    tyres = {
      tyreWearMultiplierPermille: row.tyreWearMultiplierPermille!,
      tyreEnergyMultiplierPermille: row.tyreEnergyMultiplierPermille!,
      profiles: Object.fromEntries(
        row.tyreProfiles.map((row) => [
          row.compound,
          Object.fromEntries(
            Object.entries(row).filter(
              ([key]) => key !== "careerId" && key !== "careerRaceSimulationId",
            ),
          ),
        ]),
      ) as unknown as TyreConfiguration["profiles"],
    };
    validateTyreConfiguration(tyres);
  }
  let interaction: InteractionConfiguration | undefined;
  if (row?.simulationVersion === 3 || (row?.simulationVersion === 4 || (row?.simulationVersion === 5 || row?.simulationVersion === 6))) {
    if (!row.interactionProfile) throw new RaceError("INVALID_INPUT");
    interaction = Object.fromEntries(
      Object.entries(row.interactionProfile).filter(
        ([key]) => key !== "careerId" && key !== "careerRaceSimulationId",
      ),
    ) as unknown as InteractionConfiguration;
    validateInteraction(interaction);
  }
  let pits: PitConfiguration | undefined;
  if ((row?.simulationVersion === 4 || (row?.simulationVersion === 5 || row?.simulationVersion === 6))) {
    if (!row.pitProfile) throw new RaceError("INVALID_INPUT");
    pits = Object.fromEntries(
      Object.entries(row.pitProfile).filter(
        ([key]) => key !== "careerId" && key !== "careerRaceSimulationId",
      ),
    ) as unknown as PitConfiguration;
    validatePitConfiguration(pits);
  }
  const commands = (row?.simulationVersion === 5 || row?.simulationVersion === 6) ? row.commandProfile?.profile as unknown as CommandConfiguration : undefined;
  if (commands) validateCommandConfiguration(commands);
  if ((row?.simulationVersion === 5 || row?.simulationVersion === 6) && !commands) throw new RaceError("INVALID_INPUT");
  const weatherConfig = row?.simulationVersion === 6 ? row.weatherProfile?.profile as unknown as WeatherConfiguration : undefined;
  let weather: WeatherState | undefined;
  if (row?.simulationVersion === 6) {
    if (!weatherConfig || !row.weatherProfile) throw new RaceError("INVALID_INPUT");
    validateWeatherConfiguration(weatherConfig,row.totalLaps);
    const w=row.weatherProfile;
    weather={rainfallIntensity:w.rainfallIntensity,airTemperatureMilliC:w.airTemperatureMilliC,trackTemperatureMilliC:w.trackTemperatureMilliC,trackWater:w.trackWater,drsState:w.drsState as WeatherState["drsState"]};
    validateWeatherState(weather);
  }
  const state: RaceSimulationState | null = row
    ? {
        simulationVersion: row.simulationVersion,
        ...(weather ? { weather } : {}),
        rngState: Number(row.rngState),
        lap: row.currentLap,
        status: row.status,
        input: {
          ...(weatherConfig ? { weather: weatherConfig } : {}),
          ...(commands ? { commands } : {}),
          ...(tyres ? { tyres } : {}),
          ...(pits ? { pits } : {}),
          ...(interaction ? { interaction } : {}),
          seed: Number(row.seed),
          totalLaps: row.totalLaps,
          initialFuelKg: row.initialFuelGrams / 1000,
          fuelBurnPerLapKg: row.fuelBurnPerLapGrams / 1000,
          circuit: {
            baseLapTimeMs: row.baseLapTimeMs,
            fuelEffectMsPerKg: row.fuelEffectMsPerKg,
          },
          parameters: {
            carPerformanceRangeMs: row.carPerformanceRangeMs,
            driverPerformanceRangeMs: row.driverPerformanceRangeMs,
            minVariationMs: row.minVariationMs,
            maxVariationMs: row.maxVariationMs,
            gridOffsetMs: row.gridOffsetMs,
          },
          entrants: row.entrants.map((e) => ({
            ...(pits ? { strategyController: e.strategyController! } : {}),
            ...(interaction
              ? {
                  interaction: readDriverInteraction(
                    e.driverOvertaking,
                    e.driverDefending,
                  ),
                }
              : {}),
            entrantId: e.id,
            driverId: e.careerDriverId,
            teamId: e.careerTeamId,
            gridPosition: e.gridPosition,
            driver: { pace: e.driverPace, consistency: e.driverConsistency },
            car: { performance: e.carPerformance },
            ...(tyres
              ? {
                  startingTyre: readTyre(
                    e.startingCompound,
                    e.startingTyreAgeLaps,
                    e.startingTyreWearPermille,
                    e.startingTyreTemperatureMilliC,
                  ),
                }
              : {}),
          })),
        },
        entrants: [...row.entrants]
          .sort((a, b) => a.position - b.position)
          .map((e) => ({
            ...(commands ? { commands: readCommands(e, commands) } : {}),
            ...(pits ? { pit: readPit(e) } : {}),
            ...(interaction ? { track: readTrack(e) } : {}),
            ...(tyres
              ? {
                  stint: {
                    number: e.stintNumber!,
                    startedAtLap: e.stintStartedAtLap!,
                    tyre: readTyre(
                      e.compound,
                      e.tyreAgeLaps,
                      e.tyreWearPermille,
                      e.tyreTemperatureMilliC,
                    ),
                  },
                }
              : {}),
            entrantId: e.id,
            completedLaps: e.completedLaps,
            elapsedTimeMs: e.elapsedTimeMs,
            lastLapTimeMs: e.lastLapTimeMs,
            bestLapTimeMs: e.bestLapTimeMs,
            fuelMassKg: e.fuelMassGrams / 1000,
            position: e.position,
            gapToLeaderMs: e.gapToLeaderMs,
            intervalToAheadMs: e.intervalToAheadMs,
          })),
      }
    : null;
  return {
    progress,
    eventId,
    sessionId: session.id,
    state,
    circuit: {
      lengthMeters: circuit.lengthMeters,
      defaultLapCount: circuit.defaultLapCount,
    },
    labels:
      row?.entrants.map((e) => ({
        entrantId: e.id,
        driverName: e.driverName,
        teamName: e.teamName,
      })) ?? [],
    roster: roster.map((e) => ({
      driverId: e.careerDriverId,
      teamId: e.teamEntry.careerTeamId,
      driverName: `${e.driver.firstName} ${e.driver.lastName}`,
      teamName: e.teamEntry.team.name,
      teamOrder: e.teamEntry.entryOrder,
      carNumber: e.carNumber!,
    })),
  };
}
export class PrismaRaceRepository implements CareerRaceRepository {
  constructor(private readonly client: PrismaClient) {}
  async getRace(careerId: string, eventId: string) {
    validate(careerId, eventId);
    return protect(() =>
      this.client.$transaction((tx) => read(tx, careerId, eventId), {
        isolationLevel: "RepeatableRead",
      }),
    );
  }
  async changeRace(
    careerId: string,
    eventId: string,
    change: Parameters<CareerRaceRepository["changeRace"]>[2],
  ) {
    validate(careerId, eventId);
    return protect(() =>
      this.client.$transaction(
        async (tx) => {
          const locked = await tx.career.updateMany({
            where: { id: careerId },
            data: { updatedAt: new Date() },
          });
          if (!locked.count) throw new RaceError("NOT_FOUND");
          const before = await read(tx, careerId, eventId);
          if (!before) throw new RaceError("NOT_FOUND");
          const after = change(before),
            s = after.state;
          if (!before.state) {
            const row = await tx.careerRaceSimulation.create({
              data: {
                careerId,
                careerSessionId: before.sessionId,
                sessionType: "RACE",
                simulationVersion: s.simulationVersion,

                seed: BigInt(s.input.seed),
                rngState: BigInt(s.rngState),
                currentLap: s.lap,
                totalLaps: s.input.totalLaps,
                status: s.status,
                baseLapTimeMs: s.input.circuit.baseLapTimeMs,
                fuelEffectMsPerKg: s.input.circuit.fuelEffectMsPerKg,
                initialFuelGrams: Math.round(s.input.initialFuelKg * 1000),
                fuelBurnPerLapGrams: Math.round(
                  s.input.fuelBurnPerLapKg * 1000,
                ),
                ...s.input.parameters,
                tyreWearMultiplierPermille:
                  s.input.tyres?.tyreWearMultiplierPermille,
                tyreEnergyMultiplierPermille:
                  s.input.tyres?.tyreEnergyMultiplierPermille,
              },
            });
            if (s.input.weather && s.weather) await tx.careerRaceWeather.create({data:{careerId,careerRaceSimulationId:row.id,profile:JSON.parse(JSON.stringify(s.input.weather)),...s.weather}});
            if (s.input.commands) await tx.careerRaceCommandProfile.create({ data: { careerId, careerRaceSimulationId: row.id, profile: JSON.parse(JSON.stringify(s.input.commands)) } });
            if (s.input.pits)
              await tx.careerRacePitProfile.create({
                data: {
                  ...s.input.pits,
                  careerId,
                  careerRaceSimulationId: row.id,
                },
              });
            if (s.input.interaction)
              await tx.careerRaceInteractionProfile.create({
                data: {
                  ...s.input.interaction,
                  careerId,
                  careerRaceSimulationId: row.id,
                },
              });
            if (s.input.tyres)
              await tx.careerRaceTyreProfile.createMany({
                data: Object.values(s.input.tyres.profiles).map((profile) => ({
                  ...profile,
                  careerId,
                  careerRaceSimulationId: row.id,
                })),
              });
            await tx.careerRaceEntrant.createMany({
              data: s.input.entrants.map((e) => {
                const state = s.entrants.find(
                  (x) => x.entrantId === e.entrantId,
                )!;
                const label = after.labels.find(
                  (x) => x.entrantId === e.entrantId,
                )!;
                return {
                  id: e.entrantId,
                  careerId,
                  careerRaceSimulationId: row.id,
                  careerDriverId: e.driverId,
                  careerTeamId: e.teamId,
                  driverOvertaking: e.interaction?.overtaking,
                  driverDefending: e.interaction?.defending,
                  strategyController: e.strategyController,
                  driverName: label.driverName,
                  teamName: label.teamName,
                  gridPosition: e.gridPosition,
                  driverPace: e.driver.pace,
                  driverConsistency: e.driver.consistency,
                  carPerformance: e.car.performance,
                  ...(e.startingTyre
                    ? {
                        startingCompound: e.startingTyre.compound,
                        startingTyreAgeLaps: e.startingTyre.ageLaps,
                        startingTyreWearPermille: e.startingTyre.wearPermille,
                        startingTyreTemperatureMilliC:
                          e.startingTyre.temperatureMilliC,
                      }
                    : {}),
                  ...entrantState(state),
                };
              }),
            });
          } else {
            await tx.careerRaceSimulation.update({
              where: { careerSessionId: before.sessionId },
              data: {
                rngState: BigInt(s.rngState),
                currentLap: s.lap,
                status: s.status,
              },
            });
            if (s.weather) { const row = await tx.careerRaceSimulation.findUniqueOrThrow({where:{careerSessionId:before.sessionId}}); await tx.careerRaceWeather.update({where:{careerRaceSimulationId:row.id},data:{...s.weather}}); }
            for (const e of s.entrants)
              await tx.careerRaceEntrant.update({
                where: { id: e.entrantId },
                data: entrantState(e),
              });
          }
          if (s.input.pits) {
            const row = await tx.careerRaceSimulation.findUniqueOrThrow({
              where: { careerSessionId: before.sessionId },
            });
            for (const e of s.entrants)
              await persistPitHistory(tx, careerId, row.id, e);
          }
          await persistProgress(tx, before.progress, after.progress);
        },
        { isolationLevel: "ReadCommitted", timeout: 30000, maxWait: 5000 },
      ),
    );
  }
}
function entrantState(e: RaceSimulationState["entrants"][number]) {
  return {
    ...(e.commands ? { ...e.commands } : {}),
    ...(e.pit
      ? {
          pendingPitCompound: e.pit.pendingCompound,
          pitCommandRevision: e.pit.commandRevision,
          stopCount: e.pit.stops.length,
        }
      : {}),
    ...(e.track
      ? {
          trackProgressMicrolaps: BigInt(e.track.progressMicrolaps),
          drsEligible: e.track.drsEligible,
          overtakesCompleted: e.track.overtakesCompleted,
          potentialLapTimeMs: e.track.potentialLapTimeMs,
          dirtyAirMs: e.track.dirtyAirMs,
          drsBenefitMs: e.track.drsBenefitMs,
          trafficLossMs: e.track.trafficLossMs,
          attempted: e.track.attempted,
          passed: e.track.passed,
        }
      : {}),
    ...(e.stint
      ? {
          compound: e.stint.tyre.compound,
          tyreAgeLaps: e.stint.tyre.ageLaps,
          tyreWearPermille: e.stint.tyre.wearPermille,
          tyreTemperatureMilliC: e.stint.tyre.temperatureMilliC,
          stintNumber: e.stint.number,
          stintStartedAtLap: e.stint.startedAtLap,
        }
      : {}),
    completedLaps: e.completedLaps,
    elapsedTimeMs: e.elapsedTimeMs,
    lastLapTimeMs: e.lastLapTimeMs,
    bestLapTimeMs: e.bestLapTimeMs,
    fuelMassGrams: Math.round(e.fuelMassKg * 1000),
    position: e.position,
    gapToLeaderMs: e.gapToLeaderMs,
    intervalToAheadMs: e.intervalToAheadMs,
  };
}

function readTyre(
  compound: TyreCompound | null,
  ageLaps: number | null,
  wearPermille: number | null,
  temperatureMilliC: number | null,
): TyreState {
  if (
    compound === null ||
    ageLaps === null ||
    wearPermille === null ||
    temperatureMilliC === null
  )
    throw new RaceError("INVALID_INPUT");
  const tyre = { compound, ageLaps, wearPermille, temperatureMilliC };
  validateTyreState(tyre);
  return tyre;
}

function readDriverInteraction(
  overtaking: number | null,
  defending: number | null,
) {
  if (overtaking === null || defending === null)
    throw new RaceError("INVALID_INPUT");
  const profile = { overtaking, defending };
  validateDriverInteraction(profile);
  return profile;
}
function readTrack(e: {
  trackProgressMicrolaps: bigint | null;
  drsEligible: boolean | null;
  overtakesCompleted: number | null;
  potentialLapTimeMs: number | null;
  dirtyAirMs: number | null;
  drsBenefitMs: number | null;
  trafficLossMs: number | null;
  attempted: boolean | null;
  passed: boolean | null;
}): TrackState {
  const values = {
    progressMicrolaps:
      e.trackProgressMicrolaps === null
        ? null
        : Number(e.trackProgressMicrolaps),
    drsEligible: e.drsEligible,
    overtakesCompleted: e.overtakesCompleted,
    potentialLapTimeMs: e.potentialLapTimeMs,
    dirtyAirMs: e.dirtyAirMs,
    drsBenefitMs: e.drsBenefitMs,
    trafficLossMs: e.trafficLossMs,
    attempted: e.attempted,
    passed: e.passed,
  };
  if (Object.values(values).some((v) => v === null))
    throw new RaceError("INVALID_INPUT");
  return values as TrackState;
}

function readPit(
  e: Prisma.CareerRaceEntrantGetPayload<{
    include: { stintHistory: true; pitStops: true };
  }>,
): PitState {
  if (
    e.pitCommandRevision === null ||
    e.stopCount === null ||
    e.strategyController === null ||
    e.stintHistory.length !== e.stopCount + 1 ||
    e.pitStops.length !== e.stopCount
  )
    throw new RaceError("INVALID_INPUT");
  return {
    pendingCompound: e.pendingPitCompound,
    commandRevision: e.pitCommandRevision,
    stints: e.stintHistory.map((s) => ({
      number: s.number,
      startLap: s.startLap,
      endLap: s.endLap,
      startingTyre: readTyre(
        s.compound,
        s.startingAgeLaps,
        s.startingWearPermille,
        s.startingTemperatureMilliC,
      ),
      endingTyre:
        s.endLap === null
          ? null
          : readTyre(
              s.compound,
              s.endingAgeLaps,
              s.endingWearPermille,
              s.endingTemperatureMilliC,
            ),
    })),
    stops: e.pitStops.map((s) => ({
      number: s.number,
      lap: s.lap,
      oldCompound: s.oldCompound,
      newCompound: s.newCompound,
      pitLaneLossMs: s.pitLaneLossMs,
      stationaryTimeMs: s.stationaryTimeMs,
      totalLossMs: s.totalLossMs,
    })),
  };
}
async function persistPitHistory(
  tx: Prisma.TransactionClient,
  careerId: string,
  careerRaceSimulationId: string,
  e: RaceSimulationState["entrants"][number],
) {
  if (!e.pit) throw new RaceError("INVALID_INPUT");
  for (const s of e.pit.stints) {
    const data = {
      careerId,
      careerRaceSimulationId,
      entrantId: e.entrantId,
      number: s.number,
      startLap: s.startLap,
      endLap: s.endLap,
      compound: s.startingTyre.compound,
      startingAgeLaps: s.startingTyre.ageLaps,
      startingWearPermille: s.startingTyre.wearPermille,
      startingTemperatureMilliC: s.startingTyre.temperatureMilliC,
      endingAgeLaps: s.endingTyre?.ageLaps ?? null,
      endingWearPermille: s.endingTyre?.wearPermille ?? null,
      endingTemperatureMilliC: s.endingTyre?.temperatureMilliC ?? null,
    };
    await tx.careerRaceStint.upsert({
      where: { entrantId_number: { entrantId: e.entrantId, number: s.number } },
      create: data,
      update: data,
    });
  }
  for (const s of e.pit.stops) {
    const data = {
      ...s,
      careerId,
      careerRaceSimulationId,
      entrantId: e.entrantId,
    };
    await tx.careerRacePitStop.upsert({
      where: { entrantId_number: { entrantId: e.entrantId, number: s.number } },
      create: data,
      update: data,
    });
  }
}

function readCommands(e: { paceMode: string | null; fuelMode: string | null; ersMode: string | null; ersCharge: number | null; commandRevision: number | null }, c: CommandConfiguration): CommandState {
  const state = { paceMode: e.paceMode, fuelMode: e.fuelMode, ersMode: e.ersMode, ersCharge: e.ersCharge, commandRevision: e.commandRevision } as CommandState;
  validateCommandState(state, c);
  return state;
}

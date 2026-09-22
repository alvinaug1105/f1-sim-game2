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
      entrants: { orderBy: { gridPosition: "asc" } },
      tyreProfiles: true,
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
  if (row?.simulationVersion === 2) {
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
  const state: RaceSimulationState | null = row
    ? {
        simulationVersion: row.simulationVersion,
        rngState: Number(row.rngState),
        lap: row.currentLap,
        status: row.status,
        input: {
          ...(tyres ? { tyres } : {}),
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
            for (const e of s.entrants)
              await tx.careerRaceEntrant.update({
                where: { id: e.entrantId },
                data: entrantState(e),
              });
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

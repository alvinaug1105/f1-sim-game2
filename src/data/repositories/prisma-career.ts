import type {
  PrismaClient,
  Prisma,
  Career as CareerRow,
  CareerTeam as TeamRow,
  CareerSeason as SeasonRow,
  CareerCalendarEvent as EventRow,
} from "../generated/prisma/client";
import type {
  CareerRepository,
  CareerCreationTransaction,
} from "../../game/domain/career-repository";
import {
  CareerError,
  type Career,
  type CareerWorld,
  type CareerOverview,
  type CareerSummary,
  type CareerCreationOptions,
} from "../../game/domain/career";
import { assertContentId } from "../../game/domain/content-repository";
import { PrismaGameContentRepository } from "./prisma-game-content";
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const audit = (row: { createdAt: Date; updatedAt: Date }) => ({
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
function careerRecord(row: CareerRow): Career {
  return { ...row, ...audit(row), currentDate: iso(row.currentDate) };
}
function seasonRecord(row: SeasonRow) {
  return {
    ...row,
    startDate: row.startDate ? iso(row.startDate) : null,
    endDate: row.endDate ? iso(row.endDate) : null,
  };
}
function eventRecord(row: EventRow) {
  return { ...row, startDate: iso(row.startDate), endDate: iso(row.endDate) };
}
function summary(
  row: CareerRow & { playerTeam: TeamRow; currentSeason: SeasonRow },
): CareerSummary {
  const { playerTeam, currentSeason, ...career } = row;
  return {
    career: careerRecord(career),
    playerTeam: { ...playerTeam, ...audit(playerTeam) },
    season: seasonRecord(currentSeason),
  };
}
function validateId(id: string) {
  try {
    assertContentId(id);
  } catch (cause) {
    throw new CareerError("INVALID_ID", { cause });
  }
}
async function protect<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof CareerError) throw cause;
    throw new CareerError("PERSISTENCE_FAILED", { cause });
  }
}
async function saveWorld(tx: Prisma.TransactionClient, world: CareerWorld) {
  // Required playerTeam/currentSeason foreign keys are deferred until commit (see career_world migration).
  await tx.career.create({
    data: { ...world.career, currentDate: date(world.career.currentDate) },
  });
  await tx.careerTeam.createMany({ data: [...world.teams] });
  await tx.careerDriver.createMany({
    data: world.drivers.map((row) => ({
      ...row,
      dateOfBirth: date(row.dateOfBirth),
    })),
  });
  await tx.careerCircuit.createMany({ data: [...world.circuits] });
  await tx.careerSeason.create({
    data: {
      ...world.season,
      startDate: world.season.startDate ? date(world.season.startDate) : null,
      endDate: world.season.endDate ? date(world.season.endDate) : null,
    },
  });
  await tx.careerSeasonTeamEntry.createMany({ data: [...world.teamEntries] });
  await tx.careerSeasonDriverEntry.createMany({
    data: [...world.driverEntries],
  });
  await tx.careerCalendarEvent.createMany({
    data: world.events.map((row) => ({
      ...row,
      startDate: date(row.startDate),
      endDate: date(row.endDate),
    })),
  });
}
export class PrismaCareerRepository implements CareerRepository {
  constructor(private readonly client: PrismaClient) {}
  async createAtomically(
    work: (tx: CareerCreationTransaction) => Promise<Career>,
  ): Promise<Career> {
    return protect(() =>
      this.client.$transaction(
        (tx) =>
          work({
            source: new PrismaGameContentRepository(tx),
            saveWorld: (world) => saveWorld(tx, world),
          }),
        { isolationLevel: "RepeatableRead", timeout: 30000, maxWait: 5000 },
      ),
    );
  }
  async getCareerById(id: string): Promise<Career | null> {
    validateId(id);
    return protect(async () => {
      const row = await this.client.career.findUnique({ where: { id } });
      return row ? careerRecord(row) : null;
    });
  }
  async listCareers(): Promise<readonly CareerSummary[]> {
    return protect(async () => {
      const rows = await this.client.career.findMany({
        include: { playerTeam: true, currentSeason: true },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      });
      return rows.map(summary);
    });
  }
  async getCareerOverview(id: string): Promise<CareerOverview | null> {
    validateId(id);
    return protect(() =>
      this.client.$transaction(
        async (tx) => {
          const row = await tx.career.findUnique({
            where: { id },
            include: { playerTeam: true, currentSeason: true },
          });
          if (!row) return null;
          const next = await tx.careerCalendarEvent.findFirst({
            where: {
              careerId: id,
              careerSeasonId: row.currentSeasonId,
              status: { in: ["UPCOMING", "CURRENT"] },
              endDate: { gte: row.currentDate },
            },
            include: { circuit: true },
            orderBy: [{ startDate: "asc" }, { round: "asc" }],
          });
          const nextEvent = next
            ? (() => {
                const { circuit, ...event } = next;
                return { event: eventRecord(event), circuit };
              })()
            : null;
          return { ...summary(row), nextEvent };
        },
        { isolationLevel: "RepeatableRead" },
      ),
    );
  }
  async getCreationOptions(): Promise<CareerCreationOptions> {
    // This is the only read path here that consults source content; Continue never calls it.
    return protect(async () => {
      const rows = await this.client.gameDatabase.findMany({
        select: {
          id: true,
          name: true,
          version: true,
          seasons: {
            select: {
              id: true,
              name: true,
              year: true,
              teams: {
                select: {
                  team: { select: { id: true, name: true, shortName: true } },
                },
                orderBy: { entryOrder: "asc" },
              },
            },
            orderBy: [{ year: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      return {
        databases: rows.map((row) => ({
          ...row,
          seasons: row.seasons.map((season) => ({
            ...season,
            teams: season.teams.map((entry) => entry.team),
          })),
        })),
      };
    });
  }
}

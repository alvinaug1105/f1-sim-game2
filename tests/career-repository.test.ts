import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import type { Prisma } from "../src/data/generated/prisma/client";
import { createPrismaClient } from "../src/data/prisma/connection";
import { PrismaCareerRepository } from "../src/data/repositories/prisma-career";
import { createCareer } from "../src/features/career/create-career";
import { developmentContent as data } from "../src/data/seed/content-development";
import {
  MemoryCareerRepository,
  input,
  runtime,
  audit,
} from "./helpers/memory-career";
const client = createPrismaClient(
  "postgresql://unused:unused@localhost:1/unused",
);
const repository = new PrismaCareerRepository(client);
const nativeAudit = {
  createdAt: new Date(audit.createdAt),
  updatedAt: new Date(audit.updatedAt),
};
function transactionDouble() {
  return {
    gameDatabase: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ ...data.database, ...nativeAudit }),
    },
    season: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ ...data.seasons[0], ...nativeAudit }),
    },
    seasonTeamEntry: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          data.teamEntries.map((entry) => ({
            ...entry,
            team: {
              ...data.teams.find((team) => team.id === entry.teamId),
              ...nativeAudit,
            },
          })),
        ),
    },
    seasonDriverEntry: {
      findMany: vi.fn().mockResolvedValue(
        data.driverEntries.map((entry) => {
          const driver = data.drivers.find(
            (driver) => driver.id === entry.driverId,
          )!;
          return {
            ...entry,
            driver: {
              ...driver,
              ...nativeAudit,
              dateOfBirth: new Date(driver.dateOfBirth),
            },
          };
        }),
      ),
    },
    calendarEvent: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          data.events.map((event) => ({
            ...event,
            startDate: new Date(event.startDate),
            endDate: new Date(event.endDate),
            circuit: {
              ...data.circuits.find(
                (circuit) => circuit.id === event.circuitId,
              ),
              ...nativeAudit,
            },
          })),
        ),
    },
    career: { create: vi.fn().mockResolvedValue({}), findUnique: vi.fn() },
    careerTeam: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    careerDriver: { createMany: vi.fn().mockResolvedValue({ count: 4 }) },
    careerCircuit: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    careerSeason: { create: vi.fn().mockResolvedValue({}) },
    careerSeasonTeamEntry: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    careerSeasonDriverEntry: {
      createMany: vi.fn().mockResolvedValue({ count: 4 }),
    },
    careerCalendarEvent: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}
let tx = transactionDouble();
beforeEach(() => {
  tx = transactionDouble();
  vi.spyOn(client, "$transaction").mockImplementation(async (work) => {
    if (typeof work !== "function")
      throw new Error("Expected interactive transaction");
    return work(tx as unknown as Prisma.TransactionClient);
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => client.$disconnect());
describe("Career Prisma adapter contracts (mocked delegates, not SQL execution)", () => {
  it("uses one RepeatableRead transaction for source reads and all owned writes", async () => {
    const career = await createCareer(repository, input, runtime);
    expect(client.$transaction).toHaveBeenCalledOnce();
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      timeout: 30000,
      maxWait: 5000,
    });
    expect(tx.career.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: career.id,
        playerTeamId: career.playerTeamId,
        currentDate: new Date("2026-02-20T00:00:00Z"),
      }),
    });
    expect(tx.careerTeam.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          careerId: career.id,
          sourceTeamId: input.playerTeamId,
          id: career.playerTeamId,
        }),
      ]),
    });
    expect(tx.careerDriver.createMany).toHaveBeenCalledOnce();
    expect(tx.careerCircuit.createMany).toHaveBeenCalledOnce();
    expect(tx.careerSeason.create).toHaveBeenCalledOnce();
    expect(tx.careerSeasonTeamEntry.createMany).toHaveBeenCalledOnce();
    expect(tx.careerSeasonDriverEntry.createMany).toHaveBeenCalledOnce();
    expect(tx.careerCalendarEvent.createMany).toHaveBeenCalledOnce();
  });
  it("propagates a late write failure through the transaction", async () => {
    tx.careerCalendarEvent.createMany.mockRejectedValue(
      new Error("CHECK failure"),
    );
    await expect(
      createCareer(repository, input, runtime),
    ).rejects.toMatchObject({ code: "PERSISTENCE_FAILED" });
    expect(tx.career.create).toHaveBeenCalledOnce();
  });
  it("loads the overview entirely from Career tables", async () => {
    const memory = new MemoryCareerRepository();
    const career = await createCareer(memory, input, runtime);
    const world = memory.worlds.get(career.id)!;
    const team = world.teams.find((row) => row.id === career.playerTeamId)!;
    const event = world.events[0];
    tx.career.findUnique.mockResolvedValue({
      ...career,
      ...nativeAudit,
      currentDate: new Date(career.currentDate),
      playerTeam: { ...team, ...nativeAudit },
      currentSeason: {
        ...world.season,
        startDate: new Date(world.season.startDate!),
        endDate: new Date(world.season.endDate!),
      },
    });
    tx.careerCalendarEvent.findFirst.mockResolvedValue({
      ...event,
      startDate: new Date(event.startDate),
      endDate: new Date(event.endDate),
      circuit: world.circuits[0],
    });
    const overview = await repository.getCareerOverview(career.id);
    expect(overview?.playerTeam.name).toBe("Aurora Racing");
    expect(overview?.career.currentDate).toBe("2026-02-20");
    expect(overview?.nextEvent?.event.startDate).toBe("2026-03-06");
    expect(tx.gameDatabase.findUnique).not.toHaveBeenCalled();
    expect(tx.season.findUnique).not.toHaveBeenCalled();
    expect(tx.calendarEvent.findMany).not.toHaveBeenCalled();
    expect(tx.careerCalendarEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          careerId: career.id,
          careerSeasonId: career.currentSeasonId,
        }),
      }),
    );
  });
  it("returns null for missing Careers without consulting source content", async () => {
    tx.career.findUnique.mockResolvedValue(null);
    expect(await repository.getCareerOverview(input.gameDatabaseId)).toBeNull();
    expect(tx.careerCalendarEvent.findFirst).not.toHaveBeenCalled();
    expect(tx.gameDatabase.findUnique).not.toHaveBeenCalled();
  });
  it("rejects invalid Career route IDs before querying", async () => {
    await expect(repository.getCareerOverview("bad")).rejects.toMatchObject({
      code: "INVALID_ID",
    });
    expect(client.$transaction).not.toHaveBeenCalled();
  });
  it("lists saved worlds by update time and returns no fixture fallback", async () => {
    const query = vi.spyOn(client.career, "findMany").mockResolvedValue([]);
    expect(await repository.listCareers()).toEqual([]);
    expect(query).toHaveBeenCalledWith({
      include: { playerTeam: true, currentSeason: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    query.mockRejectedValue(new Error("offline"));
    await expect(repository.listCareers()).rejects.toMatchObject({
      code: "PERSISTENCE_FAILED",
    });
  });
  it("returns null for an unknown saved Career ID", async () => {
    vi.spyOn(client.career, "findUnique").mockResolvedValue(null);
    expect(await repository.getCareerById(input.gameDatabaseId)).toBeNull();
  });
  it("exposes only source selection data through creation options", async () => {
    vi.spyOn(client.gameDatabase, "findMany").mockResolvedValue([]);
    expect(await repository.getCreationOptions()).toEqual({ databases: [] });
  });
});

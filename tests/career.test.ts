import { describe, it, expect, vi } from "vitest";
import { createCareer } from "../src/features/career/create-career";
import { validateCareerInput } from "../src/game/domain/career-snapshot";
import { developmentContent as data } from "../src/data/seed/content-development";
import {
  MemoryCareerRepository,
  runtime,
  input,
} from "./helpers/memory-career";
const missing = "11111111-1111-4111-8111-111111111111";
describe("Career creation and validation", () => {
  it("creates a saved Career with a separate owned world", async () => {
    const repo = new MemoryCareerRepository();
    const career = await createCareer(repo, input, runtime);
    const world = repo.worlds.get(career.id)!;
    expect(career.name).toBe(input.name);
    expect(career.status).toBe("ACTIVE");
    expect(world.teams).toHaveLength(2);
    expect(world.drivers).toHaveLength(4);
    expect(world.circuits).toHaveLength(2);
    expect(world.events).toHaveLength(2);
    expect(career.sourceGameDatabaseVersion).toBe(data.database.version);
  });
  it.each(["", "   ", "x".repeat(81)])(
    "rejects invalid Career names",
    async (name) => {
      const repo = new MemoryCareerRepository();
      const spy = vi.spyOn(repo, "createAtomically");
      await expect(
        createCareer(repo, { ...input, name }, runtime),
      ).rejects.toMatchObject({ code: "INVALID_NAME" });
      expect(spy).not.toHaveBeenCalled();
    },
  );
  it("trims valid names", () => {
    expect(validateCareerInput({ ...input, name: "  My Career  " }).name).toBe(
      "My Career",
    );
  });
  it("rejects invalid source identifiers before persistence", async () => {
    await expect(
      createCareer(
        new MemoryCareerRepository(),
        { ...input, seasonId: "bad" },
        runtime,
      ),
    ).rejects.toMatchObject({ code: "INVALID_ID" });
  });
  it("rejects a missing database", async () => {
    await expect(
      createCareer(
        new MemoryCareerRepository(),
        { ...input, gameDatabaseId: missing },
        runtime,
      ),
    ).rejects.toMatchObject({ code: "DATABASE_NOT_FOUND" });
  });
  it("rejects a missing season", async () => {
    await expect(
      createCareer(
        new MemoryCareerRepository(),
        { ...input, seasonId: missing },
        runtime,
      ),
    ).rejects.toMatchObject({ code: "SEASON_NOT_FOUND" });
  });
  it("rejects a season from a different database", async () => {
    const repo = new MemoryCareerRepository();
    repo.data = {
      ...data,
      seasons: [{ ...data.seasons[0], gameDatabaseId: missing }],
    };
    await expect(createCareer(repo, input, runtime)).rejects.toMatchObject({
      code: "SEASON_NOT_FOUND",
    });
  });
  it("rejects a non-participating player team", async () => {
    const repo = new MemoryCareerRepository();
    repo.data = {
      ...data,
      teamEntries: [data.teamEntries[1]],
      driverEntries: data.driverEntries.slice(2),
    };
    await expect(createCareer(repo, input, runtime)).rejects.toMatchObject({
      code: "TEAM_NOT_PARTICIPATING",
    });
  });
  it("rejects an inconsistent roster without writing a Career", async () => {
    const repo = new MemoryCareerRepository();
    repo.data = {
      ...data,
      driverEntries: [
        { ...data.driverEntries[0], teamId: missing },
        ...data.driverEntries.slice(1),
      ],
    };
    await expect(createCareer(repo, input, runtime)).rejects.toMatchObject({
      code: "INVALID_SOURCE",
    });
    expect(repo.worlds.size).toBe(0);
  });
  it("uses earliest weekend minus 14 UTC days", async () => {
    const repo = new MemoryCareerRepository();
    repo.data = { ...data, events: [data.events[1], data.events[0]] };
    const career = await createCareer(repo, input, runtime);
    expect(career.currentDate).toBe("2026-02-20");
  });
  it("uses January 1 and no circuits when the season has no events", async () => {
    const repo = new MemoryCareerRepository();
    repo.data = { ...data, events: [] };
    const career = await createCareer(repo, input, runtime);
    expect(career.currentDate).toBe("2026-01-01");
    expect(repo.worlds.get(career.id)?.circuits).toEqual([]);
    expect((await repo.getCareerOverview(career.id))?.nextEvent).toBeNull();
  });
  it("clones only participating content and deduplicates required circuits", async () => {
    const repo = new MemoryCareerRepository();
    repo.data = {
      ...data,
      teamEntries: [data.teamEntries[0]],
      driverEntries: data.driverEntries.slice(0, 2),
      events: data.events.map((event) => ({
        ...event,
        circuitId: data.circuits[0].id,
      })),
    };
    const career = await createCareer(repo, input, runtime);
    const world = repo.worlds.get(career.id)!;
    expect(world.teams).toHaveLength(1);
    expect(world.drivers).toHaveLength(2);
    expect(world.circuits).toHaveLength(1);
  });
});
describe("Career snapshot and identity mapping", () => {
  it.each(["teams", "drivers", "circuits", "events"] as const)(
    "isolates source %s edits",
    async (group) => {
      const repo = new MemoryCareerRepository();
      const career = await createCareer(repo, input, runtime);
      const before = structuredClone(repo.worlds.get(career.id)![group]);
      repo.data = {
        ...data,
        [group]: data[group].map((row) => ({
          ...row,
          name: "Edited",
          lastName: "Edited",
          nationalityCode: "AU",
          color: "#000000",
          lengthMeters: 9999,
          startDate: "2026-09-01",
        })),
      };
      expect(repo.worlds.get(career.id)![group]).toEqual(before);
    },
  );
  it("freezes roster and source version at creation", async () => {
    const repo = new MemoryCareerRepository();
    const career = await createCareer(repo, input, runtime);
    const before = structuredClone(repo.worlds.get(career.id));
    repo.data = {
      ...data,
      database: { ...data.database, version: "2.0.0" },
      driverEntries: [],
    };
    expect(repo.worlds.get(career.id)).toEqual(before);
  });
  it("maps all live relationships and player team to owned IDs", async () => {
    const repo = new MemoryCareerRepository();
    const career = await createCareer(repo, input, runtime);
    const world = repo.worlds.get(career.id)!;
    const teamIds = world.teams.map((row) => row.id),
      driverIds = world.drivers.map((row) => row.id),
      circuitIds = world.circuits.map((row) => row.id),
      entryIds = world.teamEntries.map((row) => row.id);
    expect(teamIds).toContain(career.playerTeamId);
    expect(career.playerTeamId).not.toBe(input.playerTeamId);
    expect(career.currentSeasonId).toBe(world.season.id);
    for (const row of world.teamEntries) {
      expect(teamIds).toContain(row.careerTeamId);
      expect(row.careerSeasonId).toBe(world.season.id);
    }
    for (const row of world.driverEntries) {
      expect(driverIds).toContain(row.careerDriverId);
      expect(entryIds).toContain(row.careerSeasonTeamEntryId);
    }
    for (const row of world.events)
      expect(circuitIds).toContain(row.careerCircuitId);
    const all = [
      career.id,
      world.season.id,
      ...teamIds,
      ...driverIds,
      ...circuitIds,
      ...entryIds,
      ...world.driverEntries.map((r) => r.id),
      ...world.events.map((r) => r.id),
    ];
    expect(new Set(all).size).toBe(all.length);
    for (const id of all)
      expect(
        [
          ...data.teams,
          ...data.drivers,
          ...data.circuits,
          ...data.seasons,
          ...data.events,
        ].map((r) => r.id),
      ).not.toContain(id);
  });
  it("preserves provenance without storing source IDs as live FKs", async () => {
    const repo = new MemoryCareerRepository();
    const career = await createCareer(repo, input, runtime);
    const world = repo.worlds.get(career.id)!;
    expect(world.teams[0].sourceTeamId).toBe(data.teams[0].id);
    expect(world.teams[0]).not.toHaveProperty("gameDatabaseId");
    expect(world.drivers[0]).not.toHaveProperty("teamId");
  });
  it("keeps two Careers independent even after Career A is edited", async () => {
    const repo = new MemoryCareerRepository();
    const a = await createCareer(repo, input, runtime),
      b = await createCareer(repo, input, runtime);
    const worldA = repo.worlds.get(a.id)!;
    const beforeB = structuredClone(repo.worlds.get(b.id));
    repo.worlds.set(a.id, {
      ...worldA,
      teams: worldA.teams.map((team) => ({ ...team, name: "Career A only" })),
    });
    expect(a.id).not.toBe(b.id);
    expect(a.playerTeamId).not.toBe(b.playerTeamId);
    expect(repo.worlds.get(b.id)).toEqual(beforeB);
  });
  it("continues after source deletion without source queries", async () => {
    const repo = new MemoryCareerRepository();
    const career = await createCareer(repo, input, runtime);
    repo.data = null;
    vi.spyOn(repo.source, "getGameDatabaseById").mockRejectedValue(
      new Error("Do not read source"),
    );
    expect((await repo.getCareerOverview(career.id))?.playerTeam.name).toBe(
      "Aurora Racing",
    );
    expect(await repo.listCareers()).toHaveLength(1);
  });
  it("does not commit a partially saved Career when transaction work fails (test double)", async () => {
    const repo = new MemoryCareerRepository();
    const existing = await createCareer(repo, input, runtime);
    repo.failAfterSave = true;
    await expect(createCareer(repo, input, runtime)).rejects.toThrow(
      "Injected snapshot-write failure",
    );
    expect([...repo.worlds.keys()]).toEqual([existing.id]);
  });
  it("rejects a reused source ID from the allocator", async () => {
    const repo = new MemoryCareerRepository();
    await expect(
      createCareer(repo, input, {
        ...runtime,
        newId: () => input.playerTeamId,
      }),
    ).rejects.toThrow("reused ID");
    expect(repo.worlds.size).toBe(0);
  });
});

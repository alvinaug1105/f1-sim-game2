import { describe, expect, it } from "vitest";
import { advanceSimulation } from "../src/simulation/core/clock";
import { createSeededRandom } from "../src/simulation/core/random";
import { assertEntityId, isAssignedToTeam } from "../src/game/domain/identity";
import {
  getDashboard,
  type DashboardRepository,
} from "../src/features/dashboard/get-dashboard";
import { developmentDashboardRepository } from "../src/data/repositories/development-dashboard";
describe("simulation clock", () => {
  it("advances tick 0 to 1 without mutating input", () => {
    const state = Object.freeze({ tick: 0 });
    expect(advanceSimulation(state)).toEqual({ tick: 1 });
    expect(state.tick).toBe(0);
    expect(advanceSimulation(state)).not.toBe(state);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    "rejects invalid or overflowing tick %s",
    (tick) => {
      expect(() => advanceSimulation({ tick })).toThrow(RangeError);
    },
  );
});
describe("seeded randomness", () => {
  it("reproduces the same sequence with the same seed", () => {
    const a = createSeededRandom(42),
      b = createSeededRandom(42);
    expect(Array.from({ length: 100 }, () => a.next())).toEqual(
      Array.from({ length: 100 }, () => b.next()),
    );
  });
  it("keeps outputs within [0,1) and distinguishes seeds", () => {
    const a = createSeededRandom(0),
      b = createSeededRandom(1);
    expect(a.next()).not.toBe(b.next());
    for (let i = 0; i < 1000; i++) {
      const n = a.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
  it("locks the version 1 sequence", () => {
    const random = createSeededRandom(0);
    expect(random.next()).toBe(1013904223 / 4294967296);
    expect(random.next()).toBe(1196435762 / 4294967296);
  });
  it.each([-1, 0.1, NaN, Infinity, 4294967296])(
    "rejects invalid seed %s",
    (seed) => {
      expect(() => createSeededRandom(seed)).toThrow(RangeError);
    },
  );
});
describe("domain identity", () => {
  it("resolves team membership entirely by IDs", () => {
    const assignment = { driverId: "driver-1", teamId: "team-1" };
    expect(isAssignedToTeam(assignment, "team-1")).toBe(true);
    expect(isAssignedToTeam(assignment, "team-2")).toBe(false);
  });
  it.each(["", " ", " team-1"])("rejects invalid ID '%s'", (id) => {
    expect(() => assertEntityId(id)).toThrow("Entity ID");
  });
});
describe("dashboard application boundary", () => {
  it("reads development data through its repository", async () => {
    const result = await getDashboard(
      developmentDashboardRepository,
      "team-dev-001",
    );
    expect(result.team?.shortName).toBe("DEV");
    expect(result.event?.id).toBe("event-dev-001");
  });
  it("preserves missing records for explicit empty states", async () => {
    const repository: DashboardRepository = {
      findTeam: async () => null,
      getNextEvent: async () => null,
    };
    expect(await getDashboard(repository, "missing")).toEqual({
      team: null,
      event: null,
    });
  });
  it("rejects invalid IDs before touching persistence", async () => {
    await expect(
      getDashboard(developmentDashboardRepository, ""),
    ).rejects.toThrow("Entity ID");
  });
  it("propagates unexpected persistence failures", async () => {
    const repository: DashboardRepository = {
      findTeam: async () => {
        throw new Error("Storage unavailable");
      },
      getNextEvent: async () => null,
    };
    await expect(getDashboard(repository, "team-1")).rejects.toThrow(
      "Storage unavailable",
    );
  });
  it("rejects a repository returning the wrong identity", async () => {
    const repository: DashboardRepository = {
      findTeam: async () => ({ id: "wrong", name: "Example", shortName: "EX" }),
      getNextEvent: async () => null,
    };
    await expect(getDashboard(repository, "team-1")).rejects.toThrow(
      "different team ID",
    );
  });
});

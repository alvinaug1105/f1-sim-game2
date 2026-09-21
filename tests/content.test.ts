import { describe, it, expect } from "vitest";
import { developmentContent as data } from "../src/data/seed/content-development";
import {
  validateContentDataset,
  ContentValidationError,
} from "../src/game/domain/content-dataset";
import {
  assertContentId,
  InvalidContentIdError,
} from "../src/game/domain/content-repository";
const id = "00000000-0000-4000-8000-000000000999";
describe("fictional source content graph (no database required)", () => {
  it("validates the complete fictional dataset", () => {
    expect(() => validateContentDataset(data)).not.toThrow();
    expect([
      data.teams.length,
      data.drivers.length,
      data.circuits.length,
      data.seasons.length,
      data.events.length,
    ]).toEqual([2, 4, 2, 1, 2]);
  });
  it("keeps teams, drivers, circuits and seasons in their dataset", () => {
    for (const row of [
      ...data.teams,
      ...data.drivers,
      ...data.circuits,
      ...data.seasons,
    ])
      expect(row.gameDatabaseId).toBe(data.database.id);
  });
  it("keeps driver identities independent of teams", () => {
    for (const driver of data.drivers)
      expect(driver).not.toHaveProperty("teamId");
  });
  it("connects season teams, drivers and calendar by IDs", () => {
    for (const entry of data.teamEntries) {
      expect(data.teams.some((team) => team.id === entry.teamId)).toBe(true);
      expect(entry.seasonId).toBe(data.seasons[0].id);
    }
    for (const entry of data.driverEntries) {
      expect(data.drivers.some((driver) => driver.id === entry.driverId)).toBe(
        true,
      );
      expect(
        data.teamEntries.some(
          (team) =>
            team.teamId === entry.teamId && team.seasonId === entry.seasonId,
        ),
      ).toBe(true);
    }
    for (const event of data.events) {
      expect(event.seasonId).toBe(data.seasons[0].id);
      expect(
        data.circuits.some((circuit) => circuit.id === event.circuitId),
      ).toBe(true);
    }
  });
  it("allows renaming without changing relationships", () => {
    expect(() =>
      validateContentDataset({
        ...data,
        teams: data.teams.map((team) => ({ ...team, name: "Edited team" })),
        drivers: data.drivers.map((driver) => ({
          ...driver,
          lastName: "Edited name",
        })),
      }),
    ).not.toThrow();
  });
  it("rejects a cross-database entity", () => {
    expect(() =>
      validateContentDataset({
        ...data,
        teams: [{ ...data.teams[0], gameDatabaseId: id }, data.teams[1]],
      }),
    ).toThrow("Cross-database");
  });
  it.each(["teams", "drivers", "circuits", "seasons"] as const)(
    "rejects duplicate %s keys",
    (group) => {
      const rows = [...data[group], { ...data[group][0], id }];
      expect(() => validateContentDataset({ ...data, [group]: rows })).toThrow(
        "Duplicate scoped key",
      );
    },
  );
  it("rejects a foreign driver reference", () => {
    expect(() =>
      validateContentDataset({
        ...data,
        driverEntries: [
          { ...data.driverEntries[0], driverId: id },
          ...data.driverEntries.slice(1),
        ],
      }),
    ).toThrow("foreign driver");
  });
  it("rejects a driver assignment without a participating team", () => {
    expect(() =>
      validateContentDataset({ ...data, teamEntries: [data.teamEntries[0]] }),
    ).toThrow("team entry");
  });
  it("rejects a foreign circuit reference", () => {
    expect(() =>
      validateContentDataset({
        ...data,
        events: [{ ...data.events[0], circuitId: id }],
      }),
    ).toThrow("foreign season/circuit");
  });
  it("rejects duplicate event rounds", () => {
    expect(() =>
      validateContentDataset({
        ...data,
        events: [data.events[0], { ...data.events[1], round: 1 }],
      }),
    ).toThrow("Duplicate event round");
  });
  it("rejects conflicting driver entries and car numbers", () => {
    expect(() =>
      validateContentDataset({
        ...data,
        driverEntries: [
          ...data.driverEntries,
          { ...data.driverEntries[0], id, teamId: data.teams[1].id },
        ],
      }),
    ).toThrow("Duplicate season driver");
    expect(() =>
      validateContentDataset({
        ...data,
        driverEntries: [
          data.driverEntries[0],
          { ...data.driverEntries[1], carNumber: 12 },
        ],
      }),
    ).toThrow("car number");
  });
  it("allows the same driver to join another team in a different season", () => {
    expect(() =>
      validateContentDataset({
        ...data,
        seasons: [
          ...data.seasons,
          { ...data.seasons[0], id, key: "season-2027", year: 2027 },
        ],
        teamEntries: [
          ...data.teamEntries,
          {
            ...data.teamEntries[1],
            id: "00000000-0000-4000-8000-000000000998",
            seasonId: id,
          },
        ],
        driverEntries: [
          ...data.driverEntries,
          {
            ...data.driverEntries[0],
            id: "00000000-0000-4000-8000-000000000997",
            seasonId: id,
            teamId: data.teams[1].id,
          },
        ],
      }),
    ).not.toThrow();
  });
  it("rejects reversed dates and non-positive track length", () => {
    expect(() =>
      validateContentDataset({
        ...data,
        events: [{ ...data.events[0], endDate: "2026-03-01" }],
      }),
    ).toThrow("before");
    expect(() =>
      validateContentDataset({
        ...data,
        circuits: [{ ...data.circuits[0], lengthMeters: 0 }, data.circuits[1]],
      }),
    ).toThrow(ContentValidationError);
  });
  it("rejects invalid calendar dates and country codes", () => {
    expect(() =>
      validateContentDataset({
        ...data,
        events: [{ ...data.events[0], startDate: "2026-02-30" }],
      }),
    ).toThrow("calendar date");
    expect(() =>
      validateContentDataset({
        ...data,
        teams: [{ ...data.teams[0], countryCode: "gb" }, data.teams[1]],
      }),
    ).toThrow("uppercase");
  });
  it.each(["", "team-dev-001", "not-a-uuid", ` ${id}`])(
    "rejects malformed persisted ID %s",
    (value) => {
      expect(() => assertContentId(value)).toThrow(InvalidContentIdError);
    },
  );
});

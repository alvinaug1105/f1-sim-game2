import { describe, it, expect } from "vitest";
import { developmentContent as current } from "../src/data/seed/content-development";
import previous from "./fixtures/development-content-before-naming.json";
import { validateContentDataset } from "../src/game/domain/content-dataset";
function withoutDisplayNames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDisplayNames);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["name", "shortName", "firstName", "lastName", "abbreviation"].includes(key))
    .map(([key, child]) => [key, withoutDisplayNames(child)]));
  return value;
}
describe("fictional content naming pass", () => {
  it("changes only display identity, preserving every ID, key, relationship and numeric value", () => {
    expect(current).not.toEqual(previous);
    expect(current.database).toEqual(previous.database);
    expect(withoutDisplayNames(current)).toEqual(withoutDisplayNames(previous));
  });
  it("retains a valid unique two-team, four-driver, two-circuit grid and calendar", () => {
    expect(() => validateContentDataset(current)).not.toThrow();
    for (const names of [current.teams.map(e => e.name), current.drivers.map(e => `${e.firstName} ${e.lastName}`), current.circuits.map(e => e.name)])
      expect(new Set(names).size).toBe(names.length);
    expect([current.teams.length, current.drivers.length, current.circuits.length, current.events.length]).toEqual([2, 4, 2, 2]);
  });
});

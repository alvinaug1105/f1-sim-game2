import { describe, it, expect } from "vitest";
import { developmentContent as current } from "../src/data/seed/content-development";
import previous from "./fixtures/development-content-before-naming.json";
import { validateContentDataset } from "../src/game/domain/content-dataset";
function withoutDisplayNames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDisplayNames);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["name", "shortName", "firstName", "lastName", "abbreviation", "nationalityCode", "dateOfBirth", "preferredNumber", "carNumber", "countryCode", "city", "foundedYear"].includes(key))
    .map(([key, child]) => [key, withoutDisplayNames(child)]));
  return value;
}
describe("content identity pass", () => {
  it("changes only identity metadata, preserving every ID, key, relationship and simulation numeric value", () => {
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

import beforeReal from "./fixtures/development-content-before-real-names.json";
it("private-use pass preserves pre-pass IDs, keys, colours and simulation values",()=>{expect(withoutDisplayNames(current)).toEqual(withoutDisplayNames(beforeReal));expect(current.database).toEqual(beforeReal.database);});
it("keeps real identity metadata coherent across drivers and season entries",()=>{expect(current.teams.map(t=>t.name)).toEqual(["Mercedes","Ferrari"]);expect(current.drivers.map(d=>[d.firstName,d.lastName,d.abbreviation,d.nationalityCode,d.dateOfBirth,d.preferredNumber])).toEqual([["George","Russell","RUS","GB","1998-02-15",63],["Kimi","Antonelli","ANT","IT","2006-08-25",12],["Charles","Leclerc","LEC","MC","1997-10-16",16],["Lewis","Hamilton","HAM","GB","1985-01-07",44]]);for(const d of current.drivers)expect(current.driverEntries.find(e=>e.driverId===d.id)!.carNumber).toBe(d.preferredNumber);expect(current.circuits.map(c=>[c.countryCode,c.city])).toEqual([["AU","Melbourne"],["JP","Suzuka"]]);});

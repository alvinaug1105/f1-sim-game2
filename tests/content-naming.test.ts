import { describe, it, expect } from "vitest";
import { developmentContent as current } from "../src/data/seed/content-development";
import previous from "./fixtures/development-content-before-naming.json";
import { validateContentDataset } from "../src/game/domain/content-dataset";
function withoutDisplayNames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDisplayNames);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["name", "shortName", "firstName", "lastName", "abbreviation", "nationalityCode", "dateOfBirth", "preferredNumber", "carNumber", "countryCode", "city", "foundedYear", "color", "secondaryColor"].includes(key))
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
it("private-use pass preserves pre-pass IDs, keys and simulation values (display colours are identity metadata)",()=>{expect(withoutDisplayNames(current)).toEqual(withoutDisplayNames(beforeReal));expect(current.database).toEqual(beforeReal.database);});
it("keeps real identity metadata coherent across drivers and season entries",()=>{expect(current.teams.map(t=>t.name)).toEqual(["Mercedes","Ferrari"]);expect(current.drivers.map(d=>[d.firstName,d.lastName,d.abbreviation,d.nationalityCode,d.dateOfBirth,d.preferredNumber])).toEqual([["George","Russell","RUS","GB","1998-02-15",63],["Kimi","Antonelli","ANT","IT","2006-08-25",12],["Charles","Leclerc","LEC","MC","1997-10-16",16],["Lewis","Hamilton","HAM","GB","1985-01-07",44]]);for(const d of current.drivers)expect(current.driverEntries.find(e=>e.driverId===d.id)!.carNumber).toBe(d.preferredNumber);expect(current.circuits.map(c=>[c.countryCode,c.city])).toEqual([["AU","Melbourne"],["JP","Suzuka"]]);});

describe("team display colours (pre-Phase-13 visual identity pass)", () => {
  // Looked up by stable key, never by display name: colours are data supplied per team.
  const byKey = Object.fromEntries(current.teams.map(t => [t.key, t]));
  it("gives the private-use teams real-life-inspired colours as plain data", () => {
    expect(byKey["team-nova"].color).toBe("#E10600");   // shown as Ferrari: racing red
    expect(byKey["team-aurora"].color).toBe("#00D2BE"); // shown as Mercedes: turquoise
    for (const t of current.teams) { expect(t.color).toMatch(/^#[0-9A-F]{6}$/i); expect(t.secondaryColor).toMatch(/^#[0-9A-F]{6}$/i); }
  });
  it("keeps team colours distinguishable and visible on the dark Race map", () => {
    const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
    const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
    // Map background / dark tag body: graphical objects need at least 3:1.
    for (const t of current.teams) expect(contrast(t.color, "#0c1318")).toBeGreaterThanOrEqual(3);
    expect(current.teams[0].color).not.toBe(current.teams[1].color);
  });
});


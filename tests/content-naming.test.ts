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
/**
 * Content Expansion Pass A adds rows, game-balance columns (pace / consistency / carPerformance) and reorders the
 * development calendar into 2026-season order. Everything that existed before must otherwise be unchanged: the same
 * IDs, keys, relationships and simulation values for the original teams, drivers, circuits and entries.
 */
// The Post-Phase-14 Race Dynamics pass likewise adds only the circuit Race interaction balance columns.
const PASS_A_ADDED = ["pace", "consistency", "carPerformance", "overtakingDifficulty", "dirtyAirSensitivityPermille", "drsEffectivenessPermille"], CALENDAR_ORDER = ["round", "startDate", "endDate"];
function originalSubset(fixture: Record<string, unknown>) {
  const pick = (name: string, rows: readonly Record<string, unknown>[]) => {
    const ids = new Set((fixture[name] as { id: string }[]).map(row => row.id));
    return rows.filter(row => ids.has(row.id as string)).map(row => Object.fromEntries(Object.entries(row)
      .filter(([key]) => !PASS_A_ADDED.includes(key) && !(name === "events" && CALENDAR_ORDER.includes(key)))));
  };
  const strip = (name: string) => (fixture[name] as Record<string, unknown>[]).map(row => Object.fromEntries(Object.entries(row)
    .filter(([key]) => !(name === "events" && CALENDAR_ORDER.includes(key)))));
  const names = ["teams", "drivers", "circuits", "seasons", "teamEntries", "driverEntries", "events"];
  return {
    current: withoutDisplayNames({ database: current.database, ...Object.fromEntries(names.map(n => [n, pick(n, current[n as keyof typeof current] as unknown as Record<string, unknown>[])])) }),
    fixture: withoutDisplayNames({ database: fixture.database, ...Object.fromEntries(names.map(n => [n, strip(n)])) }),
  };
}
describe("content identity pass", () => {
  it("changes only identity metadata, preserving every original ID, key, relationship and simulation numeric value", () => {
    expect(current).not.toEqual(previous);
    expect(current.database).toEqual(previous.database);
    const { current: now, fixture } = originalSubset(previous as unknown as Record<string, unknown>);
    expect(now).toEqual(fixture);
  });
  it("is a valid, unique 11-team, 22-driver, 8-circuit grid and calendar", () => {
    expect(() => validateContentDataset(current)).not.toThrow();
    for (const names of [current.teams.map(e => e.name), current.drivers.map(e => `${e.firstName} ${e.lastName}`), current.circuits.map(e => e.name)])
      expect(new Set(names).size).toBe(names.length);
    expect([current.teams.length, current.drivers.length, current.circuits.length, current.events.length]).toEqual([11, 22, 8, 8]);
  });
});

import beforeReal from "./fixtures/development-content-before-real-names.json";
it("private-use pass preserves pre-pass IDs, keys and simulation values (display colours are identity metadata)",()=>{const { current: now, fixture } = originalSubset(beforeReal as unknown as Record<string, unknown>);expect(now).toEqual(fixture);expect(current.database).toEqual(beforeReal.database);});
it("keeps real identity metadata coherent across drivers and season entries",()=>{expect(current.teams.slice(0, 2).map(t=>t.name)).toEqual(["Mercedes","Ferrari"]);expect(current.drivers.slice(0, 4).map(d=>[d.firstName,d.lastName,d.abbreviation,d.nationalityCode,d.dateOfBirth,d.preferredNumber])).toEqual([["George","Russell","RUS","GB","1998-02-15",63],["Kimi","Antonelli","ANT","IT","2006-08-25",12],["Charles","Leclerc","LEC","MC","1997-10-16",16],["Lewis","Hamilton","HAM","GB","1985-01-07",44]]);for(const d of current.drivers)expect(current.driverEntries.find(e=>e.driverId===d.id)!.carNumber).toBe(d.preferredNumber);expect(current.circuits.slice(0, 2).map(c=>[c.countryCode,c.city])).toEqual([["AU","Melbourne"],["JP","Suzuka"]]);});

describe("team display colours (real-life-inspired identity, data only)", () => {
  // Looked up by stable key, never by display name: colours are data supplied per team.
  const byKey = Object.fromEntries(current.teams.map(t => [t.key, t]));
  it("gives every team a real-life-inspired colour as plain data", () => {
    expect(byKey["team-nova"].color).toBe("#E10600");   // shown as Ferrari: racing red
    expect(byKey["team-aurora"].color).toBe("#00D2BE"); // shown as Mercedes: turquoise
    expect(byKey["team-mclaren"].color).toBe("#FF8000"); // papaya
    expect(byKey["team-aston-martin"].color).toBe("#229971"); // racing green
    for (const t of current.teams) { expect(t.color).toMatch(/^#[0-9A-F]{6}$/i); expect(t.secondaryColor).toMatch(/^#[0-9A-F]{6}$/i); }
  });
  it("keeps all 11 team colours distinct and visible on the dark Race map", () => {
    const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
    const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
    // Map background / dark tag body: graphical objects need at least 3:1.
    for (const t of current.teams) expect(contrast(t.color, "#0c1318"), t.key).toBeGreaterThanOrEqual(3);
    expect(new Set(current.teams.map(t => t.color.toUpperCase())).size).toBe(current.teams.length);
  });
});

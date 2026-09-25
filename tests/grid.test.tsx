import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { developmentContent as source } from "../src/data/seed/content-development";
import legacy from "./fixtures/development-content-before-real-names.json";
import { ContentValidationError, validateContentDataset, type ContentDataset } from "../src/game/domain/content-dataset";
import { enterNextEvent, progressSummary } from "../src/game/domain/progression";
import { developmentPerformance, entrantPerformance } from "../src/features/race/development-profiles";
import { simulatePracticeSession, startPracticeSession } from "../src/features/practice/service";
import { practiceView } from "../src/features/practice/view-model";
import { PracticeTiming } from "../src/features/practice/components";
import { startIncidentCareerRace } from "../src/features/race/service";
import { advanceRace, createRace, validateRaceInput } from "../src/simulation/race/engine";
import { timingRows } from "../src/features/race/viewer/model";
import { labelTiers } from "../src/features/race/viewer/race-view";
import { TrackMap } from "../src/features/race/viewer/track-map";
import { TimingTower } from "../src/features/race/viewer/timing-tower";
import { layoutForCircuit } from "../src/data/seed/circuit-layouts";
import { LABEL_TIER } from "../src/features/race/viewer/labels";
import { I18nProvider } from "../src/i18n/provider";
import { MemoryPracticeRepository } from "./helpers/practice";
import { careerGrid, raceRepository } from "./helpers/grid";
const html = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
/** Expected 2026 grid (identity data): team → [abbreviation, number] × 2. Test data only; never used by logic. */
const GRID: Record<string, readonly (readonly [string, number])[]> = {
  Mercedes: [["RUS", 63], ["ANT", 12]], Ferrari: [["LEC", 16], ["HAM", 44]], McLaren: [["NOR", 1], ["PIA", 81]],
  "Red Bull Racing": [["VER", 3], ["HAD", 6]], "Racing Bulls": [["LAW", 30], ["LIN", 41]], Alpine: [["GAS", 10], ["COL", 43]],
  Haas: [["OCO", 31], ["BEA", 87]], Audi: [["HUL", 27], ["BOR", 5]], Williams: [["SAI", 55], ["ALB", 23]],
  "Aston Martin": [["ALO", 14], ["STR", 18]], Cadillac: [["PER", 11], ["BOT", 77]],
};
describe("Content Expansion Pass A — source grid", () => {
  it("has 11 teams and 22 race drivers, exactly two per team, each with one active entry", () => {
    expect(source.teams).toHaveLength(11);
    const race = source.driverEntries.filter(e => e.role === "RACE_DRIVER");
    expect(race).toHaveLength(22);
    for (const team of source.teams) expect(race.filter(e => e.teamId === team.id), team.key).toHaveLength(2);
    for (const driver of source.drivers) expect(race.filter(e => e.driverId === driver.id), driver.key).toHaveLength(1);
    expect(new Set(race.map(e => e.carNumber)).size).toBe(22);
    expect(new Set(source.drivers.map(d => d.abbreviation)).size).toBe(22);
    for (const d of source.drivers) expect(d.abbreviation).toMatch(/^[A-Z]{3}$/);
  });
  it("matches the 2026 team / driver relationships, abbreviations and race numbers (NOR #1, VER #3)", () => {
    const actual = Object.fromEntries(source.teams.map(t => [t.name, source.driverEntries.filter(e => e.teamId === t.id)
      .map(e => { const d = source.drivers.find(x => x.id === e.driverId)!; return [d.abbreviation, e.carNumber] as const; })]));
    expect(actual).toEqual(GRID);
    const by = (abbreviation: string) => source.drivers.find(d => d.abbreviation === abbreviation)!;
    expect([by("NOR").preferredNumber, by("VER").preferredNumber]).toEqual([1, 3]);
  });
  it("keeps the pre-existing Mercedes/Ferrari/Albert Park/Suzuka IDs and keys (no duplicates)", () => {
    for (const [key, n] of [["team-aurora", 100], ["team-nova", 101]] as const) expect(source.teams.find(t => t.key === key)!.id).toBe(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
    expect(source.teams.filter(t => t.name === "Mercedes" || t.name === "Ferrari")).toHaveLength(2);
    expect(source.drivers.slice(0, 4).map(d => d.key)).toEqual(["driver-alex-smith", "driver-mika-lee", "driver-ren-sato", "driver-luca-moretti"]);
    expect(source.circuits.slice(0, 2).map(c => c.key)).toEqual(["circuit-silver-coast", "circuit-mountain-park"]);
  });
  it("keeps game-balance data separate, complete, in range and varied enough for a real field", () => {
    for (const e of source.teamEntries) expect(e.carPerformance).toBeGreaterThanOrEqual(0);
    for (const e of source.driverEntries) { expect(Number.isInteger(e.pace) && Number.isInteger(e.consistency)).toBe(true); }
    for (const t of source.teams) for (const k of ["pace", "consistency", "carPerformance"]) expect(t).not.toHaveProperty(k);
    for (const d of source.drivers) for (const k of ["pace", "consistency", "carPerformance"]) expect(d).not.toHaveProperty(k);
    expect(new Set(source.teamEntries.map(e => e.carPerformance)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(source.driverEntries.map(e => e.pace)).size).toBeGreaterThanOrEqual(8);
    const triple = source.driverEntries.map(e => `${e.pace}/${e.consistency}/${source.teamEntries.find(t => t.teamId === e.teamId)!.carPerformance}`);
    expect(new Set(triple).size).toBe(22); // no two cars share an identical profile
  });
  it("rejects out-of-range or half-specified balance data", () => {
    const bad = (patch: (d: ContentDataset) => ContentDataset) => expect(() => validateContentDataset(patch(structuredClone(source) as ContentDataset))).toThrow(ContentValidationError);
    bad(d => ({ ...d, teamEntries: d.teamEntries.map((e, i) => i ? e : { ...e, carPerformance: 101 }) }));
    bad(d => ({ ...d, driverEntries: d.driverEntries.map((e, i) => i ? e : { ...e, pace: 1.5 }) }));
    bad(d => ({ ...d, driverEntries: d.driverEntries.map((e, i) => i ? e : { ...e, consistency: null }) }));
  });
  it("is a data-driven 8-round development calendar in 2026 order (not the full calendar)", () => {
    const events = [...source.events].sort((a, b) => a.round - b.round);
    expect(events.map(e => e.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(events.map(e => source.circuits.find(c => c.id === e.circuitId)!.countryCode)).toEqual(["AU", "CN", "JP", "BH", "MC", "GB", "BE", "SG"]);
    for (let i = 1; i < events.length; i++) expect(events[i].startDate > events[i - 1].endDate).toBe(true);
    expect(new Set(source.events.map(e => e.circuitId)).size).toBe(8);
  });
});
describe("Career snapshot: any of the 11 teams, 2 player / 20 AI drivers", () => {
  it.each(["team-aurora", "team-nova", "team-mclaren", "team-cadillac", "team-williams"])("%s", async key => {
    const g = await careerGrid(key);
    expect([g.world.teams.length, g.world.drivers.length, g.world.circuits.length, g.world.events.length]).toEqual([11, 22, 8, 8]);
    const chosen = g.world.teams.find(t => t.id === g.playerTeamId)!;
    expect(chosen.key).toBe(key);
    expect(g.roster).toHaveLength(22);
    expect(g.roster.filter(r => r.teamId === g.playerTeamId)).toHaveLength(2);
    expect(g.roster.filter(r => r.teamId !== g.playerTeamId)).toHaveLength(20);
    expect(new Set(g.roster.filter(r => r.teamId !== g.playerTeamId).map(r => r.teamId)).size).toBe(10);
    // Balance is snapshotted into the Career, not read from the source at play time.
    for (const r of g.roster) expect(r.balance).not.toBeNull();
    for (const e of g.world.teamEntries) expect(e.carPerformance).not.toBeNull();
  });
  it("a Career from the legacy 2-team content keeps its snapshot and the exact legacy performance profile", async () => {
    const g = await careerGrid("team-aurora", legacy as unknown as ContentDataset);
    expect([g.world.teams.length, g.world.drivers.length, g.world.circuits.length, g.world.events.length]).toEqual([2, 4, 2, 2]);
    g.roster.forEach((row, index) => {
      expect(row.balance).toBeNull();
      expect(entrantPerformance(row, index)).toEqual(developmentPerformance(index, row.teamOrder));
    });
  });
  it("a new Career uses its snapshotted balance values", async () => {
    const g = await careerGrid("team-mclaren"), row = g.roster.find(r => r.abbreviation === "NOR")!;
    expect(entrantPerformance(row, 0)).toEqual({ driver: { pace: 95, consistency: 91 }, car: { performance: 94 } });
  });
});
describe("22-car Practice (real Practice service)", () => {
  it("runs 22 entrants: the player manages 2, the auto manager 20; classification reaches P22", async () => {
    const g = await careerGrid("team-cadillac");
    // Deterministic weekend/session IDs: the Practice seed and weather derive from stable identity.
    let sequence = 900;
    const progress = enterNextEvent(g.progress, progressSummary(g.progress).next!.id, () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`);
    const repo = new MemoryPracticeRepository(progress, g.roster);
    const event = progressSummary(progress).active!, p1 = [...event.weekend!.sessions].sort((a, b) => a.order - b.order)[0];
    const started = await startPracticeSession(repo, g.career.id, event.id, p1.id);
    const s = started.state!;
    expect(s.input.entrants).toHaveLength(22);
    expect(s.input.entrants.filter(e => e.controller === "PLAYER").map(e => e.teamId)).toEqual([g.playerTeamId, g.playerTeamId]);
    expect(s.input.entrants.filter(e => e.controller === "AI")).toHaveLength(20);
    // AI cars leave at staggered times from the one central engine (no per-car timers).
    const ready = s.entrants.filter((_, i) => s.input.entrants[i].controller === "AI").map(e => e.readyAtMs);
    const together = Math.max(...ready.map(t => ready.filter(x => x === t).length));
    // No synchronised mass release: at most a quarter of the AI field shares a release instant (Phase 13 stagger).
    expect(together).toBeLessThanOrEqual(5);
    expect(Math.max(...ready) - Math.min(...ready)).toBeGreaterThan(4 * 60_000);
    const view = practiceView(started);
    expect(view.entrants.filter(e => e.own)).toHaveLength(2);
    const done = await simulatePracticeSession(repo, g.career.id, event.id, p1.id);
    const finished = practiceView(done);
    expect(finished.status).toBe("FINISHED");
    expect(finished.entrants.map(e => e.position)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(finished.entrants.every(e => e.bestLapMs !== null && e.timedLaps > 0)).toBe(true);
    const table = html(<PracticeTiming view={finished} selected={finished.entrants[21].entrantId} onSelect={() => {}}/>);
    expect(table.match(/data-entrant=/g)).toHaveLength(22);
    expect(table).toContain(">22</td>");
    for (const e of finished.entrants) expect(table).toContain(e.abbreviation);
  });
});
describe("22-car Race (real Career Race start, v7)", () => {
  it("starts 22 entrants with 2 player cars; runs laps; tower shows P1–P22; all markers; labels stay prioritised", async () => {
    const g = await careerGrid("team-williams"), m = raceRepository(g);
    await startIncidentCareerRace(m.repository, g.career.id, m.eventId, {});
    let data = m.get();
    const s = data.state!;
    expect(s.simulationVersion).toBe(7);
    expect(s.input.entrants).toHaveLength(22);
    expect(() => validateRaceInput(s.input)).not.toThrow();
    expect(s.input.entrants.filter(e => e.teamId === g.playerTeamId)).toHaveLength(2);
    data = { ...data, state: advanceRace(s, 6) };
    const rows = timingRows(data);
    expect(rows).toHaveLength(22);
    expect(rows.map(r => r.entrant.position).sort((a, b) => a - b)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(rows.filter(r => r.player)).toHaveLength(2);
    expect(new Set(rows.map(r => r.abbreviation)).size).toBe(22);
    const tower = html(<TimingTower state={data.state!} rows={rows} selected={rows.find(r => r.player)!.id} onSelect={() => {}} interval={false} onInterval={() => {}}/>);
    expect(tower.match(/data-entrant=/g)).toHaveLength(22);
    const selected = rows.find(r => r.player)!.id, tiers = labelTiers(rows, selected, data.state!);
    const map = html(<TrackMap layout={layoutForCircuit(data.circuit.sourceCircuitId)} rows={rows} selected={selected} onSelect={() => {}} speed={1} reduceMotion tiers={tiers}/>);
    expect(map.match(/data-car=/g)).toHaveLength(22);
    const labels = map.match(/data-label=/g)?.length ?? 0;
    expect(labels).toBeGreaterThanOrEqual(2);
    expect(labels).toBeLessThan(22);                 // ordinary AI cars are marker-only
    for (const r of rows.filter(x => x.player)) expect(tiers.get(r.id)).toBeLessThanOrEqual(LABEL_TIER.PLAYER);
  });
  it("replays identically from the same Career snapshot and seed (determinism)", async () => {
    const run = async () => { const g = await careerGrid("team-mclaren"), m = raceRepository(g); await startIncidentCareerRace(m.repository, g.career.id, m.eventId, {}, 1234); return advanceRace(m.get().state!, 10); };
    const [a, b] = [await run(), await run()];
    // Storage IDs differ per Career; compare by grid slot (same snapshot order), position and time.
    const summary = (r: typeof a) => r.entrants.map(e => [r.input.entrants.findIndex(x => x.entrantId === e.entrantId), e.position, e.elapsedTimeMs, e.completedLaps]);
    expect(summary(a)).toEqual(summary(b));
    expect(new Set(summary(a).map(x => x[2])).size).toBeGreaterThan(15); // a spread field, not a synchronised pack
    expect(createRace(a.input).entrants).toHaveLength(22);
  });
});

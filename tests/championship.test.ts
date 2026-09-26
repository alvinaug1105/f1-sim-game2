import { describe, expect, it } from "vitest";
import {
  POINT_UNITS,
  computeStandings,
  isSeasonComplete,
  countGreenLaps,
  grandPrixEligible,
  hasAuthoritativeGrandPrix,
  pointsTable,
  reachedCutoffs,
  scoreSession,
  scoringRulesOf,
  seasonHistory,
  weekendPoints,
  type ChampionshipInput,
  type ClassifiedEntry,
  type ScoredRound,
  type SessionClassification,
} from "../src/game/domain/championship";
const GP = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT = [8, 7, 6, 5, 4, 3, 2, 1];
const pts = (units: number) => units / POINT_UNITS;
/** A classification of `order` (driver IDs, winner first); team = `t-<driver>` unless given. */
function classified(order: readonly string[], teamOf: (d: string) => string = (d) => `t-${d}`, laps: { leader: number; scheduled: number; green?: number } = { leader: 20, scheduled: 20 }): SessionClassification {
  return { scheduledLaps: laps.scheduled, leaderLaps: laps.leader, leaderGreenLaps: laps.green ?? laps.leader, entries: order.map((driverId, i) => ({ driverId, teamId: teamOf(driverId), position: i + 1 })) };
}
/** An all-green distance unless `green` says otherwise. */
const dist = (leaderLaps: number, scheduledLaps: number, leaderGreenLaps = leaderLaps) => ({ leaderLaps, scheduledLaps, leaderGreenLaps });
const field = (n: number) => Array.from({ length: n }, (_, i) => `d${String(i + 1).padStart(2, "0")}`);
function round(r: number, race: SessionClassification | null, extra: Partial<ScoredRound> = {}): ScoredRound {
  return { eventId: `e${r}`, round: r, sprint: null, race, qualifying: null, ...extra };
}
function input(rounds: readonly ScoredRound[], drivers: readonly string[] = [], teamOf: (d: string) => string = (d) => `t-${d}`): ChampionshipInput {
  return { version: "F1_2026", rounds, drivers: drivers.map((id) => ({ id, teamId: teamOf(id) })), teams: [...new Set(drivers.map(teamOf))] };
}
describe("2026 points tables", () => {
  it("Grand Prix: 25-18-15-12-10-8-6-4-2-1 at full distance, nothing from P11", () => {
    expect(pointsTable("F1_2026", "RACE", dist(57, 57))).toEqual(GP);
    const scored = scoreSession("F1_2026", "RACE", classified(field(22)));
    expect(scored.map((e) => pts(e.units))).toEqual([...GP, ...Array(12).fill(0)]);
  });
  it("Sprint: 8-7-6-5-4-3-2-1 — P8 scores 1, P9 scores 0", () => {
    const scored = scoreSession("F1_2026", "SPRINT", classified(field(22)));
    expect(scored.map((e) => pts(e.units))).toEqual([...SPRINT, ...Array(14).fill(0)]);
    expect(pts(scored[7].units)).toBe(1);
    expect(pts(scored[8].units)).toBe(0);
  });
  it("no fastest-lap point: a full Grand Prix awards exactly 101 points and a Sprint exactly 36", () => {
    const sum = (kind: "RACE" | "SPRINT") => scoreSession("F1_2026", kind, classified(field(22))).reduce((a, e) => a + e.units, 0);
    expect(pts(sum("RACE"))).toBe(101);
    expect(pts(sum("SPRINT"))).toBe(36);
  });
  it("shortened Grand Prix bands by leader distance — exact 25 / 50 / 75 % boundaries belong to the higher band", () => {
    const at = (leader: number, scheduled = 20) => pointsTable("F1_2026", "RACE", dist(leader, scheduled));
    expect(at(0)).toEqual([]);
    expect(at(1)).toEqual([]);
    expect(at(2)).toEqual([6, 4, 3, 2, 1]);
    expect(at(4)).toEqual([6, 4, 3, 2, 1]);
    expect(at(5)).toEqual([13, 10, 8, 6, 5, 4, 3, 2, 1]); // exactly 25 %
    expect(at(9)).toEqual([13, 10, 8, 6, 5, 4, 3, 2, 1]);
    expect(at(10)).toEqual([19, 14, 12, 10, 8, 6, 4, 3, 2, 1]); // exactly 50 %
    expect(at(14)).toEqual([19, 14, 12, 10, 8, 6, 4, 3, 2, 1]);
    expect(at(15)).toEqual(GP); // exactly 75 %
    expect(at(20)).toEqual(GP);
    // Non-integer thresholds: 57 laps → 25 % = 14.25, 50 % = 28.5, 75 % = 42.75.
    expect(at(14, 57)).toEqual([6, 4, 3, 2, 1]);
    expect(at(15, 57)).toEqual([13, 10, 8, 6, 5, 4, 3, 2, 1]);
    expect(at(28, 57)).toEqual([13, 10, 8, 6, 5, 4, 3, 2, 1]);
    expect(at(29, 57)).toEqual([19, 14, 12, 10, 8, 6, 4, 3, 2, 1]);
    expect(at(42, 57)).toEqual([19, 14, 12, 10, 8, 6, 4, 3, 2, 1]);
    expect(at(43, 57)).toEqual(GP);
  });
  it("A/B: fewer than 2 leader laps never score — 0 or 1 lap of 1, 2, 4 or 100 scheduled", () => {
    for (const scheduled of [1, 2, 4, 100]) {
      expect(pointsTable("F1_2026", "RACE", dist(0, scheduled))).toEqual([]);
      expect(pointsTable("F1_2026", "RACE", dist(1, scheduled))).toEqual([]);
      expect(grandPrixEligible("F1_2026", dist(1, scheduled))).toBe(false);
      expect(scoreSession("F1_2026", "RACE", classified(field(22), undefined, { leader: 1, scheduled })).every((e) => e.units === 0)).toBe(true);
    }
  });
  it("C: 2+ leader laps but fewer than 2 green-flag laps never score, whatever the distance covered", () => {
    for (const [leader, scheduled, green] of [[2, 20, 1], [2, 2, 0], [10, 20, 1], [19, 20, 1], [57, 57, 0], [60, 60, 1]]) {
      expect(grandPrixEligible("F1_2026", dist(leader, scheduled, green))).toBe(false);
      expect(pointsTable("F1_2026", "RACE", dist(leader, scheduled, green))).toEqual([]);
    }
    expect(scoreSession("F1_2026", "RACE", classified(field(22), undefined, { leader: 57, scheduled: 57, green: 1 })).every((e) => e.units === 0)).toBe(true);
  });
  it("D–G: an eligible Grand Prix (2+ laps, 2+ green) is then placed in its band; exact 25 / 50 / 75 % take the higher band", () => {
    const short = [6, 4, 3, 2, 1], q = [13, 10, 8, 6, 5, 4, 3, 2, 1], h = [19, 14, 12, 10, 8, 6, 4, 3, 2, 1];
    expect(pointsTable("F1_2026", "RACE", dist(2, 20, 2))).toEqual(short); // D: lowest band
    expect(pointsTable("F1_2026", "RACE", dist(2, 4, 2))).toEqual(h); // D: 2 of 4 laps = 50 %
    expect(pointsTable("F1_2026", "RACE", dist(2, 2, 2))).toEqual(GP); // 2 of 2 = full distance
    expect(pointsTable("F1_2026", "RACE", dist(14, 56, 2))).toEqual(q); // E: exactly 25 %
    expect(pointsTable("F1_2026", "RACE", dist(15, 60, 3))).toEqual(q);
    expect(pointsTable("F1_2026", "RACE", dist(28, 56, 2))).toEqual(h); // F: exactly 50 %
    expect(pointsTable("F1_2026", "RACE", dist(30, 60, 30))).toEqual(h);
    expect(pointsTable("F1_2026", "RACE", dist(42, 56, 2))).toEqual(GP); // G: exactly 75 %
    expect(pointsTable("F1_2026", "RACE", dist(45, 60, 40))).toEqual(GP);
    // Just below each boundary (integer comparisons, no floating percentages): 56 / 57 / 60 laps.
    expect(pointsTable("F1_2026", "RACE", dist(13, 56))).toEqual(short);
    expect(pointsTable("F1_2026", "RACE", dist(27, 56))).toEqual(q);
    expect(pointsTable("F1_2026", "RACE", dist(41, 56))).toEqual(h);
    expect(pointsTable("F1_2026", "RACE", dist(14, 60))).toEqual(short);
    expect(pointsTable("F1_2026", "RACE", dist(29, 60))).toEqual(q);
    expect(pointsTable("F1_2026", "RACE", dist(44, 60))).toEqual(h);
  });
  it("H: a normal full-distance Grand Prix still awards the standard 101 points", () => {
    for (const laps of [56, 57, 60]) expect(pts(scoreSession("F1_2026", "RACE", classified(field(22), undefined, { leader: laps, scheduled: laps })).reduce((a, e) => a + e.units, 0))).toBe(101);
  });
  it("green laps come from Safety Car / VSC periods: laps start+1 … end are neutralised; an open period runs to the flag", () => {
    expect(countGreenLaps(57, [])).toBe(57);
    expect(countGreenLaps(57, [{ startLap: 10, endLap: 14 }, { startLap: 30, endLap: 32 }])).toBe(57 - 4 - 2);
    expect(countGreenLaps(20, [{ startLap: 18, endLap: null }])).toBe(18);
    expect(countGreenLaps(4, [{ startLap: 1, endLap: null }])).toBe(1); // green only on lap 1 → ineligible
    expect(countGreenLaps(10, [{ startLap: 2, endLap: 5 }, { startLap: 4, endLap: 6 }])).toBe(6); // overlaps never double count
    expect(countGreenLaps(0, [{ startLap: 0, endLap: null }])).toBe(0);
  });
  it("Sprint scores only from 50 % of its distance (exactly 50 % scores)", () => {
    expect(pointsTable("F1_2026", "SPRINT", dist(9, 20))).toEqual([]);
    expect(pointsTable("F1_2026", "SPRINT", dist(10, 20))).toEqual(SPRINT);
    expect(pointsTable("F1_2026", "SPRINT", dist(9, 19))).toEqual([]);
    expect(pointsTable("F1_2026", "SPRINT", dist(10, 19))).toEqual(SPRINT);
    const none = scoreSession("F1_2026", "SPRINT", classified(field(22), undefined, { leader: 9, scheduled: 20 }));
    expect(none.every((e) => e.units === 0)).toBe(true);
  });
  it("rejects impossible distances and unknown rule versions; NULL means F1_2026", () => {
    expect(() => pointsTable("F1_2026", "RACE", dist(21, 20))).toThrow(RangeError);
    expect(() => pointsTable("F1_2026", "RACE", dist(1, 0))).toThrow(RangeError);
    expect(() => pointsTable("F1_2026", "RACE", dist(5, 10, 6))).toThrow(/green laps exceed/);
    expect(() => pointsTable("F1_2026", "RACE", dist(5, 10, -1))).toThrow(RangeError);
    expect(scoringRulesOf(null)).toBe("F1_2026");
    expect(scoringRulesOf(undefined)).toBe("F1_2026");
    expect(scoringRulesOf("F1_2026")).toBe("F1_2026");
    expect(() => scoringRulesOf("F1_2010")).toThrow(RangeError);
  });
  it("retired cars score from their classified position", () => {
    // The classification is authoritative; retirement status is not an input to scoring.
    const s = scoreSession("F1_2026", "RACE", classified(["a", "b", "c"]));
    expect(s.map((e) => pts(e.units))).toEqual([25, 18, 15]);
  });
});
describe("dead heats (unreachable from Race v7, which persists unique positions)", () => {
  it("a two-way dead heat shares the pooled points exactly in half points", () => {
    const entries: ClassifiedEntry[] = [
      { driverId: "a", teamId: "x", position: 1 },
      { driverId: "b", teamId: "y", position: 1 },
      { driverId: "c", teamId: "z", position: 3 },
    ];
    const s = scoreSession("F1_2026", "RACE", { scheduledLaps: 10, leaderLaps: 10, leaderGreenLaps: 10, entries });
    expect(s.map((e) => pts(e.units))).toEqual([21.5, 21.5, 15]);
    const s2 = scoreSession("F1_2026", "RACE", { scheduledLaps: 10, leaderLaps: 10, leaderGreenLaps: 10, entries: [{ driverId: "a", teamId: "x", position: 10 }, { driverId: "b", teamId: "y", position: 10 }] });
    expect(s2.map((e) => pts(e.units))).toEqual([0.5, 0.5]);
  });
  it("a wider dead heat shares when representable and refuses to round when not", () => {
    const three = (position: number) => ["a", "b", "c"].map((driverId) => ({ driverId, teamId: driverId, position }));
    expect(scoreSession("F1_2026", "RACE", { scheduledLaps: 10, leaderLaps: 10, leaderGreenLaps: 10, entries: three(4) }).map((e) => pts(e.units))).toEqual([10, 10, 10]);
    expect(() => scoreSession("F1_2026", "RACE", { scheduledLaps: 10, leaderLaps: 10, leaderGreenLaps: 10, entries: three(1) })).toThrow(/not representable/);
  });
  it("rejects a driver classified twice", () => {
    expect(() => scoreSession("F1_2026", "RACE", { scheduledLaps: 1, leaderLaps: 1, leaderGreenLaps: 1, entries: [{ driverId: "a", teamId: "x", position: 1 }, { driverId: "a", teamId: "x", position: 2 }] })).toThrow(RangeError);
  });
});
describe("Drivers' and Constructors' standings", () => {
  const teamOf = (d: string) => (d === "a" || d === "b" ? "red" : d === "c" || d === "d" ? "blue" : "green");
  it("sums Sprint + Grand Prix points per Career driver ID and both cars per team", () => {
    const rounds = [
      round(1, classified(["a", "c", "b", "d", "e"], teamOf)),
      round(2, classified(["c", "a", "d", "e", "b"], teamOf), { sprint: classified(["b", "a", "c", "d", "e"], teamOf) }),
    ];
    const s = computeStandings(input(rounds, ["a", "b", "c", "d", "e", "f"], teamOf));
    const d = Object.fromEntries(s.drivers.map((r) => [r.id, pts(r.units)]));
    expect(d).toEqual({ a: 25 + 18 + 7, c: 18 + 25 + 6, b: 15 + 10 + 8, d: 12 + 15 + 5, e: 10 + 12 + 4, f: 0 });
    const t = Object.fromEntries(s.constructors.map((r) => [r.id, pts(r.units)]));
    expect(t).toEqual({ red: d.a + d.b, blue: d.c + d.d, green: d.e + d.f });
    expect(s.drivers.reduce((a, r) => a + r.units, 0)).toBe(s.constructors.reduce((a, r) => a + r.units, 0));
    expect(s.drivers.map((r) => r.id)).toEqual(["a", "c", "b", "d", "e", "f"]);
    expect(s.drivers[0]).toMatchObject({ position: 1, tied: false, wins: 1 });
  });
  it("countback: equal points are split by Grand Prix finishes (P1 count, then P2 …), never by Sprint results", () => {
    // a: GP P1 (25). b: GP P2 (18) + Sprint P2 (7) = 25 and a Sprint win elsewhere is irrelevant.
    const rounds = [
      round(1, classified(["a", "b", "c"]), { sprint: classified(["c", "b", "a"], undefined, { leader: 5, scheduled: 20 }) }),
      round(2, classified(["c", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9", "x10", "a"]), { sprint: classified(["c", "b", "x1"]) }),
    ];
    const s = computeStandings(input(rounds, ["a", "b", "c"]));
    const a = s.drivers.find((r) => r.id === "a")!, b = s.drivers.find((r) => r.id === "b")!;
    expect(pts(a.units)).toBe(25);
    expect(pts(b.units)).toBe(25);
    expect(a.position).toBeLessThan(b.position);
    expect(a.tied || b.tied).toBe(false);
    expect(a.raceCountback[0]).toBe(1);
  });
  it("countback compares the next position when wins are equal", () => {
    // a and b each finish P2 once and P3 once: equal points and identical Grand Prix vectors.
    const rounds = [
      round(1, classified(["c", "a", "b", "e", "f", "g", "h", "i", "j", "k"])),
      round(2, classified(["c", "b", "a", "e", "f", "g", "h", "i", "j", "k"])),
    ];
    const s = computeStandings(input(rounds));
    const a = s.drivers.find((r) => r.id === "a")!, b = s.drivers.find((r) => r.id === "b")!;
    expect(a.units).toBe(b.units);
    expect(a.raceCountback).toEqual([0, 1, 1]);
    expect(a.tied && b.tied).toBe(true); // identical vectors, no Qualifying → perfect tie
    expect(a.position).toBe(b.position);
  });
  it("then Grand Prix Qualifying countback — Sprint Qualifying is not an input and never counts", () => {
    const rounds = [
      round(1, classified(["c", "a", "b"]), { qualifying: [{ driverId: "b", teamId: "t-b", position: 1 }, { driverId: "a", teamId: "t-a", position: 2 }, { driverId: "c", teamId: "t-c", position: 3 }] }),
      round(2, classified(["c", "b", "a"]), { qualifying: [{ driverId: "a", teamId: "t-a", position: 1 }, { driverId: "b", teamId: "t-b", position: 2 }, { driverId: "c", teamId: "t-c", position: 3 }] }),
    ];
    let s = computeStandings(input(rounds));
    let a = s.drivers.find((r) => r.id === "a")!, b = s.drivers.find((r) => r.id === "b")!;
    expect(a.units).toBe(b.units);
    expect(a.tied && b.tied).toBe(true); // one Qualifying P1 each → still perfectly tied
    const third = round(3, classified(["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9", "z10", "a", "b"]), { qualifying: [{ driverId: "b", teamId: "t-b", position: 3 }, { driverId: "a", teamId: "t-a", position: 4 }] });
    s = computeStandings(input([...rounds, third]));
    a = s.drivers.find((r) => r.id === "a")!;
    b = s.drivers.find((r) => r.id === "b")!;
    // Round 3: a P11 and b P12 in the race → a ahead on race countback despite b's better Qualifying.
    expect(a.position).toBeLessThan(b.position);
    const fourth = round(3, classified(["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9", "z10", "b", "a"]), { qualifying: [{ driverId: "b", teamId: "t-b", position: 3 }, { driverId: "a", teamId: "t-a", position: 4 }] });
    s = computeStandings(input([...rounds, fourth]));
    expect(s.drivers.find((r) => r.id === "b")!.position).toBeLessThan(s.drivers.find((r) => r.id === "a")!.position);
    // Equal race vectors (P11 + P12 swapped away): Qualifying decides.
    const fifth = [round(3, classified(["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9", "z10"]), { qualifying: [{ driverId: "b", teamId: "t-b", position: 3 }, { driverId: "a", teamId: "t-a", position: 4 }] })];
    s = computeStandings(input([...rounds, ...fifth]));
    a = s.drivers.find((r) => r.id === "a")!;
    b = s.drivers.find((r) => r.id === "b")!;
    expect(b.position).toBeLessThan(a.position);
    expect(a.tied || b.tied).toBe(false);
  });
  it("a perfect tie shares the position, is flagged, and renders in stable ID order", () => {
    const s = computeStandings(input([round(1, classified(["a", "b"])), round(2, classified(["b", "a"]))], ["b", "a", "c"]));
    const [first, second, third] = s.drivers;
    expect([first.id, second.id]).toEqual(["a", "b"]);
    expect(first).toMatchObject({ position: 1, tied: true });
    expect(second).toMatchObject({ position: 1, tied: true });
    expect(third).toMatchObject({ id: "c", position: 3, tied: false });
  });
  it("constructors use their cars' combined countback", () => {
    const teamOf = (d: string) => ({ a: "x", b: "x", c: "y", d: "y" })[d]!;
    // x: P1 + P4 = 37; y: P2 + P3 = 33 …; round 2 y: P1 + P4, x: P2 + P3 → 70 each; x has 1 win + P2 + P3 + P4, y same.
    const rounds = [round(1, classified(["a", "c", "d", "b"], teamOf)), round(2, classified(["c", "a", "b", "d"], teamOf))];
    const s = computeStandings(input(rounds, ["a", "b", "c", "d"], teamOf));
    expect(s.constructors.map((r) => [r.id, pts(r.units), r.raceCountback])).toEqual([["x", 70, [1, 1, 1, 1]], ["y", 70, [1, 1, 1, 1]]]);
    expect(s.constructors.every((r) => r.tied && r.position === 1)).toBe(true);
    expect(s.constructors[0].wins).toBe(1);
  });
  it("transfer-safe: each result scores for the team the car was entered for at that event", () => {
    const rounds = [
      round(1, { scheduledLaps: 10, leaderLaps: 10, leaderGreenLaps: 10, entries: [{ driverId: "a", teamId: "old", position: 1 }, { driverId: "b", teamId: "new", position: 2 }] }),
      round(2, { scheduledLaps: 10, leaderLaps: 10, leaderGreenLaps: 10, entries: [{ driverId: "a", teamId: "new", position: 1 }, { driverId: "b", teamId: "old", position: 2 }] }),
    ];
    const s = computeStandings({ version: "F1_2026", rounds, drivers: [{ id: "a", teamId: "old" }, { id: "b", teamId: "new" }], teams: ["old", "new"] });
    expect(s.constructors.map((r) => [r.id, pts(r.units)])).toEqual([["new", 43], ["old", 43]]);
    expect(s.drivers.find((r) => r.id === "a")!.teamId).toBe("new");
    expect(s.drivers.find((r) => r.id === "b")!.teamId).toBe("old");
  });
});
describe("cutoffs, movement and history", () => {
  const rounds = [
    round(1, classified(["a", "b", "c"])),
    round(2, classified(["c", "b", "a"]), { sprint: classified(["b", "c", "a"]) }),
    round(3, classified(["b", "a", "c"])),
  ];
  const all = input(rounds, ["a", "b", "c"]);
  const points = (c: Parameters<typeof computeStandings>[1]) => Object.fromEntries(computeStandings(all, c).drivers.map((r) => [r.id, pts(r.units)]));
  it("before a round / after its Sprint / after its Grand Prix — never beyond the cutoff", () => {
    expect(points({ round: 1, stage: "BEFORE" })).toEqual({ a: 0, b: 0, c: 0 });
    expect(computeStandings(all, { round: 1, stage: "BEFORE" }).through).toBeNull();
    expect(points({ round: 1, stage: "RACE" })).toEqual({ a: 25, b: 18, c: 15 });
    expect(points({ round: 2, stage: "BEFORE" })).toEqual({ a: 25, b: 18, c: 15 });
    expect(points({ round: 2, stage: "SPRINT" })).toEqual({ a: 25 + 6, b: 18 + 8, c: 15 + 7 });
    expect(points({ round: 2, stage: "RACE" })).toEqual({ a: 31 + 15, b: 26 + 18, c: 22 + 25 });
    expect(points(null)).toEqual({ a: 46 + 18, b: 44 + 25, c: 47 + 15 });
    expect(computeStandings(all, { round: 2, stage: "SPRINT" }).through).toEqual({ round: 2, stage: "SPRINT" });
    expect(reachedCutoffs(rounds)).toEqual([{ round: 1, stage: "RACE" }, { round: 2, stage: "SPRINT" }, { round: 2, stage: "RACE" }, { round: 3, stage: "RACE" }]);
  });
  it("only completed sessions are supplied, so a live weekend's Sprint counts and its unfinished Grand Prix does not", () => {
    const live = input([rounds[0], { ...rounds[1], race: null }], ["a", "b", "c"]);
    expect(computeStandings(live).through).toEqual({ round: 2, stage: "SPRINT" });
    expect(computeStandings(live).drivers.find((r) => r.id === "a")!.units).toBe(31 * 2);
  });
  it("movement is against the standings before the latest round; the first round has none", () => {
    const r1 = computeStandings(all, { round: 1, stage: "RACE" });
    expect(r1.drivers.every((r) => r.movement === null && r.previousPosition === null)).toBe(true);
    const r2 = computeStandings(all, { round: 2, stage: "RACE" });
    const m = Object.fromEntries(r2.drivers.map((r) => [r.id, [r.position, r.previousPosition, r.movement]]));
    expect(m).toEqual({ c: [1, 3, "UP"], a: [2, 1, "DOWN"], b: [3, 2, "DOWN"] });
    const s2 = computeStandings(all, { round: 2, stage: "SPRINT" });
    expect(Object.fromEntries(s2.drivers.map((r) => [r.id, r.movement]))).toEqual({ a: "SAME", b: "SAME", c: "SAME" });
  });
  it("per-round results and season history scale with the calendar (24 rounds)", () => {
    const many = Array.from({ length: 24 }, (_, i) => round(i + 1, classified(i % 2 ? ["b", "a"] : ["a", "b"])));
    const s = computeStandings(input(many, ["a", "b"]));
    expect(s.drivers[0].rounds).toHaveLength(24);
    expect(s.drivers.find((r) => r.id === "a")!.rounds[0]).toEqual({ eventId: "e1", round: 1, sprint: null, race: { position: 1, units: 50 } });
    const history = seasonHistory(input(many, ["a", "b"]));
    expect(history).toHaveLength(24);
    expect(history[0].driverLeaders).toEqual(["a"]);
    expect(history[1].driverLeaders).toEqual(["a", "b"]); // a perfect tie after round 2
  });
  it("weekend points and season completion", () => {
    const w = weekendPoints("F1_2026", rounds[1]);
    expect(Object.fromEntries([...w].map(([id, p]) => [id, [p.sprint && pts(p.sprint), p.race && pts(p.race), pts(p.total)]]))).toEqual({ b: [8, 18, 26], c: [7, 25, 32], a: [6, 15, 21] });
    const real = classified(["a", "b"]), empty = { ...real, entries: [] };
    expect(isSeasonComplete([])).toBe(false);
    expect(isSeasonComplete([{ race: real }, { race: null }])).toBe(false);
    expect(isSeasonComplete([{ race: real }, { race: empty }])).toBe(false); // no classified car is no result
    expect(isSeasonComplete([{ race: real }, { race: real }])).toBe(true);
    expect(hasAuthoritativeGrandPrix(round(1, null, { sprint: real }))).toBe(false); // a Sprint never completes a round
    // An ineligible (zero-point) Grand Prix is still an authoritative result.
    expect(isSeasonComplete([{ race: classified(["a"], undefined, { leader: 1, scheduled: 50 }) }])).toBe(true);
  });
  it("is order-independent and deterministic", () => {
    const shuffled = input([rounds[2], rounds[0], rounds[1]], ["c", "b", "a"]);
    expect(computeStandings(shuffled)).toEqual(computeStandings(all));
    expect(computeStandings(all, { round: 2, stage: "SPRINT" })).toEqual(computeStandings(all, { round: 2, stage: "SPRINT" }));
  });
});

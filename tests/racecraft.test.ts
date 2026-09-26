import { describe, expect, it } from "vitest";
import { racecraftInput, laps, carModes, type RacecraftScenario } from "./helpers/racecraft";
import { modes } from "./helpers/commands";
import { createRace, advanceRaceLap, simulateRace } from "../src/simulation/race/engine";
import { chooseAiCommands } from "../src/simulation/race/commands/policy";
import { defaultRacecraftConfiguration, validateRacecraftConfiguration } from "../src/simulation/race/traffic/racecraft";
import { validateCommandConfiguration } from "../src/simulation/race/commands/model";
import type { RaceSimulationState } from "../src/simulation/race/types";
import type { CommandState } from "../src/simulation/race/commands/model";
const MIN_GAP = 80;
/** How many of 100 seeds see the car starting second pass the car starting first within the race. */
function passRate(o: RacecraftScenario, prepare?: (s: RaceSimulationState) => RaceSimulationState) {
  let passed = 0;
  for (let seed = 0; seed < 100; seed++) {
    const states = laps(racecraftInput({ laps: 12, gapMs: 600, ...o, seed }), prepare);
    if (states.some(s => s.entrants[0].entrantId !== s.input.entrants[0].entrantId)) passed++;
  }
  return passed;
}
/** Share of close laps (≤ 1 s) on which the follower sits exactly on the physical minimum gap. */
function exactFloorShare(o: RacecraftScenario) {
  let close = 0, exact = 0;
  for (let seed = 0; seed < 50; seed++) for (const s of laps(racecraftInput({ laps: 12, gapMs: 600, ...o, seed }))) {
    const gap = s.entrants[1].intervalToAheadMs;
    if (gap !== null && gap <= 1000) { close++; if (gap === MIN_GAP) exact++; }
  }
  return exact / close;
}
function assertOrder(s: RaceSimulationState) {
  expect(s.entrants.map(e => e.position)).toEqual(s.entrants.map((_, i) => i + 1));
  expect(new Set(s.entrants.map(e => e.entrantId)).size).toBe(s.entrants.length);
  for (const e of s.entrants.slice(1)) if (e.intervalToAheadMs !== null) expect(e.intervalToAheadMs).toBeGreaterThanOrEqual(MIN_GAP);
  for (const e of s.entrants) if (e.gapToLeaderMs !== null) expect(e.gapToLeaderMs).toBeGreaterThanOrEqual(0);
}
describe("racecraft configuration", () => {
  it("is frozen into the command profile JSON and validated (no schema change)", () => {
    const c = defaultRacecraftConfiguration();
    expect(() => validateRacecraftConfiguration(c)).not.toThrow();
    expect(() => validateRacecraftConfiguration({ ...c, pressureCapMs: -1 })).toThrow(RangeError);
    const commands = racecraftInput().commands!;
    expect(() => validateCommandConfiguration(commands)).not.toThrow();
    expect(() => validateCommandConfiguration({ ...commands, racecraft: { ...c, aiOvertakeCharge: 5000 } })).toThrow(RangeError);
  });
});
describe("controlled gap: soft following instead of the exact 80 ms floor", () => {
  it("a faster car held in traffic is no longer pinned at exactly the minimum gap", () => {
    const held: RacecraftScenario = { paceMs: [0, -300], difficulty: 70 };
    const legacy = exactFloorShare({ ...held, racecraft: false }), racecraft = exactFloorShare(held);
    expect(legacy).toBeGreaterThan(0.2);                                    // legacy: a frozen queue at exactly 80 ms
    expect(racecraft).toBeLessThan(legacy / 5);
  });
  it("order stays valid: positions 1..n, no negative gaps, every interval at least the physical minimum", () => {
    for (let seed = 0; seed < 10; seed++) for (const s of laps(racecraftInput({ count: 8, seed, laps: 20, gapMs: 300, paceMs: [0, -250, -500, 100, -700, -200, -900, 0], drs: true }))) assertOrder(s);
  });
  it("equal or slower pace never earns an attack, with or without DRS", () => {
    expect(passRate({ paceMs: [0, 0], drs: true })).toBe(0);
    expect(passRate({ paceMs: [0, 150], drs: true })).toBe(0);
  });
  it("a larger pace edge passes more often; a small edge is not a guaranteed pass", () => {
    const small = passRate({ paceMs: [0, -250] }), large = passRate({ paceMs: [0, -400] });
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(100);
    expect(large).toBeGreaterThan(small);
  });
});
describe("DRS versus dirty air", () => {
  it("A (equal pace + DRS) < B (real pace, no DRS) < C (real pace + DRS)", () => {
    const a = passRate({ paceMs: [0, 0], drs: true }), b = passRate({ paceMs: [0, -250] }), c = passRate({ paceMs: [0, -250], drs: true });
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThan(100);                                            // still not automatic
  });
  it("a harder circuit (higher overtaking difficulty) passes less often for the same edge", () => {
    expect(passRate({ paceMs: [0, -250], drs: true, difficulty: 70 })).toBeLessThan(passRate({ paceMs: [0, -250], drs: true }));
  });
});
describe("player commands", () => {
  const attack: Partial<CommandState> = { paceMode: "ATTACK", ersMode: "OVERTAKE" };
  it("free air: ATTACK/OVERTAKE gives exactly the same lap as before (no buff)", () => {
    const run = (racecraft: boolean) => simulateRace(racecraftInput({ count: 1, laps: 8, racecraft })).state;
    const pushed = (racecraft: boolean) => laps(racecraftInput({ count: 1, laps: 8, racecraft }), s => modes(s, attack)).at(-1)!;
    expect(pushed(true).entrants[0].elapsedTimeMs).toBe(pushed(false).entrants[0].elapsedTimeMs);
    expect(run(true).entrants[0].elapsedTimeMs).toBe(run(false).entrants[0].elapsedTimeMs);
    expect(pushed(true).entrants[0].elapsedTimeMs).toBeLessThan(run(true).entrants[0].elapsedTimeMs);
  });
  it("in traffic, ATTACK + OVERTAKE creates real threat from equal pace, but can still fail; ERS limits still apply", () => {
    const standard = passRate({ paceMs: [0, 0], drs: true });
    const attacking = passRate({ paceMs: [0, 0], drs: true }, s => carModes(s, attack, 1));
    expect(standard).toBe(0);
    expect(attacking).toBeGreaterThan(standard);
    // Each attempt is still one draw against the defender: some attempts fail (and cost the attacker time).
    let attempts = 0, failed = 0;
    for (let seed = 0; seed < 50; seed++) for (const s of laps(racecraftInput({ laps: 12, gapMs: 600, paceMs: [0, 0], drs: true, seed }), x => carModes(x, attack, 1))) {
      const t = s.entrants.find(e => e.entrantId === s.input.entrants[1].entrantId)!.track!;
      if (t.attempted) { attempts++; if (!t.passed) failed++; }
    }
    expect(failed).toBeGreaterThan(0);
    expect(failed).toBeLessThan(attempts);
    const drained = laps(racecraftInput({ paceMs: [0, 0], drs: true, laps: 12 }), s => carModes(s, attack, 1)).at(-1)!;
    const chaser = drained.entrants.find(e => e.entrantId === drained.input.entrants[1].entrantId)!;
    expect(chaser.commands!.ersCharge).toBeLessThan(createRace(drained.input).entrants[1].commands!.ersCharge);
  });
});
describe("AI command policy", () => {
  const train = (seed: number) => racecraftInput({ count: 8, seed, laps: 25, gapMs: 400, paceMs: [0, -120, -60, -200, -30, -150, -90, -10], drs: true, ai: true });
  it("a train of AI cars is selectively aggressive: never everyone on attack commands", () => {
    let attackers = 0;
    for (let seed = 0; seed < 6; seed++) for (const s of laps(train(seed)).slice(2)) {
      const all = s.entrants.filter(e => e.commands!.paceMode === "PUSH" && e.commands!.ersMode === "OVERTAKE").length;
      expect(all).toBeLessThan(s.entrants.length - 1);
      attackers += all;
    }
    expect(attackers).toBeGreaterThan(0);                                   // attacks happen where there is a basis
  });
  it("identical mechanics for every car: renaming drivers and teams changes no choice", () => {
    const s = laps(train(3)).at(6)!;
    const renamed: RaceSimulationState = { ...s, input: { ...s.input, entrants: s.input.entrants.map((e, i) => ({ ...e, driverId: `other-driver-${i}`, teamId: `other-team-${i}` })) } };
    const choices = (x: RaceSimulationState) => chooseAiCommands(x).entrants.map(e => [e.entrantId, e.commands!.paceMode, e.commands!.ersMode]);
    expect(choices(renamed)).toEqual(choices(s));
  });
  it("the legacy policy is unchanged for Races saved without racecraft", () => {
    const s = laps({ ...train(3), commands: { ...train(3).commands!, racecraft: undefined } }).at(6)!;
    for (const e of chooseAiCommands(s).entrants) {
      const behind = s.entrants.find(x => x.position === e.position + 1), ahead = e.position > 1 && e.intervalToAheadMs !== null && e.intervalToAheadMs <= s.input.commands!.ai.battleGapMs;
      const defending = behind?.intervalToAheadMs != null && behind.intervalToAheadMs <= s.input.commands!.ai.battleGapMs;
      if (e.stint!.tyre.wearPermille < s.input.commands!.ai.highWear) expect(e.commands!.paceMode).toBe(ahead || defending ? "PUSH" : "STANDARD");
    }
  });
});
describe("determinism", () => {
  it("the same racecraft input replays identically", () => {
    const i = racecraftInput({ count: 8, seed: 9, laps: 20, gapMs: 300, paceMs: [0, -250, -500, 100, -700, -200, -900, 0], drs: true, ai: true });
    expect(simulateRace(i)).toEqual(simulateRace(i));
  });
  it("records each successful pass once as an OVERTAKE event with a public cause", () => {
    const s = simulateRace(racecraftInput({ count: 8, seed: 9, laps: 20, gapMs: 300, paceMs: [0, -250, -500, 100, -700, -200, -900, 0], drs: true, ai: true })).state;
    const events = s.incidents!.events.filter(e => e.type === "OVERTAKE");
    expect(events.length).toBe(s.entrants.reduce((n, e) => n + e.track!.overtakesCompleted, 0));
    for (const e of events) {
      expect(e.entrantIds).toHaveLength(2);
      expect(["TYRE", "ERS", "DRS", "PACE"]).toContain(e.cause);
      expect(e.timeLossMs).toBe(0);
    }
    const legacy = simulateRace(racecraftInput({ count: 8, seed: 9, laps: 20, gapMs: 300, paceMs: [0, -250, -500, 100, -700, -200, -900, 0], drs: true, racecraft: false })).state;
    expect(legacy.incidents!.events.some(e => e.type === "OVERTAKE")).toBe(false);
  });
});
void advanceRaceLap;

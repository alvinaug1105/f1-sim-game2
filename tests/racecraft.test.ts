import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { racecraftInput, laps, carModes, type RacecraftScenario } from "./helpers/racecraft";
import { modes } from "./helpers/commands";
import { createRace, advanceRaceLap, simulateRace } from "../src/simulation/race/engine";
import { chooseAiCommands } from "../src/simulation/race/commands/policy";
import { defaultRacecraftConfiguration, validateRacecraftConfiguration, type RacecraftConfiguration } from "../src/simulation/race/traffic/racecraft";
import { attackEdge } from "../src/simulation/race/traffic/model";
import { circuitInteractionConfiguration } from "../src/simulation/race/traffic/profiles";
import { validateCommandConfiguration } from "../src/simulation/race/commands/model";
import type { RaceSimulationState } from "../src/simulation/race/types";
import type { CommandState } from "../src/simulation/race/commands/model";
const MIN_GAP = 80;
const TRAIN_PACE_MS = [0, -120, -60, -200, -30, -150, -90, -10, -175, 25, -220, -50, -140, 10, -95, -245, -65, -185, 40, -130, -15, -210];
const TRAIN_PROFILES = { Monza: [18, 850, 1300], Spa: [15, 900, 1350] } as const;
function trainInput(count: number, seed: number, circuit: keyof typeof TRAIN_PROFILES, racecraft: RacecraftConfiguration = defaultRacecraftConfiguration()) {
  const base = racecraftInput({ count, seed, laps: 15, gapMs: 400, paceMs: TRAIN_PACE_MS.slice(0, count), drs: true, ai: true });
  const [overtakingDifficulty, dirtyAirSensitivityPermille, drsEffectivenessPermille] = TRAIN_PROFILES[circuit];
  return { ...base,
    interaction: { ...circuitInteractionConfiguration({ overtakingDifficulty, dirtyAirSensitivityPermille, drsEffectivenessPermille }), drsActivationLap: 1 },
    commands: { ...base.commands!, racecraft },
  };
}
function floorRuns(count: number, circuit: keyof typeof TRAIN_PROFILES) {
  let exact = 0, near = 0, close = 0, repeated = 0, longest = 0, attempts = 0, failures = 0, passes = 0;
  for (let seed = 0; seed < 50; seed++) {
    let prior = new Map<string, number>();
    for (const state of laps(trainInput(count, seed, circuit))) {
      assertOrder(state);
      const current = new Map<string, number>();
      for (let i = 1; i < state.entrants.length; i++) {
        const ahead = state.entrants[i - 1], behind = state.entrants[i];
        const gap = behind.intervalToAheadMs;
        if (gap === null) continue;
        if (gap <= 1000) close++;
        if (gap <= 100) near++;
        const key = `${ahead.entrantId}:${behind.entrantId}`;
        const length = gap === MIN_GAP ? (prior.get(key) ?? 0) + 1 : 0;
        if (gap === MIN_GAP) exact++;
        if (length > 1) repeated++;
        longest = Math.max(longest, length);
        current.set(key, length);
      }
      prior = current;
      for (const e of state.entrants) if (e.track!.attempted) { attempts++; if (e.track!.passed) passes++; else failures++; }
    }
  }
  return { exact, near, close, repeated, longest, attempts, failures, passes };
}
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
  expect(s.entrants[0].gapToLeaderMs).toBe(0);
  for (const e of s.entrants.slice(1)) if (e.intervalToAheadMs !== null) {
    expect(Number.isFinite(e.intervalToAheadMs)).toBe(true);
    expect(e.intervalToAheadMs).toBeGreaterThanOrEqual(MIN_GAP);
  }
  for (const e of s.entrants) if (e.gapToLeaderMs !== null) {
    expect(Number.isFinite(e.gapToLeaderMs)).toBe(true);
    expect(e.gapToLeaderMs).toBeGreaterThanOrEqual(0);
  }
}
describe("racecraft configuration", () => {
  it("is frozen into the command profile JSON and validated (no schema change)", () => {
    const c = defaultRacecraftConfiguration();
    expect(() => validateRacecraftConfiguration(c)).not.toThrow();
    expect(() => validateRacecraftConfiguration({ ...c, pressureCapMs: -1 })).toThrow(RangeError);
    const commands = racecraftInput().commands!;
    expect(() => validateCommandConfiguration(commands)).not.toThrow();
    expect(() => validateCommandConfiguration({ ...commands, racecraft: { ...c, aiOvertakeCharge: 5000 } })).toThrow(RangeError);
    expect(() => validateRacecraftConfiguration({ ...c, heldFollowingLossPermille: undefined })).toThrow(RangeError);
    expect(() => validateRacecraftConfiguration({ ...c, heldFollowingLossMaxMs: -1 })).toThrow(RangeError);
    expect(() => validateRacecraftConfiguration({ ...c, heldFollowingLossPermille: 1001 })).toThrow(RangeError);
  });
});
describe("DRS train floor recurrence", () => {
  it("lets eight-car and full-field trains breathe without moving the floor to 81–100 ms", () => {
    for (const circuit of ["Monza", "Spa"] as const) for (const count of [8, 22]) {
      const m = floorRuns(count, circuit);
      expect(m.exact).toBeGreaterThan(0); // brief physical-floor contact is legal
      expect(m.repeated).toBeLessThanOrEqual(2);
      expect(m.longest).toBeLessThanOrEqual(3);
      expect(m.near / m.close).toBeLessThan(count === 22 ? 0.09 : 0.04);
      expect(m.attempts).toBeGreaterThan(0);
      expect(m.failures).toBeGreaterThan(0);
      expect(m.passes).toBeGreaterThan(0);
    }
  });
  it("replays pre-repair saved Racecraft JSON exactly for multiple seeds and field sizes", () => {
    const { heldFollowingLossPermille: _share, heldFollowingLossMaxMs: _cap, ...old } = defaultRacecraftConfiguration(); void _share; void _cap;
    const expected: Record<string, string> = {
      "2-1": "b5b071b9a8fde8dc3908e01929a50c8d16e957654a574578116d85b5752bef7f",
      "2-9": "d440f753229718856ac2b96f295428ad5fd6bd2040988197ad07a464bfabe33c",
      "2-42": "dd81abdff6079c3fdef61ddead786e8aafac15ed213b328a3cf73de63306eeac",
      "8-1": "79c8d7a370aa12368e271761d13971764bcbe05897805c64d417f71f19a4c446",
      "8-9": "09aee0c1864f446b53b234b72c6862d383ba88fcc7ac629af8e467d35a16ab06",
      "8-42": "575b80610e861291dcf588f1945189cdffe645171b3cd43adf923ff642b5a1ba",
      "22-1": "28ad163f4185f665eb0e326597959294944f7feda8978a11ed8345f1928ba031",
      "22-9": "46e0d55903143d3c9f6b7e2544901795375acc12d524e23c8c0fcfcd9217fe76",
      "22-42": "cba63d865bf6acf764ce82511065416e2b9c030b89949ec8c045c55eec6c3a37",
    };
    expect(() => validateRacecraftConfiguration(old)).not.toThrow();
    for (const count of [2, 8, 22]) for (const seed of [1, 9, 42]) {
      const base = racecraftInput({ count, seed, laps: 12, gapMs: 400, paceMs: TRAIN_PACE_MS.slice(0, count), drs: true, ai: true });
      const state = simulateRace({ ...base, commands: { ...base.commands!, racecraft: old } }).state;
      expect(createHash("sha256").update(JSON.stringify(state)).digest("hex")).toBe(expected[`${count}-${seed}`]);
    }
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
  it("continuous run equals persist/reload every lap (JSON round trip), with AI defence and player commands", () => {
    const i = racecraftInput({ count: 6, seed: 4, laps: 15, gapMs: 400, paceMs: [0, -100, 50, -200, 0, -50], drs: true, ai: true });
    const player = { ...i, entrants: i.entrants.map((e, n) => n === 1 ? { ...e, strategyController: "PLAYER" as const } : e) };
    const attack = (s: RaceSimulationState) => carModes(s, { paceMode: "ATTACK", ersMode: "OVERTAKE" }, 1);
    let continuous = createRace(player), reloaded = createRace(player);
    while (continuous.status === "RUNNING") {
      continuous = advanceRaceLap(attack(continuous));
      reloaded = JSON.parse(JSON.stringify(advanceRaceLap(attack(JSON.parse(JSON.stringify(reloaded)) as RaceSimulationState)))) as RaceSimulationState;
    }
    expect(reloaded).toEqual(JSON.parse(JSON.stringify(continuous)));
  });
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

describe("command exploit repair: bounded command edge and AI closing-threat defence", () => {
  const r = defaultRacecraftConfiguration();
  const CIRCUIT = { Monaco: [85, 1500, 350], Shanghai: [25, 950, 1150], Spa: [15, 900, 1350] } as const;
  const COMMANDS: Record<string, Partial<CommandState>> = { STANDARD: {}, ATTACK: { paceMode: "ATTACK" }, OVERTAKE: { ersMode: "OVERTAKE" }, BOTH: { paceMode: "ATTACK", ersMode: "OVERTAKE" } };
  /** A player car 0.6 s behind a real AI car (same car, driver and tyres unless `paceMs` says otherwise), 10 laps. */
  function duel(circuit: keyof typeof CIRCUIT, modes: Partial<CommandState>, paceMs = 0, racecraft: RacecraftConfiguration = r) {
    const [d, dirty, drs] = CIRCUIT[circuit];
    let passed = 0, lapsToPass = 0, defended = 0, observed = 0;
    for (let seed = 0; seed < 100; seed++) {
      const base = racecraftInput({ seed, laps: 10, gapMs: 600, paceMs: [0, paceMs], drs: true });
      const input = { ...base, commands: { ...base.commands!, racecraft },
        interaction: { ...circuitInteractionConfiguration({ overtakingDifficulty: d, dirtyAirSensitivityPermille: dirty, drsEffectivenessPermille: drs }), drsActivationLap: 1 },
        entrants: base.entrants.map((e, i) => ({ ...e, strategyController: i === 0 ? "DEVELOPMENT_AI" as const : "PLAYER" as const })) };
      const states = laps(input, s => carModes(s, modes, 1)), attacker = input.entrants[1].entrantId, defender = input.entrants[0].entrantId;
      const k = states.findIndex(s => s.entrants[0].entrantId === attacker);
      if (k >= 0) { passed++; lapsToPass += k + 1; }
      for (const s of states.slice(0, k >= 0 ? k + 1 : undefined)) { observed++; const c = s.entrants.find(e => e.entrantId === defender)!.commands!; if (c.paceMode === "PUSH" || c.ersMode === "DEPLOY") defended++; }
    }
    return { passed, meanLaps: passed ? lapsToPass / passed : null, defendShare: defended / observed };
  }
  it("only a bounded share of the attacker's net command advantage counts towards the pass; real pace counts in full", () => {
    expect(attackEdge(1400, 1400, r)).toEqual({ edge: 300, excessMs: 1100 });                 // ATTACK+OVERTAKE, equal cars
    expect(attackEdge(550, 550, r)).toEqual({ edge: Math.round(550 * 0.35), excessMs: 550 - Math.round(550 * 0.35) });
    expect(attackEdge(900, 500, r).edge).toBe(400 + 175);                                        // 0.4 s real + commands
    expect(attackEdge(-300, -300, r)).toEqual({ edge: -300, excessMs: 0 });                    // a defending car's commands count in full
    // Racecraft frozen before the repair (no command fields) counts command pace in full, exactly as before.
    const { commandEdgePermille: _p, commandEdgeCapMs: _c, aiThreatEdgeMs: _t, ...before } = r; void _p; void _c; void _t;
    expect(attackEdge(1400, 1400, before)).toEqual({ edge: 1400, excessMs: 0 });
    expect(() => validateRacecraftConfiguration({ ...r, commandEdgeCapMs: undefined })).toThrow(RangeError);
  });
  it("equal pace vs a real AI car: stronger commands help, ATTACK+OVERTAKE is not a universal pass, and circuits differ", () => {
    const spa = Object.fromEntries(Object.entries(COMMANDS).map(([k, m]) => [k, duel("Spa", m)]));
    expect(spa.STANDARD.passed).toBe(0);
    expect(spa.ATTACK.passed).toBeGreaterThan(spa.STANDARD.passed);
    expect(spa.OVERTAKE.passed).toBeGreaterThan(spa.STANDARD.passed);
    expect(spa.BOTH.passed).toBeGreaterThan(Math.max(spa.ATTACK.passed, spa.OVERTAKE.passed));
    expect(spa.BOTH.passed).toBeLessThan(75);
    const monaco = duel("Monaco", COMMANDS.BOTH), shanghai = duel("Shanghai", COMMANDS.BOTH);
    expect(monaco.passed).toBeLessThan(shanghai.passed);
    expect(shanghai.passed).toBeLessThanOrEqual(spa.BOTH.passed + 10);
    // The defending AI recognises the command-driven closing threat and answers with the normal (paid-for) modes.
    expect(spa.BOTH.defendShare).toBeGreaterThan(0.5);
    expect(spa.STANDARD.defendShare).toBe(0);
    // Before the repair the same duel was a near-certain pass.
    const { commandEdgePermille: _p, commandEdgeCapMs: _c, aiThreatEdgeMs: _t, ...before } = r; void _p; void _c; void _t;
    expect(duel("Spa", COMMANDS.BOTH, 0, before).passed).toBeGreaterThan(95);
  });
  it("a genuine pace edge amplified by commands still passes, even at Monaco sometimes", () => {
    expect(duel("Spa", COMMANDS.BOTH, -400).passed).toBeGreaterThan(90);
    expect(duel("Spa", COMMANDS.ATTACK, -800).passed).toBeGreaterThan(95);
    const monaco = duel("Monaco", COMMANDS.BOTH, -400).passed;
    expect(monaco).toBeGreaterThan(10);
    expect(monaco).toBeLessThan(duel("Spa", COMMANDS.BOTH, -400).passed);
  });
  it("AI threat detection reads Race state only: the same attack commands from any car behind trigger the same defence", () => {
    const i = racecraftInput({ count: 3, laps: 10, gapMs: 400, paceMs: [0, 0, 0], ai: true });
    let s = laps(i).at(2)!;
    const order = [...s.entrants].sort((a, b) => a.position - b.position), leader = order[0], chaser = order[1];
    s = { ...s, entrants: s.entrants.map(e => e.entrantId === chaser.entrantId ? { ...e, intervalToAheadMs: 400, commands: { ...e.commands!, paceMode: "ATTACK", ersMode: "OVERTAKE", ersCharge: 700 } } : e.entrantId === leader.entrantId ? { ...e, commands: { ...e.commands!, ersCharge: 700 } } : e) };
    const modesOf = (x: RaceSimulationState) => { const e = chooseAiCommands(x).entrants.find(e => e.entrantId === leader.entrantId)!.commands!; return [e.paceMode, e.ersMode]; };
    expect(modesOf(s)).toEqual(["PUSH", "DEPLOY"]);
    const renamed: RaceSimulationState = { ...s, input: { ...s.input, entrants: s.input.entrants.map((e, n) => ({ ...e, driverId: `x-${n}`, teamId: `y-${n}` })) } };
    expect(modesOf(renamed)).toEqual(modesOf(s));
    // No threat (neutral commands behind) → the leader runs its normal race.
    const calm = { ...s, entrants: s.entrants.map(e => e.entrantId === chaser.entrantId ? { ...e, commands: { ...e.commands!, paceMode: "STANDARD" as const, ersMode: "NEUTRAL" as const } } : e) };
    expect(modesOf(calm)).toEqual(["STANDARD", "NEUTRAL"]);
    // An empty battery is not a threat and cannot defend: the costs are the same for everyone.
    const flat = { ...s, entrants: s.entrants.map(e => e.entrantId === chaser.entrantId ? { ...e, commands: { ...e.commands!, paceMode: "STANDARD" as const, ersCharge: 0 } } : e) };
    expect(modesOf(flat)).toEqual(["STANDARD", "NEUTRAL"]);
  });
});

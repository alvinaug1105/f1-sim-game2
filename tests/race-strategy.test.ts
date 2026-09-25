import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { advanceRace, advanceRaceLap, createRace } from "../src/simulation/race/engine";
import { committedStops } from "../src/simulation/race/pits/model";
import { weatherPitChoice } from "../src/simulation/race/weather/policy";
import { aiDryStartingCompound, assessAiStop, defaultAiStrategyConfiguration, dryCompound, publicWeather, releaseTraffic, strategyPreference, validateAiStrategyConfiguration, type StrategyPreference } from "../src/simulation/race/pits/ai-strategy";
import { validatePitConfiguration } from "../src/simulation/race/pits/profiles";
import { developmentWeather, type WeatherConfiguration } from "../src/simulation/race/weather/model";
import { TYRE_COMPOUNDS, type TyreCompound } from "../src/simulation/race/tyres/model";
import type { RaceSimulationState } from "../src/simulation/race/types";
import { neutralise } from "./helpers/incidents";
import { NEUTRAL, assess, strategyRace } from "./helpers/race-dynamics";

const EARLY: StrategyPreference = { ...NEUTRAL, stopBias: -1 }, LONG: StrategyPreference = { ...NEUTRAL, stopBias: 1 };
/** First lap at which the policy would call car `index` in (the car itself never stops: a pure what-if walk). */
function firstCall(s: RaceSimulationState, preference: StrategyPreference, index = 0) {
  for (; s.status === "RUNNING" && s.lap < s.input.totalLaps - 1; s = advanceRaceLap(s))
    if (assess(s, s.entrants[index], preference).compound) return { lap: s.lap, compound: assess(s, s.entrants[index], preference).compound! };
  return null;
}
/** Walk to the first checkpoint where the neutral car is inside its window but not yet stopping (gain between floor and stop point). */
function insideWindow(count: number) {
  let s = strategyRace(count);
  for (; s.lap < 50; s = advanceRaceLap(s)) {
    const a = assess(s, s.entrants[0], NEUTRAL);
    if (a.reason === "HOLD" || a.reason === "WINDOW") return s;
  }
  throw new Error("window never opened");
}
const softness = (c: TyreCompound) => TYRE_COMPOUNDS.indexOf(c as (typeof TYRE_COMPOUNDS)[number]);

describe("AI pit strategy — deterministic window with per-car character", () => {
  it("identical conditions, different character: earlier bias < neutral < longer-stint bias (no single synchronised lap)", () => {
    const [early, neutral, long] = [EARLY, NEUTRAL, LONG].map(p => firstCall(strategyRace(1), p)!);
    expect(early.lap).toBeLessThan(neutral.lap);
    expect(neutral.lap).toBeLessThan(long.lap);
    // A window, not a lottery: the whole spread stays within a handful of laps of the neutral point.
    expect(long.lap - early.lap).toBeLessThanOrEqual(10);
  });
  it("a stop is a candidate only once the tyre is becoming worth replacing (fresh tyres never stop)", () => {
    const s = strategyRace(1);
    for (const p of [EARLY, NEUTRAL, LONG]) expect(assess(advanceRace(s, 8), advanceRace(s, 8).entrants[0], p)).toMatchObject({ compound: null, reason: "NO_WINDOW" });
  });
  it("clean-air release: an empty rejoin gap lowers the stop point; a busy rejoin raises it and can hold the car out", () => {
    const s = insideWindow(4), e = s.entrants.find(x => x.position === 1)!, loss = s.input.pits!.pitLaneLossMs + s.input.pits!.stationaryBaseMs;
    const place = (offsets: number[]) => ({ ...s, entrants: s.entrants.map(x => x.entrantId === e.entrantId ? x : { ...x, elapsedTimeMs: e.elapsedTimeMs + loss + offsets[s.entrants.indexOf(x) % offsets.length] }) });
    const clean = place([9000, 12000, 15000]), busy = place([-400, 150, 700]);
    expect(releaseTraffic(clean, e, loss, 1500)).toBe(0);
    expect(releaseTraffic(busy, e, loss, 1500)).toBe(3);
    const a = assess(clean, e, NEUTRAL), b = assess(busy, e, NEUTRAL);
    expect(b.requiredPermille).toBeGreaterThan(a.requiredPermille);
    // Somewhere in the window the clean car goes while the same car facing traffic stays out.
    let diverged = false;
    for (let t = s; t.lap < 50 && !diverged; t = advanceRaceLap(t)) {
      const car = t.entrants.find(x => x.entrantId === e.entrantId)!;
      const at = (offsets: number[]) => ({ ...t, entrants: t.entrants.map(x => x.entrantId === car.entrantId ? x : { ...x, elapsedTimeMs: car.elapsedTimeMs + loss + offsets[t.entrants.indexOf(x) % offsets.length] }) });
      diverged = assess(at([9000, 12000, 15000]), car, NEUTRAL).compound !== null && assess(at([-400, 150, 700]), car, NEUTRAL).compound === null;
    }
    expect(diverged).toBe(true);
    // Traffic counts for more where passing is hard (circuit data, never a circuit name).
    const hard = { ...busy, input: { ...busy.input, interaction: { ...busy.input.interaction!, overtakingDifficulty: 80 } } };
    const easy = { ...busy, input: { ...busy.input, interaction: { ...busy.input.interaction!, overtakingDifficulty: 15 } } };
    expect(assess(hard, e, NEUTRAL).requiredPermille).toBeGreaterThan(assess(easy, e, NEUTRAL).requiredPermille);
    // Traffic-sensitive characters weigh it more.
    expect(assess(busy, e, { ...NEUTRAL, trafficSensitivity: 1.5 }).requiredPermille).toBeGreaterThan(assess(busy, e, { ...NEUTRAL, trafficSensitivity: 0.5 }).requiredPermille);
  });
  it("undercut: close behind a car on tyres at least as old makes an earlier stop more attractive — never with a fresher-tyred car ahead", () => {
    const s = insideWindow(4), e = s.entrants.find(x => x.position === 2)!, ahead = s.entrants.find(x => x.position === 1)!;
    const gap = (interval: number, aheadAge = ahead.stint!.tyre.ageLaps) => ({ ...s, entrants: s.entrants.map(x => x.entrantId === e.entrantId ? { ...x, intervalToAheadMs: interval } : x.entrantId === ahead.entrantId ? { ...x, stint: { ...x.stint!, tyre: { ...x.stint!.tyre, ageLaps: aheadAge } } } : x) });
    const keen = { ...NEUTRAL, undercut: 1 };
    const car = (t: RaceSimulationState) => t.entrants.find(x => x.entrantId === e.entrantId)!;
    const close = assess(gap(800), car(gap(800)), keen), neither = assess(gap(2000), car(gap(2000)), keen);
    expect(close.requiredPermille).toBeLessThan(neither.requiredPermille);
    // Rival already on much fresher tyres: no undercut to be had.
    expect(assess(gap(800, 0), car(gap(800, 0)), keen).requiredPermille).toBe(neither.requiredPermille);
    // Undercut appetite is a character trait: a car with none is unaffected.
    expect(assess(gap(800), car(gap(800)), { ...NEUTRAL, undercut: 0 }).requiredPermille).toBe(assess(gap(2000), car(gap(2000)), { ...NEUTRAL, undercut: 0 }).requiredPermille);
  });
  it("extension / overcut: clear air ahead with nobody close behind lets a car stay out longer on viable tyres", () => {
    const s = insideWindow(4), e = s.entrants.find(x => x.position === 2)!, behind = s.entrants.find(x => x.position === 3)!;
    const shape = (ahead: number, back: number) => ({ ...s, entrants: s.entrants.map(x => x.entrantId === e.entrantId ? { ...x, intervalToAheadMs: ahead } : x.entrantId === behind.entrantId ? { ...x, intervalToAheadMs: back } : x) });
    const patient = { ...NEUTRAL, undercut: 0 };
    const car = (t: RaceSimulationState) => t.entrants.find(x => x.entrantId === e.entrantId)!;
    const clear = assess(shape(6000, 4000), car(shape(6000, 4000)), patient), boxed = assess(shape(2000, 4000), car(shape(2000, 4000)), patient);
    expect(clear.requiredPermille).toBeGreaterThan(boxed.requiredPermille);
    // A car right behind removes the extension option.
    expect(assess(shape(6000, 600), car(shape(6000, 600)), patient).requiredPermille).toBeLessThan(clear.requiredPermille);
  });
  it("compound: a clearly unsuitable compound is never chosen; where plans are close the car's own preference decides", () => {
    const c = defaultAiStrategyConfiguration();
    const pick = (lap: number, compound: number) => {
      const t = advanceRace(strategyRace(1), lap), remaining = t.input.totalLaps - t.lap - 1;
      return dryCompound({ state: t, entrant: t.entrants[0], weather: t.weather!, publicWeather: publicWeather(t.input.weather!), mode: "GREEN", greenPitLaneLossMs: t.input.pits!.pitLaneLossMs }, c, { ...NEUTRAL, compound }, t.input.tyres!, remaining);
    };
    // Long run to the flag: the soft would need extra stops — no character picks it.
    for (const p of [-1, 0, 1]) expect(pick(8, p)).not.toBe("SOFT");
    let differs = false;
    for (let lap = 8; lap <= 54; lap += 2) {
      const soft = pick(lap, -1), hard = pick(lap, 1);
      expect(softness(soft)).toBeLessThanOrEqual(softness(hard));
      differs ||= soft !== hard;
    }
    expect(differs).toBe(true);
  });
  it("dry-start character: most cars start on the medium, some on the soft, none on the hard", () => {
    const starts = Array.from({ length: 200 }, (_, n) => aiDryStartingCompound(strategyPreference(7, n + 1)));
    expect(starts).not.toContain("HARD");
    expect(starts.filter(x => x === "MEDIUM").length).toBeGreaterThan(starts.filter(x => x === "SOFT").length);
    expect(starts.filter(x => x === "SOFT").length).toBeGreaterThan(0);
  });
  it("character is a stable function of Race seed and grid slot (not names, not storage IDs); a new seed reshuffles it", () => {
    expect(strategyPreference(42, 3)).toEqual(strategyPreference(42, 3));
    expect(strategyPreference(42, 3)).not.toEqual(strategyPreference(42, 4));
    expect(strategyPreference(42, 3)).not.toEqual(strategyPreference(43, 3));
    for (let n = 1; n <= 50; n++) {
      const p = strategyPreference(9, n);
      expect(p.stopBias).toBeGreaterThanOrEqual(-1); expect(p.stopBias).toBeLessThan(1);
      expect(p.undercut).toBeGreaterThanOrEqual(0); expect(p.undercut).toBeLessThan(1);
      expect(p.trafficSensitivity).toBeGreaterThanOrEqual(0.5); expect(p.trafficSensitivity).toBeLessThan(1.5);
    }
  });
  it("the policy is pure: same checkpoint → same assessment, and the state is not mutated", () => {
    const s = insideWindow(4), copy = structuredClone(s);
    expect(assess(s, s.entrants[1], NEUTRAL)).toEqual(assess(s, s.entrants[1], NEUTRAL));
    expect(s).toEqual(copy);
  });
});

describe("weather and Race Control", () => {
  function rainAt(lap: number, rainfall = 900): WeatherConfiguration {
    const c = developmentWeather(42, 58);
    return { ...c, timeline: [{ startLap: 1, rainfall: 0, airTemperatureMilliC: 24000 }, { startLap: lap, rainfall, airTemperatureMilliC: 19000 }], forecast: [{ arrivalMinLap: 1, arrivalMaxLap: 1, rainfallMin: 0, rainfallMax: 0 }, { arrivalMinLap: lap - 1, arrivalMaxLap: lap + 1, rainfallMin: rainfall - 100, rainfallMax: rainfall + 50 }] };
  }
  it("mixed: every character crosses over to a wet-weather tyre from current conditions, within a couple of laps of each other", () => {
    const calls = [EARLY, NEUTRAL, LONG].map(p => firstCall(strategyRace(1, 42, rainAt(14)), p)!);
    for (const c of calls) expect(["INTERMEDIATE", "WET"]).toContain(c.compound);
    expect(calls[0].lap).toBeLessThanOrEqual(calls[2].lap);
    expect(calls[2].lap - calls[0].lap).toBeLessThanOrEqual(3);
  });
  it("the crossover never reads the truth timeline (same result with the timeline replaced)", () => {
    const s = advanceRace(strategyRace(1, 42, rainAt(14)), 16);
    const blind = { ...s, input: { ...s.input, weather: { ...s.input.weather!, timeline: [{ startLap: 1, rainfall: 0, airTemperatureMilliC: 24000 }] } } };
    expect(assess(blind, blind.entrants[0], NEUTRAL)).toEqual(assess(s, s.entrants[0], NEUTRAL));
  });
  it("SC/VSC: a cheap stop tempts cars on worn tyres — but not the whole field, and never a car on fresh tyres", () => {
    for (const mode of ["SAFETY_CAR", "VSC"] as const) {
      // Walk one car's stint; at the first checkpoint where ANY character would take the cheap stop, not all do.
      let s = strategyRace(1), decisions: boolean[] = [];
      for (; s.lap < 50; s = advanceRaceLap(s)) {
        const sc = neutralise(s, mode);
        decisions = Array.from({ length: 21 }, (_, n) => assess(sc, sc.entrants[0], { ...NEUTRAL, stopBias: -1 + n / 10 }).compound !== null);
        if (decisions.some(Boolean)) break;
      }
      expect(decisions.some(Boolean)).toBe(true);
      expect(decisions.every(Boolean)).toBe(false);
      expect(decisions[0]).toBe(true); // the earliest character takes the cheap stop …
      expect(decisions[20]).toBe(false); // … the longest-stint character stays out
      const fresh = neutralise(advanceRace(strategyRace(1), 6), mode);
      expect(assess(fresh, fresh.entrants[0], EARLY).compound).toBeNull();
    }
  });
});

describe("full races", () => {
  function field(seed: number, strategy: boolean, weather?: WeatherConfiguration) {
    const s = strategyRace(10, seed, weather, true);
    return strategy ? s : { ...s, input: { ...s.input, pits: { ...s.input.pits!, strategy: undefined } } };
  }
  const firstStops = (s: RaceSimulationState) => s.entrants.map(e => e.pit!.stops[0]?.lap).filter((x): x is number => x !== undefined);
  it("dry: legacy policy stops the identical field on one lap; the strategy policy spreads first stops and sequences", () => {
    const legacy = advanceRace(field(5, false), 1000), fresh = advanceRace(field(5, true), 1000);
    // Legacy: the whole identical field within two adjacent laps, nine or ten cars on the same lap.
    expect(new Set(firstStops(legacy)).size).toBeLessThanOrEqual(2);
    const wave = (s: RaceSimulationState) => { const m = new Map<number, number>(); for (const l of firstStops(s)) m.set(l, (m.get(l) ?? 0) + 1); return Math.max(...m.values()); };
    expect(wave(legacy)).toBeGreaterThanOrEqual(9);
    expect(new Set(firstStops(fresh)).size).toBeGreaterThanOrEqual(3);
    const byLap = new Map<number, number>();
    for (const l of fresh.entrants.flatMap(e => e.pit!.stops.map(x => x.lap))) byLap.set(l, (byLap.get(l) ?? 0) + 1);
    expect(Math.max(...byLap.values())).toBeLessThan(10);
  });
  it("the saved configuration switch: without it, AI stop decisions are exactly the legacy weather policy", () => {
    let s = field(5, false);
    for (; s.status === "RUNNING" && s.lap < 40; s = advanceRaceLap(s)) {
      const stops = committedStops(s);
      for (const e of s.entrants) {
        const { weather, ...input } = s.input;
        const legacy = weatherPitChoice(e, input, s.weather!, publicWeather(weather!), s.lap);
        expect(stops.get(e.entrantId) ?? null).toBe(legacy);
      }
    }
  });
  it("player-managed cars are never auto-pitted by the strategy", () => {
    const s = advanceRace(strategyRace(6, 3), 1000);
    expect(s.entrants.every(e => e.pit!.stops.length === 0)).toBe(true);
  });
  it.each([
    ["dry", undefined, false],
    ["mixed", developmentWeather(11, 58), false],
    ["SC", undefined, true],
  ] as const)("determinism (%s): same seed/state/commands → the identical Race", (_name, weather, sc) => {
    const run = () => { let s = field(8, true, weather); s = advanceRace(s, 12); if (sc) s = neutralise(s, "SAFETY_CAR", 3); return advanceRace(s, 1000); };
    const a = run();
    expect(a.status).toBe("FINISHED");
    expect(run()).toEqual(a);
  });
});

describe("configuration and architecture", () => {
  it("validates the snapshotted strategy configuration", () => {
    expect(() => validateAiStrategyConfiguration(defaultAiStrategyConfiguration())).not.toThrow();
    expect(() => validateAiStrategyConfiguration({ ...defaultAiStrategyConfiguration(), preferenceSpreadPermille: 900 })).toThrow(RangeError);
    expect(() => validateAiStrategyConfiguration({ ...defaultAiStrategyConfiguration(), version: 2 as 1 })).toThrow(RangeError);
    const pits = createRace(strategyRace(1).input).input.pits!;
    expect(() => validatePitConfiguration(pits)).not.toThrow();
    expect(() => validatePitConfiguration({ ...pits, strategy: { ...pits.strategy!, windowOpenPermille: 5 } })).toThrow(RangeError);
  });
  it("the Race engine has no Math.random and no team/driver/circuit-name branching", () => {
    const files: string[] = [];
    const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".ts")) files.push(p); } };
    walk("src/simulation/race");
    const banned = /Math\.random|monaco|spa-franc|francorchamps|bahrain|silverstone|suzuka|shanghai|marina|albert park|singapore|mercedes|ferrari|mclaren|red bull/i;
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(banned);
  });
  it("strategy never draws Race RNG (identical stream position before and after assessing)", () => {
    const s = insideWindow(4);
    const before = s.rngState;
    for (const e of s.entrants) assessAiStop({ state: s, entrant: e, weather: s.weather!, publicWeather: publicWeather(s.input.weather!), mode: "GREEN", greenPitLaneLossMs: s.input.pits!.pitLaneLossMs }, s.input.pits!.strategy!, NEUTRAL);
    expect(s.rngState).toBe(before);
    expect(committedStops(s)).toEqual(committedStops(structuredClone(s)));
  });
});

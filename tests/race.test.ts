import { describe, it, expect } from "vitest";
import { performance } from "node:perf_hooks";
import { createSeededRandom } from "../src/simulation/core/random";
import {
  createRace,
  advanceRaceLap,
  advanceRace,
  simulateRace,
  raceResult,
  classify,
  calculateLapTime,
  triangularVariation,
  DEFAULT_RACE_PARAMETERS,
} from "../src/simulation/race/engine";
import type {
  RaceSimulationInput,
  RaceEntrantState,
} from "../src/simulation/race/types";
import { formatRaceTime, formatRaceGap } from "../src/i18n/race-time";
export function raceInput(
  seed = 42,
  count = 20,
  laps = 60,
): RaceSimulationInput {
  return {
    seed,
    totalLaps: laps,
    initialFuelKg: 100,
    fuelBurnPerLapKg: 1.6,
    circuit: { baseLapTimeMs: 90000, fuelEffectMsPerKg: 30 },
    parameters: { ...DEFAULT_RACE_PARAMETERS },
    entrants: Array.from({ length: count }, (_, i) => ({
      entrantId: `entrant-${String(i).padStart(2, "0")}`,
      driverId: `driver-${i}`,
      teamId: `team-${Math.floor(i / 2)}`,
      gridPosition: i + 1,
      driver: { pace: 90 - i * 0.4, consistency: 80 },
      car: { performance: 90 - Math.floor(i / 2) },
    })),
  };
}
const lapInput = {
  driver: { pace: 90, consistency: 80 },
  car: { performance: 90 },
  circuit: { baseLapTimeMs: 90000, fuelEffectMsPerKg: 30 },
  parameters: DEFAULT_RACE_PARAMETERS,
  fuelMassKg: 100,
};
const neutral = () => ({ next: () => 0.5 });
const sd = (values: number[]) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
  );
};
describe("lap calculation", () => {
  it("repeats identical seeded diagnostic components", () =>
    expect(calculateLapTime(lapInput, createSeededRandom(7))).toEqual(
      calculateLapTime(lapInput, createSeededRandom(7)),
    ));
  it("ten car rating points save 300ms", () =>
    expect(
      calculateLapTime({ ...lapInput, car: { performance: 80 } }, neutral())
        .lapTimeMs - calculateLapTime(lapInput, neutral()).lapTimeMs,
    ).toBe(300));
  it("ten driver pace points save 150ms", () =>
    expect(
      calculateLapTime(
        { ...lapInput, driver: { pace: 80, consistency: 80 } },
        neutral(),
      ).lapTimeMs - calculateLapTime(lapInput, neutral()).lapTimeMs,
    ).toBe(150));
  it("fuel increases time by the explicit mass coefficient", () =>
    expect(
      calculateLapTime(lapInput, neutral()).lapTimeMs -
        calculateLapTime({ ...lapInput, fuelMassKg: 0 }, neutral()).lapTimeMs,
    ).toBe(3000));
  it("fuel burn improves noise-free times", () => {
    const input = raceInput();
    const state = createRace({
      ...input,
      parameters: { ...input.parameters, minVariationMs: 0, maxVariationMs: 0 },
    });
    const a = advanceRaceLap(state),
      b = advanceRaceLap(a);
    expect(b.entrants[0].lastLapTimeMs).toBeLessThan(
      a.entrants[0].lastLapTimeMs!,
    );
  });
  it("high consistency reduces spread under identical random draws", () => {
    const measure = (consistency: number) => {
      const random = createSeededRandom(99);
      return sd(
        Array.from(
          { length: 1000 },
          () =>
            calculateLapTime(
              { ...lapInput, driver: { pace: 90, consistency } },
              random,
            ).variationMs,
        ),
      );
    };
    expect(measure(20)).toBeGreaterThan(measure(95) * 3);
  });
  it("triangular variation is bounded and centred", () => {
    const random = createSeededRandom(321);
    const xs = Array.from({ length: 10000 }, () => triangularVariation(random));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(Math.abs(xs.reduce((a, b) => a + b, 0) / xs.length)).toBeLessThan(
      0.02,
    );
  });
  it("rejects invalid random sources", () =>
    expect(() => triangularVariation({ next: () => 1 })).toThrow());
  it("minimum valid lap remains positive integer even at negative noise bound", () => {
    const result = calculateLapTime(
      {
        ...lapInput,
        circuit: { baseLapTimeMs: 1000, fuelEffectMsPerKg: 0 },
        parameters: {
          ...DEFAULT_RACE_PARAMETERS,
          minVariationMs: 500,
          maxVariationMs: 500,
        },
      },
      { next: () => 0 },
    );
    expect(result.lapTimeMs).toBeGreaterThan(0);
    expect(Number.isInteger(result.lapTimeMs)).toBe(true);
  });
  it.each([-1, 101, NaN, Infinity])("rejects invalid driver pace %s", (pace) =>
    expect(() =>
      calculateLapTime(
        { ...lapInput, driver: { pace, consistency: 90 } },
        neutral(),
      ),
    ).toThrow(),
  );
});
describe("race progression and replay", () => {
  it("initializes distinct elapsed grid offsets", () => {
    const s = createRace(raceInput());
    expect(s.entrants[0].elapsedTimeMs).toBe(0);
    expect(s.entrants[1].elapsedTimeMs).toBe(180);
  });
  it("advances laps and accumulates elapsed time", () => {
    const old = createRace(raceInput());
    const next = advanceRaceLap(old);
    expect(next.lap).toBe(1);
    for (const e of next.entrants) {
      const before = old.entrants.find((x) => x.entrantId === e.entrantId)!;
      expect(e.completedLaps).toBe(1);
      expect(e.elapsedTimeMs).toBe(before.elapsedTimeMs + e.lastLapTimeMs!);
    }
  });
  it("never mutates prior state or input", () => {
    const input = raceInput();
    const frozen = structuredClone(input),
      s = createRace(input),
      before = structuredClone(s);
    advanceRaceLap(s);
    expect(input).toEqual(frozen);
    expect(s).toEqual(before);
  });
  it("deeply snapshots initial profiles", () => {
    const input = raceInput();
    const s = createRace(input);
    (input.entrants[0].driver as { pace: number }).pace = 1;
    expect(s.input.entrants[0].driver.pace).toBe(90);
  });
  it("finishes at exactly the specified lap with all entrants classified", () => {
    const { state, result } = simulateRace(raceInput());
    expect(state.lap).toBe(60);
    expect(state.status).toBe("FINISHED");
    expect(result).toHaveLength(20);
    expect(state.entrants.every((e) => e.completedLaps === 60)).toBe(true);
  });
  it("rejects advancing finished races", () =>
    expect(() =>
      advanceRaceLap(simulateRace(raceInput(1, 2, 1)).state),
    ).toThrow());
  it("rejects premature result generation", () =>
    expect(() => raceResult(createRace(raceInput()))).toThrow());
  it("same seed produces identical entire race", () =>
    expect(simulateRace(raceInput())).toEqual(simulateRace(raceInput())));
  it("different seeds change lap times and elapsed outcomes", () =>
    expect(simulateRace(raceInput(1)).result).not.toEqual(
      simulateRace(raceInput(2)).result,
    ));
  it("serialization and resume after lap 10 equals continuous finish", () => {
    const input = raceInput();
    const tenth = advanceRace(createRace(input), 10);
    const resumed = JSON.parse(JSON.stringify(tenth));
    const lap11 = advanceRaceLap(resumed);
    expect(advanceRace(lap11, 1000)).toEqual(simulateRace(input).state);
  });
  it("input array order does not change draw assignment", () => {
    const input = raceInput();
    const a = simulateRace(input);
    const b = simulateRace({
      ...input,
      entrants: [...input.entrants].reverse(),
    });
    expect(a.result).toEqual(b.result);
  });
  it("rejects unknown simulation versions", () =>
    expect(() =>
      advanceRaceLap({ ...createRace(raceInput()), simulationVersion: 99 }),
    ).toThrow("version"));
  it("fuel decreases by grams and clamps to zero", () => {
    const s = simulateRace({
      ...raceInput(),
      initialFuelKg: 1,
      fuelBurnPerLapKg: 0.333,
    }).state;
    expect(s.entrants.every((e) => e.fuelMassKg === 0)).toBe(true);
    const one = advanceRaceLap(
      createRace({ ...raceInput(), initialFuelKg: 1, fuelBurnPerLapKg: 0.333 }),
    );
    expect(one.entrants[0].fuelMassKg).toBe(0.667);
  });
  it("lap variation is nonconstant even without fuel change", () => {
    let s = createRace({ ...raceInput(), fuelBurnPerLapKg: 0 });
    const laps = [];
    for (let i = 0; i < 10; i++) {
      s = advanceRaceLap(s);
      laps.push(
        s.entrants.find((e) => e.entrantId === "entrant-00")!.lastLapTimeMs,
      );
    }
    expect(new Set(laps).size).toBeGreaterThan(5);
  });
  it("handles 20 entrants and 75 laps comfortably", () => {
    const start = performance.now();
    const result = simulateRace(raceInput(2, 20, 75));
    expect(result.result).toHaveLength(20);
    expect(performance.now() - start).toBeLessThan(2000);
  });
  it.each([0, -1, 1001, NaN])("rejects invalid total laps %s", (totalLaps) =>
    expect(() => createRace({ ...raceInput(), totalLaps })).toThrow(),
  );
  it("rejects empty or duplicate roster/grid", () => {
    const input = raceInput();
    expect(() => createRace({ ...input, entrants: [] })).toThrow();
    expect(() =>
      createRace({
        ...input,
        entrants: [input.entrants[0], input.entrants[0]],
      }),
    ).toThrow();
  });
  it("rejects fractional grams and invalid unsigned seed", () => {
    expect(() =>
      createRace({ ...raceInput(), initialFuelKg: 0.0001 }),
    ).toThrow();
    expect(() => createRace({ ...raceInput(), seed: 4294967296 })).toThrow();
  });
});
describe("classification", () => {
  const entrant = (
    id: string,
    laps: number,
    time: number,
  ): RaceEntrantState => ({
    entrantId: id,
    completedLaps: laps,
    elapsedTimeMs: time,
    lastLapTimeMs: null,
    bestLapTimeMs: null,
    fuelMassKg: 0,
    position: 0,
    gapToLeaderMs: null,
    intervalToAheadMs: null,
  });
  it("orders same-lap entrants by elapsed time with correct gaps", () => {
    const s = classify([
      entrant("b", 2, 105000),
      entrant("a", 2, 100000),
      entrant("c", 2, 107000),
    ]);
    expect(s.map((e) => e.entrantId)).toEqual(["a", "b", "c"]);
    expect(s.map((e) => e.gapToLeaderMs)).toEqual([0, 5000, 7000]);
    expect(s.map((e) => e.intervalToAheadMs)).toEqual([0, 5000, 2000]);
  });
  it("more completed laps take precedence with null cross-lap gaps", () => {
    const s = classify([entrant("a", 1, 1000), entrant("b", 2, 100000)]);
    expect(s[0].entrantId).toBe("b");
    expect(s[1].gapToLeaderMs).toBeNull();
  });
  it("uses stable IDs as exact-tie breaker", () =>
    expect(
      classify([entrant("z", 2, 10), entrant("a", 2, 10)])[0].entrantId,
    ).toBe("a"));
});
describe("100-seed balance sanity, not real-world validation", () => {
  function controlled(seed: number, kind: "car" | "driver") {
    const base = raceInput(seed, 2, 30);
    return {
      ...base,
      entrants: base.entrants.map((e, i) => ({
        ...e,
        driver: {
          pace: kind === "driver" ? (i === 0 ? 95 : 85) : 90,
          consistency: 40,
        },
        car: { performance: kind === "car" ? (i === 0 ? 95 : 85) : 90 },
      })),
    };
  }
  it("a clearly stronger car wins a strong majority", () => {
    let wins = 0;
    for (let seed = 0; seed < 100; seed++) {
      if (
        simulateRace(controlled(seed, "car")).result[0].entrantId ===
        "entrant-00"
      )
        wins++;
    }
    expect(wins).toBeGreaterThan(85);
  });
  it("a stronger driver has an average elapsed-time advantage", () => {
    let total = 0,
      wins = 0;
    for (let seed = 0; seed < 100; seed++) {
      const r = simulateRace(controlled(seed, "driver")).result;
      const difference =
        r.find((e) => e.entrantId === "entrant-01")!.totalTimeMs -
        r.find((e) => e.entrantId === "entrant-00")!.totalTimeMs;
      total += difference;
      if (difference > 0) wins++;
    }
    expect(total / 100).toBeGreaterThan(3000);
    expect(wins).toBeGreaterThan(80);
  });
});
describe("presentation isolation", () => {
  it("formats lap, gap and long race duration", () => {
    expect(formatRaceTime(92481, "en")).toBe("1:32.481");
    expect(formatRaceGap(2343, "en")).toBe("+2.343");
    expect(formatRaceTime(5324503, "en")).toBe("1:28:44.503");
  });
  it("both locales leave saved simulation untouched", () => {
    const s = advanceRace(createRace(raceInput()), 10);
    const before = structuredClone(s);
    for (const locale of ["en", "zh-TW"] as const)
      for (const e of s.entrants) {
        formatRaceTime(e.elapsedTimeMs, locale);
        formatRaceGap(e.gapToLeaderMs!, locale);
      }
    expect(s).toEqual(before);
  });
});

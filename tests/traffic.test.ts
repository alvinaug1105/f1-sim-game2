import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import v2 from "./fixtures/race-v2.json";
import { trafficInput, trafficMeasurements } from "./helpers/traffic";
import {
  createRace,
  advanceRaceLap,
  advanceRace,
  simulateRace,
  raceResult,
} from "../src/simulation/race/engine";
import {
  followingEffects,
  validateInteraction,
  passProbability,
} from "../src/simulation/race/traffic/model";
import { defaultInteractionConfiguration } from "../src/simulation/race/traffic/profiles";
import type { RaceSimulationInput } from "../src/simulation/race/types";
const c = defaultInteractionConfiguration();
describe("version 3 interactions", () => {
  it("preserves captured v2 output exactly", () =>
    expect(simulateRace(v2.state.input as RaceSimulationInput)).toEqual(v2));
  it("creates v3 with explicit grid order and lap-relative progress", () => {
    const s = createRace(trafficInput());
    expect(s.simulationVersion).toBe(3);
    expect(s.entrants.map((e) => e.position)).toEqual([1, 2]);
    expect(s.entrants[1].track!.progressMicrolaps).toBeLessThan(
      s.entrants[0].track!.progressMicrolaps,
    );
  });
  it("does not sort an unpassed faster follower ahead", () => {
    const i = trafficInput(1, 1200, 180);
    const s = advanceRaceLap(createRace(i));
    expect(s.entrants[0].entrantId).toBe(i.entrants[0].entrantId);
    expect(s.entrants[1].intervalToAheadMs).toBe(c.minimumGapMs);
    expect(s.entrants[1].track!.trafficLossMs).toBeGreaterThan(500);
  });
  it("failed attack retains order and positive gap", () => {
    const i = trafficInput(1, 900, 180);
    const input = {
      ...i,
      interaction: { ...c, overtakingDifficulty: 100, drsZoneCount: 0 },
      entrants: i.entrants.map((e) => ({
        ...e,
        interaction: { overtaking: 0, defending: 100 },
      })),
    };
    const s = advanceRace(createRace(input), 2);
    expect(s.entrants[1].track!.attempted).toBe(true);
    expect(s.entrants[1].track!.passed).toBe(false);
    expect(s.entrants[0].entrantId).toBe(i.entrants[0].entrantId);
    expect(s.entrants[1].intervalToAheadMs).toBeGreaterThanOrEqual(
      c.minimumGapMs,
    );
  });
  it("explicit pass swaps crossing order and releases traffic", () => {
    const i = trafficInput(42, 1200, 180);
    const input = {
      ...i,
      interaction: { ...c, overtakingDifficulty: 0, drsActivationLap: 1 },
      entrants: i.entrants.map((e) => ({
        ...e,
        interaction: { overtaking: 100, defending: 0 },
      })),
    };
    let s = createRace(input);
    while (s.lap < 20 && !s.entrants.some((e) => e.track!.passed))
      s = advanceRaceLap(s);
    expect(s.entrants[0].entrantId).toBe(i.entrants[1].entrantId);
    expect(s.entrants[0].track!.overtakesCompleted).toBe(1);
    s = advanceRaceLap(s);
    expect(s.entrants[0].track!.dirtyAirMs).toBe(0);
    expect(s.entrants[0].track!.trafficLossMs).toBe(0);
    expect(s.entrants[0].lastLapTimeMs).toBe(
      s.entrants[0].track!.potentialLapTimeMs,
    );
  });
  it("checkpoint15 serialized resume reproduces complete result", () => {
    const i = trafficInput();
    const midway = JSON.parse(JSON.stringify(advanceRace(createRace(i), 15)));
    expect(advanceRace(midway, 1000)).toEqual(simulateRace(i).state);
  });
  it("same seed repeats including interaction RNG", () =>
    expect(simulateRace(trafficInput())).toEqual(simulateRace(trafficInput())));
  it("does not mutate input or nested previous tyres/track", () => {
    const s = createRace(trafficInput());
    const before = structuredClone(s);
    advanceRace(s, 5);
    expect(s).toEqual(before);
  });
  it("input array order cannot alter draw assignment", () => {
    const i = trafficInput();
    expect(
      simulateRace({ ...i, entrants: [...i.entrants].reverse() }).result,
    ).toEqual(simulateRace(i).result);
  });
  it("tyre degradation feeds pass strength through pace alone", () => {
    const i = trafficInput(42, 0, 180);
    const s = simulateRace({
      ...i,
      entrants: i.entrants.map((e, n) => ({
        ...e,
        startingTyre: n
          ? e.startingTyre
          : {
              compound: "SOFT",
              ageLaps: 30,
              wearPermille: 950,
              temperatureMilliC: 98000,
            },
      })),
    }).state;
    expect(s.entrants[0].entrantId).toBe(i.entrants[1].entrantId);
    expect(s.entrants[0].track!.overtakesCompleted).toBeGreaterThan(0);
  });
  it("all positions and gaps remain valid through a 20-car race", () => {
    const i = trafficInput();
    let s = createRace({
      ...i,
      totalLaps: 75,
      entrants: Array.from({ length: 20 }, (_, n) => ({
        ...i.entrants[n % 2],
        entrantId: `e${n}`,
        driverId: `d${n}`,
        gridPosition: n + 1,
      })),
    });
    while (s.status !== "FINISHED") {
      s = advanceRaceLap(s);
      expect(s.entrants.map((e) => e.position)).toEqual(
        Array.from({ length: 20 }, (_, n) => n + 1),
      );
      for (const e of s.entrants) {
        expect(e.gapToLeaderMs).toBeGreaterThanOrEqual(0);
        expect(e.intervalToAheadMs).toBeGreaterThanOrEqual(0);
        expect(e.lastLapTimeMs).toBeGreaterThan(0);
      }
    }
    const result = raceResult(s);
    expect(() => advanceRaceLap(s)).toThrow();
    expect(raceResult(s)).toEqual(result);
  });
  it("profiles are copied into frozen race input", () => {
    const i = trafficInput();
    const s = createRace(i);
    (i.interaction! as { overtakingDifficulty: number }).overtakingDifficulty =
      99;
    expect(s.input.interaction!.overtakingDifficulty).toBe(35);
  });
  it("version2 cannot silently acquire traffic", () => {
    const s = createRace(trafficInput());
    expect(() => advanceRaceLap({ ...s, simulationVersion: 2 })).toThrow();
  });
  it.each([-1, 101, NaN])("rejects difficulty %s", (overtakingDifficulty) =>
    expect(() => validateInteraction({ ...c, overtakingDifficulty })).toThrow(),
  );
  it("locale formatting does not affect order or state", () => {
    const s = advanceRace(createRace(trafficInput()), 15);
    const before = structuredClone(s);
    for (const locale of ["en", "zh-TW"])
      for (const e of s.entrants)
        new Intl.NumberFormat(locale).format(e.intervalToAheadMs!);
    expect(s).toEqual(before);
  });
  it.each(["model.ts", "profiles.ts"])(
    "%s remains framework and clock independent",
    (file) =>
      expect(
        readFileSync(
          new URL(`../src/simulation/race/traffic/${file}`, import.meta.url),
          "utf8",
        ),
      ).not.toMatch(
        /(?:from\s+["'][^"']*(?:react|prisma|next|i18n)|Math\.random|Date\.now|localStorage|window\.)/,
      ),
  );
  it("20 cars x75 laps stays below interactive latency", () => {
    const i = trafficInput();
    const start = performance.now();
    simulateRace({
      ...i,
      totalLaps: 75,
      entrants: Array.from({ length: 20 }, (_, n) => ({
        ...i.entrants[n % 2],
        entrantId: `e${n}`,
        driverId: `d${n}`,
        gridPosition: n + 1,
      })),
    });
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
describe("DRS and dirty air", () => {
  it("leader has no DRS or dirty air", () =>
    expect(followingEffects(null, 5, c)).toEqual({
      drsEligible: false,
      dirtyAirMs: 0,
      drsBenefitMs: 0,
    }));
  it("DRS inactive before activation", () =>
    expect(followingEffects(200, 2, c).drsEligible).toBe(false));
  it("DRS at exact threshold", () =>
    expect(followingEffects(1000, 3, c).drsEligible).toBe(true));
  it("DRS off outside threshold", () =>
    expect(followingEffects(1001, 3, c).drsEligible).toBe(false));
  it("no zones means no DRS", () =>
    expect(
      followingEffects(200, 5, { ...c, drsZoneCount: 0 }).drsEligible,
    ).toBe(false));
  it("close following has greater bounded dirty-air loss", () => {
    expect(followingEffects(100, 5, c).dirtyAirMs).toBeGreaterThan(
      followingEffects(1000, 5, c).dirtyAirMs,
    );
    expect(followingEffects(2000, 5, c).dirtyAirMs).toBe(0);
    expect(followingEffects(0, 5, c).dirtyAirMs).toBe(c.maxDirtyAirMs);
  });
  it("multiple followers can form a DRS train", () => {
    const i = trafficInput(42, 0, 180);
    const s = advanceRaceLap(
      createRace({
        ...i,
        interaction: { ...c, drsActivationLap: 1 },
        entrants: Array.from({ length: 3 }, (_, n) => ({
          ...i.entrants[0],
          entrantId: `e${n}`,
          driverId: `d${n}`,
          gridPosition: n + 1,
        })),
      }),
    );
    expect(s.entrants.map((e) => e.track!.drsEligible)).toEqual([
      false,
      true,
      true,
    ]);
  });
  it("DRS increases attack probability without guaranteeing success", () => {
    const p = { overtaking: 65, defending: 65 };
    expect(passProbability(500, p, p, 0, true, c)).toBeGreaterThan(
      passProbability(500, p, p, 0, false, c),
    );
    expect(passProbability(500, p, p, 0, true, c)).toBeLessThan(1000);
  });
});
describe("200-seed controlled balance", () => {
  const m = trafficMeasurements();
  it("large advantage passes much more than 20ms advantage", () =>
    expect(m.easyRate).toBeGreaterThan(m.smallAdvantageRate + 0.4));
  it("difficult circuit reduces passing", () =>
    expect(m.easyRate).toBeGreaterThan(m.difficultRate + 0.15));
  it("DRS improves passing likelihood", () =>
    expect(m.withDrs).toBeGreaterThan(m.withoutDrs + 0.1));
  it("blocked follower catches and pays actual traffic cost", () => {
    expect(m.caughtLap).toBeGreaterThan(0);
    expect(m.caughtLap).toBeLessThanOrEqual(5);
    expect(m.trafficCost5LapsMs).toBeGreaterThan(1000);
  });
});

it("DRS uses the start checkpoint, not a gap caught later in the lap", () => {
  const i = trafficInput(42, 900, 1100);
  const s = advanceRaceLap(
    createRace({ ...i, interaction: { ...c, drsActivationLap: 1 } }),
  );
  expect(s.entrants[1].track!.drsEligible).toBe(false);
  expect(s.entrants[1].intervalToAheadMs).toBeLessThan(1000);
});
it("traffic leaves fuel and tyre updates identical to v2", () => {
  const i = trafficInput();
  const v3 = advanceRace(createRace(i), 15);
  const legacy = {
    ...i,
    interaction: undefined,
    entrants: i.entrants.map((e) => ({ ...e, interaction: undefined })),
  };
  const v2 = advanceRace(createRace(legacy), 15);
  for (const e of v3.entrants) {
    const old = v2.entrants.find((x) => x.entrantId === e.entrantId)!;
    expect(e.stint).toEqual(old.stint);
    expect(e.fuelMassKg).toEqual(old.fuelMassKg);
  }
});

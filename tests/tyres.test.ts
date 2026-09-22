import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import fixture from "./fixtures/race-v1.json";
import {
  calculateLapTime,
  advanceRace,
  advanceRaceLap,
  createRace,
  simulateRace,
} from "../src/simulation/race/engine";
import type { RaceSimulationInput } from "../src/simulation/race/types";
import {
  advanceTyre,
  tyreContributions,
  validateTyreState,
  validateTyreConfiguration,
  TYRE_COMPOUNDS,
} from "../src/simulation/race/tyres/model";
import {
  defaultTyreConfiguration,
  startingTyre,
} from "../src/simulation/race/tyres/profiles";
const legacy = fixture.state.input as RaceSimulationInput;
const config = defaultTyreConfiguration();
function input(seed = 42): RaceSimulationInput {
  return {
    ...legacy,
    seed,
    totalLaps: 75,
    tyres: defaultTyreConfiguration(),
    entrants: legacy.entrants.map((e) => ({
      ...e,
      startingTyre: startingTyre(),
    })),
  };
}
describe("version 2 tyre model", () => {
  it("preserves captured pre-tyre v1 output exactly", () =>
    expect(simulateRace(legacy)).toEqual(fixture));
  it.each(TYRE_COMPOUNDS)("loads %s profile", (c) =>
    expect(config.profiles[c].compound).toBe(c),
  );
  it.each(TYRE_COMPOUNDS)("increments %s age and wear independently", (c) => {
    const t = advanceTyre(startingTyre(c), config);
    expect(t.ageLaps).toBe(1);
    expect(t.wearPermille).toBe(config.profiles[c].baseWearPerLapPermille);
  });
  it.each(TYRE_COMPOUNDS)("caps %s wear without resetting age", (c) => {
    const t = advanceTyre(
      { ...startingTyre(c), ageLaps: 50, wearPermille: 999 },
      config,
    );
    expect(t.wearPermille).toBe(1000);
    expect(t.ageLaps).toBe(51);
  });
  it("numeric stress increases wear", () =>
    expect(
      advanceTyre(startingTyre(), {
        ...config,
        tyreWearMultiplierPermille: 2000,
      }).wearPermille,
    ).toBeGreaterThan(
      advanceTyre(startingTyre(), {
        ...config,
        tyreWearMultiplierPermille: 500,
      }).wearPermille,
    ));
  it("soft wears faster than medium and hard", () => {
    const wear = TYRE_COMPOUNDS.map(
      (c) => advanceTyre(startingTyre(c), config).wearPermille,
    );
    expect(wear[0]).toBeGreaterThan(wear[1]);
    expect(wear[1]).toBeGreaterThan(wear[2]);
  });
  it.each(TYRE_COMPOUNDS)(
    "%s degradation is monotonic with nonlinear cliff",
    (c) => {
      const p = config.profiles[c];
      const loss = (wearPermille: number) =>
        tyreContributions({ ...startingTyre(c), wearPermille }, p).tyreWearMs;
      expect(loss(0)).toBe(0);
      for (let w = 1; w <= 1000; w++)
        expect(loss(w)).toBeGreaterThanOrEqual(loss(w - 1));
      expect(loss(1000) - loss(p.cliffWear)).toBeGreaterThan(4000);
    },
  );
  it.each(TYRE_COMPOUNDS)(
    "%s penalizes cold/hot but not ideal temperature",
    (c) => {
      const p = config.profiles[c];
      const loss = (temperatureMilliC: number) =>
        tyreContributions({ ...startingTyre(c), temperatureMilliC }, p)
          .tyreTemperatureMs;
      expect(loss(p.idealTemperatureMinMilliC)).toBe(0);
      expect(loss(p.idealTemperatureMaxMilliC)).toBe(0);
      expect(loss(0)).toBeGreaterThan(0);
      expect(loss(160000)).toBeGreaterThan(0);
      expect(loss(160000)).toBeLessThanOrEqual(p.maxTemperaturePenaltyMs);
    },
  );
  it("temperature evolves gradually and reproducibly", () => {
    const t = startingTyre();
    const next = advanceTyre(t, config);
    expect(next.temperatureMilliC).toBeGreaterThan(t.temperatureMilliC);
    expect(next.temperatureMilliC).toBeLessThan(
      config.profiles.MEDIUM.targetTemperatureMilliC,
    );
    expect(next).toEqual(advanceTyre(t, config));
  });
  it.each([250, 3000])("energy %s remains bounded", (energy) => {
    let t = startingTyre();
    for (let i = 0; i < 1000; i++)
      t = advanceTyre(t, { ...config, tyreEnergyMultiplierPermille: energy });
    expect(t.temperatureMilliC).toBeGreaterThanOrEqual(0);
    expect(t.temperatureMilliC).toBeLessThanOrEqual(160000);
  });
  it.each([-1, 1001, 0.5, NaN])("rejects invalid wear %s", (wearPermille) =>
    expect(() =>
      validateTyreState({ ...startingTyre(), wearPermille }),
    ).toThrow(),
  );
  it("rejects incomplete profiles", () =>
    expect(() =>
      validateTyreConfiguration({
        ...config,
        profiles: { ...config.profiles, SOFT: undefined } as never,
      }),
    ).toThrow());
  it("requires every starting tyre", () =>
    expect(() =>
      createRace({ ...input(), entrants: legacy.entrants }),
    ).toThrow());
  it("deeply snapshots configuration and preserves previous nested state", () => {
    const i = input();
    const s = createRace(i);
    const before = structuredClone(s);
    advanceRaceLap(s);
    expect(s).toEqual(before);
    (i.tyres!.profiles.MEDIUM as { baseGripDeltaMs: number }).baseGripDeltaMs =
      900;
    expect(s.input.tyres!.profiles.MEDIUM.baseGripDeltaMs).toBe(0);
  });
  it("lap20 serialized resume matches entire continuous state", () => {
    const i = input();
    const resumed = JSON.parse(JSON.stringify(advanceRace(createRace(i), 20)));
    expect(advanceRace(resumed, 1000)).toEqual(simulateRace(i).state);
  });
  it("same seed repeats full result", () =>
    expect(simulateRace(input())).toEqual(simulateRace(input())));
  it("adds no RNG draws and preserves fuel semantics", () => {
    const i = input();
    const a = simulateRace(i).state;
    const b = simulateRace({
      ...legacy,
      seed: i.seed,
      totalLaps: i.totalLaps,
    }).state;
    expect(a.rngState).toBe(b.rngState);
    expect(a.entrants.map((e) => e.fuelMassKg)).toEqual(
      b.entrants.map((e) => e.fuelMassKg),
    );
  });
  it("20 cars by 75 laps completes comfortably", () => {
    const i = input();
    const entrants = Array.from({ length: 20 }, (_, n) => ({
      ...i.entrants[0],
      entrantId: `e${n}`,
      driverId: `d${n}`,
      gridPosition: n + 1,
    }));
    const start = performance.now();
    expect(simulateRace({ ...i, entrants }).result).toHaveLength(20);
    expect(performance.now() - start).toBeLessThan(2000);
  });
  it("localised presentation cannot change state", () => {
    const s = advanceRace(createRace(input()), 20);
    const before = structuredClone(s);
    for (const locale of ["en", "zh-TW"])
      for (const e of s.entrants) {
        new Intl.NumberFormat(locale, { style: "percent" }).format(
          e.stint!.tyre.wearPermille / 1000,
        );
        new Intl.NumberFormat(locale, {
          style: "unit",
          unit: "celsius",
        }).format(e.stint!.tyre.temperatureMilliC / 1000);
      }
    expect(s).toEqual(before);
  });
  it.each(["model.ts", "profiles.ts"])(
    "%s has no framework, locale or nondeterministic dependency",
    (file) => {
      const text = readFileSync(
        new URL(`../src/simulation/race/tyres/${file}`, import.meta.url),
        "utf8",
      );
      expect(text).not.toMatch(
        /(?:from\s+["'][^"']*(?:react|prisma|next|i18n)|Math\.random|Date\.now|localStorage|window\.)/,
      );
    },
  );
  it("100 seeds show fresh ordering and worn-soft crossover", () => {
    for (let seed = 0; seed < 100; seed++) {
      const times = TYRE_COMPOUNDS.map((c) => {
        let s = createRace({
          ...input(seed),
          totalLaps: 30,
          entrants: [
            { ...input(seed).entrants[0], startingTyre: startingTyre(c) },
          ],
        });
        const laps: number[] = [];
        for (let n = 0; n < 30; n++) {
          s = advanceRaceLap(s);
          laps.push(s.entrants[0].lastLapTimeMs!);
        }
        return laps;
      });
      expect(times[0][0]).toBeLessThan(times[1][0]);
      expect(times[1][0]).toBeLessThan(times[2][0]);
      expect(times[0][29]).toBeGreaterThan(times[1][29]);
      expect(times[0][29]).toBeGreaterThan(times[2][29]);
    }
  });
});

describe("tyre lap diagnostics", () => {
  const base = {
    driver: legacy.entrants[0].driver,
    car: legacy.entrants[0].car,
    circuit: legacy.circuit,
    parameters: legacy.parameters,
    fuelMassKg: 50,
  };
  it.each(["compound", "wear", "temperature"])(
    "includes %s contribution exactly",
    (kind) => {
      const state = {
        ...startingTyre("SOFT"),
        wearPermille: kind === "wear" ? 950 : 0,
        temperatureMilliC: kind === "temperature" ? 50000 : 98000,
      };
      const neutral = () => ({ next: () => 0.5 });
      const baseline = calculateLapTime(base, neutral());
      const result = calculateLapTime(
        { ...base, tyre: { state, profile: config.profiles.SOFT } },
        neutral(),
      );
      expect(result.lapTimeMs - baseline.lapTimeMs).toBe(
        result.tyreCompoundMs + result.tyreWearMs + result.tyreTemperatureMs,
      );
      if (kind === "compound") expect(result.tyreCompoundMs).toBe(-350);
      if (kind === "wear") expect(result.tyreWearMs).toBeGreaterThan(4000);
      if (kind === "temperature")
        expect(result.tyreTemperatureMs).toBeGreaterThan(0);
    },
  );
});

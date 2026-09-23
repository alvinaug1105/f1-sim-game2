import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import fixture from "./fixtures/race-v3.json";
import { pitInput, runPitSchedule, strategyComparisons } from "./helpers/pits";
import {
  createRace,
  advanceRaceLap,
  advanceRace,
  simulateRace,
} from "../src/simulation/race/engine";
import { requestPitStop } from "../src/simulation/race/pits/model";
import { validatePitConfiguration } from "../src/simulation/race/pits/profiles";
import { estimatePitWindow } from "../src/features/race/strategy-estimate";
import type { RaceSimulationInput } from "../src/simulation/race/types";
const box = (
  s: ReturnType<typeof createRace>,
  compound: "SOFT" | "MEDIUM" | "HARD" = "HARD",
) => requestPitStop(s, s.input.entrants[0].entrantId, compound);
describe("version 4 pit mechanics", () => {
  it("preserves captured v3 output exactly", () =>
    expect(simulateRace(fixture.state.input as RaceSimulationInput)).toEqual(
      fixture,
    ));
  it("starts v4 with one open stint and no pending stop", () => {
    const s = createRace(pitInput());
    expect(s.simulationVersion).toBe(4);
    expect(s.entrants[0].pit).toMatchObject({
      pendingCompound: null,
      stops: [],
      commandRevision: 0,
      stints: [{ number: 1, startLap: 0, endLap: null }],
    });
  });
  it("pending request changes no timing, tyres, fuel or RNG", () => {
    const before = advanceRace(createRace(pitInput()), 15);
    const after = box(before);
    expect(after.rngState).toBe(before.rngState);
    expect(after.entrants[0].elapsedTimeMs).toBe(
      before.entrants[0].elapsedTimeMs,
    );
    expect(after.entrants[0].stint).toEqual(before.entrants[0].stint);
    expect(after.entrants[0].fuelMassKg).toBe(before.entrants[0].fuelMassKg);
    expect(after.entrants[0].pit!.pendingCompound).toBe("HARD");
  });
  it("executes after next completed lap, resets tyres and opens next stint", () => {
    const s = advanceRaceLap(box(advanceRace(createRace(pitInput()), 15)));
    const e = s.entrants.find(
      (e) => e.entrantId === s.input.entrants[0].entrantId,
    )!;
    expect(e.stint).toEqual({
      number: 2,
      startedAtLap: 16,
      tyre: {
        compound: "HARD",
        ageLaps: 0,
        wearPermille: 0,
        temperatureMilliC: 80000,
      },
    });
    expect(e.pit!.stints[0]).toMatchObject({
      startLap: 0,
      endLap: 16,
      endingTyre: { ageLaps: 16, wearPermille: 352 },
    });
    expect(e.pit!.stops[0].lap).toBe(16);
    expect(e.pit!.pendingCompound).toBeNull();
  });
  it("pit loss exactly adds transit and bounded service without refuelling", () => {
    const i = pitInput(42, 1);
    const no = advanceRaceLap(createRace(i));
    const stop = advanceRaceLap(box(createRace(i))).entrants[0];
    const history = stop.pit!.stops[0];
    expect(history.stationaryTimeMs).toBeGreaterThanOrEqual(2250);
    expect(history.stationaryTimeMs).toBeLessThanOrEqual(2750);
    expect(history.totalLossMs).toBe(
      history.pitLaneLossMs + history.stationaryTimeMs,
    );
    expect(stop.elapsedTimeMs - no.entrants[0].elapsedTimeMs).toBe(
      history.totalLossMs,
    );
    expect(stop.fuelMassKg).toBe(no.entrants[0].fuelMassKg);
  });
  it("pit-cycle loss moves leader behind without inflating overtakes", () => {
    const s = advanceRaceLap(box(createRace(pitInput())));
    expect(s.entrants[0].entrantId).toBe(s.input.entrants[1].entrantId);
    expect(s.entrants.every((e) => e.track!.overtakesCompleted === 0)).toBe(
      true,
    );
    expect(s.entrants[1].intervalToAheadMs).toBeGreaterThan(19000);
  });
  it("pitting car gets no DRS, dirty air or attack during pit lap", () => {
    const i = pitInput();
    let s = createRace({
      ...i,
      interaction: { ...i.interaction!, drsActivationLap: 1 },
    });
    s = requestPitStop(s, i.entrants[1].entrantId, "SOFT");
    s = advanceRaceLap(s);
    const e = s.entrants.find((e) => e.entrantId === i.entrants[1].entrantId)!;
    expect(e.track).toMatchObject({
      drsEligible: false,
      drsBenefitMs: 0,
      dirtyAirMs: 0,
      attempted: false,
      passed: false,
    });
  });
  it("cancel before commitment prevents a stop", () => {
    const pending = box(createRace(pitInput()));
    const cancelled = requestPitStop(
      pending,
      pending.input.entrants[0].entrantId,
      null,
    );
    expect(
      advanceRaceLap(cancelled).entrants.every(
        (e) => e.pit!.stops.length === 0,
      ),
    ).toBe(true);
  });
  it("compound change replaces one active request", () => {
    const a = box(createRace(pitInput()), "SOFT");
    const b = box(a, "HARD");
    const s = advanceRaceLap(b);
    const e = s.entrants.find(
      (e) => e.entrantId === a.input.entrants[0].entrantId,
    )!;
    expect(e.pit!.stops).toHaveLength(1);
    expect(e.stint!.tyre.compound).toBe("HARD");
  });
  it("duplicate command is idempotent", () => {
    const a = box(createRace(pitInput()));
    expect(box(a)).toEqual(a);
  });
  it("rejects final-lap and finished requests", () => {
    const s = advanceRace(createRace(pitInput(42, 1, 3)), 2);
    expect(() => box(s)).toThrow();
    expect(() => box(advanceRaceLap(s))).toThrow();
  });
  it("rejects legacy or invalid entrant/compound commands", () => {
    const i = pitInput();
    const s = createRace(i);
    expect(() => requestPitStop(s, "unknown", "SOFT")).toThrow();
    expect(() =>
      requestPitStop(s, i.entrants[0].entrantId, "WET" as never),
    ).toThrow();
    expect(() =>
      requestPitStop(
        { ...s, simulationVersion: 3 },
        i.entrants[0].entrantId,
        "SOFT",
      ),
    ).toThrow();
  });
  it("pending lap15 save/reload and post-stop save both resume exactly", () => {
    const i = pitInput();
    const pending = box(advanceRace(createRace(i), 15));
    const expected = advanceRace(pending, 1000);
    const loaded = JSON.parse(JSON.stringify(pending));
    const stopped = advanceRaceLap(loaded);
    expect(advanceRace(JSON.parse(JSON.stringify(stopped)), 1000)).toEqual(
      expected,
    );
  });
  it("same seed and two-stop commands repeat complete history and final state", () => {
    const i = pitInput();
    const commands = [
      { lap: 18, index: 0, compound: "MEDIUM" },
      { lap: 40, index: 0, compound: "SOFT" },
    ] as const;
    expect(runPitSchedule(i, commands)).toEqual(runPitSchedule(i, commands));
  });
  it("does not mutate prior pit, tyre or history objects", () => {
    const s = box(advanceRace(createRace(pitInput()), 15));
    const before = structuredClone(s);
    advanceRaceLap(s);
    expect(s).toEqual(before);
  });
  it("simultaneous teammate stops use independent standard service and unique order", () => {
    const i = pitInput();
    let s = createRace(i);
    for (const e of i.entrants) s = requestPitStop(s, e.entrantId, "HARD");
    s = advanceRaceLap(s);
    expect(s.entrants.map((e) => e.position)).toEqual([1, 2]);
    expect(
      s.entrants.every(
        (e) =>
          e.pit!.stops.length === 1 && e.pit!.stops[0].stationaryTimeMs <= 2750,
      ),
    ).toBe(true);
    expect(s.entrants[1].intervalToAheadMs).toBeGreaterThanOrEqual(
      i.interaction!.minimumGapMs,
    );
  });
  it("reversing input arrays preserves simultaneous service draw allocation", () => {
    const i = pitInput();
    const a = runPitSchedule(i, [
      { lap: 5, index: 0, compound: "HARD" },
      { lap: 5, index: 1, compound: "HARD" },
    ]);
    const reversed = { ...i, entrants: [...i.entrants].reverse() };
    const b = runPitSchedule(reversed, [
      { lap: 5, index: 0, compound: "HARD" },
      { lap: 5, index: 1, compound: "HARD" },
    ]);
    expect(b.entrants).toEqual(a.entrants);
    expect(b.rngState).toBe(a.rngState);
  });
  it("closes final stint at finish and keeps all stop histories", () => {
    const s = runPitSchedule(pitInput(42, 1), [
      { lap: 20, index: 0, compound: "HARD" },
    ]);
    const e = s.entrants[0];
    expect(e.pit!.stints).toHaveLength(2);
    expect(e.pit!.stints[1].endLap).toBe(58);
    expect(e.pit!.stints[1].endingTyre).toEqual(e.stint!.tyre);
  });
  it("new tyres warm through existing temperature model", () => {
    let s = advanceRaceLap(box(createRace(pitInput(42, 1))));
    expect(s.entrants[0].stint!.tyre.temperatureMilliC).toBe(80000);
    s = advanceRaceLap(s);
    expect(s.entrants[0].stint!.tyre.temperatureMilliC).toBeGreaterThan(80000);
    expect(s.entrants[0].stint!.tyre.ageLaps).toBe(1);
  });
  it("snapshots configuration independent of later defaults", () => {
    const i = pitInput();
    const s = createRace(i);
    (i.pits! as { pitLaneLossMs: number }).pitLaneLossMs = 99000;
    expect(s.input.pits!.pitLaneLossMs).toBe(19500);
  });
  it.each([-1, 1001, NaN])(
    "rejects invalid variation %s",
    (stationaryVariationMs) =>
      expect(() =>
        validatePitConfiguration({
          ...pitInput().pits!,
          stationaryVariationMs,
        }),
      ).toThrow(),
  );
  it("presentation estimates and locale formatting do not alter game state", () => {
    const s = advanceRace(createRace(pitInput()), 15);
    const before = structuredClone(s);
    expect(estimatePitWindow(s, s.entrants[0]).lapsToCliff).toBeGreaterThan(0);
    for (const locale of ["en", "zh-TW"])
      new Intl.NumberFormat(locale).format(
        estimatePitWindow(s, s.entrants[0]).maximumLossMs,
      );
    expect(s).toEqual(before);
  });
  it.each(["model.ts", "strategy-policy.ts", "profiles.ts"])(
    "%s has no framework, clock or locale dependency",
    (file) =>
      expect(
        readFileSync(
          new URL(`../src/simulation/race/pits/${file}`, import.meta.url),
          "utf8",
        ),
      ).not.toMatch(
        /(?:from\s+["'][^"']*(?:react|prisma|next|i18n)|Math\.random|Date\.now|localStorage|window\.)/,
      ),
  );
});
describe("temporary strategy policy and balance", () => {
  it("AI uses normal stops, avoids every-lap pitting and keeps valid tyre/history state", () => {
    const i = pitInput(42, 2, 75);
    const s = simulateRace({
      ...i,
      entrants: i.entrants.map((e) => ({
        ...e,
        strategyController: "DEVELOPMENT_AI" as const,
        startingTyre: { ...e.startingTyre!, compound: "SOFT" as const },
      })),
    }).state;
    for (const e of s.entrants) {
      expect(e.pit!.stops.length).toBeGreaterThan(0);
      expect(e.pit!.stops.length).toBeLessThan(5);
      for (const stop of e.pit!.stops) {
        expect(["SOFT", "MEDIUM", "HARD"]).toContain(stop.newCompound);
        expect(stop.totalLossMs).toBeGreaterThanOrEqual(21750);
      }
      expect(e.pit!.stints[0].endingTyre!.wearPermille).toBeLessThan(1000);
    }
  });
  it("high transit loss increases two-stop cost twice as much as one-stop cost", () => {
    const i = pitInput(42, 1);
    const time = (lane: number, count: number) =>
      runPitSchedule(
        { ...i, pits: { ...i.pits!, pitLaneLossMs: lane } },
        count === 1
          ? [{ lap: 25, index: 0, compound: "HARD" }]
          : [
              { lap: 18, index: 0, compound: "MEDIUM" },
              { lap: 40, index: 0, compound: "SOFT" },
            ],
      ).entrants[0].elapsedTimeMs;
    expect(time(30000, 1) - time(10000, 1)).toBe(20000);
    expect(time(30000, 2) - time(10000, 2)).toBe(40000);
  });
  it("compares one-stop, two-stop and no-stop histories", () =>
    expect(strategyComparisons().map((x) => x.stops)).toEqual([1, 2, 0]));
  it("20 cars x75 laps with AI pits remains comfortably fast and positions unique", () => {
    const i = pitInput(42, 20, 75);
    const t = performance.now();
    const s = simulateRace({
      ...i,
      entrants: i.entrants.map((e) => ({
        ...e,
        strategyController: "DEVELOPMENT_AI" as const,
      })),
    }).state;
    expect(performance.now() - t).toBeLessThan(2000);
    expect(s.entrants.map((e) => e.position)).toEqual(
      Array.from({ length: 20 }, (_, n) => n + 1),
    );
    expect(
      s.entrants.every((e) => e.completedLaps === 75 && e.gapToLeaderMs! >= 0),
    ).toBe(true);
  });
});

import { strategyScenario } from "./helpers/pits";
it("undercut emerges from worn tyres and equal pit losses", () => {
  const s = strategyScenario("undercut").rejoin;
  expect(s.entrants[0].entrantId).toBe("pit-entrant-1");
  expect(s.entrants.every((e) => e.track!.overtakesCompleted === 0)).toBe(true);
  expect(s.entrants[0].pit!.stops[0].totalLossMs).toBe(
    s.entrants[1].pit!.stops[0].totalLossMs,
  );
});
it("overcut emerges from staying out while new tyres warm up", () => {
  const s = strategyScenario("overcut").rejoin;
  expect(s.entrants[0].entrantId).toBe("pit-entrant-1");
  expect(s.entrants[0].pit!.stops[0].lap).toBe(5);
  expect(s.entrants[1].pit!.stops[0].lap).toBe(2);
  expect(s.entrants.every((e) => e.track!.overtakesCompleted === 0)).toBe(true);
});
it("identical early stop succeeds in clean air but fails behind rejoin traffic", () => {
  const clear = strategyScenario("clear").rejoin,
    traffic = strategyScenario("traffic").rejoin;
  expect(clear.entrants[0].entrantId).toBe("pit-entrant-1");
  expect(traffic.entrants[0].entrantId).toBe("pit-entrant-0");
  const follower = traffic.entrants.find(
    (e) => e.entrantId === "pit-entrant-1",
  )!;
  expect(follower.track!.trafficLossMs).toBeGreaterThan(1000);
  expect(follower.intervalToAheadMs).toBe(80);
  expect(follower.pit!.stops[0]).toEqual(clear.entrants[0].pit!.stops[0]);
});
it("cancelling after completion cannot remove an executed stop", () => {
  const stopped = advanceRaceLap(box(createRace(pitInput())));
  const cancelled = requestPitStop(
    stopped,
    stopped.input.entrants[0].entrantId,
    null,
  );
  expect(cancelled).toEqual(stopped);
  expect(
    cancelled.entrants.find(
      (e) => e.entrantId === stopped.input.entrants[0].entrantId,
    )!.pit!.stops,
  ).toHaveLength(1);
});

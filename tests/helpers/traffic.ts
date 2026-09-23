import fixture from "../fixtures/race-v2.json";
import type { RaceSimulationInput } from "../../src/simulation/race/types";
import {
  defaultInteractionConfiguration,
  developmentDriverInteraction,
} from "../../src/simulation/race/traffic/profiles";
import { startingTyre } from "../../src/simulation/race/tyres/profiles";
import {
  createRace,
  advanceRaceLap,
  simulateRace,
} from "../../src/simulation/race/engine";
export function trafficInput(
  seed = 42,
  advantageMs = 900,
  gapMs = 2000,
): RaceSimulationInput {
  const base = fixture.state.input as RaceSimulationInput;
  return {
    ...base,
    seed,
    totalLaps: 30,
    parameters: {
      ...base.parameters,
      gridOffsetMs: gapMs,
      minVariationMs: 0,
      maxVariationMs: 0,
    },
    interaction: defaultInteractionConfiguration(),
    entrants: base.entrants.map((e, i) => ({
      ...e,
      driver: { pace: 90, consistency: 90 },
      car: { performance: i === 0 ? 60 : 60 + advantageMs / 30 },
      startingTyre: startingTyre(),
      interaction: developmentDriverInteraction(),
    })),
  };
}
export function scenarioRate(
  difficulty: number,
  drs: boolean,
  advantageMs = 900,
) {
  let passes = 0;
  for (let seed = 0; seed < 200; seed++) {
    const i = trafficInput(seed, advantageMs, 1000);
    const state = simulateRace({
      ...i,
      totalLaps: 6,
      interaction: {
        ...i.interaction!,
        overtakingDifficulty: difficulty,
        drsZoneCount: drs ? 2 : 0,
        drsActivationLap: 1,
      },
    }).state;
    if (state.entrants.some((e) => e.track!.overtakesCompleted > 0)) passes++;
  }
  return passes / 200;
}
export function trafficMeasurements() {
  const i = trafficInput(42, 900, 2000);
  const blocked = {
    ...i,
    interaction: {
      ...i.interaction!,
      overtakingDifficulty: 100,
      drsZoneCount: 0,
    },
    entrants: i.entrants.map((e, n) => ({
      ...e,
      interaction: { overtaking: n ? 0 : 65, defending: 100 },
    })),
  };
  let s = createRace(blocked);
  let caught = 0;
  for (let lap = 1; lap <= 5; lap++) {
    s = advanceRaceLap(s);
    if (
      !caught &&
      s.entrants[1].intervalToAheadMs === blocked.interaction.minimumGapMs
    )
      caught = lap;
  }
  const free = simulateRace({
    ...blocked,
    totalLaps: 5,
    entrants: [{ ...blocked.entrants[1], gridPosition: 1 }],
  }).state.entrants[0];
  return {
    advantageMs: 900,
    startingGapMs: 2000,
    caughtLap: caught,
    trafficCost5LapsMs: s.entrants[1].elapsedTimeMs - 2000 - free.elapsedTimeMs,
    easyRate: scenarioRate(10, false),
    difficultRate: scenarioRate(90, false),
    withoutDrs: scenarioRate(50, false),
    withDrs: scenarioRate(50, true),
    smallAdvantageRate: scenarioRate(10, false, 20),
  };
}

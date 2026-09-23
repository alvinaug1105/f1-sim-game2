import { trafficInput } from "./traffic";
import { defaultPitConfiguration } from "../../src/simulation/race/pits/profiles";
import { requestPitStop } from "../../src/simulation/race/pits/model";
import { createRace, advanceRaceLap } from "../../src/simulation/race/engine";
import type {
  RaceSimulationInput,
  RaceSimulationState,
} from "../../src/simulation/race/types";
import type { TyreCompound } from "../../src/simulation/race/tyres/model";
export function pitInput(
  seed = 42,
  count = 2,
  totalLaps = 58,
): RaceSimulationInput {
  const i = trafficInput(seed, 0, 1000);
  return {
    ...i,
    totalLaps,
    pits: defaultPitConfiguration(),
    entrants: Array.from({ length: count }, (_, n) => ({
      ...i.entrants[n % 2],
      entrantId: `pit-entrant-${n}`,
      driverId: `pit-driver-${n}`,
      teamId: `pit-team-${Math.floor(n / 2)}`,
      gridPosition: n + 1,
      strategyController: "PLAYER" as const,
    })),
  };
}
export interface ScheduledStop {
  lap: number;
  index: number;
  compound: TyreCompound;
}
export function runPitSchedule(
  input: RaceSimulationInput,
  stops: readonly ScheduledStop[],
  initial?: RaceSimulationState,
) {
  let s = initial ?? createRace(input);
  while (s.status === "RUNNING") {
    for (const stop of stops.filter((x) => x.lap === s.lap + 1))
      s = requestPitStop(
        s,
        input.entrants[stop.index].entrantId,
        stop.compound,
      );
    s = advanceRaceLap(s);
  }
  return s;
}
export function strategyComparisons() {
  return (
    [
      {
        name: "Medium → Hard",
        compound: "MEDIUM",
        stops: [{ lap: 25, index: 0, compound: "HARD" }],
      },
      {
        name: "Soft → Medium → Soft",
        compound: "SOFT",
        stops: [
          { lap: 18, index: 0, compound: "MEDIUM" },
          { lap: 40, index: 0, compound: "SOFT" },
        ],
      },
      { name: "Hard only", compound: "HARD", stops: [] },
    ] as const
  ).map((plan) => {
    const i = pitInput(42, 1);
    const input = {
      ...i,
      entrants: i.entrants.map((e) => ({
        ...e,
        startingTyre: { ...e.startingTyre!, compound: plan.compound },
      })),
    };
    const e = runPitSchedule(input, plan.stops).entrants[0];
    return {
      strategy: plan.name,
      totalTimeMs: e.elapsedTimeMs,
      stops: e.pit!.stops.length,
      pitLossMs: e.pit!.stops.reduce((a, b) => a + b.totalLossMs, 0),
    };
  });
}

/** Controlled initial wear and checkpoint gaps; not production starting conditions. */
export function strategyScenario(
  kind: "undercut" | "overcut" | "clear" | "traffic",
) {
  const traffic = kind === "traffic",
    overcut = kind === "overcut";
  const i = pitInput(42, traffic ? 3 : 2, 12);
  const wear = overcut ? 100 : kind === "undercut" ? 750 : 650;
  const input: RaceSimulationInput = {
    ...i,
    pits: {
      ...i.pits!,
      newTyreTemperatureMilliC: overcut ? 20000 : 80000,
      stationaryVariationMs: 0,
    },
    interaction: {
      ...i.interaction!,
      opportunityIntervalLaps: 10,
      overtakingDifficulty: 100,
      minimumPaceAdvantageMs: 2000,
    },
    entrants: i.entrants.map((e, n) => ({
      ...e,
      car: { performance: n === 2 ? 30 : 90 },
      startingTyre: {
        ...e.startingTyre!,
        wearPermille: n === 2 ? 0 : wear,
        temperatureMilliC: 97000,
      },
      interaction: { overtaking: 0, defending: 100 },
    })),
  };
  let s = createRace(input);
  if (traffic)
    s = {
      ...s,
      entrants: s.entrants.map((e, n) =>
        n === 2
          ? {
              ...e,
              elapsedTimeMs: 15000,
              gapToLeaderMs: 15000,
              intervalToAheadMs: 14000,
              track: {
                ...e.track!,
                progressMicrolaps: -Math.round(
                  (15000 / input.circuit.baseLapTimeMs) * 1000000,
                ),
              },
            }
          : e,
      ),
    };
  const aLap = overcut ? 2 : kind === "undercut" ? 5 : 8,
    bLap = overcut ? 5 : 2;
  let rejoin = s;
  while (s.status === "RUNNING") {
    if (s.lap + 1 === aLap)
      s = requestPitStop(s, input.entrants[0].entrantId, "HARD");
    if (s.lap + 1 === bLap)
      s = requestPitStop(s, input.entrants[1].entrantId, "HARD");
    s = advanceRaceLap(s);
    if (s.lap === Math.max(aLap, bLap)) rejoin = s;
  }
  return { rejoin, final: s };
}

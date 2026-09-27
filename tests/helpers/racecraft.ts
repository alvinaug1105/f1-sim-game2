import { incidentInput } from "./incidents";
import { defaultRacecraftConfiguration } from "../../src/simulation/race/traffic/racecraft";
import { createRace, advanceRaceLap } from "../../src/simulation/race/engine";
import type { RaceSimulationInput, RaceSimulationState } from "../../src/simulation/race/types";
import type { CommandState } from "../../src/simulation/race/commands/model";
export interface RacecraftScenario {
  count?: number; seed?: number; laps?: number; gapMs?: number;
  /** Car-performance pace of each grid slot in ms relative to the leader (negative = faster). */
  paceMs?: readonly number[];
  drs?: boolean; difficulty?: number; racecraft?: boolean; ai?: boolean;
}
/** A quiet dry v7 race (no incidents, no lap-time noise) with controlled pace gaps; racecraft frozen in unless disabled. */
export function racecraftInput(o: RacecraftScenario = {}): RaceSimulationInput {
  const { count = 2, seed = 42, laps = 30, gapMs = 1000, paceMs = [], drs = false, difficulty, racecraft = true, ai = false } = o;
  const i = incidentInput(count, seed, laps);
  return {
    ...i,
    // Spread small test seeds: the engine's LCG gives nearly identical first draws for consecutive small seeds.
    seed: Math.imul(seed + 1, 2_654_435_761) >>> 0,
    parameters: { ...i.parameters, gridOffsetMs: gapMs, minVariationMs: 0, maxVariationMs: 0 },
    incidents: { ...i.incidents, baseErrorPpm: 0, controlDeficitPpm: 0, wearRiskPpm: 0, unsuitableRiskPpm: 0, battleRiskPpm: 0, baseMechanicalPpm: 0, conditionDeficitPpm: 0, distanceRiskPpm: 0 },
    interaction: { ...i.interaction!, drsZoneCount: drs ? 2 : 0, drsActivationLap: 1, ...(difficulty === undefined ? {} : { overtakingDifficulty: difficulty }) },
    commands: { ...i.commands!, ...(racecraft ? { racecraft: defaultRacecraftConfiguration() } : {}) },
    entrants: i.entrants.map((e, n) => ({
      ...e,
      car: { performance: 60 - (paceMs[n] ?? 0) / 30 },
      reliability: { reliability: 100, powerUnitCondition: 100, gearboxCondition: 100, control: 100 },
      ...(ai ? { strategyController: "DEVELOPMENT_AI" as const } : {}),
    })),
  };
}
/** Command modes for one car, found by its grid slot's entrant id (it keeps them after changing position). */
export function carModes(s: RaceSimulationState, values: Partial<CommandState>, gridSlot: number): RaceSimulationState {
  const id = s.input.entrants[gridSlot].entrantId;
  return { ...s, entrants: s.entrants.map(e => e.entrantId === id ? { ...e, commands: { ...e.commands!, ...values } } : e) };
}
/** Every lap's state (lap 1 → total). */
export function laps(input: RaceSimulationInput, prepare: (s: RaceSimulationState) => RaceSimulationState = s => s) {
  const out: RaceSimulationState[] = [];
  let s = createRace(input);
  while (s.status === "RUNNING") { s = advanceRaceLap(prepare(s)); out.push(s); }
  return out;
}

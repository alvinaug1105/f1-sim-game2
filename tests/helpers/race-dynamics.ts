import { incidentInput } from "./incidents";
import { requestPitStop } from "../../src/simulation/race/pits/model";
import { createRace } from "../../src/simulation/race/engine";
import type { RaceSimulationState } from "../../src/simulation/race/types";
import type { TyreCompound } from "../../src/simulation/race/tyres/model";
import type { RaceStint } from "../../src/simulation/race/pits/types";

/** Incident configuration where only a car with zero reliability ratings can fail — and then always retires. */
export function onlyZeroReliabilityRetires(s: RaceSimulationState): RaceSimulationState["input"]["incidents"] {
  return {
    ...s.input.incidents!, baseErrorPpm: 0, controlDeficitPpm: 0, wearRiskPpm: 0, unsuitableRiskPpm: 0, battleRiskPpm: 0,
    baseMechanicalPpm: 0, conditionDeficitPpm: 10000, distanceRiskPpm: 0, mechanicalRetirementPermille: 1000,
    vscRetirementPermille: 0, vscMinorPermille: 0, scMajorPermille: 0,
  };
}
/** Before the NEXT lap: the car at `index` (grid order) is called in AND suffers a certain mechanical retirement on that lap. */
export function pitAndRetireNextLap(s: RaceSimulationState, index: number, compound: TyreCompound = "HARD"): RaceSimulationState {
  const target = s.input.entrants[index].entrantId;
  const edited: RaceSimulationState = {
    ...s,
    input: {
      ...s.input,
      incidents: onlyZeroReliabilityRetires(s),
      entrants: s.input.entrants.map(e => ({
        ...e,
        reliability: e.entrantId === target
          ? { reliability: 0, powerUnitCondition: 0, gearboxCondition: 0, control: 100 }
          : { reliability: 100, powerUnitCondition: 100, gearboxCondition: 100, control: 100 },
      })),
    },
  };
  return requestPitStop(edited, target, compound);
}
/** A quiet 4-car v7 race (no incidents unless a test forces one); every car is player-managed. */
export function quietIncidentRace(count = 4, seed = 42) {
  const s = createRace(incidentInput(count, seed));
  return { ...s, input: { ...s.input, incidents: onlyZeroReliabilityRetires(s), entrants: s.input.entrants.map(e => ({ ...e, reliability: { reliability: 100, powerUnitCondition: 100, gearboxCondition: 100, control: 100 } })) } };
}
/** Persisted-history invariants (mirrors the SQL CHECKs plus stop/stint linkage). */
export function stintProblems(stints: readonly RaceStint[], stops: readonly { number: number; lap: number; newCompound: TyreCompound; oldCompound: TyreCompound }[]) {
  const problems: string[] = [];
  if (stints.length !== stops.length + 1) problems.push("stints != stops + 1");
  if (stints.filter(s => s.endLap === null).length > 1) problems.push("more than one open stint");
  stints.forEach((s, i) => {
    if (s.number !== i + 1) problems.push(`stint ${i + 1} number`);
    if (s.endLap !== null && !(s.endLap > s.startLap)) problems.push(`stint ${s.number} zero/negative length ${s.startLap}-${s.endLap}`);
    if (s.endLap !== null && s.endingTyre === null) problems.push(`stint ${s.number} missing ending tyre`);
    if (i > 0) {
      const stop = stops[i - 1];
      if (stop.lap !== s.startLap) problems.push(`stop ${stop.number} lap vs stint ${s.number} start`);
      if (stop.newCompound !== s.startingTyre.compound) problems.push(`stop ${stop.number} compound`);
      if (stop.oldCompound !== stints[i - 1].startingTyre.compound) problems.push(`stop ${stop.number} old compound`);
      if (stints[i - 1].endLap !== stop.lap) problems.push(`stint ${i} not closed at stop ${stop.number}`);
    }
  });
  return problems;
}

import { assessAiStop, defaultAiStrategyConfiguration, publicWeather, type StrategyPreference } from "../../src/simulation/race/pits/ai-strategy";
import { greenPitLaneLoss } from "../../src/simulation/race/pits/model";
import { effectivePitLaneLoss } from "../../src/simulation/race/incidents/model";
import type { WeatherConfiguration } from "../../src/simulation/race/weather/model";
import type { RaceEntrantState } from "../../src/simulation/race/types";
/** Neutral character; tests vary one trait at a time. */
export const NEUTRAL: StrategyPreference = { stopBias: 0, undercut: 0.5, trafficSensitivity: 1, compound: 0 };
/** Quiet v7 race with the AI strategy configuration frozen in (cars stay player-managed unless a test says otherwise). */
export function strategyRace(count = 1, seed = 42, weather?: WeatherConfiguration, ai = false): RaceSimulationState {
  const s = quietIncidentRace(count, seed);
  return { ...s, ...(weather ? { weather: structuredClone(weather.initial) } : {}), input: { ...s.input, ...(weather ? { weather } : {}), pits: { ...s.input.pits!, strategy: defaultAiStrategyConfiguration() },
    entrants: s.input.entrants.map(e => ({ ...e, strategyController: ai ? "DEVELOPMENT_AI" as const : e.strategyController })) } };
}
/** The policy's view of car `e` at this checkpoint, exactly as the engine builds it (SC/VSC: reduced effective loss). */
export function assess(s: RaceSimulationState, e: RaceEntrantState, preference: StrategyPreference) {
  const mode = s.incidents?.mode ?? "GREEN";
  const view = mode === "GREEN" ? s : { ...s, input: { ...s.input, pits: { ...s.input.pits!, pitLaneLossMs: effectivePitLaneLoss(s) } } };
  return assessAiStop({ state: view, entrant: e, weather: s.weather!, publicWeather: publicWeather(s.input.weather!), mode, greenPitLaneLossMs: greenPitLaneLoss(view) }, s.input.pits!.strategy!, preference);
}

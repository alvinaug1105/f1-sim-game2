import { weatherInput, constantWeather } from "./weather";
import { defaultIncidentConfiguration, defaultReliability } from "../../src/simulation/race/incidents/model";
import { createRace } from "../../src/simulation/race/engine";
import type { RaceSimulationState } from "../../src/simulation/race/types";
export function incidentInput(count = 4, seed = 42, total = 58) { const i = weatherInput(count, seed, total); return { ...i, weather: constantWeather(0), incidents: defaultIncidentConfiguration(), entrants: i.entrants.map(e => ({ ...e, reliability: defaultReliability() })) }; }
export function quietRace(count = 4) { const i = incidentInput(count); return createRace({ ...i, incidents: { ...i.incidents, baseErrorPpm: 0, controlDeficitPpm: 0, wearRiskPpm: 0, unsuitableRiskPpm: 0, battleRiskPpm: 0, baseMechanicalPpm: 0, conditionDeficitPpm: 0, distanceRiskPpm: 0 } }); }
export function neutralise(s: RaceSimulationState, mode: "VSC" | "SAFETY_CAR", laps = 3): RaceSimulationState { return { ...s, incidents: { ...s.incidents!, mode, startedLap: s.lap, remainingLaps: laps } }; }
export function forceMechanical(s: RaceSimulationState, retire = false): RaceSimulationState { return { ...s, input: { ...s.input, incidents: { ...s.input.incidents!, baseMechanicalPpm: 1000000, mechanicalRetirementPermille: retire ? 1000 : 0, vscRetirementPermille: retire ? 1000 : 0, vscMinorPermille: 0 } } }; }

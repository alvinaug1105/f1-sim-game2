/** Race v8C (progression revision 3) test fixtures: production-shaped inputs and synthetic actual-tyre histories. */
import { createRace } from "../../src/simulation/race/engine";
import { progressionCForCircuit } from "../../src/data/seed/circuit-progression";
import { defaultPitConfiguration } from "../../src/simulation/race/pits/profiles";
import { defaultAiStrategyConfiguration } from "../../src/simulation/race/pits/ai-strategy";
import { developmentWeather } from "../../src/simulation/race/weather/model";
import type { RegulatedSession } from "../../src/simulation/race/regulations/tyres";
import type { TyreCompound } from "../../src/simulation/race/tyres/model";
import type { CarProgression } from "../../src/simulation/race/progression/model";
import type { RaceSimulationInput, RaceSimulationState } from "../../src/simulation/race/types";
import { incidentInput } from "./incidents";

export const SUZUKA = "00000000-0000-4000-8000-000000000301", MONACO = "00000000-0000-4000-8000-000000000304", MONZA = "00000000-0000-4000-8000-000000000315";
export interface V8cScenario { circuit?: string; seed?: number; laps?: number; count?: number; players?: number; session?: RegulatedSession; weather?: boolean; quiet?: boolean }
/** A production-shaped revision-3 Race input: incidents, AI pit strategy, dry (or changing) weather, revision-3 content. */
export function v8cInput(o: V8cScenario = {}): RaceSimulationInput {
    const { circuit = SUZUKA, seed = 11, laps = 30, count = 22, players = 0, session = "RACE", weather = false, quiet = false } = o;
    const b = incidentInput(count, seed, laps);
    return {
        ...b,
        ...(weather ? { weather: developmentWeather(seed, laps) } : {}),
        ...(quiet ? { incidents: { ...b.incidents, baseErrorPpm: 0, controlDeficitPpm: 0, wearRiskPpm: 0, unsuitableRiskPpm: 0, battleRiskPpm: 0, baseMechanicalPpm: 0, conditionDeficitPpm: 0, distanceRiskPpm: 0 } } : {}),
        pits: { ...defaultPitConfiguration(), strategy: defaultAiStrategyConfiguration() },
        progression: progressionCForCircuit(circuit, session),
        entrants: b.entrants.map((e, n) => ({ ...e, strategyController: n < players ? "PLAYER" as const : "DEVELOPMENT_AI" as const })),
    };
}
export const v8cRace = (o: V8cScenario = {}) => createRace(v8cInput(o));
/**
 * Replace one car's ACTUAL tyre history (stints in order, the last one current) and optionally its route — a pure
 * fixture for the compliance helper (the engine never produces impossible histories).
 */
export function withTyres(s: RaceSimulationState, entrantId: string, compounds: readonly TyreCompound[], route: CarProgression["route"] = "TRACK", status?: "RUNNING" | "FINISHED" | "RETIRED"): RaceSimulationState {
    const tyre = (compound: TyreCompound) => ({ compound, ageLaps: 1, wearPermille: 50, temperatureMilliC: 90000 });
    const stints = compounds.map((c, i) => ({ number: i + 1, startLap: i * 2, endLap: i === compounds.length - 1 ? null : i * 2 + 2, startingTyre: tyre(c), endingTyre: i === compounds.length - 1 ? null : tyre(c) }));
    return {
        ...s,
        progression: { ...s.progression!, cars: { ...s.progression!.cars, [entrantId]: { ...s.progression!.cars[entrantId], route } } },
        entrants: s.entrants.map(e => e.entrantId !== entrantId ? e : { ...e, ...(status ? { incident: { ...e.incident!, status } } : {}), stint: { number: compounds.length, startedAtLap: (compounds.length - 1) * 2, tyre: tyre(compounds.at(-1)!) }, pit: { ...e.pit!, stints } }),
    };
}

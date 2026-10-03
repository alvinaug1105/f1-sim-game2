/** Race v8D (progression revision 4) test fixtures: the production tuning bundle on top of the v8C fixture. */
import { createRace } from "../../src/simulation/race/engine";
import { progressionDForCircuit } from "../../src/data/seed/circuit-progression";
import { defaultCommandConfiguration } from "../../src/simulation/race/commands/model";
import { defaultRacecraftConfiguration } from "../../src/simulation/race/traffic/racecraft";
import { v8dTuningBundle } from "../../src/features/race/v8d-tuning";
import type { RaceSimulationInput } from "../../src/simulation/race/types";
import { SUZUKA, v8cInput, type V8cScenario } from "./v8c";

/** A production-shaped revision-4 Race input: exactly what `startCareerRace(..., 4)` freezes from the bundle. */
export function v8dInput(o: V8cScenario = {}): RaceSimulationInput {
    const base = v8cInput(o), progression = progressionDForCircuit(o.circuit ?? SUZUKA, o.session ?? "RACE");
    const bundle = v8dTuningBundle(progression, base.circuit.baseLapTimeMs, true);
    return {
        ...base, progression, tyres: bundle.tyres,
        pits: { ...base.pits!, pitLaneLossMs: bundle.pitTiming.pitLaneLossMs, strategy: bundle.strategy },
        incidents: { ...base.incidents!, pitTrackSectionMs: bundle.pitTiming.pitTrackSectionMs },
        commands: { ...(base.commands ?? defaultCommandConfiguration()), racecraft: bundle.racecraft },
    };
}
export const v8dRace = (o: V8cScenario = {}) => createRace(v8dInput(o));
/** The same Race frozen with the accepted (pre-v8D) racecraft: only the late-Race window differs. */
export function withoutLateWindow(i: RaceSimulationInput): RaceSimulationInput {
    return { ...i, commands: { ...i.commands!, racecraft: defaultRacecraftConfiguration() } };
}

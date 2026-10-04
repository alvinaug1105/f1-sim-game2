/** Race v8E (progression revision 5) test fixtures: the production v8E bundle on top of the v8C fixture. */
import { createRace } from "../../src/simulation/race/engine";
import { progressionEForCircuit } from "../../src/data/seed/circuit-progression";
import { defaultCommandConfiguration } from "../../src/simulation/race/commands/model";
import { v8eTuningBundle } from "../../src/features/race/v8e-tuning";
import type { RaceSimulationInput } from "../../src/simulation/race/types";
import { SUZUKA, v8cInput, type V8cScenario } from "./v8c";

/** A production-shaped revision-5 Race input: exactly what `startCareerRace(..., 5)` freezes from the bundle. */
export function v8eInput(o: V8cScenario = {}): RaceSimulationInput {
    const base = v8cInput(o), progression = progressionEForCircuit(o.circuit ?? SUZUKA, o.session ?? "RACE");
    const b = v8eTuningBundle(progression, base.circuit.baseLapTimeMs, true);
    return {
        ...base, progression, tyres: b.tyres, interaction: b.interaction,
        pits: { ...base.pits!, pitLaneLossMs: b.pitTiming.pitLaneLossMs, strategy: b.strategy },
        // Keep the fixture's (possibly quiet) incident risks; take every v8E Race Control field from the bundle.
        incidents: { ...base.incidents!, pitTrackSectionMs: b.incidents.pitTrackSectionMs, maxCompressionMs: b.incidents.maxCompressionMs, scTrainCatchupPermille: b.incidents.scTrainCatchupPermille, SAFETY_CAR: b.incidents.SAFETY_CAR },
        commands: { ...(base.commands ?? defaultCommandConfiguration()), racecraft: b.racecraft },
    };
}
export const v8eRace = (o: V8cScenario = {}) => createRace(v8eInput(o));

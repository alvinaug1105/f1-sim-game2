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
        ...base, progression, tyres: bundle.tyres, interaction: bundle.interaction,
        pits: { ...base.pits!, pitLaneLossMs: bundle.pitTiming.pitLaneLossMs, strategy: bundle.strategy },
        incidents: { ...base.incidents!, pitTrackSectionMs: bundle.pitTiming.pitTrackSectionMs },
        commands: { ...(base.commands ?? defaultCommandConfiguration()), racecraft: bundle.racecraft },
    };
}
export const v8dRace = (o: V8cScenario = {}) => createRace(v8dInput(o));
/** The same Race without the late-Race window (every other v8D racecraft field kept): only the window differs. */
export function withoutLateWindow(i: RaceSimulationInput): RaceSimulationInput {
    const { lateRaceStartPermille: _a, lateRaceAttackThresholdPermille: _b, lateRaceMinimumPaceAdvantagePermille: _c, ...rest } = i.commands!.racecraft!;
    void _a; void _b; void _c;
    return { ...i, commands: { ...i.commands!, racecraft: rest } };
}
/** The same Race without the v8D progression held-following loss (clamp only, as accepted before the repair). */
export function withoutHeldLoss(i: RaceSimulationInput): RaceSimulationInput {
    const { progressionHeldFollowingLossPermille: _a, progressionHeldFollowingLossMaxMs: _b, ...rest } = i.commands!.racecraft!;
    void _a; void _b;
    return { ...i, commands: { ...i.commands!, racecraft: rest } };
}
/** The accepted (pre-v8D) racecraft. */
export const acceptedRacecraft = defaultRacecraftConfiguration;

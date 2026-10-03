/**
 * Deterministic energy-budget driver for the REAL assistance accounting (energyStep + revision-3 recoverByDistance):
 * one car running alone at a constant pace around a circuit's frozen zones, in 100 ms slices cut at zone boundaries,
 * with the same call order as the progression engine (deploy → move → recover). No Race, no traffic, no RNG.
 */
import { LAP_UNITS, zonesAt, type ProgressionConfiguration } from "../../src/simulation/race/progression/model";
import { energyModelFor } from "../../src/simulation/race/progression/revision";
import { deploys, energyStep, initialAssistance, recoverByDistance, type AssistanceState, type EnergyPolicy } from "../../src/simulation/race/assistance/model";

export interface BudgetLap {
    /** Policy for this lap. */
    readonly policy: EnergyPolicy;
    /** Neutralised running (SC / VSC / pit lane): no deployment allowed. */
    readonly neutral?: boolean;
    /** Lap time in ms (a slower neutralised lap is longer). Default 90 000. */
    readonly lapMs?: number;
}
export interface BudgetResult {
    readonly energyAtLapEnd: number[];
    /** Electrical benefit integral per lap: Σ electricalDeltaMs × slice ms / lap ms (≈ ms of lap time gained). */
    readonly benefitPerLap: number[];
    readonly usedPerLap: number[];
    readonly recoveredPerLap: number[];
    readonly state: AssistanceState;
}
export function runBudget(config: ProgressionConfiguration, laps: readonly BudgetLap[], start?: Partial<AssistanceState>, slicer = 100): BudgetResult {
    const c = config.assistance!, v8c = energyModelFor(config) === "V8C";
    const s: AssistanceState = { ...initialAssistance(c), ...start };
    const bounds = [...new Set([0, LAP_UNITS, ...config.segments.map(x => x.end), ...config.zones.flatMap(z => [z.start, z.end])])].sort((a, b) => a - b);
    const out: BudgetResult = { energyAtLapEnd: [], benefitPerLap: [], usedPerLap: [], recoveredPerLap: [], state: s };
    for (const [n, lap] of laps.entries()) {
        s.policy = lap.policy;
        const lapMs = lap.lapMs ?? 90000, rate = LAP_UNITS * 1000 / lapMs; // nanolaps per ms
        let p = 0, rem = 0, benefit = 0, used = 0, recovered = 0;
        while (p < LAP_UNITS) {
            const next = bounds.find(b => b > p)!;
            const dt = Math.max(1, Math.min(slicer, Math.ceil(((next - p) * 1000 - rem) / rate)));
            const straight = zonesAt(config, p).some(z => z.kind === "ASSISTANCE"), x = { dt, lap: n, progress: p, straight, safe: !lap.neutral };
            const before = s.energy;
            energyStep(s, c, x);
            used += s.used; benefit += s.electricalDeltaMs * dt / lapMs;
            const units = dt * rate + rem, moved = Math.min(next - p, Math.floor(units / 1000)); rem = moved === next - p ? 0 : units % 1000;
            if (v8c) recoverByDistance(s, c, moved, deploys(s, x));
            recovered += s.energy - before + s.used;
            p += moved;
        }
        out.energyAtLapEnd.push(s.energy); out.benefitPerLap.push(benefit); out.usedPerLap.push(used); out.recoveredPerLap.push(recovered);
    }
    return out;
}
export const hold = (policy: EnergyPolicy, laps: number, extra: Partial<BudgetLap> = {}): BudgetLap[] => Array.from({ length: laps }, () => ({ policy, ...extra }));

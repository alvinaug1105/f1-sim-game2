/**
 * Race v8E local fix pass (still progression revision 5): circuit-scaled attack cadence,
 * tyre-blanket warm-up for fitted tyres, the per-car track-position value and dry-start plan, neutral wet-tyre refreshes,
 * and revision-4 isolation of every one of them. Mechanism / boundary tests only — no tuning-output assertions.
 */
import { describe, expect, it } from "vitest";
import { advanceRace, createRace } from "../src/simulation/race/engine";
import { progressionDForCircuit, progressionEForCircuit } from "../src/data/seed/circuit-progression";
import { attackCadence, attackOpen, heldLossAllowed, v8dRacecraftConfiguration, v8eRacecraftConfiguration, validateRacecraftConfiguration, V8E_ATTACK_COOLDOWN_MS, V8E_ATTACK_REARM_GAP_MS, V8E_CADENCE_NEUTRAL_DIFFICULTY } from "../src/simulation/race/traffic/racecraft";
import { aiDryStartingPlan, extraStopTrackPositionMs, v8dAiStrategyConfiguration, v8eAiStrategyConfiguration, validateAiStrategyConfiguration, type DryStartPlanInput } from "../src/simulation/race/pits/ai-strategy";
import { freshTyreTemperatureMilliC } from "../src/simulation/race/tyres/fresh";
import { startingTyre, v8eWeatherTyreConfiguration } from "../src/simulation/race/tyres/profiles";
import { defaultPitConfiguration } from "../src/simulation/race/pits/profiles";
import { defaultInteractionConfiguration } from "../src/simulation/race/traffic/profiles";
import type { TyreCompound } from "../src/simulation/race/tyres/model";
import { assess, NEUTRAL } from "./helpers/race-dynamics";
import { weatherField } from "./helpers/weather-overdelay";
import { SUZUKA } from "./helpers/v8c";
import { v8dInput } from "./helpers/v8d";
import { v8eInput } from "./helpers/v8e";

describe("circuit identity: the attack cadence scales with the circuit's own overtaking difficulty", () => {
    const r = v8eRacecraftConfiguration();
    it("neutral difficulty keeps the base cadence; easy circuits re-attack sooner, hard ones later (monotone, integer)", () => {
        expect(attackCadence(r, V8E_CADENCE_NEUTRAL_DIFFICULTY)).toEqual({ cooldownMs: V8E_ATTACK_COOLDOWN_MS, rearmGapMs: V8E_ATTACK_REARM_GAP_MS });
        let last = attackCadence(r, 0)!;
        for (let d = 5; d <= 100; d += 5) {
            const now = attackCadence(r, d)!;
            expect(Number.isSafeInteger(now.cooldownMs) && Number.isSafeInteger(now.rearmGapMs)).toBe(true);
            expect(now.cooldownMs).toBeGreaterThanOrEqual(last.cooldownMs); expect(now.rearmGapMs).toBeGreaterThanOrEqual(last.rearmGapMs);
            last = now;
        }
        expect(attackCadence(r, 15)!.cooldownMs).toBeLessThan(V8E_ATTACK_COOLDOWN_MS); // e.g. Spa / Monza / Las Vegas class
        expect(attackCadence(r, 85)!.cooldownMs).toBeGreaterThan(V8E_ATTACK_COOLDOWN_MS); // e.g. Monaco class
        expect(attackCadence(r, undefined)).toEqual({ cooldownMs: V8E_ATTACK_COOLDOWN_MS, rearmGapMs: V8E_ATTACK_REARM_GAP_MS });
    });
    it("the gate uses the circuit cooldown; a hard circuit still waits where an easy one may already re-attack", () => {
        const car = { attemptedLap: 4, attacksThisLap: 1, lastAttackAtMs: 10000, attackArmed: true };
        const easy = attackCadence(r, 15)!.cooldownMs, hard = attackCadence(r, 85)!.cooldownMs;
        expect(attackOpen(r, car, 5, 10000 + easy, 15)).toBe(true);
        expect(attackOpen(r, car, 5, 10000 + easy, 85)).toBe(false);
        expect(attackOpen(r, car, 5, 10000 + hard, 85)).toBe(true);
        expect(heldLossAllowed(r, car, 5, 10000 + easy, 85)).toBe(false);
        expect(heldLossAllowed(r, car, 5, 10000 + hard, 85)).toBe(true);
    });
    it("revision 4 has no cadence at all (null) whatever the circuit; the field needs the cadence and is bounded", () => {
        expect(attackCadence(v8dRacecraftConfiguration(), 85)).toBeNull();
        expect(attackOpen(v8dRacecraftConfiguration(), { attemptedLap: 4 }, 5, 0, 85)).toBe(true);
        expect(() => validateRacecraftConfiguration(r)).not.toThrow();
        expect(() => validateRacecraftConfiguration({ ...v8dRacecraftConfiguration(), attackCadenceNeutralDifficulty: 35 })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, attackCadenceNeutralDifficulty: 0 })).toThrow();
    });
    it("the revision-5 bundle freezes the circuit-scaled cadence; the Race reads difficulty from its own interaction snapshot", () => {
        const i = v8eInput({ count: 4, laps: 6, quiet: true });
        expect(i.commands!.racecraft!.attackCadenceNeutralDifficulty).toBe(V8E_CADENCE_NEUTRAL_DIFFICULTY);
        expect(typeof i.interaction!.overtakingDifficulty).toBe("number");
    });
});

// The Sprint tactical AI policy of this pass was replaced by local fix 2: see tests/race-v8e-local-fix-2.test.ts.

describe("tyre warm-up (undercut component): fitted tyres come off blankets in revision 5 only", () => {
    const tyres = v8eWeatherTyreConfiguration(), pits = defaultPitConfiguration();
    it("revision 5: at least the bottom of each compound's window, never above its top; revision 4: the frozen pit value", () => {
        const five = { pits, tyres, progression: progressionEForCircuit(SUZUKA, "RACE") }, four = { pits, tyres, progression: progressionDForCircuit(SUZUKA, "RACE") };
        for (const c of ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const) {
            const p = tyres.profiles[c]!, t = freshTyreTemperatureMilliC(five, c);
            expect(t).toBeGreaterThanOrEqual(Math.min(p.idealTemperatureMinMilliC, p.idealTemperatureMaxMilliC));
            expect(t).toBeLessThanOrEqual(p.idealTemperatureMaxMilliC);
            expect(freshTyreTemperatureMilliC(four, c)).toBe(pits.newTyreTemperatureMilliC);
        }
        expect(freshTyreTemperatureMilliC(five, "SOFT")).toBe(tyres.profiles.SOFT.idealTemperatureMinMilliC);
    });
    it("a revision-5 stop fits the new tyre at the blanket temperature (engine and planner use the same rule)", () => {
        let s = createRace(v8eInput({ count: 4, laps: 30, quiet: true, seed: 11 }));
        while (s.status === "RUNNING" && !s.entrants.some(e => e.pit!.stops.length)) s = advanceRace(s, 1);
        const e = s.entrants.find(x => x.pit!.stops.length)!, stint = e.pit!.stints.at(-1)!;
        expect(stint.startingTyre.temperatureMilliC).toBe(freshTyreTemperatureMilliC(s.input, stint.startingTyre.compound));
    }, 60_000);
});

describe("dry strategy diversity: per-car track-position value and the dry-start plan", () => {
    const v = v8eAiStrategyConfiguration(), interaction = defaultInteractionConfiguration();
    it("extra-stop track position: shared value in revision 4; scaled by trafficSensitivity in revision 5", () => {
        const d = v8dAiStrategyConfiguration(), lo = { ...NEUTRAL, trafficSensitivity: 0.5 }, hi = { ...NEUTRAL, trafficSensitivity: 1.5 };
        expect(extraStopTrackPositionMs(d, lo, { interaction })).toBe(extraStopTrackPositionMs(d, hi, { interaction }));
        expect(extraStopTrackPositionMs(v, NEUTRAL, { interaction })).toBe(extraStopTrackPositionMs(d, NEUTRAL, { interaction }));
        expect(extraStopTrackPositionMs(v, lo, { interaction })).toBeLessThan(extraStopTrackPositionMs(v, hi, { interaction }));
        expect(() => validateAiStrategyConfiguration({ ...v, trackPositionValueSpreadPermille: 1001 })).toThrow();
    });
    const plan = (tolerance: number, compound: number, distinct = true) => {
        const tyres = v8eWeatherTyreConfiguration(), progression = progressionEForCircuit(SUZUKA, "RACE");
        const o: DryStartPlanInput = { tyres, totalLaps: 53, minimumStintLaps: 3, stopBaseMs: 25000, distinctCompounds: distinct, interaction,
            startTyre: (c: TyreCompound) => startingTyre(c), freshTyre: (c: TyreCompound) => ({ compound: c, ageLaps: 0, wearPermille: 0, temperatureMilliC: freshTyreTemperatureMilliC({ pits: defaultPitConfiguration(), tyres, progression }, c) }) };
        return aiDryStartingPlan(o, { ...v, compoundToleranceMs: tolerance }, { ...NEUTRAL, compound });
    };
    it("a clearly best start is taken by every character; only genuinely close plans leave the choice to the character", () => {
        const strict = new Set([-1, -0.5, 0, 0.5, 1].map(c => plan(0, c)));
        expect(strict.size).toBe(1);
        expect(plan(1e9, -1)).toBe("SOFT"); expect(plan(1e9, 1)).toBe("HARD"); // everything "sensible": softest ↔ hardest by character
        expect(plan(2500, 0.3)).toBe(plan(2500, 0.3)); // deterministic
        expect(["SOFT", "MEDIUM", "HARD"]).toContain(plan(2500, 0, false));
    });
});

describe("wet tyre refresh (Issue 7): a same-family refresh is a wear stop, not a weather decision", () => {
    it("the decision for a worn intermediate on a steady intermediate track does not depend on the weather-risk trait", () => {
        const s0 = weatherField(71, [[1, 1000]], 450, "INTERMEDIATE"), w = s0.input.weather!;
        const s = { ...s0, lap: 20, input: { ...s0.input, weather: { ...w, circuit: { ...w.circuit, accumulationPermille: 0, drainagePerLap: 0, dryingPerLap: 0 } }, tyres: v8eWeatherTyreConfiguration(), pits: { ...s0.input.pits!, strategy: v8eAiStrategyConfiguration() } } };
        for (const wear of [300, 600, 780]) {
            const e = { ...s.entrants[0], stint: { ...s.entrants[0].stint!, startedAtLap: 2, tyre: { ...s.entrants[0].stint!.tyre, ageLaps: 18, wearPermille: wear } } };
            expect(assess(s, e, { ...NEUTRAL, weatherRisk: -1 })).toEqual(assess(s, e, { ...NEUTRAL, weatherRisk: 1 }));
        }
        expect(v8eAiStrategyConfiguration().wetRefreshNeutral).toBe(true);
        expect(v8dAiStrategyConfiguration()).not.toHaveProperty("wetRefreshNeutral");
    });
});

describe("revision-4 isolation of every local-fix mechanism", () => {
    it("revision-4 snapshots carry none of the new fields, so every new code path falls back to the accepted rule", () => {
        const i = v8dInput({ count: 4, laps: 6, quiet: true });
        for (const k of ["attackCadenceNeutralDifficulty", "passEdgeNeutralDifficulty", "aiPitCyclePace", "aiSprintTactics", "aiFinalAttackLaps"]) expect(i.commands!.racecraft).not.toHaveProperty(k);
        for (const k of ["trackPositionValueSpreadPermille", "wetRefreshNeutral"]) expect(i.pits!.strategy).not.toHaveProperty(k);
        expect(freshTyreTemperatureMilliC(i, "SOFT")).toBe(i.pits!.newTyreTemperatureMilliC);
    });
});

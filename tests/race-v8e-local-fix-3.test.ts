/**
 * Race v8E local fix 3 (still progression revision 5): the bounded circuit pass conversion, and a real-progression
 * regression for the pit-cycle correction (the first fresh-tyre lap after a green AI stop is driven at PUSH).
 * Mechanism / boundary tests only — no pass-count or tuning-output assertions.
 */
import { describe, expect, it } from "vitest";
import { advanceRace, createRace } from "../src/simulation/race/engine";
import { AI_PIT_CYCLE_PACE } from "../src/simulation/race/assistance/policy";
import { circuitPassEdge, v8dRacecraftConfiguration, v8eRacecraftConfiguration, validateRacecraftConfiguration, V8E_PASS_EDGE_EASY_RESPONSE_PERMILLE, V8E_PASS_EDGE_HARD_RESPONSE_PERMILLE, V8E_PASS_EDGE_NEUTRAL_DIFFICULTY } from "../src/simulation/race/traffic/racecraft";
import { v8dInput } from "./helpers/v8d";
import { v8eInput } from "./helpers/v8e";

describe("circuit pass conversion: bounded, asymmetric response (local fix 3)", () => {
    const r = v8eRacecraftConfiguration(), n = V8E_PASS_EDGE_NEUTRAL_DIFFICULTY;
    const easy = V8E_PASS_EDGE_EASY_RESPONSE_PERMILLE / 1000, hard = V8E_PASS_EDGE_HARD_RESPONSE_PERMILLE / 1000;
    const full = { ...r, passEdgeEasyResponsePermille: 1000, passEdgeHardResponsePermille: 1000 };
    it("neutral counts the edge in full; the response is monotone in difficulty and never creates an edge", () => {
        for (const edge of [100, 250, 600, 1200]) {
            expect(circuitPassEdge(r, edge, n)).toBe(edge);
            let last = circuitPassEdge(r, edge, 0);
            for (let d = 1; d <= 100; d++) { const now = circuitPassEdge(r, edge, d); expect(Number.isSafeInteger(now)).toBe(true); expect(now).toBeLessThanOrEqual(last); last = now; }
        }
        expect(circuitPassEdge(r, 0, 100)).toBe(0); expect(circuitPassEdge(r, 0, 0)).toBe(0);
    });
    it("the factor stays within [1 − hard response, 1 + easy response] at every difficulty", () => {
        const edge = 10000;
        for (let d = 0; d <= 100; d++) {
            const v = circuitPassEdge(r, edge, d);
            expect(v).toBeGreaterThanOrEqual(Math.floor(edge * (1 - hard))); expect(v).toBeLessThanOrEqual(Math.ceil(edge * (1 + easy)));
        }
    });
    it("easy circuits still amplify and hard circuits still attenuate, both more gently than the local fix 2 curve", () => {
        expect(circuitPassEdge(r, 500, 15)).toBeGreaterThan(500); expect(circuitPassEdge(r, 500, 15)).toBeLessThan(circuitPassEdge(full, 500, 15));
        expect(circuitPassEdge(r, 500, 85)).toBeLessThan(500); expect(circuitPassEdge(r, 500, 85)).toBeGreaterThan(circuitPassEdge(full, 500, 85));
        // A large legitimate edge keeps most of its value even at the hardest class of circuit.
        expect(circuitPassEdge(r, 1200, 85)).toBeGreaterThanOrEqual(1200 * 0.85);
        expect(circuitPassEdge(r, 1200, 100)).toBeGreaterThanOrEqual(1200 * (1 - hard));
    });
    it("full response reproduces the local fix 2 curve exactly; no neutral field or no difficulty leaves the edge unchanged", () => {
        for (const d of [0, 15, 35, 62, 85, 100]) for (const edge of [101, 333, 1000]) expect(circuitPassEdge(full, edge, d)).toBe(Math.round(edge * 2 * n / (n + d)));
        const { passEdgeEasyResponsePermille: _e, passEdgeHardResponsePermille: _h, ...pass2 } = r; void _e; void _h;
        expect(circuitPassEdge(pass2, 500, 85)).toBe(circuitPassEdge(full, 500, 85));
        expect(circuitPassEdge(r, 300, undefined)).toBe(300);
        expect(circuitPassEdge(v8dRacecraftConfiguration(), 300, 85)).toBe(300);
    });
    it("is frozen into the revision-5 bundle and validated (both-or-neither, needs the neutral difficulty, bounded)", () => {
        const i = v8eInput({ count: 4, laps: 6, quiet: true }).commands!.racecraft!;
        expect(i.passEdgeEasyResponsePermille).toBe(V8E_PASS_EDGE_EASY_RESPONSE_PERMILLE); expect(i.passEdgeHardResponsePermille).toBe(V8E_PASS_EDGE_HARD_RESPONSE_PERMILLE);
        expect(() => validateRacecraftConfiguration(r)).not.toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, passEdgeHardResponsePermille: undefined })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, passEdgeNeutralDifficulty: undefined })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, passEdgeEasyResponsePermille: 1001 })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, passEdgeHardResponsePermille: -1 })).toThrow();
    });
});

describe("pit-cycle regression: the first fresh-tyre lap after a green AI stop (real progression path)", () => {
    it("revision 5: the out-lap's frozen lap commands are PUSH for every green-flag AI stop", () => {
        let s = createRace(v8eInput({ count: 8, laps: 30, quiet: true, seed: 11 })), observed = 0;
        while (s.status === "RUNNING") {
            const before = s, green = s.incidents!.mode === "GREEN";
            s = advanceRace(s, 1);
            for (const e of s.entrants) {
                const prior = before.entrants.find(x => x.entrantId === e.entrantId)!;
                // A stop completed in THIS checkpoint (its service and line crossing happened during the advance) and the
                // car is still on that fresh tyre's first lap: the lap's commands were frozen at the crossing in the lane.
                if (!green || e.incident!.status !== "RUNNING" || e.pit!.stops.length === prior.pit!.stops.length || e.stint!.tyre.ageLaps !== 0) continue;
                const lap = s.progression!.cars[e.entrantId].lapCommands;
                expect(lap).not.toBeNull();
                expect(lap!.paceMode).toBe(AI_PIT_CYCLE_PACE);
                observed++;
            }
        }
        expect(observed).toBeGreaterThan(0);
    }, 120_000);
});

describe("revision-4 isolation of the local-fix-3 fields", () => {
    it("revision-4 racecraft carries no conversion response, so its pass probability is untouched", () => {
        const r = v8dInput({ count: 4, laps: 6, quiet: true }).commands!.racecraft!;
        for (const k of ["passEdgeNeutralDifficulty", "passEdgeEasyResponsePermille", "passEdgeHardResponsePermille"]) expect(r).not.toHaveProperty(k);
    });
});

import { describe, expect, it } from "vitest";
import {
    advanceQualifying, callIn, continuePhase, createQualifying, enableAutoPlayer, runQualifyingToEnd, sendOut, stepQualifying, QualifyingRuleError,
} from "../src/simulation/qualifying/engine";
import { autoGarageDecision } from "../src/simulation/qualifying/policy";
import { finalClassification, phaseClassification } from "../src/simulation/qualifying/classification";
import {
    INTERMISSION_MS, OUT_LAP_PERMILLE, QUALIFYING_STEP_MS, QUALIFYING_WEATHER_TICK_MS, phaseFormat, planningLapMs, qualifyingFormat, qualifyingWeatherTicks,
    type QualifyingInput, type QualifyingState,
} from "../src/simulation/qualifying/model";
import { NEUTRAL_SETUP } from "../src/simulation/practice/model";
import { weatherTyreConfiguration } from "../src/simulation/race/tyres/profiles";
import { scenarioWeather, type WeatherScenario } from "../src/features/race/weather-scenarios";
import { developmentContent as source } from "../src/data/seed/content-development";
const PREP = { setup: NEUTRAL_SETUP, ideal: { AERO: 55, MECHANICAL: 45, RIDE: 50, BRAKE: 52, TYRE: 48 }, confidence: 500, acclimatisation: 600, tyreKnowledge: { SOFT: 500, MEDIUM: 500, HARD: 300, INTERMEDIATE: 100, WET: 100 } };
/** Engine-level input from the shipped 22-car balance data (or the first `n` cars); all AI unless players are named. */
function input(options: { seed?: number; scenario?: WeatherScenario; n?: number; players?: number[] } = {}): QualifyingInput {
    const { seed = 11, scenario = "DRY", n = 22, players = [] } = options, format = qualifyingFormat(n);
    return {
        version: 1, seed, stepMs: QUALIFYING_STEP_MS, weatherTickMs: QUALIFYING_WEATHER_TICK_MS, baseLapTimeMs: 86_667, format, tyres: weatherTyreConfiguration(),
        weather: scenarioWeather(seed, qualifyingWeatherTicks(format, QUALIFYING_WEATHER_TICK_MS), scenario),
        entrants: source.driverEntries.slice(0, n).map((d, i) => ({
            entrantId: `e${i}`, driverId: d.driverId, teamId: d.teamId, controller: players.includes(i) ? "PLAYER" as const : "AI" as const,
            driver: { pace: d.pace!, consistency: d.consistency! }, car: { performance: source.teamEntries.find(t => t.teamId === d.teamId)!.carPerformance! },
            preparation: PREP, fallbackRank: i + 1,
        })),
    };
}
/** Steps (continuing phases) until `until` holds; bounded. */
function run(s: QualifyingState, until: (s: QualifyingState) => boolean) {
    for (let n = 0; n < 2_000 && !until(s); n++) s = s.phaseStatus === "COMPLETE" && s.status === "RUNNING" ? continuePhase(s, s.phase) : stepQualifying(s);
    return s;
}
const at = (s: QualifyingState, phaseElapsedMs: number): QualifyingState => ({ ...s, phaseElapsedMs });
const idx = (s: QualifyingState, id: string) => s.entrants.findIndex(e => e.entrantId === id);
describe("qualifying format (data-driven by field size)", () => {
    it("22 → 16 → 10 with 18 / 15 / 13 minutes and 7-minute breaks", () => {
        const f = qualifyingFormat(22);
        expect(f.phases.map(p => [p.phase, p.eligible, p.advancing, p.durationMs / 60_000])).toEqual([["Q1", 22, 16, 18], ["Q2", 16, 10, 15], ["Q3", 10, 10, 13]]);
        expect(f.intermissionMs).toBe(7 * 60_000);
    });
    it("20 → 15 → 10 and a legacy 4-car field runs all three phases with every car", () => {
        expect(qualifyingFormat(20).phases.map(p => [p.eligible, p.advancing])).toEqual([[20, 15], [15, 10], [10, 10]]);
        expect(qualifyingFormat(4).phases.map(p => [p.eligible, p.advancing])).toEqual([[4, 4], [4, 4], [4, 4]]);
        expect(qualifyingFormat(10).phases.map(p => [p.eligible, p.advancing])).toEqual([[10, 10], [10, 10], [10, 10]]);
    });
});
describe("phase clock edges", () => {
    const out = Math.round(planningLapMs({ baseLapTimeMs: 86_667 }) * OUT_LAP_PERMILLE / 1000);
    it("a timed lap started before the flag finishes after it, counts, and the phase waits for it, then freezes once", () => {
        const base = createQualifying(input({ n: 1, players: [0] })), d = phaseFormat(base).durationMs;
        // Out lap finishes ~10 s before the flag → the timed lap starts in time.
        let s = sendOut(at(base, d - out - 12_000), "e0", 0, { compound: "SOFT", pushLaps: 1 });
        s = run(s, x => x.phaseElapsedMs >= d);
        expect(s.entrants[0].location).toBe("FLYING");
        expect(s.phaseStatus).toBe("RUNNING");                              // clock expired, lap still running
        s = run(s, x => x.phaseStatus === "COMPLETE");
        const best = s.entrants[0].best.Q1!;
        expect(best.setAtMs).toBeGreaterThan(d);                            // completed after the flag, still valid
        expect(stepQualifying(s)).toBe(s);                                  // frozen exactly once
    });
    it("an out lap still running at the flag cannot start a timed lap; no run may start after expiry", () => {
        const base = createQualifying(input({ n: 1, players: [0] })), d = phaseFormat(base).durationMs;
        expect(() => sendOut(at(base, d - out + 15_000), "e0", 0, { compound: "SOFT", pushLaps: 1 })).toThrow(expect.objectContaining({ code: "PLAN_TOO_LONG" }));
        // Out lap launched earlier with a 2-lap plan: the second timed lap would start after the flag.
        let s = sendOut(at(base, d - out - planningLapMs(base.input) - 30_000), "e0", 0, { compound: "SOFT", pushLaps: 2 });
        s = run(s, x => x.phaseStatus === "COMPLETE");
        expect(s.entrants[0].best.Q1).not.toBeNull();
        const expired = at(base, d);
        expect(() => sendOut(expired, "e0", 0, { compound: "SOFT", pushLaps: 1 })).toThrow(expect.objectContaining({ code: "CLOCK_EXPIRED" }));
        // A car on its out lap when the clock expires only returns to the pits: no timed lap.
        let t = sendOut(at(base, d - out - 12_000), "e0", 0, { compound: "SOFT", pushLaps: 1 });
        t = { ...t, phaseElapsedMs: d - 5_000 };                            // the out lap now ends after the flag
        t = run(t, x => x.phaseStatus === "COMPLETE");
        expect(t.entrants[0].best.Q1).toBeNull();
        expect([t.entrants[0].location, t.entrants[0].lapsCompleted]).toEqual(["GARAGE", 0]); // never reached a timed lap
    });
    it("call in: a timed lap in progress still counts, then the car comes in", () => {
        let s = sendOut(createQualifying(input({ n: 1, players: [0] })), "e0", 0, { compound: "SOFT", pushLaps: 3 });
        s = run(s, x => x.entrants[0].location === "FLYING");
        s = callIn(s, "e0", 1);
        s = run(s, x => x.entrants[0].location === "GARAGE");
        expect(s.entrants[0].run).toBeNull();
        expect(s.entrants[0].lapsCompleted).toBe(3);                        // out, one timed, in
        expect(s.entrants[0].best.Q1).not.toBeNull();
    });
});
describe("classification", () => {
    const withTimes = (s: QualifyingState, times: (number | null)[], phase: "Q1" | "Q2" | "Q3" = "Q1", at: number[] = []) =>
        ({ ...s, entrants: s.entrants.map((e, i) => ({ ...e, best: { ...e.best, [phase]: times[i] === null ? null : { ms: times[i]!, setAtMs: at[i] ?? 1000 } } })) });
    it("sorts by the phase's best lap; an identical time goes to the lap set earlier", () => {
        const s = withTimes(createQualifying(input({ n: 4 })), [90_000, 89_000, 90_000, 91_000], "Q1", [5000, 1000, 2000, 1000]);
        expect(phaseClassification(s, "Q1")).toEqual([1, 2, 0, 3]);
    });
    it("no-time fallbacks: Q1 by fallback rank; Q2/Q3 behind timed cars in the previous phase's order", () => {
        let s = createQualifying(input({ n: 4 }));
        s = { ...s, input: { ...s.input, entrants: s.input.entrants.map((e, i) => ({ ...e, fallbackRank: [3, 1, 4, 2][i] })) } };
        expect(phaseClassification(withTimes(s, [null, null, 90_000, null]), "Q1")).toEqual([2, 1, 3, 0]);
        s = withTimes(s, [91_000, 90_000, 92_000, 93_000]);                // Q1 order: 1, 0, 2, 3
        expect(phaseClassification(withTimes(s, [null, null, 88_000, null], "Q2"), "Q2")).toEqual([2, 1, 0, 3]);
        const q2 = withTimes(s, [89_500, 89_000, 89_700, 89_800], "Q2");   // Q2 order: 1, 0, 2, 3
        expect(phaseClassification(withTimes(q2, [null, null, null, 88_000], "Q3"), "Q3")).toEqual([3, 1, 0, 2]);
    });
    it("a full 22-car session: Q1 and Q2 each eliminate 6, final P1–P22 group ordering, no duplicate positions", () => {
        const s = runQualifyingToEnd(createQualifying(input()));
        expect(s.status).toBe("FINISHED");
        expect(s.entrants.filter(e => e.eliminatedIn === "Q1")).toHaveLength(6);
        expect(s.entrants.filter(e => e.eliminatedIn === "Q2")).toHaveLength(6);
        const final = finalClassification(s), pos = (i: number) => s.entrants[i].finalPosition!;
        expect(final.map(pos)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
        for (const i of final) {
            const p = pos(i), e = s.entrants[i];
            expect(e.eliminatedIn).toBe(p <= 10 ? null : p <= 16 ? "Q2" : "Q1");
        }
        // Q2 eliminations keep Q2 order, Q1 eliminations keep Q1 order, Q3 decides P1–P10.
        expect(final.slice(0, 10)).toEqual(phaseClassification(s, "Q3"));
        expect(final.slice(10, 16)).toEqual(phaseClassification(s, "Q2").slice(10));
        expect(final.slice(16)).toEqual(phaseClassification(s, "Q1").slice(16));
        // Earlier-phase times never act as later-phase times.
        for (const e of s.entrants) if (e.eliminatedIn === null) expect(e.best.Q3?.ms).not.toBe(e.best.Q2?.ms ?? -1);
    });
    it("a 4-car legacy field completes all three phases and Q3 decides the order", () => {
        const s = runQualifyingToEnd(createQualifying(input({ n: 4 })));
        expect(s.entrants.every(e => e.eliminatedIn === null && e.best.Q3 !== null)).toBe(true);
        expect(finalClassification(s)).toEqual(phaseClassification(s, "Q3"));
    });
});
describe("session flow, auto-management and determinism", () => {
    it("pauses at a completed phase for the player; the break advances session time by 7 minutes", () => {
        let s = createQualifying(input({ players: [0, 1] }));
        s = run(s, x => x.phaseStatus === "COMPLETE");
        expect([s.phase, s.status]).toEqual(["Q1", "RUNNING"]);
        expect(advanceQualifying(s)).toBe(s);                                // manual: waits for Continue
        expect(() => continuePhase(s, "Q2")).toThrow(expect.objectContaining({ code: "STALE" }));
        const next = continuePhase(s, "Q1");
        expect([next.phase, next.phaseElapsedMs, next.sessionElapsedMs - s.sessionElapsedMs]).toEqual(["Q2", 0, INTERMISSION_MS]);
        expect(next.entrants.filter(e => e.eliminatedIn === null).every(e => e.location === "GARAGE" && e.best.Q2 === null)).toBe(true);
        expect(() => continuePhase(next, "Q1")).toThrow(QualifyingRuleError);
        expect(advanceQualifying(enableAutoPlayer(s)).phase).toBe("Q2");    // auto-management continues by itself
    });
    it("Simulate Remainder from any saved state equals an offline replay of the same auto policy", () => {
        let s = createQualifying(input({ players: [2, 3] }));
        s = sendOut(s, "e2", 0, { compound: "SOFT", pushLaps: 2 });
        s = run(s, x => x.sessionElapsedMs >= 8 * 60_000);
        const saved = structuredClone(s);
        const a = runQualifyingToEnd(enableAutoPlayer(s)), b = runQualifyingToEnd(enableAutoPlayer(saved));
        expect(a).toEqual(b);
        expect(a.entrants[2].best.Q1).not.toBeNull();                        // the manual run is preserved
    });
    it("is deterministic for dry, changing and wet sessions and a 4-car field; no Math.random", () => {
        const original = Math.random;
        Math.random = () => { throw new Error("Math.random used"); };
        try {
            for (const opts of [{ scenario: "DRY" as const }, { scenario: "MIXED" as const, seed: 7 }, { scenario: "WET" as const, seed: 9 }, { n: 4 }]) {
                expect(runQualifyingToEnd(createQualifying(input(opts)))).toEqual(runQualifyingToEnd(createQualifying(input(opts))));
            }
        } finally { Math.random = original; }
    });
    it("performance comes from the data: faster cars qualify better on average, with upsets", () => {
        const average: number[] = Array(22).fill(0);
        let upsets = 0;
        for (let seed = 1; seed <= 12; seed++) {
            const s = runQualifyingToEnd(createQualifying(input({ seed })));
            s.entrants.forEach((e, i) => { average[i] += e.finalPosition! / 12; });
            const perf = (i: number) => s.input.entrants[i].car.performance;
            if (s.entrants.some((e, i) => perf(i) >= 92 && e.eliminatedIn !== null) || s.entrants.some((e, i) => perf(i) <= 86 && e.eliminatedIn === null)) upsets++;
        }
        const car = (i: number) => source.teamEntries.find(t => t.teamId === source.driverEntries[i].teamId)!.carPerformance!;
        const fast = average.filter((_, i) => car(i) >= 92), slow = average.filter((_, i) => car(i) <= 85);
        expect(Math.max(...fast)).toBeLessThan(Math.min(...slow));
        expect(upsets).toBeGreaterThan(0);
    });
});
describe("weather, track evolution and traffic", () => {
    it("a dry track improves with running; rain costs grip", () => {
        const dry = run(createQualifying(input()), x => x.phaseStatus === "COMPLETE");
        expect(dry.evolution).toBeGreaterThan(createQualifying(input()).evolution + 200);
        const wet = runQualifyingToEnd(createQualifying(input({ scenario: "WET", seed: 9 })));
        expect(wet.evolution).toBeLessThan(dry.evolution);
    });
    it("on a wet track the auto manager fits wet-weather tyres (current conditions only)", () => {
        const s = createQualifying(input({ scenario: "WET", seed: 9 }));
        const soaked = { ...s, weather: { ...s.weather, trackWater: 600 }, phaseElapsedMs: 10 * 60_000 };
        const decision = autoGarageDecision(soaked, 0);
        expect(decision).toMatchObject({ kind: "send", plan: { compound: "WET" } });
        const damp = { ...soaked, weather: { ...soaked.weather, trackWater: 200 } };
        expect(autoGarageDecision(damp, 0)).toMatchObject({ plan: { compound: "INTERMEDIATE" } });
    });
    it("the auto manager never reads the hidden weather timeline, setup target or RNG", () => {
        const s = { ...createQualifying(input()), phaseElapsedMs: 9 * 60_000 };
        const blind = { ...s, rngState: 1, input: { ...s.input, weather: { ...s.input.weather, timeline: [{ startLap: 1, rainfall: 1000, airTemperatureMilliC: 5000 }] },
            entrants: s.input.entrants.map(e => ({ ...e, preparation: { ...e.preparation, ideal: NEUTRAL_SETUP } })) } };
        for (let i = 0; i < 22; i++) expect(autoGarageDecision(blind, i)).toEqual(autoGarageDecision(s, i));
    });
    it("traffic: a lone car never loses time; a busy Q1 does, with finite, positive lap times throughout", () => {
        const lone = runQualifyingToEnd(createQualifying(input({ n: 1 })));
        expect(lone.entrants[0].lastLapTrafficMs).toBe(0);
        let s = createQualifying(input()), traffic = 0, laps = 0;
        while (s.phase === "Q1" && s.phaseStatus === "RUNNING") {
            const before = s; s = stepQualifying(s);
            s.entrants.forEach((e, i) => {
                if (e.lastLapMs !== before.entrants[i].lastLapMs && e.lastLapMs !== null) { laps++; if (e.lastLapTrafficMs >= 300) traffic++; expect(Number.isSafeInteger(e.lastLapMs) && e.lastLapMs > 60_000).toBe(true); }
                expect(Number.isFinite(e.distance)).toBe(true);
            });
        }
        expect(laps).toBeGreaterThan(30);
        expect(traffic).toBeGreaterThan(0);
        expect(traffic).toBeLessThan(laps * .6);
    });
    it("auto-managed cars leave at staggered times — never a mass release", () => {
        let s = createQualifying(input()), maxLaunch = 0;
        while (s.phase === "Q1" && s.phaseStatus === "RUNNING") {
            const before = s; s = stepQualifying(s);
            maxLaunch = Math.max(maxLaunch, s.entrants.filter((e, i) => e.attempts > before.entrants[i].attempts).length);
        }
        expect(maxLaunch).toBeLessThanOrEqual(6);
    });
});
describe("commands", () => {
    it("rejects stale revisions, cars not in the garage, eliminated cars and invalid plans", () => {
        const s = createQualifying(input({ players: [0, 1] }));
        expect(() => sendOut(s, "e0", 3, { compound: "SOFT", pushLaps: 1 })).toThrow(expect.objectContaining({ code: "STALE" }));
        expect(() => sendOut(s, "e0", 0, { compound: "SOFT", pushLaps: 4 })).toThrow(expect.objectContaining({ code: "PLAN_INVALID" }));
        const out = sendOut(s, "e0", 0, { compound: "SOFT", pushLaps: 1 });
        expect(() => sendOut(out, "e0", 1, { compound: "SOFT", pushLaps: 1 })).toThrow(expect.objectContaining({ code: "NOT_IN_GARAGE" }));
        expect(() => callIn(s, "e1", 0)).toThrow(expect.objectContaining({ code: "NOT_ON_TRACK" }));
        const eliminated = { ...s, entrants: s.entrants.map((e, i) => i === 0 ? { ...e, eliminatedIn: "Q1" as const } : e) };
        expect(() => sendOut(eliminated, "e0", 0, { compound: "SOFT", pushLaps: 1 })).toThrow(expect.objectContaining({ code: "ELIMINATED" }));
        // The teammate stays fully controllable.
        expect(sendOut(eliminated, "e1", 0, { compound: "SOFT", pushLaps: 1 }).entrants[idx(s, "e1")].location).toBe("OUT_LAP");
    });
});

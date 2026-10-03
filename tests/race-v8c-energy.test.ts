/**
 * Race v8C (revision 3) energy equilibrium repair, checked with the REAL accounting functions (energyStep +
 * recoverByDistance) and the real engine. Revision 2 stays the accepted v8B model (its digests: race-v8b-golden).
 */
import { describe, expect, it } from "vitest";
import { advanceRace, advanceRaceLap } from "../src/simulation/race/engine";
import { circuitProgressionB, progressionCFrom } from "../src/data/seed/circuit-progression";
import { energyStep, initialAssistance, recoverByDistance, type AssistanceState } from "../src/simulation/race/assistance/model";
import { runBudget, hold } from "./helpers/energy-budget";
import { neutralise } from "./helpers/incidents";
import { canonical } from "./helpers/determinism";
import { v8cRace, SUZUKA } from "./helpers/v8c";
import type { RaceSimulationState } from "../src/simulation/race/types";

const circuits = Object.entries(circuitProgressionB);
const v8c = (b: (typeof circuits)[number][1]) => progressionCFrom(b, "RACE");
const avg = (a: readonly number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe("24-circuit deterministic energy budget", () => {
    it.each(circuits)("%s: revision-3 BOOST held continuously empties the store and then gives NO electrical benefit (revision 2 kept a small permanent one)", (_id, b) => {
        const r3 = runBudget(v8c(b), hold("BOOST", 30)), r2 = runBudget(b, hold("BOOST", 30));
        expect(r3.energyAtLapEnd.findIndex(e => e === 0)).toBeLessThan(3);
        expect(r3.benefitPerLap.slice(5).every(x => x === 0)).toBe(true);
        expect(r3.recoveredPerLap.every(x => x === 0)).toBe(true); // BOOST never recovers
        // The closed revision-2 equilibrium: recovery in BOOST funded a non-zero benefit indefinitely.
        expect(avg(r2.benefitPerLap.slice(20))).toBeGreaterThan(0);
    });
    it.each(circuits)("%s: RECHARGE recovers without any electrical benefit; BALANCED is bounded far below permanent full Boost", (_id, b) => {
        const c = v8c(b);
        const recharge = runBudget(c, hold("RECHARGE", 3), { energy: 0 });
        expect(recharge.benefitPerLap.every(x => x === 0)).toBe(true);
        expect(recharge.recoveredPerLap[0]).toBeGreaterThan(0);
        const fullBoostLap = runBudget(c, hold("BOOST", 1), { energy: c.assistance!.capacity }).benefitPerLap[0];
        const balanced = runBudget(c, hold("BALANCED", 40));
        expect(fullBoostLap).toBeGreaterThan(0);
        expect(avg(balanced.benefitPerLap.slice(30))).toBeLessThan(fullBoostLap * 0.15);
        expect(Math.max(...balanced.benefitPerLap)).toBeLessThan(fullBoostLap);
    });
    it.each(circuits)("%s: Safety Car / VSC laps recover by distance — a slower neutralised lap never multiplies recovery (revision 2 did)", (_id, b) => {
        const c = v8c(b), green = runBudget(c, hold("RECHARGE", 1), { energy: 0 }).recoveredPerLap[0];
        for (const lapMs of [90000, 126000, 162000]) {
            const sc = runBudget(c, hold("RECHARGE", 1, { neutral: true, lapMs }), { energy: 0 });
            expect(Math.abs(sc.recoveredPerLap[0] - green)).toBeLessThanOrEqual(1);
            expect(sc.benefitPerLap[0]).toBe(0); // no deployment while neutralised
        }
        const r2 = (lapMs: number) => runBudget(b, hold("RECHARGE", 1, { neutral: true, lapMs }), { energy: 0 }).recoveredPerLap[0];
        expect(r2(162000)).toBeGreaterThan(r2(90000) * 1.5);
    });
});

describe("accounting invariants (revision 3)", () => {
    const c = v8c(circuitProgressionB[SUZUKA]);
    const a = c.assistance!;
    const fresh = (o: Partial<AssistanceState> = {}): AssistanceState => ({ ...initialAssistance(a), ...o });
    it("zero starting energy: no electrical benefit at all, in BOOST and in a qualified Overtake window", () => {
        const s = fresh({ energy: 0, policy: "BOOST", qualifiedLap: 3, validUseLap: 3, expiresAfterLap: 4, overtake: "AVAILABLE" });
        expect(energyStep(s, a, { dt: 100, lap: 3, progress: a.deploymentStart, straight: true, safe: true })).toBe(0);
        expect(s.used).toBe(0); expect(s.electricalDeltaMs).toBe(0);
    });
    it("low energy: the benefit scales with the energy actually debited (never more than the store)", () => {
        const full = fresh({ policy: "BOOST" }), low = fresh({ policy: "BOOST", energy: 200 });
        energyStep(full, a, { dt: 100, lap: 1, progress: 10, straight: true, safe: true });
        energyStep(low, a, { dt: 100, lap: 1, progress: 10, straight: true, safe: true });
        expect(full.used).toBe(800); expect(low.used).toBe(200); expect(low.energy).toBe(0);
        expect(low.electricalDeltaMs).toBe(Math.round(full.electricalDeltaMs * 200 / 800));
    });
    it("Overtake Mode and Boost share ONE envelope: never two stacked bonuses, one debit", () => {
        const s = fresh({ policy: "BOOST", qualifiedLap: 2, validUseLap: 2, expiresAfterLap: 3, overtake: "AVAILABLE" });
        energyStep(s, a, { dt: 100, lap: 2, progress: a.deploymentStart, straight: true, safe: true });
        expect(s.overtake).toBe("ACTIVE");
        expect(s.electricalDeltaMs).toBe(a.overtakeDeltaMs);
        expect(s.electricalDeltaMs).toBeLessThan(a.overtakeDeltaMs + a.boostDeltaMs);
        expect(s.used).toBe(Math.max(a.deploymentPerSecond.BOOST, a.overtakePerSecond) / 10);
    });
    it("recovery happens after deployment and cannot fund it in the same slice; BOOST recovers nothing", () => {
        const s = fresh({ policy: "BOOST", energy: 0 });
        energyStep(s, a, { dt: 100, lap: 1, progress: 10, straight: true, safe: true });
        recoverByDistance(s, a, 1000, true);
        expect(s.used).toBe(0); expect(s.energy).toBe(0);
        const corner = fresh({ policy: "BOOST", energy: 0 });
        recoverByDistance(corner, a, 5000, false);
        expect(corner.energy).toBe(0);
        const balanced = fresh({ policy: "BALANCED", energy: 0 });
        recoverByDistance(balanced, a, 1000, false);
        expect(balanced.energy).toBe(a.recoveryPerMillilap!.BALANCED);
    });
    it("policy switching (BOOST ↔ RECHARGE every lap) creates no energy: Σ used = initial + Σ recovered − final", () => {
        const schedule = Array.from({ length: 24 }, (_, i) => ({ policy: (["BOOST", "RECHARGE", "BOOST", "BALANCED"] as const)[i % 4] }));
        const r = runBudget(c, schedule);
        const used = r.usedPerLap.reduce((x, y) => x + y, 0), recovered = r.recoveredPerLap.reduce((x, y) => x + y, 0);
        expect(used).toBe(a.initialCharge + recovered - r.state.energy);
        // Benefit is proportional to energy actually used (a toggle can only spend what was recovered).
        const boostLaps = r.usedPerLap.map((u, i) => ({ u, b: r.benefitPerLap[i], p: schedule[i].policy })).filter(x => x.p === "BOOST" && x.u > 0);
        for (const x of boostLaps) expect(x.b / x.u).toBeCloseTo(boostLaps[0].b / boostLaps[0].u, 6);
    });
    it("remainders persist: one long slice equals the same distance in many small slices", () => {
        const whole = fresh({ policy: "RECHARGE", energy: 0 }), parts = fresh({ policy: "RECHARGE", energy: 0 });
        recoverByDistance(whole, a, 3333, false);
        for (let i = 0; i < 3333; i += 101) recoverByDistance(parts, a, Math.min(101, 3333 - i), false);
        expect(parts.energy).toBe(whole.energy); expect(parts.recoveryRemainder).toBe(whole.recoveryRemainder);
    });
});

describe("engine: chunking, save / reload, pit and Race Control (revision 3)", () => {
    const boostAll = (s: RaceSimulationState): RaceSimulationState => ({ ...s, progression: { ...s.progression!, cars: Object.fromEntries(Object.entries(s.progression!.cars).map(([k, p]) => [k, { ...p, assistance: { ...p.assistance!, policy: "BOOST" as const } }])) } });
    it("mid-depletion save / reload continues exactly (energy and remainders); one call equals per-checkpoint advancement", () => {
        const start = boostAll(advanceRace(v8cRace({ players: 22, count: 6, laps: 14, quiet: true }), 1));
        let chunked = start;
        for (let n = 0; n < 6; n++) chunked = JSON.parse(JSON.stringify(advanceRaceLap(chunked))) as RaceSimulationState;
        const once = advanceRace(start, 6);
        expect(canonical(chunked)).toBe(canonical(once));
        const car = once.progression!.cars[once.input.entrants[0].entrantId].assistance!;
        expect(car.energy).toBeLessThan(start.progression!.cars[start.input.entrants[0].entrantId].assistance!.energy);
    }, 120_000);
    it("held BOOST in a real revision-3 Race reaches an empty store and stays there (no equilibrium)", () => {
        let s = boostAll(v8cRace({ players: 22, count: 4, laps: 14, quiet: true }));
        for (let n = 0; n < 10; n++) s = boostAll(advanceRaceLap(s));
        for (const p of Object.values(s.progression!.cars)) { expect(p.assistance!.energy).toBe(0); expect(p.assistance!.electricalDeltaMs).toBe(0); }
    }, 120_000);
    it("pit route: no deployment and no Overtake entitlement; BOOST recovers nothing there either", () => {
        const c = v8c(circuitProgressionB[SUZUKA]);
        const pitLike = runBudget(c, hold("BOOST", 1, { neutral: true, lapMs: 30000 }), { energy: 500000 });
        expect(pitLike.usedPerLap[0]).toBe(0); expect(pitLike.recoveredPerLap[0]).toBe(0); expect(pitLike.benefitPerLap[0]).toBe(0);
        let s = boostAll(advanceRace(v8cRace({ players: 22, count: 4, laps: 14, quiet: true }), 2));
        const id = s.input.entrants[0].entrantId;
        s = { ...s, entrants: s.entrants.map(e => e.entrantId === id ? { ...e, pit: { ...e.pit!, pendingCompound: "HARD" as const } } : e) };
        for (let n = 0; n < 4 && s.status === "RUNNING"; n++) {
            s = boostAll(advanceRaceLap(s));
            const p = s.progression!.cars[id];
            if (p.route !== "TRACK") { expect(p.assistance!.aero).toBe("SAFE"); expect(p.assistance!.overtake).toBe("NOT_ELIGIBLE"); expect(p.assistance!.electricalDeltaMs).toBe(0); }
        }
        expect(s.entrants.find(e => e.entrantId === id)!.pit!.stops.length).toBe(1);
    }, 120_000);
    it("SC / VSC: no deployment or Overtake entitlement while neutralised", () => {
        for (const mode of ["SAFETY_CAR", "VSC"] as const) {
            const s = advanceRaceLap(neutralise(boostAll(advanceRace(v8cRace({ players: 22, count: 4, laps: 14, quiet: true }), 2)), mode, 2));
            for (const p of Object.values(s.progression!.cars)) { expect(p.assistance!.aero).toBe("SAFE"); expect(p.assistance!.overtake).toBe("NOT_ELIGIBLE"); expect(p.assistance!.electricalDeltaMs).toBe(0); }
        }
    }, 120_000);
});

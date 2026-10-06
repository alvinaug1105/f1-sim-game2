/**
 * Race v8E local fix 2 (still progression revision 5): the circuit pass conversion, pit-cycle lap pace and the Sprint
 * tactical AI policy (energy for the attacker's Overtake Mode, final-laps ATTACK within tyre life), plus revision-4
 * isolation of each. Mechanism / boundary tests only — no pass-count or tuning-output assertions.
 */
import { describe, expect, it } from "vitest";
import { advanceRace, createRace } from "../src/simulation/race/engine";
import { progressionEForCircuit } from "../src/data/seed/circuit-progression";
import { LAP_UNITS, validateProgressionState, type CarProgression } from "../src/simulation/race/progression/model";
import { AI_PIT_CYCLE_PACE, chooseAssistanceAi } from "../src/simulation/race/assistance/policy";
import { v8eTuningBundle } from "../src/features/race/v8e-tuning";
import { circuitPassEdge, v8dRacecraftConfiguration, v8eRacecraftConfiguration, v8eSprintRacecraftConfiguration, validateRacecraftConfiguration, V8E_PASS_EDGE_NEUTRAL_DIFFICULTY, V8E_SPRINT_FINAL_ATTACK_LAPS, type RacecraftConfiguration } from "../src/simulation/race/traffic/racecraft";
import type { RaceControlMode } from "../src/simulation/race/incidents/model";
import type { TyreState } from "../src/simulation/race/tyres/model";
import type { RaceSimulationState } from "../src/simulation/race/types";
import { SUZUKA } from "./helpers/v8c";
import { v8dInput } from "./helpers/v8d";
import { v8eInput } from "./helpers/v8e";

describe("circuit identity: the circuit's difficulty governs how much of a pace edge converts", () => {
    const r = v8eRacecraftConfiguration();
    it("neutral difficulty counts the edge in full; easier circuits count more, harder ones less (monotone, integer)", () => {
        expect(circuitPassEdge(r, 200, V8E_PASS_EDGE_NEUTRAL_DIFFICULTY)).toBe(200);
        let last = circuitPassEdge(r, 500, 0);
        for (let d = 5; d <= 100; d += 5) {
            const now = circuitPassEdge(r, 500, d);
            expect(Number.isSafeInteger(now)).toBe(true);
            expect(now).toBeLessThanOrEqual(last);
            last = now;
        }
        expect(circuitPassEdge(r, 500, 15)).toBeGreaterThan(500); // e.g. Spa class
        expect(circuitPassEdge(r, 500, 85)).toBeLessThan(500); // e.g. Monaco class
        expect(circuitPassEdge(r, 0, 85)).toBe(0); // no edge is ever created
    });
    it("no field or no difficulty: the edge is unchanged (revision 4 never converts)", () => {
        expect(circuitPassEdge(r, 300, undefined)).toBe(300);
        expect(circuitPassEdge(v8dRacecraftConfiguration(), 300, 85)).toBe(300);
        expect(circuitPassEdge(undefined, 300, 85)).toBe(300);
    });
    it("is frozen into the revision-5 bundle and validated", () => {
        expect(v8eInput({ count: 4, laps: 6, quiet: true }).commands!.racecraft!.passEdgeNeutralDifficulty).toBe(V8E_PASS_EDGE_NEUTRAL_DIFFICULTY);
        expect(() => validateRacecraftConfiguration(r)).not.toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, passEdgeNeutralDifficulty: 0 })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, passEdgeNeutralDifficulty: 101 })).toThrow();
    });
});

/** Re-space car `behind` to run `gapMs` behind car `ahead` (same lap), coherently with the observed route. */
function placeBehind(s: RaceSimulationState, aheadId: string, behindId: string, gapMs: number): RaceSimulationState {
    const x = structuredClone(s) as RaceSimulationState, a = x.entrants.find(e => e.entrantId === aheadId)!;
    const total = a.track!.progressMicrolaps - Math.round(gapMs * LAP_UNITS / x.input.circuit.baseLapTimeMs);
    x.progression!.cars[behindId].observations = [{ atMs: x.progression!.elapsedTimeMs, total, route: "TRACK" }];
    const out = { ...x, entrants: x.entrants.map(e => e.entrantId === behindId ? { ...e, completedLaps: Math.floor(total / LAP_UNITS), track: { ...e.track!, progressMicrolaps: total } } : e) };
    validateProgressionState(out);
    return out;
}
interface Duel {
    readonly racecraft: RacecraftConfiguration; readonly gapMs?: number; readonly energy?: readonly [leader: number, follower: number];
    readonly heldMs?: number; readonly lapsToGo?: number; readonly tyre?: Partial<TyreState>; readonly mode?: RaceControlMode;
    readonly route?: CarProgression["route"]; readonly committed?: boolean;
}
const bases = new Map<string, RaceSimulationState>();
/** Two AI cars, the follower `gapMs` behind; the follower's held loss, tyre, route and commitment are set explicitly. */
function duel(session: "RACE" | "SPRINT", o: Duel) {
    if (!bases.has(session)) bases.set(session, advanceRace(createRace(v8eInput({ count: 2, laps: 12, quiet: true, seed: 3, session })), 3));
    const base = bases.get(session)!, [a, b] = [...base.entrants].sort((p, q) => p.position - q.position).map(e => e.entrantId);
    const s = placeBehind(base, a, b, o.gapMs ?? 500);
    const [ea, eb] = o.energy ?? [900000, 900000];
    for (const [id, energy] of [[a, ea], [b, eb]] as const) { const p = s.progression!.cars[id]; p.assistance!.energy = energy; p.route = "TRACK"; p.compound = null; }
    const pb = s.progression!.cars[b];
    if (o.route) pb.route = o.route;
    if (o.committed || (o.route && o.route !== "TRACK")) pb.compound = "HARD";
    const ready: RaceSimulationState = {
        ...s, lap: o.lapsToGo === undefined ? s.lap : s.input.totalLaps - o.lapsToGo,
        incidents: { ...s.incidents!, mode: o.mode ?? "GREEN" },
        input: { ...s.input, commands: { ...s.input.commands!, racecraft: o.racecraft } },
        entrants: s.entrants.map(e => ({ ...e, track: { ...e.track!, trafficLossMs: e.entrantId === b ? o.heldMs ?? 0 : 0 },
            stint: e.entrantId === b && o.tyre ? { ...e.stint!, tyre: { ...e.stint!.tyre, ...o.tyre } } : e.stint })),
    };
    const out = chooseAssistanceAi(ready);
    const pick = (id: string) => ({ pace: out.entrants.find(e => e.entrantId === id)!.commands!.paceMode, policy: out.progression!.cars[id].assistance!.policy });
    return { leader: pick(a), follower: pick(b) };
}

describe("undercut: in-lap / out-lap pace (pit-cycle laps, revision-5 racecraft)", () => {
    const five = v8eRacecraftConfiguration(), four = v8dRacecraftConfiguration();
    it("a committed car with a worn tyre drives its in-lap / out-lap instead of nursing the tyre it is discarding", () => {
        const worn = { wearPermille: 750 };
        expect(duel("RACE", { racecraft: five, committed: true, tyre: worn, gapMs: 5000 }).follower.pace).toBe(AI_PIT_CYCLE_PACE);
        expect(duel("RACE", { racecraft: four, committed: true, tyre: worn, gapMs: 5000 }).follower.pace).toBe("LIGHT"); // accepted rule
        expect(duel("RACE", { racecraft: five, committed: false, tyre: worn, gapMs: 5000 }).follower.pace).toBe("LIGHT"); // not pitting: nursing stays
    }, 60_000);
    it("the pit lane is not a Race neutralisation for the lap choice in revision 5; revision 4 keeps CONSERVE / RECHARGE", () => {
        const lane5 = duel("RACE", { racecraft: five, route: "LANE", gapMs: 5000 }).follower, lane4 = duel("RACE", { racecraft: four, route: "LANE", gapMs: 5000 }).follower;
        expect(lane5.pace).toBe(AI_PIT_CYCLE_PACE); expect(lane5.policy).not.toBe("RECHARGE");
        expect(lane4.pace).toBe("CONSERVE"); expect(lane4.policy).toBe("RECHARGE");
        // Already on its fresh tyre (pit exit): an ordinary racing lap, not a neutralised one.
        expect(duel("RACE", { racecraft: five, route: "EXIT", gapMs: 5000, tyre: { wearPermille: 0 } }).follower.pace).not.toBe("CONSERVE");
    }, 60_000);
    it("a real neutralisation still neutralises: under the Safety Car a committed car runs CONSERVE", () => {
        expect(duel("RACE", { racecraft: five, committed: true, mode: "SAFETY_CAR" }).follower.pace).toBe("CONSERVE");
    }, 60_000);
    it("in a revision-5 Race every AI car committed to a stop under green runs its in-lap / out-lap at the pit-cycle pace", () => {
        let s = createRace(v8eInput({ count: 8, laps: 30, quiet: true, seed: 11 })), seen = 0;
        while (s.status === "RUNNING") {
            const green = s.incidents!.mode === "GREEN";
            s = advanceRace(s, 1);
            if (!green) continue;
            for (const e of s.entrants) {
                const p = s.progression!.cars[e.entrantId];
                if (e.incident!.status !== "RUNNING" || p.compound === null || p.route === "EXIT") continue;
                seen++; expect(e.commands!.paceMode).toBe(AI_PIT_CYCLE_PACE);
            }
        }
        expect(seen).toBeGreaterThan(0);
    }, 120_000);
});

describe("Sprint tactical AI policy (local fix 2; SPRINT sessions only)", () => {
    const sprint = v8eSprintRacecraftConfiguration(), gp = v8eRacecraftConfiguration();
    it("a held attacker keeps its charge for Overtake Mode (BALANCED); only the genuinely threatened defender BOOSTs", () => {
        const s = duel("SPRINT", { racecraft: sprint, heldMs: 200 });
        expect(s.follower.policy).toBe("BALANCED"); expect(s.leader.policy).toBe("BOOST");
        expect(s.follower.pace).toBe("PUSH"); expect(s.leader.pace).toBe("PUSH"); // no sustained ATTACK before the final laps
        const g = duel("SPRINT", { racecraft: gp, heldMs: 200 }); // the GP policy is symmetric
        expect(g.follower.policy).toBe("BOOST"); expect(g.leader.policy).toBe("BOOST");
    }, 60_000);
    it("mere proximity spends nothing: without a genuine basis neither car BOOSTs in a Sprint", () => {
        const s = duel("SPRINT", { racecraft: sprint, heldMs: 0 });
        expect(s.follower.policy).toBe("BALANCED"); expect(s.leader.policy).toBe("BALANCED");
    }, 60_000);
    it("the accepted energy thresholds stand: RECHARGE below a quarter, no BOOST at or below half", () => {
        expect(duel("SPRINT", { racecraft: sprint, heldMs: 200, energy: [200000, 200000] }).leader.policy).toBe("RECHARGE");
        expect(duel("SPRINT", { racecraft: sprint, heldMs: 200, energy: [400000, 400000] }).leader.policy).toBe("BALANCED");
        expect(duel("SPRINT", { racecraft: sprint, heldMs: 200, energy: [900000, 200000] }).follower.policy).toBe("RECHARGE");
    }, 60_000);
    it("ATTACK pace only in the final laps, only with a basis, only while the tyre reaches the flag below its cliff", () => {
        const go = V8E_SPRINT_FINAL_ATTACK_LAPS - 1;
        expect(duel("SPRINT", { racecraft: sprint, heldMs: 200, lapsToGo: go, tyre: { compound: "SOFT", wearPermille: 100 } }).follower.pace).toBe("ATTACK");
        expect(duel("SPRINT", { racecraft: sprint, heldMs: 0, lapsToGo: go, tyre: { compound: "SOFT", wearPermille: 100 } }).follower.pace).toBe("PUSH"); // no basis
        expect(duel("SPRINT", { racecraft: sprint, heldMs: 200, lapsToGo: go, tyre: { compound: "SOFT", wearPermille: 690 } }).follower.pace).toBe("PUSH"); // would cross the cliff
        expect(duel("SPRINT", { racecraft: sprint, heldMs: 200, lapsToGo: V8E_SPRINT_FINAL_ATTACK_LAPS + 5, tyre: { compound: "SOFT", wearPermille: 100 } }).follower.pace).toBe("PUSH"); // too early
        expect(duel("SPRINT", { racecraft: gp, heldMs: 200, lapsToGo: go, tyre: { compound: "SOFT", wearPermille: 100 } }).follower.pace).toBe("PUSH"); // GP: never ATTACK
    }, 60_000);
    it("the bundle freezes the Sprint policy only for SPRINT sessions; the first local fix's fields are gone; validated", () => {
        expect(v8eTuningBundle(progressionEForCircuit(SUZUKA, "SPRINT"), 90000, true).racecraft).toEqual(sprint);
        expect(v8eTuningBundle(progressionEForCircuit(SUZUKA, "RACE"), 90000, true).racecraft).toEqual(gp);
        for (const k of ["aiSprintTactics", "aiFinalAttackLaps"]) expect(gp).not.toHaveProperty(k);
        for (const k of ["aiAttackPaceMode", "aiBoostReservePermille", "aiRechargeBelowPermille"]) expect(sprint).not.toHaveProperty(k);
        expect(() => validateRacecraftConfiguration(sprint)).not.toThrow();
        expect(() => validateRacecraftConfiguration({ ...gp, aiFinalAttackLaps: 3 })).toThrow(); // needs the Sprint policy
        expect(() => validateRacecraftConfiguration({ ...sprint, aiFinalAttackLaps: 21 })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...sprint, aiSprintTactics: 1 as never })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...gp, aiPitCyclePace: "yes" as never })).toThrow();
    });
});

describe("revision-4 isolation of every local-fix-2 mechanism", () => {
    it("revision-4 racecraft carries none of the new fields", () => {
        const r = v8dInput({ count: 4, laps: 6, quiet: true }).commands!.racecraft!;
        for (const k of ["passEdgeNeutralDifficulty", "aiPitCyclePace", "aiSprintTactics", "aiFinalAttackLaps"]) expect(r).not.toHaveProperty(k);
    });
});

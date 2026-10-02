/**
 * Versioned persisted-determinism contract (v8B final):
 * - v7 and v8A progression revision 1 are frozen: the same persisted state with the same IDs continues exactly the same
 *   way whatever object-key order it was serialised with (JSON / PostgreSQL JSONB). The real v8A main save still
 *   finishes with the digest recorded when it was accepted.
 * - v8B progression revision 2: Race behaviour must not depend on generated ID text — a state with every entrant,
 *   driver and team ID remapped (plus any key order) continues identically after identity canonicalisation.
 * No tolerance anywhere.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/race-v8a-postgres-main-save.json";
import { advanceRace, advanceRaceLap, createRace } from "../src/simulation/race/engine";
import { progressionBForCircuit, progressionForCircuit } from "../src/data/seed/circuit-progression";
import { requestPitStop } from "../src/simulation/race/pits/model";
import { physicalAhead } from "../src/simulation/race/progression/model";
import { domainTieOrder, revision1TieOrder, tieOrderFor } from "../src/simulation/race/progression/tie-order";
import { racecraftInput } from "./helpers/racecraft";
import { canonical, remapIds, reorderKeys, slotCanonical, type KeyOrder } from "./helpers/determinism";
import type { RaceSimulationState } from "../src/simulation/race/types";

const ORDERS: KeyOrder[] = ["ORIGINAL", "JSONB", "REVERSE", "HASHED"];
/** Variants per remapping case (3 in the normal suite; raise with DETERMINISM_VARIANTS for a wider sweep). */
const VARIANTS = Number(process.env.DETERMINISM_VARIANTS ?? 3);
const SUZUKA = "00000000-0000-4000-8000-000000000301";
/** Base continuation: one canonical checkpoint per lap (`laps` laps or to the flag). */
function continuation(start: RaceSimulationState, laps: number) {
    const out: string[] = [];
    let s = start;
    for (let n = 0; n < laps && s.status === "RUNNING"; n++) { s = advanceRaceLap(s); out.push(canonical(s)); }
    return out;
}
/** Same IDs, every key order, re-serialised every lap (like a reload): every checkpoint must match exactly. */
function expectKeyOrderStable(start: RaceSimulationState, laps: number) {
    const base = continuation(start, laps);
    for (const [v, order] of ORDERS.entries()) {
        let x = reorderKeys(start, order, v) as RaceSimulationState;
        for (let n = 0; n < base.length; n++) {
            x = reorderKeys(advanceRaceLap(x), order, v + n) as RaceSimulationState;
            if (canonical(x) !== base[n]) throw new Error(`${order} key order diverged at lap ${x.lap}`);
        }
    }
    return base.length;
}
/** Remapped entrant / driver / team IDs plus a key order, re-serialised every lap; compared after restoring identity. */
function expectIdIndependent(start: RaceSimulationState, laps: number, variants: number) {
    const base = continuation(start, laps);
    for (let v = 0; v < variants; v++) {
        const { state, restore } = remapIds(start, 1000 + v), order = ORDERS[v % ORDERS.length];
        let x = reorderKeys(state, order, v) as RaceSimulationState;
        for (let n = 0; n < base.length; n++) {
            x = reorderKeys(advanceRaceLap(x), order, v + n) as RaceSimulationState;
            const got = canonical(restore(x));
            if (got !== base[n]) throw new Error(`variant ${v} (${order}) diverged at lap ${JSON.parse(got).lap}`);
        }
    }
    return base.length;
}
/** A 22-car revision-2 Race at lap 3 with a pit request and a near-empty-battery Boost car. */
function revision2Race() {
    const input = { ...racecraftInput({ count: 22, laps: 30, gapMs: 250, ai: true }), progression: progressionBForCircuit(SUZUKA) };
    let s = advanceRace(createRace(input), 3);
    const player = s.input.entrants[0].entrantId;
    s = requestPitStop(s, s.input.entrants[1].entrantId, "HARD");
    return { ...s, progression: { ...s.progression!, cars: { ...s.progression!.cars, [player]: { ...s.progression!.cars[player], assistance: { ...s.progression!.cars[player].assistance!, policy: "BOOST" as const, energy: 40 } } } } };
}

describe("v8A revision 1: frozen historical continuation", () => {
    it("the real main v8A save finishes with the digest recorded when it was accepted", () => {
        const start = JSON.parse(JSON.stringify(fixture.state)) as RaceSimulationState;
        expect(start.input.progression!.version).toBe(1);
        const done = advanceRace(start, start.input.totalLaps);
        expect(createHash("sha256").update(slotCanonical(done, start)).digest("hex")).toBe(fixture.finishedSha256);
    }, 120_000);
    it("the same save with the same IDs continues identically under original, JSONB, reversed and hashed key order", () => {
        const start = JSON.parse(JSON.stringify(fixture.state)) as RaceSimulationState;
        expect(expectKeyOrderStable(start, 1000)).toBeGreaterThan(50);
    }, 600_000);
    it("an exact distance tie keeps the historical entrant-ID order (revision-1 compatibility only)", () => {
        const s = createRace({ ...racecraftInput({ count: 3, laps: 10 }), progression: progressionForCircuit(SUZUKA) });
        const [a, b, c] = [...s.entrants].sort((x, y) => x.position - y.position);
        const at = (e: typeof a, id: string, progressMicrolaps: number) => ({ ...e, entrantId: id, track: { ...e.track!, progressMicrolaps } });
        // P1 and P2 side by side, P3 behind: the lexically smaller ID wins the tie, regardless of classification.
        const entrants = [at(a, "zzzz", 500_000), at(b, "aaaa", 500_000), at(c, "mmmm", 400_000)];
        expect(physicalAhead(entrants, entrants[2], undefined, tieOrderFor({ version: 1 }))!.entrant.entrantId).toBe("aaaa");
    });
});

describe("v8B revision 2: Race behaviour independent of generated ID text", () => {
    it("a 22-car Race with a pit stop and low-energy Boost continues identically with remapped entrant/driver/team IDs", () => {
        const s = revision2Race();
        expect(s.input.progression!.version).toBe(2);
        expect(expectIdIndependent(s, 20, VARIANTS)).toBe(20);
    }, 600_000);
    it("the same Race is also key-order stable with its own IDs", () => {
        expect(expectKeyOrderStable(revision2Race(), 8)).toBe(8);
    }, 300_000);
    it("an exact distance tie resolves to the car higher in the classification, whatever the IDs", () => {
        const s = createRace({ ...racecraftInput({ count: 3, laps: 10 }), progression: progressionBForCircuit(SUZUKA) });
        const [a, b, c] = [...s.entrants].sort((x, y) => x.position - y.position);
        const at = (e: typeof a, progressMicrolaps: number) => ({ ...e, track: { ...e.track!, progressMicrolaps } });
        const tie = tieOrderFor(s.input.progression!);
        const entrants = [at(a, 500_000), at(b, 500_000), at(c, 400_000)];
        expect(physicalAhead(entrants, entrants[2], undefined, tie)!.entrant.entrantId).toBe(a.entrantId);
        const renamed = entrants.map(e => ({ ...e, entrantId: e.entrantId === a.entrantId ? "zzzz" : e.entrantId === b.entrantId ? "aaaa" : e.entrantId }));
        expect(physicalAhead(renamed, renamed[2], undefined, tie)!.entrant.entrantId).toBe("zzzz");
    });
});

describe("version dispatch", () => {
    it("revision 1 selects the frozen historical tie rule; revision 2 the Race-domain rule", () => {
        expect(tieOrderFor({ version: 1 })).toBe(revision1TieOrder);
        expect(tieOrderFor({ version: 2 })).toBe(domainTieOrder);
        expect(progressionBForCircuit(SUZUKA).version).toBe(2);
    });
    it("v7 Races are unaffected and key-order stable", () => {
        const s = advanceRace(createRace(racecraftInput({ count: 12, laps: 25, gapMs: 300, ai: true })), 2);
        expect(s.simulationVersion).toBe(7);
        expect(expectKeyOrderStable(s, 15)).toBe(15);
    }, 300_000);
});

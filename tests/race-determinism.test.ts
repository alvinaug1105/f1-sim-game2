/**
 * Persisted determinism contract: the same authoritative Race state continues to exactly the same future, however it
 * was serialised — different object-key insertion order (JSON / PostgreSQL JSONB) and freshly remapped entrant, driver
 * and team IDs. No tolerance.
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/race-v8a-postgres-main-save.json";
import { advanceRace, advanceRaceLap, createRace } from "../src/simulation/race/engine";
import { progressionBForCircuit } from "../src/data/seed/circuit-progression";
import { requestPitStop } from "../src/simulation/race/pits/model";
import { physicalAhead } from "../src/simulation/race/progression/model";
import { racecraftInput } from "./helpers/racecraft";
import { canonical, remapIds, reorderKeys, type KeyOrder } from "./helpers/determinism";
import type { RaceSimulationState } from "../src/simulation/race/types";

const ORDERS: KeyOrder[] = ["JSONB", "HASHED", "REVERSE", "ORIGINAL"];
/** Variants per case (3 in the normal suite; raise with DETERMINISM_VARIANTS for a wider sweep). */
const VARIANTS = Number(process.env.DETERMINISM_VARIANTS ?? 3);
/** Continue `laps` laps (or to the flag) from `start` and from each variant; every checkpoint must match exactly. */
function expectInvariant(start: RaceSimulationState, laps: number, variants: number) {
    const base: string[] = [];
    let s = start;
    for (let n = 0; n < laps && s.status === "RUNNING"; n++) { s = advanceRaceLap(s); base.push(canonical(s)); }
    for (let v = 0; v < variants; v++) {
        const { state, restore } = remapIds(start, 1000 + v), order = ORDERS[v % ORDERS.length];
        let x = reorderKeys(state, order, v) as RaceSimulationState;
        for (let n = 0; n < base.length; n++) {
            x = reorderKeys(advanceRaceLap(x), order, v + n) as RaceSimulationState;     // re-serialised every lap, like a reload
            const got = canonical(restore(x));
            if (got !== base[n]) throw new Error(`variant ${v} (${order}) diverged at lap ${JSON.parse(got).lap}`);
        }
    }
    return base.length;
}
describe("persisted determinism: key order and remapped IDs", () => {
    it("legacy v8A (revision 1): the real main save continues identically for every variant", () => {
        const start = JSON.parse(JSON.stringify(fixture.state)) as RaceSimulationState;
        expect(start.input.progression!.version).toBe(1);
        expect(expectInvariant(start, 1000, VARIANTS)).toBeGreaterThan(50);
    }, 600_000);
    it("v8B revision 2: a 22-car race with a pit stop and Boost continues identically for every variant", () => {
        const input = { ...racecraftInput({ count: 22, laps: 30, gapMs: 250, ai: true }), progression: progressionBForCircuit("00000000-0000-4000-8000-000000000301") };
        let s = advanceRace(createRace(input), 3);
        const player = s.input.entrants[0].entrantId;
        s = requestPitStop(s, s.input.entrants[1].entrantId, "HARD");
        s = { ...s, progression: { ...s.progression!, cars: { ...s.progression!.cars, [player]: { ...s.progression!.cars[player], assistance: { ...s.progression!.cars[player].assistance!, policy: "BOOST", energy: 40 } } } } };
        expect(s.input.progression!.version).toBe(2);
        expect(expectInvariant(s, 20, VARIANTS)).toBe(20);
    }, 600_000);
    it("v7 Races are unaffected and equally invariant", () => {
        const s = advanceRace(createRace(racecraftInput({ count: 12, laps: 25, gapMs: 300, ai: true })), 2);
        expect(s.simulationVersion).toBe(7);
        expect(expectInvariant(s, 15, 4)).toBe(15);
    }, 300_000);
    it("an exact distance tie resolves to the car higher in the classification, whatever the IDs", () => {
        const s = createRace({ ...racecraftInput({ count: 3, laps: 10 }), progression: progressionBForCircuit("00000000-0000-4000-8000-000000000301") });
        const [a, b, c] = [...s.entrants].sort((x, y) => x.position - y.position);
        const at = (e: typeof a, progressMicrolaps: number) => ({ ...e, track: { ...e.track!, progressMicrolaps } });
        const entrants = [at(a, 500_000), at(b, 500_000), at(c, 400_000)];
        expect(physicalAhead(entrants, entrants[2])!.entrant.entrantId).toBe(a.entrantId);
        // Same with the IDs swapped in lexical order: the classification still decides.
        const renamed = entrants.map(e => ({ ...e, entrantId: e.entrantId === a.entrantId ? "zzzz" : e.entrantId === b.entrantId ? "aaaa" : e.entrantId }));
        expect(physicalAhead(renamed, renamed[2])!.entrant.entrantId).toBe("zzzz");
    });
});

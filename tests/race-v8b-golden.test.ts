/**
 * Race v8B (progression revision 2) golden compatibility. The digests below were recorded from the accepted v8B main
 * (9b9a88f8, before any Race v8C change). Revision 2 is frozen: a v8C change must never alter these continuations, and
 * these digests must never be re-pinned to absorb a later behaviour change.
 *
 * same accepted revision-2 state + same IDs + same commands + same seed ⇒ same continuation as accepted v8B.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { advanceRace, advanceRaceLap, createRace } from "../src/simulation/race/engine";
import { progressionBForCircuit } from "../src/data/seed/circuit-progression";
import { requestPitStop } from "../src/simulation/race/pits/model";
import { defaultPitConfiguration } from "../src/simulation/race/pits/profiles";
import { defaultAiStrategyConfiguration } from "../src/simulation/race/pits/ai-strategy";
import { developmentWeather } from "../src/simulation/race/weather/model";
import type { EnergyPolicy } from "../src/simulation/race/assistance/model";
import type { RaceSimulationState } from "../src/simulation/race/types";
import { racecraftInput } from "./helpers/racecraft";
import { incidentInput } from "./helpers/incidents";
import { canonical } from "./helpers/determinism";

const SUZUKA = "00000000-0000-4000-8000-000000000301", MONACO = "00000000-0000-4000-8000-000000000304";
const digest = (s: RaceSimulationState) => createHash("sha256").update(canonical(s)).digest("hex");
const policy = (s: RaceSimulationState, slot: number, p: EnergyPolicy): RaceSimulationState => {
    const id = s.input.entrants[slot].entrantId;
    return { ...s, progression: { ...s.progression!, cars: { ...s.progression!.cars, [id]: { ...s.progression!.cars[id], assistance: { ...s.progression!.cars[id].assistance!, policy: p } } } } };
};
/** Persist-and-reload as the repository does (JSON round trip). */
const reload = (s: RaceSimulationState) => JSON.parse(JSON.stringify(s)) as RaceSimulationState;

/** G1 — the quiet 22-car Suzuka Race used by the v8B determinism suite: pit request + near-empty Boost car at lap 3. */
function quietSuzuka() {
    const input = { ...racecraftInput({ count: 22, laps: 30, gapMs: 250, ai: true }), progression: progressionBForCircuit(SUZUKA) };
    let s = advanceRace(createRace(input), 3);
    const player = s.input.entrants[0].entrantId;
    s = requestPitStop(s, s.input.entrants[1].entrantId, "HARD");
    return { ...s, progression: { ...s.progression!, cars: { ...s.progression!.cars, [player]: { ...s.progression!.cars[player], assistance: { ...s.progression!.cars[player].assistance!, policy: "BOOST" as const, energy: 40 } } } } };
}
/**
 * G2 — production-like revision-2 Monaco Race: incidents and reliability on, changing development weather, the AI
 * pit strategy frozen in, two PLAYER cars switching energy policy across checkpoints, a player pit stop, and a JSON
 * round trip every few laps.
 */
function eventfulMonaco() {
    const base = incidentInput(22, 7, 40);
    const input = { ...base, weather: developmentWeather(7, 40), pits: { ...defaultPitConfiguration(), strategy: defaultAiStrategyConfiguration() }, progression: progressionBForCircuit(MONACO),
        entrants: base.entrants.map((e, n) => ({ ...e, strategyController: n < 2 ? "PLAYER" as const : "DEVELOPMENT_AI" as const })) };
    let s = createRace(input);
    for (let lap = 0; s.status === "RUNNING"; lap++) {
        if (lap === 4) s = policy(s, 0, "BOOST");
        if (lap === 9) s = policy(policy(s, 0, "RECHARGE"), 1, "BOOST");
        if (lap === 14) s = policy(policy(s, 0, "BOOST"), 1, "BALANCED");
        if (lap === 18) s = requestPitStop(s, s.input.entrants[0].entrantId, "SOFT");
        if (lap === 21) s = requestPitStop(s, s.input.entrants[1].entrantId, "HARD");
        s = advanceRaceLap(lap % 5 === 0 ? reload(s) : s);
    }
    return s;
}

/** G3 — dry production-like revision-2 Suzuka Race: incidents on, AI strategy, all cars AI-managed (Simulate Race path). */
function dryAiSuzuka() {
    const base = incidentInput(22, 11, 30);
    return advanceRace(createRace({ ...base, pits: { ...defaultPitConfiguration(), strategy: defaultAiStrategyConfiguration() }, progression: progressionBForCircuit(SUZUKA),
        entrants: base.entrants.map(e => ({ ...e, strategyController: "DEVELOPMENT_AI" as const })) }), 30);
}

describe("Race v8B revision 2 golden compatibility (frozen; never re-pin)", () => {
    it("G1: the quiet Suzuka revision-2 continuation finishes exactly as accepted v8B", () => {
        const start = quietSuzuka();
        expect(start.input.progression!.version).toBe(2);
        expect(digest(advanceRace(start, start.input.totalLaps))).toBe("16ff838d00b4a7d6c84491c0c0f1d69078203662c35a0151c61f6f9efdff96ae");
    }, 120_000);
    it("G2: the eventful Monaco revision-2 Race (incidents, weather, AI strategy, player energy + pits, reloads) finishes exactly as accepted v8B", () => {
        const done = eventfulMonaco();
        expect(done.input.progression!.version).toBe(2);
        expect(done.status).toBe("FINISHED");
        expect(digest(done)).toBe("82cc4e7f8098cd20e83ed1b8bfb9625285cd496799792fe928b42739aa65e070");
    }, 120_000);
    it("G3: the dry AI-managed Suzuka revision-2 Race finishes exactly as accepted v8B (no tyre regulation in revision 2)", () => {
        const done = dryAiSuzuka();
        expect(done.status).toBe("FINISHED");
        expect(done.progression!.classification).toBeUndefined();
        expect(digest(done)).toBe("385a07f4cdf10a21ecd02e706c3f114486897c73f2dfabf9ab98e2cd98914176");
    }, 120_000);
});

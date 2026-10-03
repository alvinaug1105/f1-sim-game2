/**
 * Race v8C (progression revision 3): FIA 2026 Section B Issue 09 B6.3.6 dry-tyre regulation — versioning, actual-use
 * compliance, wet exemption, Sprint, AI compliance, the authoritative DSQ sanction, points and the public boundary.
 */
import { describe, expect, it } from "vitest";
import { advanceRace, advanceRaceLap, createRace, raceResult } from "../src/simulation/race/engine";
import { progressionBForCircuit, progressionCForCircuit, progressionForCircuit } from "../src/data/seed/circuit-progression";
import { validateProgressionConfiguration, validateProgressionState, classifyProgress } from "../src/simulation/race/progression/model";
import { tieOrderFor } from "../src/simulation/race/progression/tie-order";
import { assessTyreRule, compoundSatisfies, enforceFinalClassification, raceRegulationForSession, validateClassificationRecord, validateRegulationConfiguration, type DryTyreRule } from "../src/simulation/race/regulations/tyres";
import { regulateAiStop } from "../src/simulation/race/regulations/ai-compliance";
import { placeInPitPhase } from "./helpers/pit-phase";
import { requestPitStop } from "../src/simulation/race/pits/model";
import { strategyPreference } from "../src/simulation/race/pits/ai-strategy";
import { autoManagePlayerCars } from "../src/features/race/service";
import { projectRaceState } from "../src/features/race/projection";
import { computeStandings, scoreSession } from "../src/game/domain/championship";
import { championshipInput } from "../src/features/championship/model";
import { event, session, source } from "./helpers/championship";
import { canonical, remapIds, reorderKeys } from "./helpers/determinism";
import { MONACO, MONZA, SUZUKA, v8cInput, v8cRace, withTyres } from "./helpers/v8c";
import type { RaceSimulationState } from "../src/simulation/race/types";
import type { TyreCompound } from "../src/simulation/race/tyres/model";

const ALL: readonly TyreCompound[] = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];
const rule = (s: RaceSimulationState) => s.input.progression!.regulation!.dryTyres as DryTyreRule;
const id = (s: RaceSimulationState, slot = 0) => s.input.entrants[slot].entrantId;
const statusOf = (s: RaceSimulationState, slot = 0) => assessTyreRule(s, id(s, slot)).status;
/** A running revision-3 Race a few laps in (every car has left the grid), quiet and dry. */
const running = (laps = 3) => advanceRace(v8cRace({ quiet: true, count: 6, laps: 20 }), laps);
const distinctDry = (s: RaceSimulationState, entrantId: string) => new Set(s.entrants.find(e => e.entrantId === entrantId)!.pit!.stints.map(x => x.startingTyre.compound).filter(c => c === "SOFT" || c === "MEDIUM" || c === "HARD")).size;
const wetUsed = (s: RaceSimulationState, entrantId: string) => s.entrants.find(e => e.entrantId === entrantId)!.pit!.stints.some(x => x.startingTyre.compound === "INTERMEDIATE" || x.startingTyre.compound === "WET");

describe("versioning: v8C is progression revision 3 of simulationVersion 8", () => {
    it("revision-3 content: v8B circuit content + v8C energy + the session's frozen regulation (Grand Prix vs Sprint)", () => {
        const race = progressionCForCircuit(SUZUKA, "RACE"), sprint = progressionCForCircuit(SUZUKA, "SPRINT"), b = progressionBForCircuit(SUZUKA);
        expect(race.version).toBe(3); expect(sprint.version).toBe(3);
        expect({ ...race, version: 2, assistance: b.assistance, regulation: undefined }).toEqual({ ...b, regulation: undefined });
        expect(race.regulation).toEqual(raceRegulationForSession("RACE"));
        expect(race.regulation!.source).toEqual({ document: "FIA 2026 Formula 1 Regulations - Section B [Sporting]", issue: 9, published: "2026-10-01" });
        expect(race.regulation!.dryTyres).toMatchObject({ article: "B6.3.6", minimumDistinctDrySpecifications: 2, wetTyreExemption: true, mandatoryDrySpecifications: [], consequence: "DISQUALIFICATION" });
        expect(sprint.regulation).toMatchObject({ session: "SPRINT", dryTyres: null });
        const s = createRace(v8cInput());
        expect(s.simulationVersion).toBe(8); expect(s.input.progression!.version).toBe(3);
        expect(() => validateProgressionState(s)).not.toThrow();
    });
    it("rejects mixed or contradictory revision content (no silent upgrade, no missing snapshot)", () => {
        const c = progressionCForCircuit(SUZUKA, "RACE"), b = progressionBForCircuit(SUZUKA), a = progressionForCircuit(SUZUKA);
        expect(() => validateProgressionConfiguration({ ...c, regulation: undefined })).toThrow(/regulation/);
        expect(() => validateProgressionConfiguration({ ...b, regulation: c.regulation })).toThrow(/Historical/);
        expect(() => validateProgressionConfiguration({ ...a, regulation: c.regulation })).toThrow();
        expect(() => validateProgressionConfiguration({ ...b, assistance: c.assistance })).toThrow(/v8B cannot acquire v8C/);
        expect(() => validateProgressionConfiguration({ ...c, assistance: b.assistance })).toThrow(/distance/);
        expect(() => validateProgressionConfiguration({ ...c, assistance: { ...c.assistance!, recoveryPerMillilap: { ...c.assistance!.recoveryPerMillilap!, BOOST: 1 } } })).toThrow(/Contradictory/);
        // A revision-2 save can never carry a v8C final classification record.
        const two = advanceRace(createRace({ ...v8cInput({ count: 4, laps: 3, quiet: true }), progression: b }), 3);
        expect(() => validateProgressionState({ ...two, progression: { ...two.progression!, classification: { version: 1, entries: [] } } })).toThrow(/Unexpected/);
        // A finished revision-3 Race must carry its record.
        const done = advanceRace(v8cRace({ count: 4, laps: 3, quiet: true }), 3);
        expect(() => validateProgressionState({ ...done, progression: { ...done.progression!, classification: undefined } })).toThrow(/Missing final classification/);
    });
    it("regulation snapshot validation rejects contradictory configuration", () => {
        const dry = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const, r = raceRegulationForSession("RACE");
        expect(() => validateRegulationConfiguration(r, dry)).not.toThrow();
        expect(() => validateRegulationConfiguration(raceRegulationForSession("SPRINT"), dry)).not.toThrow();
        expect(() => validateRegulationConfiguration({ ...raceRegulationForSession("SPRINT"), dryTyres: r.dryTyres }, dry)).toThrow(/Sprint/);
        expect(() => validateRegulationConfiguration({ ...r, dryTyres: null }, dry)).toThrow();
        expect(() => validateRegulationConfiguration({ ...r, dryTyres: { ...r.dryTyres!, minimumDistinctDrySpecifications: 1 } }, dry)).toThrow();
        expect(() => validateRegulationConfiguration({ ...r, dryTyres: { ...r.dryTyres!, minimumDistinctDrySpecifications: 3 } }, ["MEDIUM", "HARD"])).toThrow(/Unsatisfiable/);
        expect(() => validateRegulationConfiguration({ ...r, dryTyres: { ...r.dryTyres!, mandatoryDrySpecifications: ["INTERMEDIATE" as "SOFT"] } }, dry)).toThrow(/mandatory/);
        expect(() => validateRegulationConfiguration({ ...r, source: { ...r.source, issue: 5 as 9 } }, dry)).toThrow();
    });
});

describe("dry regulation: compliance from tyres ACTUALLY used", () => {
    const base = running();
    it.each([
        [["MEDIUM"], "OUTSTANDING"], [["MEDIUM", "MEDIUM"], "OUTSTANDING"], [["MEDIUM", "HARD"], "SATISFIED"],
        [["SOFT", "MEDIUM"], "SATISFIED"], [["HARD", "SOFT"], "SATISFIED"], [["MEDIUM", "MEDIUM", "MEDIUM"], "OUTSTANDING"],
    ] as const)("%j while running → %s", (tyres, expected) => {
        expect(statusOf(withTyres(base, id(base), tyres))).toBe(expected);
    });
    it.each([[["MEDIUM"]], [["MEDIUM", "MEDIUM"]]] as const)("%j at the flag → VIOLATED; MEDIUM→HARD at the flag → SATISFIED", (tyres) => {
        expect(statusOf(withTyres({ ...base, status: "FINISHED" }, id(base), tyres, "TRACK", "FINISHED"))).toBe("VIOLATED");
        expect(statusOf(withTyres({ ...base, status: "FINISHED" }, id(base), ["MEDIUM", "HARD"], "TRACK", "FINISHED"))).toBe("SATISFIED");
    });
    it("B6.3.2: pending, committed and not-yet-serviced (ENTRY / LANE / SERVICE) tyres do NOT count; the new tyre counts from PIT_EXIT", () => {
        let s = withTyres(base, id(base), ["MEDIUM"]);
        s = requestPitStop(s, id(s), "HARD");
        expect(s.entrants[0].pit!.pendingCompound).toBe("HARD");
        expect(statusOf(s)).toBe("OUTSTANDING");
        // Committed, not yet at pit entry: the stint history still holds only MEDIUM.
        s = { ...s, progression: { ...s.progression!, cars: { ...s.progression!.cars, [id(s)]: { ...s.progression!.cars[id(s)], compound: "HARD", pitEntryLap: s.lap } } } };
        expect(statusOf(s)).toBe("OUTSTANDING");
        // In the pit lane before / at service: coherent engine states (validated), still only MEDIUM used.
        for (const phase of ["ENTRY", "LANE", "SERVICE"] as const) {
            const inPit = placeInPitPhase(withTyres(base, id(base), ["MEDIUM"]), id(base), phase);
            expect(() => validateProgressionState(inPit)).not.toThrow();
            expect(assessTyreRule(inPit, id(base))).toMatchObject({ status: "OUTSTANDING", usedDry: ["MEDIUM"] });
        }
        // The engine creates the HARD stint when the car leaves the Pit Lane onto its PIT_EXIT route: it counts there…
        expect(assessTyreRule(withTyres(base, id(base), ["MEDIUM", "HARD"], "EXIT"), id(base))).toMatchObject({ status: "SATISFIED", usedDry: ["MEDIUM", "HARD"] });
        // …and still after rejoining TRACK.
        expect(statusOf(withTyres(base, id(base), ["MEDIUM", "HARD"], "TRACK"))).toBe("SATISFIED");
    });
    it("B6.3.2 in the real engine: MEDIUM → pit for HARD → at the PIT_EXIT transition both are used and the rule is already SATISFIED", () => {
        // One car: each checkpoint is its own line crossing, so a crossing in the pit lane lands exactly on PIT_EXIT.
        let s = advanceRace(v8cRace({ count: 1, players: 1, laps: 12, quiet: true }), 2);
        const me = id(s);
        expect(assessTyreRule(s, me)).toMatchObject({ status: "OUTSTANDING", usedDry: ["MEDIUM"] });
        s = requestPitStop(s, me, "HARD");
        for (let n = 0; n < 4 && s.progression!.cars[me].route !== "EXIT"; n++) {
            expect(assessTyreRule(s, me).usedDry).toEqual(["MEDIUM"]); // pending / committed / not yet serviced
            s = advanceRaceLap(s);
        }
        const car = s.progression!.cars[me], e = s.entrants[0];
        expect(car.route).toBe("EXIT");
        expect(e.pit!.stints.map(x => x.startingTyre.compound)).toEqual(["MEDIUM", "HARD"]);
        expect(e.pit!.stints.at(-1)!.endLap).toBeNull();
        expect(assessTyreRule(s, me)).toMatchObject({ status: "SATISFIED", usedDry: ["MEDIUM", "HARD"] });
        s = advanceRaceLap(s);
        expect(s.progression!.cars[me].route).toBe("TRACK");
        expect(assessTyreRule(s, me)).toMatchObject({ status: "SATISFIED", usedDry: ["MEDIUM", "HARD"] });
    });
    it("the starting tyre counts only once the car has left its grid position", () => {
        const grid = v8cRace({ quiet: true, count: 4, laps: 10 });
        expect(assessTyreRule(grid, id(grid)).usedDry).toEqual([]);
        expect(assessTyreRule(running(1), id(running(1))).usedDry).toEqual(["MEDIUM"]);
    });
    it("becomes URGENT from the last safe stop opportunity, before pit requests close", () => {
        const a = assessTyreRule(base, id(base));
        expect(a.deadlineLap).toBe(base.input.totalLaps - 2 - rule(base).latestSafeStopMarginLaps);
        expect(a.lastRequestLap).toBe(base.input.totalLaps - 2);
        expect(statusOf({ ...withTyres(base, id(base), ["MEDIUM"]), lap: a.deadlineLap! - 1 })).toBe("OUTSTANDING");
        expect(statusOf({ ...withTyres(base, id(base), ["MEDIUM"]), lap: a.deadlineLap! })).toBe("URGENT");
    });
    it("marks which next compounds satisfy the rule (a same-specification set never does)", () => {
        const s = withTyres(base, id(base), ["MEDIUM"]), a = assessTyreRule(s, id(s));
        expect(ALL.filter(c => compoundSatisfies(a, c, rule(s)))).toEqual(["SOFT", "HARD", "INTERMEDIATE", "WET"]);
    });
    it("future-ready mandatory Race specification (B6.1.2) — unset in production, enforced when a snapshot carries one", () => {
        const s0 = withTyres({ ...base, status: "FINISHED" }, id(base), ["MEDIUM", "SOFT"], "TRACK", "FINISHED");
        const withMandatory = { ...s0, input: { ...s0.input, progression: { ...s0.input.progression!, regulation: { ...s0.input.progression!.regulation!, dryTyres: { ...rule(s0), mandatoryDrySpecifications: ["HARD" as const] } } } } };
        expect(statusOf(s0)).toBe("SATISFIED");
        expect(statusOf(withMandatory)).toBe("VIOLATED");
        expect(statusOf(withTyres(withMandatory, id(base), ["MEDIUM", "HARD"], "TRACK", "FINISHED"))).toBe("SATISFIED");
    });
});

describe("wet exemption: only actual Intermediate / Wet use", () => {
    const base = running();
    it.each([[["MEDIUM", "INTERMEDIATE"]], [["MEDIUM", "WET"]], [["INTERMEDIATE"]], [["WET"]], [["MEDIUM", "INTERMEDIATE", "MEDIUM"]]] as const)("%j → EXEMPT (also at the flag)", (tyres) => {
        expect(statusOf(withTyres(base, id(base), tyres))).toBe("EXEMPT");
        expect(statusOf(withTyres({ ...base, status: "FINISHED" }, id(base), tyres, "TRACK", "FINISHED"))).toBe("EXEMPT");
    });
    it("a rain forecast, a wet track or a pending intermediate request on dry tyres is NOT an exemption", () => {
        const s = withTyres(base, id(base), ["MEDIUM"]);
        const wetTrack = { ...s, weather: { ...s.weather!, rainfallIntensity: 900, trackWater: 900 } };
        expect(statusOf(wetTrack)).toBe("OUTSTANDING");
        const forecastRain = { ...s, input: { ...s.input, weather: { ...s.input.weather!, forecast: [{ arrivalMinLap: s.lap + 1, arrivalMaxLap: s.lap + 2, rainfallMin: 800, rainfallMax: 1000 }] } } };
        expect(statusOf(forecastRain)).toBe("OUTSTANDING");
        expect(statusOf(requestPitStop(s, id(s), "INTERMEDIATE"))).toBe("OUTSTANDING");
    });
});

describe("Sprint: B6.3.6 does not apply", () => {
    it("a single dry specification in the Sprint is never a DSQ (and shows no obligation)", () => {
        const done = advanceRace(v8cRace({ session: "SPRINT", players: 2, count: 8, laps: 12, quiet: true }), 12);
        expect(done.input.progression!.regulation!.dryTyres).toBeNull();
        expect(done.entrants.every(e => distinctDry(done, e.entrantId) === 1)).toBe(true);
        expect(done.progression!.classification!.entries.every(x => x.status !== "DISQUALIFIED")).toBe(true);
        expect(statusOf(done)).toBe("NOT_APPLICABLE");
        expect(projectRaceState(done, done.input.entrants[0].teamId).entrants[0].regulation).toBeUndefined();
    });
});

describe("AI compliance: same pit system, same consequence, no cheat", () => {
    it.each([[SUZUKA, 11, 30], [MONZA, 5, 36]] as const)("22-car ordinary dry Race at %s: every finisher is compliant (zero DSQ)", (circuit, seed, laps) => {
        const done = advanceRace(v8cRace({ circuit, seed, laps }), laps);
        const finishers = done.entrants.filter(e => e.incident!.status === "FINISHED");
        expect(finishers.length).toBeGreaterThan(15);
        for (const e of finishers) expect(distinctDry(done, e.entrantId) >= 2 || wetUsed(done, e.entrantId)).toBe(true);
        expect(done.progression!.classification!.entries.filter(x => x.status === "DISQUALIFIED")).toEqual([]);
        // Every regulatory stop went through the ordinary stop record (pit loss, stationary time), never a free tyre change.
        for (const e of finishers) for (const stop of e.pit!.stops) { expect(stop.totalLossMs).toBeGreaterThan(stop.stationaryTimeMs); expect(stop.newCompound).not.toBe(stop.oldCompound); }
    }, 120_000);
    it("lapped AI finishers also comply before the flag", () => {
        const input = v8cInput({ circuit: MONZA, seed: 5, laps: 40 });
        const done = advanceRace(createRace({ ...input, entrants: input.entrants.map((e, n) => n >= 19 ? { ...e, car: { performance: 0 }, driver: { ...e.driver, pace: 0 } } : e) }), 40);
        const lapped = done.entrants.filter(e => e.incident!.status === "FINISHED" && e.completedLaps < 40);
        expect(lapped.length).toBeGreaterThan(0);
        for (const e of lapped) expect(assessTyreRule(done, e.entrantId).status).toBe("SATISFIED");
    }, 120_000);
    it("auto-managed player cars (Simulate Race / Remainder) comply from a one-compound URGENT checkpoint", () => {
        const fresh = v8cRace({ players: 2, seed: 13 });
        const atDeadline = advanceRace(fresh, assessTyreRule(fresh, id(fresh)).deadlineLap!);
        expect(statusOf(atDeadline, 0)).toBe("URGENT"); expect(statusOf(atDeadline, 1)).toBe("URGENT");
        const done = advanceRace(autoManagePlayerCars(atDeadline), atDeadline.input.totalLaps);
        expect(statusOf(done, 0)).toBe("SATISFIED"); expect(statusOf(done, 1)).toBe("SATISFIED");
        expect(done.progression!.classification!.entries.filter(x => x.status === "DISQUALIFIED")).toEqual([]);
    }, 120_000);
    it("a PLAYER car is never altered: ignoring the rule ends in DSQ, complying does not", () => {
        const violated = advanceRace(v8cRace({ players: 2 }), 30);
        expect(raceResult(violated).filter(r => r.disqualified).map(r => r.entrantId).sort()).toEqual([id(violated, 0), id(violated, 1)].sort());
        let s = advanceRace(v8cRace({ players: 2 }), 6);
        s = requestPitStop(requestPitStop(s, id(s, 0), "HARD"), id(s, 1), "SOFT");
        const complied = advanceRace(s, 30);
        expect(raceResult(complied).some(r => r.disqualified)).toBe(false);
    }, 120_000);
    it("filters only illegal choices; never forces a stop on a satisfied or exempt car; calls an outstanding car in at the deadline", () => {
        const s = running(), late = { ...s, lap: assessTyreRule(s, id(s)).deadlineLap! }, e = (x: RaceSimulationState) => x.entrants[0];
        // The pit strategy layer supplies the car's character; the regulation filter never derives it.
        const pref = strategyPreference(s.input.seed, s.input.entrants[0].gridPosition);
        const one = withTyres(s, id(s), ["MEDIUM"]);
        expect(regulateAiStop(one, e(one), "MEDIUM", 20000, pref)).not.toBe("MEDIUM");
        expect(regulateAiStop(one, e(one), "HARD", 20000, pref)).toBe("HARD");
        expect(regulateAiStop(one, e(one), null, 20000, pref)).toBeNull(); // plenty of time: normal strategy stays primary
        const urgent = withTyres(late, id(s), ["MEDIUM"]);
        expect(regulateAiStop(urgent, e(urgent), null, 20000, pref)).toMatch(/^(SOFT|HARD)$/);
        for (const done of [withTyres(late, id(s), ["MEDIUM", "HARD"]), withTyres(late, id(s), ["MEDIUM", "INTERMEDIATE"])]) {
            expect(regulateAiStop(done, e(done), null, 20000, pref)).toBeNull();
            expect(regulateAiStop(done, e(done), "MEDIUM", 20000, pref)).toBe("MEDIUM"); // satisfied / exempt: unchanged strategy
        }
        // Historical revisions: no regulation, no change.
        const two = advanceRace(createRace({ ...v8cInput({ count: 4, laps: 20, quiet: true }), progression: progressionBForCircuit(SUZUKA) }), 17);
        expect(regulateAiStop(two, two.entrants[0], null, 20000, pref)).toBeNull();
    });
    it("a changing-weather Race: actual wet-family use exempts the field (no pointless dry stop afterwards)", () => {
        const done = advanceRace(v8cRace({ circuit: MONACO, seed: 7, laps: 40, weather: true }), 40);
        for (const e of done.entrants.filter(x => x.incident!.status === "FINISHED")) expect(["EXEMPT", "SATISFIED"]).toContain(assessTyreRule(done, e.entrantId).status);
        expect(done.progression!.classification!.entries.some(x => x.status === "DISQUALIFIED")).toBe(false);
    }, 120_000);
});

describe("classification consequence: authoritative DSQ at the flag", () => {
    /** A finished revision-3 Race in which road P1 used one dry specification only and P2 / P3 complied. */
    function roadWinnerViolates() {
        const done = advanceRace(v8cRace({ count: 6, laps: 12, quiet: true, players: 6 }), 12);
        const road = [...done.entrants].sort((a, b) => a.position - b.position);
        let s: RaceSimulationState = { ...done, progression: { ...done.progression!, classification: undefined } };
        road.forEach((e, i) => { s = withTyres(s, e.entrantId, i === 0 ? ["MEDIUM"] : ["MEDIUM", "HARD"], "TRACK", "FINISHED"); });
        const tie = tieOrderFor(s.input.progression!);
        const { entrants, record } = enforceFinalClassification(s, x => classifyProgress(x, s.input.circuit.baseLapTimeMs, tie, true));
        return { road, state: { ...s, entrants, progression: { ...s.progression!, classification: record } } as RaceSimulationState, record };
    }
    it("road winner violates → DSQ, listed last; compliant drivers promoted; road order kept in the record; DSQ is not a retirement", () => {
        const { road, state, record } = roadWinnerViolates();
        const official = [...state.entrants].sort((a, b) => a.position - b.position);
        expect(official[0].entrantId).toBe(road[1].entrantId);
        expect(official[1].entrantId).toBe(road[2].entrantId);
        expect(official.at(-1)!.entrantId).toBe(road[0].entrantId);
        expect(official.at(-1)!.incident!.status).toBe("FINISHED");
        expect(official.at(-1)!.gapToLeaderMs).toBeNull();
        expect(official[0].gapToLeaderMs).toBe(0);
        const dsq = record.entries.find(x => x.entrantId === road[0].entrantId)!;
        expect(dsq).toMatchObject({ status: "DISQUALIFIED", reason: "DRY_TYRE_SPECIFICATIONS", roadPosition: 1, position: road.length });
        expect(() => validateClassificationRecord(state, record)).not.toThrow();
        expect(raceResult(state).find(r => r.entrantId === road[0].entrantId)).toMatchObject({ disqualified: true, roadPosition: 1, position: road.length });
        // A tampered record is rejected.
        expect(() => validateClassificationRecord(state, { ...record, entries: record.entries.map(x => ({ ...x, status: "CLASSIFIED" as const, reason: null })) })).toThrow();
    });
    it("retirements stay retirements (never a regulation DSQ), even with a single dry specification", () => {
        const done = advanceRace(v8cRace({ count: 6, laps: 12, quiet: true, players: 6 }), 12);
        let s: RaceSimulationState = { ...done, progression: { ...done.progression!, classification: undefined } };
        const last = [...s.entrants].sort((a, b) => b.position - a.position)[0];
        s = withTyres(s, last.entrantId, ["MEDIUM"], "TRACK", "RETIRED");
        s = { ...s, entrants: s.entrants.map(e => e.entrantId === last.entrantId ? { ...e, incident: { ...e.incident!, retiredLap: 8, retirementOrder: 1 } } : e) };
        const { record } = enforceFinalClassification(s, x => classifyProgress(x, s.input.circuit.baseLapTimeMs, tieOrderFor(s.input.progression!), true));
        expect(record.entries.find(x => x.entrantId === last.entrantId)!.status).toBe("RETIRED");
        expect(assessTyreRule(s, last.entrantId).status).toBe("NOT_APPLICABLE");
    });
    it("DSQ scores nothing; the promoted drivers score their official positions (WDC and WCC)", () => {
        const race = session(["d1", "d3", "d5", "d2", "d4", "d6"], { disqualified: ["d6"] });
        // Official order already renumbered by the engine: d6 (road winner, DSQ) listed last.
        const scored = scoreSession("F1_2026", "RACE", { scheduledLaps: 20, leaderLaps: 20, leaderGreenLaps: 20, entries: race.entrants.map(e => ({ driverId: e.driverId, teamId: e.teamId, position: e.position, ...(e.disqualified ? { disqualified: true } : {}) })) });
        expect(scored.find(e => e.driverId === "d1")!.units).toBe(25 * 2);
        expect(scored.find(e => e.driverId === "d6")!.units).toBe(0);
        const standings = computeStandings(championshipInput(source([event(1, { race })])));
        expect(standings.drivers.find(r => r.id === "d6")!.units).toBe(0);
        expect(standings.drivers.find(r => r.id === "d6")!.raceCountback).toEqual([]);
        expect(standings.drivers.find(r => r.id === "d6")!.rounds[0].race).toMatchObject({ units: 0, disqualified: true });
        const t3 = standings.constructors.find(r => r.id === "t3")!;
        expect(t3.units).toBe(15 * 2); // d5 P3 = 15; d6 (DSQ) adds nothing
        expect(t3.rounds[0].race).toMatchObject({ position: 3 });
        // Even a disqualified car listed inside the points positions scores nothing.
        const small = scoreSession("F1_2026", "RACE", { scheduledLaps: 20, leaderLaps: 20, leaderGreenLaps: 20, entries: [{ driverId: "a", teamId: "t", position: 1 }, { driverId: "b", teamId: "t", position: 2, disqualified: true }] });
        expect(small.find(e => e.driverId === "b")!.units).toBe(0);
    });
});

describe("public boundary", () => {
    it("own regulation status is visible; rivals expose no obligation, plan or energy; no seed / RNG / weather truth", () => {
        let s = advanceRace(v8cRace({ players: 2, count: 8, laps: 20, quiet: true }), 5);
        s = requestPitStop(s, id(s, 1), "HARD");
        const view = projectRaceState(s, s.input.entrants[0].teamId);
        const own = view.entrants.find(e => e.entrantId === id(s, 0))!, mate = view.entrants.find(e => e.entrantId === id(s, 1))!, rival = view.entrants.find(e => e.entrantId === id(s, 5))!;
        expect(own.regulation).toMatchObject({ status: "OUTSTANDING", usedDry: ["MEDIUM"], wetUsed: false, required: 2, satisfyingCompounds: ["SOFT", "HARD", "INTERMEDIATE", "WET"] });
        expect(mate.regulation!.status).toBe("OUTSTANDING"); // pending HARD request does not satisfy
        expect(rival.regulation).toBeUndefined(); expect(rival.assistance).toBeUndefined(); expect(rival.pit!.pendingCompound).toBeNull();
        expect(view.input.regulation).toMatchObject({ session: "RACE", dryTyres: { article: "B6.3.6", minimumDistinctDrySpecifications: 2 } });
        expect(view.classification).toBeUndefined();
        const text = JSON.stringify(view);
        for (const hidden of ["rngState", "seed", "timeline", "recoveryRemainder", "deploymentRemainder", "qualifiedLap", "latestSafeStopMarginLaps"]) expect(text).not.toContain(hidden);
    });
    it("the official classification is public once the Race is finished", () => {
        const done = advanceRace(v8cRace({ players: 2, count: 8, laps: 10, quiet: true }), 10);
        const view = projectRaceState(done, done.input.entrants[0].teamId);
        expect(view.classification).toHaveLength(8);
        expect(view.classification!.filter(x => x.status === "DISQUALIFIED").map(x => x.entrantId).sort()).toEqual([id(done, 0), id(done, 1)].sort());
    });
});

describe("determinism (revision 3)", () => {
    it("same state + same semantic identity + same commands ⇒ same continuation, under remapped IDs and any key order", () => {
        let start = advanceRace(v8cRace({ players: 2, laps: 24 }), 3);
        start = requestPitStop(start, id(start, 0), "HARD");
        const base: string[] = []; let s = start;
        while (s.status === "RUNNING") { s = advanceRaceLap(s); base.push(canonical(s)); }
        const { state, restore } = remapIds(start, 4242);
        let x = reorderKeys(state, "JSONB") as RaceSimulationState;
        for (let n = 0; n < base.length; n++) { x = reorderKeys(advanceRaceLap(x), n % 2 ? "REVERSE" : "HASHED", n) as RaceSimulationState; expect(canonical(restore(x))).toBe(base[n]); }
    }, 180_000);
    it("advancing to the flag in one call equals lap-by-lap advancement with a JSON reload every checkpoint", () => {
        const start = advanceRace(v8cRace({ players: 2, laps: 20, seed: 3 }), 2);
        let chunked = start;
        while (chunked.status === "RUNNING") chunked = JSON.parse(JSON.stringify(advanceRaceLap(chunked))) as RaceSimulationState;
        expect(canonical(advanceRace(start, 20))).toBe(canonical(chunked));
    }, 120_000);
});

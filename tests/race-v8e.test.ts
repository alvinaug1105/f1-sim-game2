/**
 * Race v8E (progression revision 5 of simulationVersion 8): revision boundary, the frozen v8E tuning bundle, attack
 * cadence, removal of the late-Race window, pit-route pass credit, actual-contribution pass cause, normalised zero,
 * Safety Car train compression vs VSC, strategy / tyre configuration and revision-4 isolation. Fixed fixtures only.
 */
import { describe, expect, it } from "vitest";
import { advanceRace, advanceRaceLap, createRace } from "../src/simulation/race/engine";
import { progressionDForCircuit, progressionEForCircuit, progressionEFrom, progressionCForCircuit } from "../src/data/seed/circuit-progression";
import { LAP_UNITS, validateProgressionConfiguration, validateProgressionState } from "../src/simulation/race/progression/model";
import { LATEST_PROGRESSION_REVISION, energyModelFor, hasRegulation, hasV8dTuning, hasV8eSemantics } from "../src/simulation/race/progression/revision";
import { attackCause, passCreditable } from "../src/simulation/race/progression/engine";
import { domainTieOrder, tieOrderFor } from "../src/simulation/race/progression/tie-order";
import { v8eTuningBundle } from "../src/features/race/v8e-tuning";
import { v8dTuningBundle } from "../src/features/race/v8d-tuning";
import { attackOpen, defaultRacecraftConfiguration, heldLossAllowed, lateRaceAttackWindow, v8dRacecraftConfiguration, v8eRacecraftConfiguration, validateRacecraftConfiguration, V8E_ATTACK_COOLDOWN_MS, V8E_MAX_ATTACKS_PER_LAP } from "../src/simulation/race/traffic/racecraft";
import { v8dAiStrategyConfiguration, v8eAiStrategyConfiguration, validateAiStrategyConfiguration } from "../src/simulation/race/pits/ai-strategy";
import { v8dTyreConfiguration, v8dWeatherTyreConfiguration, v8eTyreConfiguration, v8eWeatherTyreConfiguration } from "../src/simulation/race/tyres/profiles";
import { tyreContributions, validateTyreConfiguration } from "../src/simulation/race/tyres/model";
import { defaultIncidentConfiguration, v8eIncidentConfiguration, validateIncidentConfiguration } from "../src/simulation/race/incidents/model";
import { hasLegacyDrs } from "../src/simulation/race/traffic/model";
import { circuitPitTiming } from "../src/simulation/race/pits/circuit-timing";
import type { RaceEntrantState, RaceSimulationState } from "../src/simulation/race/types";
import { neutralise } from "./helpers/incidents";
import { SUZUKA } from "./helpers/v8c";
import { v8dInput } from "./helpers/v8d";
import { v8eInput, v8eRace } from "./helpers/v8e";

const DRY = ["SOFT", "MEDIUM", "HARD"] as const;

describe("revision 5: v8E is progression revision 5 of simulationVersion 8 (never 9)", () => {
    it("capability boundary: latest is 5; v8E semantics only at 5; v8C energy, regulation and domain tie order kept", () => {
        expect(LATEST_PROGRESSION_REVISION).toBe(5);
        for (const version of [1, 2, 3, 4, 5] as const) {
            expect(hasV8eSemantics({ version })).toBe(version === 5);
            expect(hasRegulation({ version })).toBe(version >= 3);
            expect(hasV8dTuning({ version })).toBe(version >= 4);
        }
        const e = progressionEForCircuit(SUZUKA, "RACE");
        expect(energyModelFor(e)).toBe("V8C"); expect(tieOrderFor(e)).toBe(domainTieOrder);
        expect(createRace(v8eInput({ count: 4, laps: 3 })).simulationVersion).toBe(8);
    });
    it("revision-5 content is the revision-4 content with version 5 (no geometry, anchor, energy or regulation change)", () => {
        for (const session of ["RACE", "SPRINT"] as const) {
            const d = progressionDForCircuit(SUZUKA, session), e = progressionEForCircuit(SUZUKA, session);
            expect(e).toEqual({ ...d, version: 5 });
            expect(() => validateProgressionConfiguration(e)).not.toThrow();
        }
        expect(() => progressionEFrom(progressionCForCircuit(SUZUKA, "RACE"))).toThrow(/v8D/);
        expect(() => progressionEForCircuit(null, "RACE")).not.toThrow();
        expect(() => validateProgressionConfiguration({ ...progressionEForCircuit(SUZUKA, "RACE"), regulation: undefined })).toThrow(/regulation/);
    });
    it("v8E car state exists exactly in revision 5: missing in 5 or acquired by 4 is rejected", () => {
        const five = advanceRace(v8eRace({ count: 4, laps: 6, quiet: true }), 2), id = five.input.entrants[0].entrantId;
        expect(() => validateProgressionState(five)).not.toThrow();
        const car = five.progression!.cars[id];
        expect(car).toMatchObject({ attacksThisLap: expect.any(Number), lastAttackAtMs: expect.any(Number), attackArmed: expect.any(Boolean) });
        const { attackArmed: _armed, ...missing } = car; void _armed;
        expect(() => validateProgressionState({ ...five, progression: { ...five.progression!, cars: { ...five.progression!.cars, [id]: missing } } })).toThrow(/v8E attack state/);
        const four = advanceRace(createRace(v8dInput({ count: 4, laps: 6, quiet: true })), 2), fid = four.input.entrants[0].entrantId;
        expect(four.progression!.cars[fid]).not.toHaveProperty("attacksThisLap");
        expect(() => validateProgressionState({ ...four, progression: { ...four.progression!, cars: { ...four.progression!.cars, [fid]: { ...four.progression!.cars[fid], attacksThisLap: 0 } } } })).toThrow(/Historical revisions/);
    });
});

describe("the frozen v8E bundle (revision 5) vs the accepted v8D bundle (revision 4)", () => {
    it("v8E bundle: cadence racecraft without the late window, v8E strategy / tyres / SC, DRS-inert interaction, v8D pit formula", () => {
        const e = progressionEForCircuit(SUZUKA, "RACE"), b = v8eTuningBundle(e, 90000, true);
        expect(() => v8eTuningBundle(progressionDForCircuit(SUZUKA, "RACE"), 90000, true)).toThrow(/revision 5/);
        expect(b.racecraft).toEqual(v8eRacecraftConfiguration());
        expect(b.racecraft).toMatchObject({ attackCooldownMs: expect.any(Number), attackRearmGapMs: expect.any(Number), maxAttacksPerLap: 2, progressionHeldFollowingLossPermille: 500, progressionHeldFollowingLossMaxMs: 250 });
        for (const k of ["lateRaceStartPermille", "lateRaceAttackThresholdPermille", "lateRaceMinimumPaceAdvantagePermille"]) expect(b.racecraft).not.toHaveProperty(k);
        expect(b.strategy).toEqual(v8eAiStrategyConfiguration());
        expect(b.tyres).toEqual(v8eWeatherTyreConfiguration()); expect(v8eTuningBundle(e, 90000, false).tyres).toEqual(v8eTyreConfiguration());
        expect(b.pitTiming).toEqual(circuitPitTiming(e.pit, 90000));
        expect(b.incidents).toEqual(v8eIncidentConfiguration(b.pitTiming.pitTrackSectionMs));
        expect(hasLegacyDrs(b.interaction)).toBe(false);
        expect(() => { validateRacecraftConfiguration(b.racecraft); validateAiStrategyConfiguration(b.strategy); validateTyreConfiguration(b.tyres); validateIncidentConfiguration(b.incidents); }).not.toThrow();
    });
    it("the revision-4 bundle never receives a v8E field (isolation by snapshot, not by engine checks)", () => {
        const d = v8dTuningBundle(progressionDForCircuit(SUZUKA, "RACE"), 90000, true);
        expect(d.racecraft).toEqual(v8dRacecraftConfiguration());
        for (const k of ["attackCooldownMs", "attackRearmGapMs", "maxAttacksPerLap"]) expect(d.racecraft).not.toHaveProperty(k);
        expect(d.strategy).toEqual(v8dAiStrategyConfiguration()); expect(d.strategy).not.toHaveProperty("weatherHorizonSpreadLaps");
        expect(d.tyres).toEqual(v8dWeatherTyreConfiguration());
        expect(defaultIncidentConfiguration()).not.toHaveProperty("scTrainCatchupPermille");
    });
});

describe("attack cadence (Issue 1): deterministic re-attempts instead of one attempt per lap", () => {
    const r = v8eRacecraftConfiguration(), cool = V8E_ATTACK_COOLDOWN_MS;
    it("without cadence fields the accepted once-per-lap rule is unchanged (revision 4)", () => {
        for (const c of [defaultRacecraftConfiguration(), v8dRacecraftConfiguration(), undefined]) {
            expect(attackOpen(c, { attemptedLap: 4 }, 5, 0)).toBe(true);
            expect(attackOpen(c, { attemptedLap: 5 }, 5, 999999)).toBe(false);
            expect(heldLossAllowed(c, { attemptedLap: 5 }, 5, 0)).toBe(false);
            expect(heldLossAllowed(c, { attemptedLap: 4 }, 5, 0)).toBe(true);
        }
    });
    it("cooldown, re-arm and the per-lap cap gate every further attempt (no slice dice-spam)", () => {
        const car = (o: Partial<{ attemptedLap: number; attacksThisLap: number; lastAttackAtMs: number; attackArmed: boolean }>) => ({ attemptedLap: 5, attacksThisLap: 1, lastAttackAtMs: 10000, attackArmed: true, ...o });
        expect(attackOpen(r, car({ attemptedLap: -1, lastAttackAtMs: -1 }), 5, 0)).toBe(true); // never attacked
        expect(attackOpen(r, car({ attemptedLap: 4 }), 5, 10000 + cool - 1)).toBe(false); // new lap, still cooling down
        expect(attackOpen(r, car({ attemptedLap: 4 }), 5, 10000 + cool)).toBe(true); // new lap after the cooldown
        expect(attackOpen(r, car({ attackArmed: false }), 5, 10000 + cool)).toBe(false); // same lap, not re-armed
        expect(attackOpen(r, car({}), 5, 10000 + cool - 1)).toBe(false); // same lap, re-armed but cooling down
        expect(attackOpen(r, car({}), 5, 10000 + cool)).toBe(true); // same lap, re-armed, cooled down, under the cap
        expect(attackOpen(r, car({ attacksThisLap: V8E_MAX_ATTACKS_PER_LAP }), 5, 10000 + cool * 5)).toBe(false); // cap reached
        expect(heldLossAllowed(r, car({}), 5, 10000 + cool - 1)).toBe(false);
        expect(heldLossAllowed(r, car({}), 5, 10000 + cool)).toBe(true);
    });
    it("configuration: all three cadence fields or none, bounded", () => {
        expect(() => validateRacecraftConfiguration(r)).not.toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, maxAttacksPerLap: undefined })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, maxAttacksPerLap: 4 })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, attackCooldownMs: 500 })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, attackRearmGapMs: 0 })).toThrow();
    });
    it("in a revision-5 Race: at most the cap per lap, never an attempt in a neutralised checkpoint, deterministic", () => {
        const i = v8eInput({ count: 12, laps: 16, seed: 5 });
        let s = createRace(i);
        while (s.status === "RUNNING") {
            const prev = s; s = advanceRaceLap(s);
            for (const c of Object.values(s.progression!.cars)) {
                expect(c.attacksThisLap!).toBeLessThanOrEqual(V8E_MAX_ATTACKS_PER_LAP);
                if (prev.incidents!.mode !== "GREEN") expect(c.attemptedLap).not.toBe(s.lap);
            }
        }
        expect(advanceRace(createRace(structuredClone(i)), 16)).toEqual(s);
    }, 60_000);
    it("the late-Race window (Issue 2) is not part of revision 5: the attack range never widens late", () => {
        const base = { attackThresholdMs: 300, minimumPaceAdvantageMs: 100 };
        for (const done of [0, 40, 59]) expect(lateRaceAttackWindow(r, base, done, 60)).toEqual({ late: false, ...base });
        expect(lateRaceAttackWindow(v8dRacecraftConfiguration(), base, 59, 60).late).toBe(true); // revision 4 keeps it
    });
});

describe("pit-entry pass semantics (R8D-BUG30-001) and pass cause (Issue 15)", () => {
    it("revision 5 credits an OVERTAKE only TRACK vs TRACK; earlier revisions are unchanged", () => {
        const routes = ["TRACK", "ENTRY", "LANE", "SERVICE", "EXIT"] as const;
        for (const a of routes) for (const d of routes) {
            expect(passCreditable(true, a, d)).toBe(a === "TRACK" && d === "TRACK");
            expect(passCreditable(false, a, d)).toBe(true);
        }
    });
    const car = (compound: "SOFT" | "MEDIUM" | "HARD", ageLaps: number) => ({ entrantId: "x", stint: { number: 1, startedAtLap: 0, tyre: { compound, ageLaps, wearPermille: 100, temperatureMilliC: 95000 } } } as unknown as RaceEntrantState);
    const assist = (o: Partial<{ electricalDeltaMs: number; overtake: "NOT_ELIGIBLE" | "AVAILABLE" | "ACTIVE"; policy: "RECHARGE" | "BALANCED" | "BOOST"; energy: number }>) =>
        ({ assistance: { energy: 0, policy: "BALANCED", deploymentRemainder: 0, recoveryRemainder: 0, qualifiedLap: null, validUseLap: null, expiresAfterLap: null, aero: "STRAIGHT", overtake: "NOT_ELIGIBLE", used: 0, recovered: 0, electricalDeltaMs: 0, ...o } as never });
    it("the cause is the actual contribution: zero-energy Boost is never 'Boost'", () => {
        const fresh = car("MEDIUM", 2), same = car("MEDIUM", 3), old = car("MEDIUM", 14), q = assist({});
        expect(attackCause(fresh, same, assist({ policy: "BOOST", energy: 0, electricalDeltaMs: 0 }), q)).toBe("PACE"); // Boost selected, nothing deployed
        expect(attackCause(fresh, same, assist({ policy: "BOOST", energy: 500, electricalDeltaMs: 40 }), q)).toBe("BOOST");
        expect(attackCause(fresh, same, assist({ policy: "BALANCED", energy: 500, electricalDeltaMs: 15 }), q)).toBe("PACE"); // ordinary deployment is not Boost
        expect(attackCause(fresh, same, assist({ policy: "BOOST", overtake: "ACTIVE", electricalDeltaMs: 120 }), q)).toBe("OVERTAKE_MODE");
        expect(attackCause(fresh, old, assist({}), q)).toBe("TYRE");
        expect(attackCause(fresh, old, assist({ overtake: "ACTIVE", electricalDeltaMs: 120 }), q)).toBe("OVERTAKE_MODE"); // mixed: priority
        expect(attackCause(fresh, same, assist({ policy: "BOOST", electricalDeltaMs: 40 }), assist({ policy: "BOOST", electricalDeltaMs: 40 }))).toBe("PACE"); // no net electrical edge
    });
    it("a revision-5 Race never records a DRS cause and never credits a pass into the pit route at a checkpoint", () => {
        let s = createRace(v8eInput({ count: 12, laps: 14, seed: 23, weather: true }));
        while (s.status === "RUNNING") {
            const seen = s.incidents!.events.length; s = advanceRaceLap(s);
            for (const ev of s.incidents!.events.slice(seen).filter(x => x.type === "OVERTAKE")) expect(["TYRE", "PACE", "OVERTAKE_MODE", "BOOST"]).toContain(ev.cause);
        }
    }, 60_000);
});

describe("serialization (Issue 23): revision-5 car state never holds -0", () => {
    it("variationMs is +0, never -0, at every checkpoint; JSON round trip resumes identically", () => {
        const i = v8eInput({ count: 22, laps: 10, seed: 41 });
        let s = createRace(i), mid: RaceSimulationState | null = null;
        while (s.status === "RUNNING") {
            s = advanceRaceLap(s);
            for (const c of Object.values(s.progression!.cars)) expect(Object.is(c.variationMs, -0)).toBe(false);
            if (s.lap === 4) mid = JSON.parse(JSON.stringify(s));
        }
        expect(advanceRace(mid!, 10)).toEqual(s);
    }, 60_000);
});

/** Same-lap consecutive pair gaps (ms of distance) of running cars on track. */
function pairGapSum(s: RaceSimulationState) {
    const order = [...s.entrants].filter(e => e.incident!.status === "RUNNING").sort((a, b) => a.position - b.position);
    let sum = 0;
    for (let k = 1; k < order.length; k++) sum += Math.round((order[k - 1].track!.progressMicrolaps - order[k].track!.progressMicrolaps) * s.input.circuit.baseLapTimeMs / LAP_UNITS);
    return sum;
}
describe("Safety Car train compression (Issue 6) and VSC gap retention (Issue 7)", () => {
    const spread = (input = v8eInput({ count: 8, players: 8, laps: 30, quiet: true, seed: 7 })) => advanceRace(createRace(input), 8);
    it("configuration: v8E SC fields bounded; minimum SC period of 3 laps; VSC profile unchanged", () => {
        const c = v8eIncidentConfiguration(12000);
        expect(c.scTrainCatchupPermille).toBeGreaterThan(0); expect(c.SAFETY_CAR.minLaps).toBeGreaterThanOrEqual(3);
        expect(c.VSC).toEqual(defaultIncidentConfiguration().VSC);
        expect(() => validateIncidentConfiguration({ ...c, scTrainCatchupPermille: 0 })).toThrow();
    });
    it("under the Safety Car every car moves forward, keeps its lap count, and the field compresses more than revision 4", () => {
        const run = (s: RaceSimulationState) => {
            let x = neutralise(s, "SAFETY_CAR", 4); const before = pairGapSum(x), seen = x.incidents!.events.length;
            for (let n = 0; n < 3; n++) {
                const prev = x; x = advanceRaceLap(x);
                for (const e of x.entrants) { const p = prev.entrants.find(y => y.entrantId === e.entrantId)!; expect(e.track!.progressMicrolaps).toBeGreaterThanOrEqual(p.track!.progressMicrolaps); expect(e.completedLaps).toBeGreaterThanOrEqual(p.completedLaps); }
            }
            expect(x.incidents!.events.slice(seen).some(ev => ev.type === "OVERTAKE")).toBe(false);
            return pairGapSum(x) / before;
        };
        const five = run(spread()), four = run(spread(v8dInput({ count: 8, players: 8, laps: 30, quiet: true, seed: 7 })));
        expect(five).toBeLessThan(1);
        expect(five).toBeLessThan(four);
    }, 60_000);
    it("the VSC holds gaps (no bunching) in revision 5", () => {
        let x = neutralise(spread(), "VSC", 4); const before = pairGapSum(x);
        for (let n = 0; n < 3; n++) x = advanceRaceLap(x);
        const ratio = pairGapSum(x) / before;
        expect(ratio).toBeGreaterThan(0.9); expect(ratio).toBeLessThan(1.1);
    }, 60_000);
});

describe("strategy diversity configuration (Issues 4, 5, 22) and tyre shape (Issue 8)", () => {
    it("v8E strategy: wider weather character, forecast-horizon spread and dry tolerance; validated together", () => {
        const v = v8eAiStrategyConfiguration(), d = v8dAiStrategyConfiguration();
        expect(v.weatherRiskSpreadPermille!).toBeGreaterThan(d.weatherRiskSpreadPermille!);
        expect(v.weatherGateSpreadMs!).toBeGreaterThan(d.weatherGateSpreadMs!);
        expect(v.weatherHorizonSpreadLaps).toBeGreaterThan(0);
        expect(v.compoundToleranceMs).toBeGreaterThan(d.compoundToleranceMs);
        expect(() => validateAiStrategyConfiguration(v)).not.toThrow();
        expect(() => validateAiStrategyConfiguration({ ...d, weatherHorizonSpreadLaps: 3, weatherRiskSpreadPermille: undefined, wetCompoundToleranceMs: undefined })).toThrow();
        expect(() => validateAiStrategyConfiguration({ ...v, weatherHorizonSpreadLaps: 11 })).toThrow();
    });
    it("v8E dry tyres keep the v8D cliffs but degrade more before them (fresh vs worn delta larger)", () => {
        const e = v8eTyreConfiguration().profiles, d = v8dTyreConfiguration().profiles;
        const pen = (p: typeof e.SOFT, w: number) => tyreContributions({ compound: p.compound, ageLaps: 0, wearPermille: w, temperatureMilliC: p.targetTemperatureMilliC }, p).tyreWearMs;
        for (const c of DRY) {
            expect({ start: e[c].degradationStartWear, cliff: e[c].cliffWear, after: e[c].cliffPenaltyMs, grip: e[c].baseGripDeltaMs, wear: e[c].baseWearPerLapPermille })
                .toEqual({ start: d[c].degradationStartWear, cliff: d[c].cliffWear, after: d[c].cliffPenaltyMs, grip: d[c].baseGripDeltaMs, wear: d[c].baseWearPerLapPermille });
            expect(pen(e[c], 600) - pen(e[c], 0)).toBeGreaterThan(pen(d[c], 600) - pen(d[c], 0));
            let last = 0; for (let w = 0; w <= 1000; w += 5) { const now = pen(e[c], w); expect(now).toBeGreaterThanOrEqual(last); last = now; }
        }
        expect(v8eWeatherTyreConfiguration().profiles.INTERMEDIATE).toEqual(v8dWeatherTyreConfiguration().profiles.INTERMEDIATE);
        expect(v8eWeatherTyreConfiguration().profiles.WET).toEqual(v8dWeatherTyreConfiguration().profiles.WET);
    });
});

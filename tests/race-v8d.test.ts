/**
 * Race v8D (progression revision 4 of simulationVersion 8): revision plumbing, the production tuning bundle, wet AI
 * strategy diversity, tyre cliff calibration, the late-Race attack window, circuit pit timing and cross-system
 * fixtures. Fixed deterministic fixtures only — no statistical campaigns.
 */
import { describe, expect, it } from "vitest";
import { advanceRace, createRace } from "../src/simulation/race/engine";
import { progressionCForCircuit, progressionDForCircuit, progressionDFrom, progressionBForCircuit, progressionForCircuit } from "../src/data/seed/circuit-progression";
import { validateProgressionConfiguration, validateProgressionState } from "../src/simulation/race/progression/model";
import { LATEST_PROGRESSION_REVISION, energyModelFor, hasAssistance, hasRegulation, hasV8dTuning } from "../src/simulation/race/progression/revision";
import { domainTieOrder, tieOrderFor } from "../src/simulation/race/progression/tie-order";
import { v8dTuningBundle } from "../src/features/race/v8d-tuning";
import { aiWetStartingCompound, defaultAiStrategyConfiguration, publicWeather, sensibleWetChoice, strategyPreference, v8dAiStrategyConfiguration, validateAiStrategyConfiguration, type StrategyPreference } from "../src/simulation/race/pits/ai-strategy";
import { DEFAULT_TYRE_PROFILES, defaultTyreConfiguration, v8dTyreConfiguration, v8dWeatherTyreConfiguration, weatherTyreConfiguration } from "../src/simulation/race/tyres/profiles";
import { tyreContributions, validateTyreConfiguration, type TyreCompound, type TyreCompoundProfile } from "../src/simulation/race/tyres/model";
import { currentCompoundCostMs } from "../src/simulation/race/tyres/suitability";
import { defaultRacecraftConfiguration, lateRaceAttackWindow, v8dRacecraftConfiguration, validateRacecraftConfiguration } from "../src/simulation/race/traffic/racecraft";
import { circuitPitTiming, PIT_LANE_LOSS_MAX_MS, PIT_LANE_LOSS_MIN_MS } from "../src/simulation/race/pits/circuit-timing";
import { effectivePitLaneLoss, defaultIncidentConfiguration, validateIncidentConfiguration } from "../src/simulation/race/incidents/model";
import { defaultPitConfiguration, validatePitConfiguration } from "../src/simulation/race/pits/profiles";
import { aiStartingCompound } from "../src/features/race/weather-scenarios";
import { developmentBaseLapTimeMs } from "../src/features/race/development-profiles";
import { developmentContent } from "../src/data/seed/content-development";
import { projectRaceState } from "../src/features/race/projection";
import { createSeededRandom } from "../src/simulation/core/random";
import { LAP_UNITS } from "../src/simulation/race/progression/model";
import { assess, NEUTRAL } from "./helpers/race-dynamics";
import { weatherField } from "./helpers/weather-overdelay";
import { neutralise } from "./helpers/incidents";
import { MONACO, SUZUKA, v8cInput } from "./helpers/v8c";
import { v8dInput, v8dRace, withoutLateWindow } from "./helpers/v8d";
import type { RaceSimulationState } from "../src/simulation/race/types";

const DRY = ["SOFT", "MEDIUM", "HARD"] as const;

describe("revision 4: v8D is progression revision 4 of simulationVersion 8 (never 9)", () => {
    it("capability boundary: latest is 4; regulation from 3; v8D tuning only at 4; assistance and v8C energy kept", () => {
        expect(LATEST_PROGRESSION_REVISION).toBe(5); // v8E is the latest; v8D stays revision 4
        for (const version of [1, 2, 3, 4] as const) {
            expect(hasV8dTuning({ version })).toBe(version === 4);
            expect(hasRegulation({ version })).toBe(version >= 3);
            expect(hasAssistance({ version })).toBe(version >= 2);
        }
        expect(hasV8dTuning(null)).toBe(false); expect(hasRegulation(undefined)).toBe(false);
        const d = progressionDForCircuit(SUZUKA, "RACE");
        expect(energyModelFor(d)).toBe(energyModelFor(progressionCForCircuit(SUZUKA, "RACE")));
        expect(energyModelFor(d)).toBe("V8C");
        expect(tieOrderFor(d)).toBe(domainTieOrder);
    });
    it("revision-4 content is the accepted revision-3 content with version 4: no geometry, anchor, energy or regulation change", () => {
        for (const session of ["RACE", "SPRINT"] as const) {
            const c = progressionCForCircuit(SUZUKA, session), d = progressionDForCircuit(SUZUKA, session);
            expect(d).toEqual({ ...c, version: 4 });
            expect(() => validateProgressionConfiguration(d)).not.toThrow();
        }
        expect(progressionDForCircuit(SUZUKA, "SPRINT").regulation).toMatchObject({ session: "SPRINT", dryTyres: null });
        expect(progressionDForCircuit(SUZUKA, "RACE").regulation!.dryTyres).toMatchObject({ article: "B6.3.6", consequence: "DISQUALIFICATION" });
        expect(() => progressionDFrom(progressionBForCircuit(SUZUKA))).toThrow(/v8C/);
        expect(() => progressionDFrom(progressionDForCircuit(SUZUKA, "RACE"))).toThrow(/v8C/);
        expect(() => progressionDForCircuit(null, "RACE")).not.toThrow(); // custom / fallback circuits
    });
    it("rejects contradictory revision content: 4 must carry the regulation; 1 and 2 never do; a finished 4 needs its classification", () => {
        const d = progressionDForCircuit(SUZUKA, "RACE");
        expect(() => validateProgressionConfiguration({ ...d, regulation: undefined })).toThrow(/regulation/);
        expect(() => validateProgressionConfiguration({ ...progressionBForCircuit(SUZUKA), regulation: d.regulation })).toThrow();
        expect(() => validateProgressionConfiguration({ ...progressionForCircuit(SUZUKA), regulation: d.regulation })).toThrow();
        expect(() => validateProgressionConfiguration({ ...d, version: 5 as never })).toThrow();
        const done = advanceRace(v8dRace({ count: 4, laps: 3, quiet: true }), 3);
        expect(done.status).toBe("FINISHED");
        expect(done.input.progression!.version).toBe(4);
        expect(() => validateProgressionState(done)).not.toThrow();
        expect(() => validateProgressionState({ ...done, progression: { ...done.progression!, classification: undefined } })).toThrow(/Missing final classification/);
    });
    it("the v8D bundle is only for revision 4", () => {
        expect(() => v8dTuningBundle(progressionCForCircuit(SUZUKA, "RACE"), 90000, true)).toThrow(/revision 4/);
        const d = progressionDForCircuit(SUZUKA, "RACE"), b = v8dTuningBundle(d, 90000, true), dry = v8dTuningBundle(d, 90000, false);
        expect(b.tyres).toEqual(v8dWeatherTyreConfiguration()); expect(dry.tyres).toEqual(v8dTyreConfiguration());
        expect(b.strategy).toEqual(v8dAiStrategyConfiguration()); expect(b.racecraft).toEqual(v8dRacecraftConfiguration());
        expect(b.pitTiming).toEqual(circuitPitTiming(d.pit, 90000));
    });
});

describe("production tuning bundle (revision 4) vs the frozen accepted v8C configuration (revision 3)", () => {
    it("a revision-4 input freezes every v8D configuration coherently and validates", () => {
        const i = v8dInput(), d = i.progression!, timing = circuitPitTiming(d.pit, i.circuit.baseLapTimeMs);
        expect(i.tyres).toEqual(v8dWeatherTyreConfiguration());
        expect(i.pits!.strategy).toEqual(v8dAiStrategyConfiguration());
        expect(i.commands!.racecraft).toEqual(v8dRacecraftConfiguration());
        expect(i.pits!.pitLaneLossMs).toBe(timing.pitLaneLossMs);
        expect(i.incidents!.pitTrackSectionMs).toBe(timing.pitTrackSectionMs);
        // Stationary service is unchanged and separate (never folded into the lane loss).
        expect(i.pits!.stationaryBaseMs).toBe(defaultPitConfiguration().stationaryBaseMs);
        expect(() => { validateTyreConfiguration(i.tyres!); validatePitConfiguration(i.pits!); validateIncidentConfiguration(i.incidents!); validateRacecraftConfiguration(i.commands!.racecraft!); }).not.toThrow();
        const s = createRace(i);
        expect(s.simulationVersion).toBe(8);
        expect(() => validateProgressionState(s)).not.toThrow();
    });
    it("revision 3 keeps the accepted v8C configuration exactly: no v8D field anywhere", () => {
        const i = v8cInput();
        expect(i.progression!.version).toBe(3);
        expect(i.pits!.pitLaneLossMs).toBe(19500);
        expect(i.pits!.strategy).toEqual(defaultAiStrategyConfiguration());
        expect(i.pits!.strategy).not.toHaveProperty("weatherRiskSpreadPermille");
        expect(i.tyres).toEqual(weatherTyreConfiguration());
        expect(i.incidents!.pitTrackSectionMs).toBe(defaultIncidentConfiguration().pitTrackSectionMs);
        expect(defaultRacecraftConfiguration()).not.toHaveProperty("lateRaceStartPermille");
    });
    it("public boundary: no rival character, wet trait, strategy plan or tuning internals in the browser state", () => {
        const s = advanceRace(v8dRace({ count: 6, laps: 12, quiet: true, weather: true }), 4);
        const json = JSON.stringify(projectRaceState(s, s.input.entrants[0].teamId));
        for (const key of ["weatherRisk", "wetCompound", "stopBias", "weatherRiskSpreadPermille", "wetCompoundToleranceMs", "lateRaceStartPermille", "lateRaceAttackThresholdPermille", "pitTrackSectionMs", "strategy\""]) expect(json).not.toContain(key);
    });
});

/** The strategyPreference algorithm exactly as accepted before v8D (four draws), re-implemented independently. */
function acceptedPreference(seed: number, gridPosition: number) {
    let hash = 0x811c9dc5;
    for (const char of `${seed}␟${gridPosition}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
    const random = createSeededRandom(hash >>> 0);
    random.next();
    const unit = () => random.next() * 2 - 1;
    return { stopBias: unit(), undercut: random.next(), trafficSensitivity: 0.5 + random.next(), compound: unit() };
}
/**
 * A v8D weather field: every car on `compound`, the v8D tyres and strategy, and a circuit whose public water model holds
 * `water` steady (no accumulation, drainage or drying) — so decisions reflect the conditions, not an approaching change.
 */
function v8dWet(water: number, compound: TyreCompound, lap = 0, strategy = v8dAiStrategyConfiguration()): RaceSimulationState {
    const s = weatherField(71, [[1, 1000]], water, compound), w = s.input.weather!;
    const steady = { ...w, circuit: { ...w.circuit, accumulationPermille: 0, drainagePerLap: 0, dryingPerLap: 0 } };
    return { ...s, lap, input: { ...s.input, weather: steady, tyres: v8dWeatherTyreConfiguration(), pits: { ...s.input.pits!, strategy } } };
}
const grid = (seed = 71) => Array.from({ length: 22 }, (_, n) => strategyPreference(seed, n + 1));

describe("wet AI strategy diversity (public conditions only; no RNG; no future truth)", () => {
    it("traits are appended draws: every accepted preference field is unchanged; traits are bounded and spread", () => {
        for (const seed of [1, 42, 9001]) for (let slot = 1; slot <= 22; slot++) {
            const p = strategyPreference(seed, slot);
            expect({ stopBias: p.stopBias, undercut: p.undercut, trafficSensitivity: p.trafficSensitivity, compound: p.compound }).toEqual(acceptedPreference(seed, slot));
            for (const x of [p.weatherRisk, p.wetCompound]) { expect(x).toBeGreaterThanOrEqual(-1); expect(x).toBeLessThanOrEqual(1); }
        }
        const field = grid();
        expect(field.some(p => p.weatherRisk < -0.3) && field.some(p => p.weatherRisk > 0.3)).toBe(true);
        expect(field.some(p => p.wetCompound < 0) && field.some(p => p.wetCompound > 0)).toBe(true);
        // A separate trait: not just the dry stop bias again.
        expect(field.some(p => Math.sign(p.weatherRisk) !== Math.sign(p.stopBias))).toBe(true);
        expect(strategyPreference(71, 3)).toEqual(strategyPreference(71, 3));
    });
    it("configuration: both v8D fields or neither, bounded, and only on top of the weather gate", () => {
        expect(() => validateAiStrategyConfiguration(v8dAiStrategyConfiguration())).not.toThrow();
        expect(v8dAiStrategyConfiguration()).toMatchObject({ ...defaultAiStrategyConfiguration(), weatherRiskSpreadPermille: 350, wetCompoundToleranceMs: 1500 });
        const v = v8dAiStrategyConfiguration();
        expect(() => validateAiStrategyConfiguration({ ...v, wetCompoundToleranceMs: undefined })).toThrow();
        expect(() => validateAiStrategyConfiguration({ ...v, weatherRiskSpreadPermille: 501 })).toThrow();
        expect(() => validateAiStrategyConfiguration({ ...v, wetCompoundToleranceMs: -1 })).toThrow();
        expect(() => validateAiStrategyConfiguration({ ...v, weatherGateMs: undefined, weatherGateSpreadMs: undefined })).toThrow();
    });
    it("sensible wet choice: the trait chooses only between two close wet compounds; a clearly worse one is never chosen", () => {
        const v = v8dAiStrategyConfiguration(), pick = (inter: number, wet: number, wetCompound: number) =>
            sensibleWetChoice([{ compound: "INTERMEDIATE", cost: inter }, { compound: "WET", cost: wet }], v, { ...NEUTRAL, wetCompound });
        expect(pick(1000, 1000, 0.2)).toBe("WET"); expect(pick(1000, 1000, -0.2)).toBe("INTERMEDIATE");
        expect(pick(1000, 1700, 0.9)).toBe("WET"); expect(pick(1000, 1700, 0.3)).toBe("INTERMEDIATE");
        for (const t of [-1, 0, 1]) { expect(pick(1000, 2600, t)).toBe("INTERMEDIATE"); expect(pick(2600, 1000, t)).toBe("WET"); }
        expect(sensibleWetChoice([{ compound: "INTERMEDIATE", cost: 1 }], defaultAiStrategyConfiguration(), NEUTRAL)).toBeNull();
        expect(sensibleWetChoice([{ compound: "MEDIUM", cost: 0 }], v, NEUTRAL)).toBeNull();
    });
    it("near the inter / wet crossover the field splits by trait; obvious conditions converge", () => {
        // At ~700 ‰ water both wet compounds are within tolerance; at 1000 the full wet is clearly best.
        const close = v8dWet(700, "MEDIUM"), heavy = v8dWet(1000, "MEDIUM"), field = grid();
        const pub = publicWeather(close.input.weather!), t = close.input.tyres!;
        expect(Math.abs(currentCompoundCostMs("WET", close.weather!, t, pub) - currentCompoundCostMs("INTERMEDIATE", close.weather!, t, pub))).toBeLessThan(1500);
        const picks = (s: RaceSimulationState) => field.map(p => assess(s, s.entrants[0], p).compound);
        expect(new Set(picks(close))).toEqual(new Set(["INTERMEDIATE", "WET"]));
        expect(new Set(picks(heavy))).toEqual(new Set(["WET"]));
        // Earlier strategy snapshots keep the established single choice exactly.
        const accepted = v8dWet(700, "MEDIUM", 0, defaultAiStrategyConfiguration());
        expect(new Set(picks(accepted))).toEqual(new Set(["INTERMEDIATE"]));
    });
    it("commitment timing follows the weather-risk trait (not the dry stop bias) at a borderline payback", () => {
        const s = v8dWet(700, "MEDIUM", 55), e = s.entrants[0]; // two laps remain
        const early: StrategyPreference = { ...NEUTRAL, weatherRisk: -1 }, late: StrategyPreference = { ...NEUTRAL, weatherRisk: 1 };
        expect(assess(s, e, early).compound).not.toBeNull();
        expect(assess(s, e, late).compound).toBeNull();
        for (const stopBias of [-1, 0, 1]) {
            expect(assess(s, e, { ...early, stopBias })).toEqual(assess(s, e, early));
            expect(assess(s, e, { ...late, stopBias })).toEqual(assess(s, e, late));
        }
    });
    it("anti-churn: a car already on a sensible wet tyre is never called in to swap inter ↔ wet by its trait", () => {
        for (const compound of ["INTERMEDIATE", "WET"] as const) {
            const s = v8dWet(700, compound, 10), e = { ...s.entrants[0], stint: { ...s.entrants[0].stint!, startedAtLap: 2, tyre: { ...s.entrants[0].stint!.tyre, ageLaps: 8, wearPermille: 120 } } };
            for (const p of grid()) expect(assess(s, e, p).compound).toBeNull();
        }
    });
    it("traits are inert for earlier snapshots and never consume Race RNG", () => {
        const s = weatherField(71, [[1, 1000]], 700, "MEDIUM"); // accepted strategy (no v8D fields)
        for (const p of grid()) expect(assess(s, s.entrants[0], { ...p, weatherRisk: -p.weatherRisk, wetCompound: -p.wetCompound })).toEqual(assess(s, s.entrants[0], p));
        const v = v8dWet(700, "MEDIUM"), before = v.rngState;
        for (const p of grid()) assess(v, v.entrants[0], p);
        expect(v.rngState).toBe(before);
        expect(assess(structuredClone(v), v.entrants[0], grid()[4])).toEqual(assess(v, v.entrants[0], grid()[4]));
    });
    it("wet grid start (revision 4): the trait chooses only when both wet tyres are sensible; dry grids unchanged", () => {
        const strategy = v8dAiStrategyConfiguration(), tyres = v8dWeatherTyreConfiguration(), field = grid();
        const at = (water: number) => { const s = v8dWet(water, "MEDIUM"); return { w: { ...s.weather!, trackWater: water }, pub: publicWeather(s.input.weather!) }; };
        const starts = (water: number) => { const { w, pub } = at(water), proposed = aiStartingCompound({ ...w, rainfallIntensity: 1000 });
            return new Set(field.map(p => aiWetStartingCompound(proposed, w, tyres, pub, strategy, p))); };
        expect(starts(700)).toEqual(new Set(["INTERMEDIATE", "WET"]));
        expect(starts(1000)).toEqual(new Set(["WET"]));
        expect(starts(300)).toEqual(new Set(["INTERMEDIATE"]));
        const { w, pub } = at(700);
        for (const p of field) expect(aiWetStartingCompound("MEDIUM", w, tyres, pub, strategy, p)).toBe("MEDIUM");
    });
});

describe("tyre cliff calibration (GAME TUNING)", () => {
    const penalty = (p: TyreCompoundProfile, wearPermille: number) => tyreContributions({ compound: p.compound, ageLaps: 0, wearPermille, temperatureMilliC: p.targetTemperatureMilliC }, p).tyreWearMs;
    it("accepted profiles are untouched; v8D changes only the four curve fields", () => {
        expect(DEFAULT_TYRE_PROFILES.SOFT).toMatchObject({ degradationStartWear: 400, cliffWear: 800, progressivePenaltyMs: 1600, cliffPenaltyMs: 6000 });
        expect(DEFAULT_TYRE_PROFILES.MEDIUM).toMatchObject({ degradationStartWear: 450, cliffWear: 850, progressivePenaltyMs: 1200, cliffPenaltyMs: 6000 });
        expect(DEFAULT_TYRE_PROFILES.HARD).toMatchObject({ degradationStartWear: 500, cliffWear: 900, progressivePenaltyMs: 900, cliffPenaltyMs: 6000 });
        expect(weatherTyreConfiguration().profiles.INTERMEDIATE).toMatchObject({ cliffWear: 850, cliffPenaltyMs: 6000 });
        const v = v8dTyreConfiguration().profiles;
        expect(v.SOFT).toMatchObject({ degradationStartWear: 400, cliffWear: 780, progressivePenaltyMs: 1700, cliffPenaltyMs: 8500 });
        expect(v.MEDIUM).toMatchObject({ degradationStartWear: 450, cliffWear: 830, progressivePenaltyMs: 1300, cliffPenaltyMs: 7000 });
        expect(v.HARD).toMatchObject({ degradationStartWear: 500, cliffWear: 880, progressivePenaltyMs: 1000, cliffPenaltyMs: 5500 });
        const curve = ["degradationStartWear", "cliffWear", "progressivePenaltyMs", "cliffPenaltyMs"];
        const rest = (p: object) => Object.fromEntries(Object.entries(p).filter(([k]) => !curve.includes(k)));
        for (const c of DRY) expect(rest(v[c])).toEqual(rest(defaultTyreConfiguration().profiles[c]));
        const w = v8dWeatherTyreConfiguration().profiles, accepted = weatherTyreConfiguration().profiles;
        for (const c of ["INTERMEDIATE", "WET"] as const) expect(rest(w[c]!)).toEqual(rest(accepted[c]!));
        expect(() => { validateTyreConfiguration(v8dTyreConfiguration()); validateTyreConfiguration(v8dWeatherTyreConfiguration()); }).not.toThrow();
    });
    it("every v8D curve is monotonic and continuous, and materially steeper after the cliff", () => {
        for (const p of Object.values(v8dWeatherTyreConfiguration().profiles)) {
            let last = penalty(p!, 0);
            for (let wear = 1; wear <= 1000; wear++) {
                const now = penalty(p!, wear);
                expect(now).toBeGreaterThanOrEqual(last);
                expect(now - last).toBeLessThan(200); // no step
                last = now;
            }
            const c = p!.cliffWear, before = penalty(p!, c) - penalty(p!, c - 100), after = penalty(p!, c + 100) - penalty(p!, c);
            expect(after).toBeGreaterThan(before * 1.5);
        }
    });
    it("fresh SOFT is still the fastest and HARD still lasts longest", () => {
        const v = v8dTyreConfiguration().profiles, fresh = (c: (typeof DRY)[number]) => { const x = tyreContributions({ compound: c, ageLaps: 0, wearPermille: 0, temperatureMilliC: v[c].targetTemperatureMilliC }, v[c]); return x.tyreCompoundMs + x.tyreWearMs + x.tyreTemperatureMs; };
        expect(fresh("SOFT")).toBeLessThan(fresh("MEDIUM")); expect(fresh("MEDIUM")).toBeLessThan(fresh("HARD"));
        const life = (c: (typeof DRY)[number]) => v[c].cliffWear / v[c].baseWearPerLapPermille;
        expect(life("HARD")).toBeGreaterThan(life("MEDIUM")); expect(life("MEDIUM")).toBeGreaterThan(life("SOFT"));
        // Worn past the cliff costs more than under the accepted curve (a worn tyre is no longer free to the flag).
        for (const c of DRY) expect(penalty(v[c], 950)).toBeGreaterThan(penalty(DEFAULT_TYRE_PROFILES[c], 950));
    });
});

describe("late-Race passing window (ordinary racing only; probability unchanged)", () => {
    const base = { attackThresholdMs: 700, minimumPaceAdvantageMs: 120 }, r = v8dRacecraftConfiguration();
    it("late status uses the attacker's own completed distance; thresholds scale; a pace edge is still required", () => {
        expect(lateRaceAttackWindow(r, base, 44, 60)).toEqual({ late: false, ...base });
        expect(lateRaceAttackWindow(r, base, 45, 60)).toEqual({ late: true, attackThresholdMs: 910, minimumPaceAdvantageMs: 96 });
        expect(lateRaceAttackWindow(defaultRacecraftConfiguration(), base, 59, 60)).toEqual({ late: false, ...base });
        expect(lateRaceAttackWindow(undefined, base, 59, 60)).toEqual({ late: false, ...base });
        expect(lateRaceAttackWindow(r, { attackThresholdMs: 700, minimumPaceAdvantageMs: 0 }, 59, 60).minimumPaceAdvantageMs).toBe(1);
    });
    it("configuration: all three fields or none; the window can only widen the range and relax (never remove) the edge", () => {
        expect(() => validateRacecraftConfiguration(r)).not.toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, lateRaceStartPermille: undefined })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, lateRaceAttackThresholdPermille: 999 })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, lateRaceMinimumPaceAdvantagePermille: 0 })).toThrow();
        expect(r).toMatchObject({ ...defaultRacecraftConfiguration(), lateRaceStartPermille: 750, lateRaceAttackThresholdPermille: 1300, lateRaceMinimumPaceAdvantagePermille: 800 });
    });
    it("no effect before the attacker's late distance: identical Race with or without the window; deterministic after", () => {
        const i = v8dInput({ count: 22, laps: 20, quiet: true, seed: 5 });
        const a = advanceRace(createRace(i), 15), b = advanceRace(createRace(withoutLateWindow(i)), 15);
        expect(a.entrants).toEqual(b.entrants); expect(a.progression).toEqual(b.progression); expect(a.rngState).toBe(b.rngState);
        const done = advanceRace(createRace(i), 20);
        expect(done).toEqual(advanceRace(createRace(structuredClone(i)), 20));
        expect(done.status).toBe("FINISHED");
        // The window engages in the final quarter: extra ordinary attempts draw from the same pass stream.
        expect(done.rngState).not.toBe(advanceRace(createRace(withoutLateWindow(i)), 20).rngState);
    }, 60_000);
});

describe("circuit pit timing from authoritative progression anchors (GAME TUNING)", () => {
    it("all 24 catalogue circuits: the documented formula, bounds and a real spread", () => {
        expect(developmentContent.circuits).toHaveLength(24);
        const losses = new Set<number>();
        for (const c of developmentContent.circuits) {
            const pit = progressionDForCircuit(c.id, "RACE").pit, lap = developmentBaseLapTimeMs(c.lengthMeters), t = circuitPitTiming(pit, lap);
            const bypass = (LAP_UNITS - pit.entry) + pit.exit, section = Math.round(lap * bypass / LAP_UNITS);
            expect(t.pitTrackSectionMs, c.key).toBe(section);
            expect(t.pitLaneLossMs, c.key).toBe(Math.min(PIT_LANE_LOSS_MAX_MS, Math.max(PIT_LANE_LOSS_MIN_MS, Math.round(section * 1600 / 1000))));
            expect(Number.isSafeInteger(t.pitLaneLossMs) && Number.isSafeInteger(t.pitTrackSectionMs)).toBe(true);
            expect(() => { validatePitConfiguration({ ...defaultPitConfiguration(), pitLaneLossMs: t.pitLaneLossMs }); validateIncidentConfiguration({ ...defaultIncidentConfiguration(), pitTrackSectionMs: t.pitTrackSectionMs }); }).not.toThrow();
            losses.add(t.pitLaneLossMs);
        }
        expect(losses.size).toBeGreaterThan(12);
    });
    it("timing reads only the anchors and base lap (no drawn geometry); custom circuits and bad inputs", () => {
        const d = progressionDForCircuit(MONACO, "RACE");
        expect(circuitPitTiming({ entry: d.pit.entry, exit: d.pit.exit }, 80000)).toEqual(circuitPitTiming(d.pit, 80000));
        expect(() => circuitPitTiming(progressionDForCircuit(null, "RACE").pit, 85000)).not.toThrow();
        expect(circuitPitTiming({ entry: 950000, exit: 50000 }, 100000)).toEqual({ pitTrackSectionMs: 10000, pitLaneLossMs: 16000 });
        expect(circuitPitTiming({ entry: 990000, exit: 5000 }, 90000).pitLaneLossMs).toBe(PIT_LANE_LOSS_MIN_MS);
        expect(circuitPitTiming({ entry: 700000, exit: 300000 }, 90000).pitLaneLossMs).toBe(PIT_LANE_LOSS_MAX_MS);
        for (const bad of [{ entry: 0, exit: 0 }, { entry: 500000, exit: 600000 }, { entry: LAP_UNITS, exit: 1 }]) expect(() => circuitPitTiming(bad, 90000)).toThrow();
        expect(() => circuitPitTiming({ entry: 950000, exit: 50000 }, 0)).toThrow();
    });
    it("green and SC/VSC stops use the circuit's own lane loss and track section (stationary time separate)", () => {
        const s = advanceRace(v8dRace({ count: 4, laps: 20, quiet: true }), 2), t = circuitPitTiming(s.input.progression!.pit, s.input.circuit.baseLapTimeMs);
        expect(effectivePitLaneLoss(s)).toBe(t.pitLaneLossMs);
        for (const mode of ["VSC", "SAFETY_CAR"] as const) {
            const n = neutralise(s, mode), m = s.input.incidents![mode].lapMultiplierPermille;
            expect(effectivePitLaneLoss(n)).toBe(Math.max(1000, t.pitLaneLossMs - Math.round(t.pitTrackSectionMs * (m - 1000) / 1000)));
        }
    });
});

describe("cross-system: a production-shaped revision-4 Race", () => {
    it("runs to the flag deterministically with v8C regulation (DSQ), v8C energy and the v8D bundle together", () => {
        const i = v8dInput({ count: 8, players: 1, laps: 14, quiet: true, weather: true, seed: 23 });
        const done = advanceRace(createRace(i), 14);
        expect(done.status).toBe("FINISHED");
        expect(done).toEqual(advanceRace(createRace(structuredClone(i)), 14));
        expect(() => validateProgressionState(done)).not.toThrow();
        const record = done.progression!.classification!;
        expect(record.entries).toHaveLength(8);
        const player = i.entrants[0].entrantId, stops = done.entrants.find(e => e.entrantId === player)!.pit!.stops.length;
        if (stops === 0) expect(record.entries.find(x => x.entrantId === player)!.status).toBe("DISQUALIFIED");
        // Every recorded stop paid the circuit's green (or reduced SC/VSC) lane loss — never the fixed 19.5 s default.
        const timing = circuitPitTiming(i.progression!.pit, i.circuit.baseLapTimeMs);
        for (const e of done.entrants) for (const stop of e.pit!.stops) expect(stop.pitLaneLossMs).toBeLessThanOrEqual(timing.pitLaneLossMs);
        expect(energyModelFor(done.input.progression!)).toBe("V8C");
    }, 60_000);
});

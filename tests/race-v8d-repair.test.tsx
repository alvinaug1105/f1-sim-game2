/**
 * Race v8D focused repair: V8D-DRS-01 (legacy DRS inert in revision-4 2026 Races), V8D-TRAFFIC-01 (exact-minimum-gap
 * pinning) and V8D-WETGRID-01 (wet-grid starting tyre from current-condition economics). Fixed fixtures only.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/provider";
import { advanceRace, advanceRaceLap, createRace } from "../src/simulation/race/engine";
import { followingEffects, hasLegacyDrs, passProbability } from "../src/simulation/race/traffic/model";
import { circuitInteractionConfiguration, defaultInteractionConfiguration, developmentDriverInteraction, v8dCircuitInteractionConfiguration } from "../src/simulation/race/traffic/profiles";
import { defaultRacecraftConfiguration, EMPTY_HELD_LEDGER, progressionHeldRelease, v8dRacecraftConfiguration, validateRacecraftConfiguration } from "../src/simulation/race/traffic/racecraft";
import { aiWetStartingCompound, publicWeather, strategyPreference, v8dAiStrategyConfiguration } from "../src/simulation/race/pits/ai-strategy";
import { v8dWeatherTyreConfiguration } from "../src/simulation/race/tyres/profiles";
import { currentCompoundCostMs } from "../src/simulation/race/tyres/suitability";
import { aiStartingCompound } from "../src/features/race/weather-scenarios";
import { LAP_UNITS, localProgress } from "../src/simulation/race/progression/model";
import { projectRaceView } from "../src/features/race/projection";
import { timingRows } from "../src/features/race/viewer/model";
import { drsState } from "../src/features/race/viewer/race-view";
import { ConditionsStrip, RaceAlerts } from "../src/features/race/viewer/race-header";
import { TimingTower } from "../src/features/race/viewer/timing-tower";
import { DriverPanel } from "../src/features/race/viewer/driver-panel";
import { developmentWeather } from "../src/simulation/race/weather/model";
import { viewerData } from "./helpers/viewer";
import { quietRace } from "./helpers/incidents";
import { v8cInput } from "./helpers/v8c";
import { v8dInput, withoutHeldLoss } from "./helpers/v8d";
import type { RaceSimulationInput, RaceSimulationState } from "../src/simulation/race/types";
import type { RaceViewData } from "../src/features/race/public-view";

const PROFILE = { overtakingDifficulty: 60, dirtyAirSensitivityPermille: 1200, drsEffectivenessPermille: 900 };

describe("V8D-DRS-01: legacy DRS is inert in revision-4 Races", () => {
    it("revision 3 keeps the accepted DRS-bearing interaction; revision 4 keeps traffic identity with DRS zeroed", () => {
        const historical = circuitInteractionConfiguration(PROFILE), v8d = v8dCircuitInteractionConfiguration(PROFILE);
        expect(historical).toMatchObject({ ...PROFILE, drsZoneCount: 2, drsMsPerZone: 80, maxDrsBenefitMs: 300 });
        expect(hasLegacyDrs(historical)).toBe(true);
        expect(hasLegacyDrs(defaultInteractionConfiguration())).toBe(true);
        expect(v8d).toEqual({ ...historical, drsZoneCount: 0, drsEffectivenessPermille: 0, drsMsPerZone: 0, maxDrsBenefitMs: 0 });
        expect(hasLegacyDrs(v8d)).toBe(false);
        expect(v8d.overtakingDifficulty).toBe(60); expect(v8d.dirtyAirSensitivityPermille).toBe(1200);
        expect(hasLegacyDrs(v8dInput().interaction!)).toBe(false);
        expect(hasLegacyDrs(v8cInput().interaction!)).toBe(true); // revision-3 fixture interaction untouched
    });
    it("inside the historical 1 s threshold: no eligibility, no benefit, no pass bonus — even with a wider threshold", () => {
        const v8d = v8dCircuitInteractionConfiguration(PROFILE);
        for (const c of [v8d, { ...v8d, drsThresholdMs: 5000, drsActivationLap: 1 }]) {
            for (const gap of [0, 80, 500, 999]) {
                const f = followingEffects(gap, 20, c);
                expect(f.drsEligible).toBe(false); expect(f.drsBenefitMs).toBe(0);
                expect(f.dirtyAirMs).toBe(followingEffects(gap, 20, circuitInteractionConfiguration(PROFILE)).dirtyAirMs);
            }
            // Even a (historical) true flag can add nothing: the bonus is scaled by the zeroed effectiveness.
            const a = developmentDriverInteraction(), d = developmentDriverInteraction();
            expect(passProbability(250, a, d, 0, true, c)).toBe(passProbability(250, a, d, 0, false, c));
        }
        const h = circuitInteractionConfiguration(PROFILE);
        expect(followingEffects(500, 20, h).drsEligible).toBe(true); // the historical helper itself is unchanged
    });
    it("a revision-4 Race never records DRS eligibility, benefit or a DRS pass cause; Aero / Overtake / Boost still run", () => {
        const i = v8dInput({ count: 10, laps: 12, quiet: true, seed: 9 });
        let s = createRace(i), used = 0, qualified = 0, straight = 0;
        while (s.status === "RUNNING") {
            s = advanceRaceLap(s);
            for (const e of s.entrants) { expect(e.track!.drsEligible).toBe(false); expect(e.track!.drsBenefitMs).toBe(0); }
            for (const c of Object.values(s.progression!.cars)) { used += c.assistance!.used; if (c.assistance!.qualifiedLap !== null) qualified++; if (c.assistance!.aero === "STRAIGHT") straight++; }
        }
        expect(s.incidents!.events.filter(x => x.type === "OVERTAKE").every(x => x.cause !== "DRS")).toBe(true);
        expect(used).toBeGreaterThan(0); expect(qualified).toBeGreaterThan(0); expect(straight + qualified).toBeGreaterThan(0);
        // No double chasing-car benefit: the DRS-bearing historical snapshot produces the identical Race in the v8
        // engine (legacy DRS was already zoned out there) — the revision-4 snapshot only makes that a guarantee.
        const historical = advanceRace(createRace({ ...i, interaction: circuitInteractionConfiguration(null) }), 12);
        expect(historical.entrants).toEqual(s.entrants); expect(historical.progression).toEqual(s.progression);
    }, 60_000);
});

const html = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider initialLocale="en">{node}</I18nProvider>);
/** A public view whose cars all carry (stale / historical) DRS flags and a wet DRS weather state. */
function flagged(s: RaceSimulationState): RaceViewData {
    const loud: RaceSimulationState = { ...s, weather: s.weather && { ...s.weather, drsState: "DRS_DISABLED_WET" }, entrants: s.entrants.map(e => ({ ...e, track: { ...e.track!, drsEligible: true } })) };
    return projectRaceView({ ...viewerData(s.entrants.length), state: loud });
}
function viewerMarkup(d: RaceViewData) {
    const rows = timingRows(d), row = rows[1];
    return [
        html(<TimingTower state={d.state!} rows={rows} selected={row.id} onSelect={() => {}} interval={false} onInterval={() => {}}/>),
        html(<DriverPanel data={d} row={row} busy={false} send={() => {}} rows={rows}/>),
        html(<ConditionsStrip data={d}/>),
        html(<RaceAlerts data={d} rows={rows}/>),
    ].join("\n");
}

describe("V8D-DRS-01: the viewer never presents legacy DRS for a revision-4 Race", () => {
    it("drsState is UNAVAILABLE; Timing Tower, Driver Panel, conditions strip and alerts show no DRS", () => {
        const s = advanceRace(createRace(v8dInput({ count: 4, laps: 8, quiet: true })), 3), d = flagged(s);
        expect(d.state!.input.modelRevision).toBe(4);
        expect(drsState(d.state!)).toBe("UNAVAILABLE");
        expect(viewerMarkup(d)).not.toMatch(/DRS/);
    });
    it("historical viewers stay compatible: revision 3 renders (no DRS, as accepted); a pre-v8 Race still shows its DRS", () => {
        const r3 = flagged(advanceRace(createRace(v8cInput({ count: 4, laps: 8, quiet: true })), 3));
        expect(drsState(r3.state!)).toBe("UNAVAILABLE");
        expect(() => viewerMarkup(r3)).not.toThrow();
        const legacy = flagged(advanceRace(quietRace(4), 3));
        expect(legacy.state!.input.modelRevision).toBeUndefined();
        expect(drsState(legacy.state!)).toBe("WET");
        expect(viewerMarkup(legacy)).toMatch(/DRS/);
    });
});

/** Two cars, a close start, both player-managed (no stops): the car behind has `edge` more car performance. */
function battle(edge: number, o: { minimumPaceAdvantageMs?: number; overtakingDifficulty?: number; input?: RaceSimulationInput } = {}): RaceSimulationInput {
    const b = o.input ?? v8dInput({ count: 2, players: 2, laps: 20, quiet: true, seed: 3 });
    return { ...b, parameters: { ...b.parameters, gridOffsetMs: 100 },
        interaction: { ...b.interaction!, ...(o.minimumPaceAdvantageMs !== undefined ? { minimumPaceAdvantageMs: o.minimumPaceAdvantageMs } : {}), ...(o.overtakingDifficulty !== undefined ? { overtakingDifficulty: o.overtakingDifficulty } : {}) },
        entrants: b.entrants.map((e, n) => n === 1 ? { ...e, car: { ...e.car, performance: Math.min(100, e.car.performance + edge) } } : e) };
}
/** Per checkpoint: the physical distance (microlaps) from the trailing car to the leader, and whether it attempted. */
function trace(i: RaceSimulationInput, laps = 19) {
    let s = createRace(i); const out: { units: number; behind: boolean; attempted: boolean }[] = [];
    const [lead, chase] = i.entrants.map(x => x.entrantId);
    for (let n = 0; n < laps; n++) {
        s = advanceRaceLap(s);
        const a = s.entrants.find(e => e.entrantId === lead)!, b = s.entrants.find(e => e.entrantId === chase)!;
        out.push({ units: (localProgress(a.track!.progressMicrolaps) - localProgress(b.track!.progressMicrolaps) + LAP_UNITS) % LAP_UNITS, behind: b.position > a.position, attempted: s.progression!.cars[chase].attemptedLap === s.lap });
    }
    return out;
}
const floorUnits = (i: RaceSimulationInput) => Math.max(1, Math.round(i.interaction!.minimumGapMs * LAP_UNITS / i.circuit.baseLapTimeMs));
/** "On the floor" at a checkpoint: within 2 % of it (the leader is cut exactly at its lap line, so it can read a hair under). */
const onFloor = (units: number, floor: number) => Math.abs(units - floor) <= Math.ceil(floor / 50);

describe("V8D-TRAFFIC-01: a held car no longer rides the exact minimum gap", () => {
    it("ledger helper: owes the configured share, gives it up in floor-sized drop-backs, capped, never negative, inert without config", () => {
        const r = v8dRacecraftConfiguration();
        expect(progressionHeldRelease(defaultRacecraftConfiguration(), EMPTY_HELD_LEDGER, 5000, 900, 2800, 1100)).toEqual({ extraUnits: 0, ledger: EMPTY_HELD_LEDGER });
        expect(progressionHeldRelease(undefined, EMPTY_HELD_LEDGER, 5000, 900, 2800, 1100).extraUnits).toBe(0);
        const owing = progressionHeldRelease(r, EMPTY_HELD_LEDGER, 1000, 900, 2800, 1100); // owes 500 < floor 900
        expect(owing).toEqual({ extraUnits: 0, ledger: { owedMilli: 500_000, spentUnits: 0 } });
        const due = progressionHeldRelease(r, owing.ledger, 1000, 900, 2800, 1100); // owes 1000 ≥ 900
        expect(due).toEqual({ extraUnits: 1000, ledger: { owedMilli: 0, spentUnits: 1000 } });
        expect(progressionHeldRelease(r, owing.ledger, 1000, 900, 2800, 300).extraUnits).toBe(300); // never more than this slice's movement
        expect(progressionHeldRelease(r, { owedMilli: 0, spentUnits: 2800 }, 9000, 900, 2800, 1100).extraUnits).toBe(0); // checkpoint cap spent
        expect(progressionHeldRelease(r, { owedMilli: 0, spentUnits: 2500 }, 1000, 900, 2800, 1100).extraUnits).toBe(300); // remainder of the cap
        expect(r).toMatchObject({ progressionHeldFollowingLossPermille: 500, progressionHeldFollowingLossMaxMs: 250, lateRaceStartPermille: 750, lateRaceAttackThresholdPermille: 1300, lateRaceMinimumPaceAdvantagePermille: 800 });
        expect(() => validateRacecraftConfiguration({ ...r, progressionHeldFollowingLossMaxMs: undefined })).toThrow();
        expect(() => validateRacecraftConfiguration({ ...r, progressionHeldFollowingLossPermille: 1001 })).toThrow();
        expect(defaultRacecraftConfiguration()).not.toHaveProperty("progressionHeldFollowingLossPermille");
    });
    it("Case A: a genuinely faster car held without an attack drops off the floor; the clamp-only rule pinned it every lap", () => {
        // A circuit whose minimum attack edge this car never reaches: it can only follow.
        const i = battle(25, { minimumPaceAdvantageMs: 2000 }), floor = floorUnits(i);
        const repaired = trace(i), pinned = trace(withoutHeldLoss(i));
        expect(pinned.every(x => x.behind && !x.attempted && onFloor(x.units, floor))).toBe(true); // the defect, reproduced
        expect(repaired.every(x => x.behind && !x.attempted && x.units >= floor - Math.ceil(floor / 50))).toBe(true); // never overlaps, never invents an attack
        expect(repaired.filter(x => x.units > floor + floor / 4).length).toBeGreaterThanOrEqual(8);
        expect(trace(i)).toEqual(repaired); // deterministic
    }, 60_000);
    it("Case A (attacks available): the faster car attacks; it passes or a failed attack separates — never a scripted pass", () => {
        const i = battle(25), floor = floorUnits(i), t = trace(i);
        expect(t.some(x => x.attempted)).toBe(true);
        expect(t.some(x => !x.behind) || t.some(x => x.units > floor)).toBe(true);
    }, 60_000);
    it("Case B: no genuine pace edge — no held loss, no attempt invented; identical to the clamp-only rule", () => {
        const i = battle(0);
        const a = advanceRace(createRace(i), 20), b = advanceRace(createRace(withoutHeldLoss(i)), 20);
        expect(a.entrants).toEqual(b.entrants); expect(a.progression).toEqual(b.progression); expect(a.rngState).toBe(b.rngState);
    }, 60_000);
    it("Case C: a revision-3 Race (accepted racecraft) keeps the clamp-only behaviour exactly", () => {
        const base = v8cInput({ count: 2, players: 2, laps: 20, quiet: true, seed: 3 });
        const r3 = battle(25, { minimumPaceAdvantageMs: 2000, input: { ...base, commands: { ...base.commands!, racecraft: defaultRacecraftConfiguration() } } });
        expect(r3.progression!.version).toBe(3);
        expect(trace(r3).every(x => onFloor(x.units, floorUnits(r3)))).toBe(true);
    }, 60_000);
    it("Case D: circuit difficulty still matters — pass odds stay harder at a hard circuit; the held loss ignores difficulty", () => {
        const hard = v8dCircuitInteractionConfiguration({ ...PROFILE, overtakingDifficulty: 85 }), easy = v8dCircuitInteractionConfiguration({ ...PROFILE, overtakingDifficulty: 15 });
        const a = developmentDriverInteraction(), d = developmentDriverInteraction();
        for (const edge of [150, 300, 600]) expect(passProbability(edge, a, d, 0, false, hard)).toBeLessThan(passProbability(edge, a, d, 0, false, easy));
        // With no attack possible, the drop-back is the same at any circuit: it never becomes a pass mechanism.
        expect(trace(battle(25, { minimumPaceAdvantageMs: 2000, overtakingDifficulty: 85 }))).toEqual(trace(battle(25, { minimumPaceAdvantageMs: 2000, overtakingDifficulty: 15 })));
    }, 60_000);
});

describe("V8D-WETGRID-01: revision-4 wet grid start from current-condition economics", () => {
    const strategy = v8dAiStrategyConfiguration(), tyres = v8dWeatherTyreConfiguration(), weather = developmentWeather(71, 58), pub = publicWeather(weather);
    const field = Array.from({ length: 22 }, (_, n) => strategyPreference(71, n + 1));
    const grid = (trackWater: number) => ({ ...weather.initial, trackWater, rainfallIntensity: 1000 });
    const starts = (water: number) => field.map(p => aiWetStartingCompound(aiStartingCompound(grid(water)), grid(water), tyres, pub, strategy, p));
    const cost = (c: "INTERMEDIATE" | "WET", water: number) => currentCompoundCostMs(c, grid(water), tyres, pub);
    it("clearly intermediate-favoured water: every car starts on the intermediate, even where the old threshold said WET", () => {
        for (const water of [400, 450, 500, 550]) {
            expect(aiStartingCompound(grid(water))).toBe("WET"); // the historical threshold pick
            expect(cost("WET", water) - cost("INTERMEDIATE", water)).toBeGreaterThan(strategy.wetCompoundToleranceMs!);
            expect(new Set(starts(water))).toEqual(new Set(["INTERMEDIATE"]));
        }
    });
    it("borderline water splits by stable character; clearly wet-favoured water converges on the full wet", () => {
        expect(Math.abs(cost("WET", 700) - cost("INTERMEDIATE", 700))).toBeLessThanOrEqual(strategy.wetCompoundToleranceMs!);
        expect(new Set(starts(700))).toEqual(new Set(["INTERMEDIATE", "WET"]));
        expect(starts(700)).toEqual(starts(700)); // same seed + grid → same result
        expect(new Set(starts(1000))).toEqual(new Set(["WET"]));
    });
    it("dry grids and non-wet proposals are untouched; the revision-3 threshold helper is unchanged", () => {
        for (const water of [0, 50]) { expect(aiStartingCompound(grid(water))).not.toBe("WET"); }
        expect(aiStartingCompound({ ...grid(0), rainfallIntensity: 0 })).toBe("MEDIUM");
        for (const p of field) expect(aiWetStartingCompound("MEDIUM", grid(450), tyres, pub, strategy, p)).toBe("MEDIUM");
        expect(aiStartingCompound(grid(350))).toBe("WET"); expect(aiStartingCompound(grid(100))).toBe("INTERMEDIATE");
    });
});

import { describe, expect, it } from "vitest";
import { developmentContent } from "../src/data/seed/content-development";
import type { ContentDataset } from "../src/game/domain/content-dataset";
import { enterNextEvent, getSessionSequence, isPractice, progressSummary, transitionSession, weekendFormatOf, type CareerProgress } from "../src/game/domain/progression";
import { qualifyingFormat, qualifyingWeatherTicks, SPRINT_PHASE_DURATION_MS, PHASE_DURATION_MS, INTERMISSION_MS } from "../src/simulation/qualifying/model";
import { raceWeatherSeed, scenarioWeather } from "../src/features/race/weather-scenarios";
import { simulateQualifyingSession, startQualifyingSession, advanceQualifyingSession } from "../src/features/qualifying/service";
import { finalClassification } from "../src/simulation/qualifying/classification";
import { sprintLapCount, scheduledLaps } from "../src/features/race/development-profiles";
import { advanceCareerRace, autoManagePlayerCars, simulateCareerRace, simulateCareerRaceRemainder, startIncidentCareerRace, changeCareerPitRequest } from "../src/features/race/service";
import { advanceRace, raceResult } from "../src/simulation/race/engine";
import { validateIncidentState } from "../src/simulation/race/incidents/model";
import type { RaceSimulationState } from "../src/simulation/race/types";
import { careerGrid, raceRepository } from "./helpers/grid";
import { MemoryQualifyingRepository, sequentialIds } from "./helpers/qualifying";
import { constantWeather } from "./helpers/weather";
import { forceMechanical, neutralise } from "./helpers/incidents";
import { pitAndRetireNextLap, stintProblems } from "./helpers/race-dynamics";

const SPRINT_EVENTS = ["Chinese Grand Prix", "British Grand Prix", "Singapore Grand Prix"];
/** In-memory progress: complete round 1 with the domain transitions, then enter round 2 (a Sprint weekend). */
function throughRound(progress: CareerProgress, rounds: number) {
    let p = progress;
    for (let r = 0; r < rounds; r++) {
        p = enterNextEvent(p, progressSummary(p).next!.id, sequentialIds(900 + r * 20));
        const event = progressSummary(p).active!;
        for (const s of [...event.weekend!.sessions].sort((a, b) => a.order - b.order))
            p = isPractice(s.type) ? transitionSession(p, event.id, s.id, "simulatePractice") : transitionSession(transitionSession(p, event.id, s.id, "start"), event.id, s.id, "completeDevelopment");
    }
    return enterNextEvent(p, progressSummary(p).next!.id, sequentialIds(990));
}
async function sprintWeekend(teamKey = "team-aurora") {
    const g = await careerGrid(teamKey);
    let progress = throughRound(g.progress, 1);
    const event = progressSummary(progress).active!, sessions = [...event.weekend!.sessions].sort((a, b) => a.order - b.order);
    progress = transitionSession(progress, event.id, sessions[0].id, "simulatePractice");
    const circuit = g.world.circuits.find(c => c.id === event.careerCircuitId)!;
    const sq = new MemoryQualifyingRepository(progress, g.roster, [], [], { sourceCircuitId: circuit.sourceCircuitId, lengthMeters: circuit.lengthMeters });
    sq.kind = "SPRINT_QUALIFYING";
    return { g, event, sessions, sq, circuit };
}
const without = (row: Record<string, unknown>, key: string) => { const copy = { ...row }; delete copy[key]; return copy; };

describe("weekend format — data-driven, snapshotted", () => {
    it("the development calendar marks exactly China, Great Britain and Singapore as Sprint weekends", () => {
        const sprint = developmentContent.events.filter(e => e.weekendFormat === "SPRINT").map(e => e.name).sort();
        expect(sprint).toEqual([...SPRINT_EVENTS].sort());
        expect(developmentContent.events.filter(e => e.weekendFormat === "STANDARD")).toHaveLength(5);
    });
    it("a new Career snapshots every event's format; legacy content and old Career rows fall back to STANDARD", async () => {
        const g = await careerGrid("team-mclaren");
        for (const e of g.world.events) {
            const source = developmentContent.events.find(s => s.id === e.sourceCalendarEventId)!;
            expect(e.weekendFormat).toBe(source.weekendFormat);
        }
        const legacy = structuredClone(developmentContent) as unknown as ContentDataset;
        const old = await careerGrid("team-mclaren", { ...legacy, events: legacy.events.map(e => without(e as unknown as Record<string, unknown>, "weekendFormat")) } as unknown as ContentDataset);
        expect(old.world.events.every(e => e.weekendFormat === "STANDARD")).toBe(true);
        expect(weekendFormatOf({ weekendFormat: null })).toBe("STANDARD");
        expect(weekendFormatOf({})).toBe("STANDARD");
    });
});

describe("session lifecycle", () => {
    it("STANDARD: P1 → P2 → P3 → Q → Race; SPRINT: P1 → SQ → Sprint → Q → Race (exact, no duplicates)", () => {
        expect(getSessionSequence("STANDARD")).toEqual(["PRACTICE_1", "PRACTICE_2", "PRACTICE_3", "QUALIFYING", "RACE"]);
        expect(getSessionSequence("SPRINT")).toEqual(["PRACTICE_1", "SPRINT_QUALIFYING", "SPRINT", "QUALIFYING", "RACE"]);
        for (const f of ["STANDARD", "SPRINT"] as const) expect(new Set(getSessionSequence(f)).size).toBe(5);
    });
    it("entering round 1 (Australia) creates a Standard weekend; round 2 (China) a Sprint weekend with exactly one Practice", async () => {
        const g = await careerGrid("team-mclaren");
        const first = enterNextEvent(g.progress, progressSummary(g.progress).next!.id, sequentialIds());
        expect(progressSummary(first).active!.weekend!.sessions.map(s => s.type)).toEqual(getSessionSequence("STANDARD"));
        const second = progressSummary(throughRound(g.progress, 1)).active!;
        expect(second.name).toBe("Chinese Grand Prix");
        expect(second.weekend!.sessions.map(s => [s.order, s.type, s.status])).toEqual([[1, "PRACTICE_1", "AVAILABLE"], [2, "SPRINT_QUALIFYING", "LOCKED"], [3, "SPRINT", "LOCKED"], [4, "QUALIFYING", "LOCKED"], [5, "RACE", "LOCKED"]]);
    });
    it("Sprint weekend progression unlocks exactly one next session at a time and completes after the Race", async () => {
        const g = await careerGrid("team-mclaren");
        let p = throughRound(g.progress, 1);
        const event = progressSummary(p).active!, ordered = [...event.weekend!.sessions].sort((a, b) => a.order - b.order);
        const statuses = () => progressSummary(p).active?.weekend!.sessions.map(s => s.status) ?? p.events.find(e => e.id === event.id)!.weekend!.sessions.map(s => s.status);
        p = transitionSession(p, event.id, ordered[0].id, "simulatePractice");
        expect(statuses()).toEqual(["COMPLETED", "AVAILABLE", "LOCKED", "LOCKED", "LOCKED"]);
        for (const [i, expected] of [[1, ["COMPLETED", "COMPLETED", "AVAILABLE", "LOCKED", "LOCKED"]], [2, ["COMPLETED", "COMPLETED", "COMPLETED", "AVAILABLE", "LOCKED"]], [3, ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "AVAILABLE"]]] as const) {
            p = transitionSession(transitionSession(p, event.id, ordered[i].id, "start"), event.id, ordered[i].id, "completeDevelopment");
            expect(statuses()).toEqual(expected);
        }
        p = transitionSession(transitionSession(p, event.id, ordered[4].id, "start"), event.id, ordered[4].id, "completeDevelopment");
        expect(p.events.find(e => e.id === event.id)!.weekend!.status).toBe("COMPLETED");
        // Sprint Qualifying / Sprint can never be skipped (only Practice can).
        expect(() => transitionSession(throughRound(g.progress, 1), event.id, ordered[1].id, "skipPractice")).toThrow();
    });
});

describe("Sprint Qualifying — the shared Qualifying core, configured", () => {
    it("format: 22 → 16 → 10, 20 → 15 → 10, 4 → 4 → 4; SQ1/SQ2/SQ3 = 12/10/8 min with 7-min breaks (GP Q unchanged)", () => {
        for (const [n, sizes] of [[22, [22, 16, 10]], [20, [20, 15, 10]], [4, [4, 4, 4]]] as const) {
            const f = qualifyingFormat(n, "SPRINT_QUALIFYING");
            expect(f.phases.map(p => p.eligible)).toEqual(sizes);
            expect(f.phases.map(p => p.durationMs)).toEqual([12, 10, 8].map(m => m * 60_000));
            expect(f.intermissionMs).toBe(7 * 60_000);
            expect(qualifyingFormat(n).phases.map(p => p.durationMs)).toEqual([18, 15, 13].map(m => m * 60_000));
        }
        expect(SPRINT_PHASE_DURATION_MS).toEqual({ Q1: 720_000, Q2: 600_000, Q3: 480_000 });
        expect(PHASE_DURATION_MS).toEqual({ Q1: 1_080_000, Q2: 900_000, Q3: 780_000 });
        expect(INTERMISSION_MS).toBe(420_000);
    });
    it("runs SQ1 → SQ2 → SQ3 on the real engine to a complete 22-car Sprint grid, completing the SQ session", async () => {
        const w = await sprintWeekend();
        const d = await simulateQualifyingSession(w.sq, w.g.career.id, w.event.id);
        const s = d.state!;
        expect(d.kind).toBe("SPRINT_QUALIFYING");
        expect(s.status).toBe("FINISHED");
        expect(s.input.format.phases.map(p => p.durationMs)).toEqual([720_000, 600_000, 480_000]);
        const order = finalClassification(s);
        expect(order.map(i => s.entrants[i].finalPosition)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
        // P1–P10 from SQ3, P11–P16 from SQ2 eliminations, P17–P22 from SQ1 eliminations.
        expect(order.slice(0, 10).every(i => s.entrants[i].eliminatedIn === null)).toBe(true);
        expect(order.slice(10, 16).every(i => s.entrants[i].eliminatedIn === "Q2")).toBe(true);
        expect(order.slice(16).every(i => s.entrants[i].eliminatedIn === "Q1")).toBe(true);
        const statuses = w.sq.progress.events.find(e => e.id === w.event.id)!.weekend!.sessions.map(x => [x.type, x.status]);
        expect(statuses).toEqual([["PRACTICE_1", "COMPLETED"], ["SPRINT_QUALIFYING", "COMPLETED"], ["SPRINT", "AVAILABLE"], ["QUALIFYING", "LOCKED"], ["RACE", "LOCKED"]]);
    });
    it("manual SQ pauses at the frozen classification between phases (no auto-continue) and replays deterministically", async () => {
        const w = await sprintWeekend();
        let d = await startQualifyingSession(w.sq, w.g.career.id, w.event.id);
        while (d.state!.phaseStatus !== "COMPLETE") d = await advanceQualifyingSession(w.sq, w.g.career.id, w.event.id, d.state!.sessionElapsedMs);
        expect(d.state!.phase).toBe("Q1");
        expect(d.state!.phaseElapsedMs).toBeGreaterThanOrEqual(720_000);
        await expect(advanceQualifyingSession(w.sq, w.g.career.id, w.event.id, d.state!.sessionElapsedMs)).rejects.toMatchObject({ code: "PHASE_COMPLETE" });
        // Same saved Sprint Qualifying → same result (the engine and seed are deterministic).
        const fresh = await sprintWeekend(), copy = fresh.sq.clone();
        const x = await simulateQualifyingSession(fresh.sq, fresh.g.career.id, fresh.event.id), y = await simulateQualifyingSession(copy, fresh.g.career.id, fresh.event.id);
        // Entrant storage IDs are fresh per start; everything that matters is identical.
        const outcome = (d: typeof x) => d.state!.input.entrants.map((e, i) => [e.driverId, d.state!.entrants[i].finalPosition, d.state!.entrants[i].best]);
        expect(outcome(y)).toEqual(outcome(x));
        expect(y.state!.rngState).toBe(x.state!.rngState);
    });
    it("Sprint Qualifying and Grand Prix Qualifying of the same weekend are independent sessions (seed, weather, classification)", async () => {
        const w = await sprintWeekend();
        const sq = await simulateQualifyingSession(w.sq, w.g.career.id, w.event.id);
        // Grand Prix Qualifying on the same weekend (sessions before it completed via development transitions).
        let p = w.sq.progress;
        const sprint = p.events.find(e => e.id === w.event.id)!.weekend!.sessions.find(s => s.type === "SPRINT")!;
        p = transitionSession(transitionSession(p, w.event.id, sprint.id, "start"), w.event.id, sprint.id, "completeDevelopment");
        const q = new MemoryQualifyingRepository(p, w.g.roster, [], [], w.sq.circuit);
        const gp = await simulateQualifyingSession(q, w.g.career.id, w.event.id);
        expect(gp.kind).toBe("QUALIFYING");
        expect(gp.sessionId).not.toBe(sq.sessionId);
        expect(gp.state!.input.seed).not.toBe(sq.state!.input.seed);
        // Each session freezes weather from its own identity (a dry story may still look alike).
        const ticks = (st: typeof gp.state) => qualifyingWeatherTicks(st!.input.format, st!.input.weatherTickMs), key = w.circuit.sourceCircuitId!;
        expect(sq.state!.input.weather).toEqual(scenarioWeather(raceWeatherSeed([w.g.career.id, w.event.id, key, "SPRINT_QUALIFYING"]), ticks(sq.state)));
        expect(gp.state!.input.weather).toEqual(scenarioWeather(raceWeatherSeed([w.g.career.id, w.event.id, key, "QUALIFYING"]), ticks(gp.state)));
        expect(gp.state!.input.format.phases.map(f => f.durationMs)).toEqual([1_080_000, 900_000, 780_000]);
        expect(gp.state!.entrants.every(e => e.best.Q1 !== undefined)).toBe(true);
        const orderOf = (s: typeof gp.state) => finalClassification(s!).map(i => s!.input.entrants[i].driverId);
        expect(orderOf(gp.state)).not.toEqual(orderOf(sq.state));
    });
});

describe("Sprint distance", () => {
    it("every development circuit: the least complete laps whose distance EXCEEDS 100 km (from Career circuit length)", async () => {
        const g = await careerGrid("team-mclaren");
        for (const c of g.world.circuits) {
            const laps = sprintLapCount(c.lengthMeters);
            expect(laps * c.lengthMeters, c.key).toBeGreaterThan(100_000);
            expect((laps - 1) * c.lengthMeters, c.key).toBeLessThanOrEqual(100_000);
            expect(scheduledLaps({ kind: "SPRINT", circuit: { lengthMeters: c.lengthMeters, defaultLapCount: c.defaultLapCount } })).toBe(laps);
            expect(scheduledLaps({ kind: "RACE", circuit: { lengthMeters: c.lengthMeters, defaultLapCount: c.defaultLapCount } })).toBe(c.defaultLapCount);
        }
        expect(sprintLapCount(5000)).toBe(21); // exactly 100 km is not "exceeding"
        for (const bad of [0, -5, Number.NaN, 1.5]) expect(() => sprintLapCount(bad)).toThrow(RangeError);
    });
});

describe("the Sprint on Race v7", () => {
    async function sprintData(teamKey = "team-aurora", grid: readonly string[] | null = null) {
        const g = await careerGrid(teamKey);
        return { g, sprint: raceRepository(g, grid, { kind: "SPRINT", eventIndex: 1 }), race: raceRepository(g, null, { kind: "RACE", eventIndex: 1 }) };
    }
    it("same v7 engine and circuit profile; Sprint distance, Sprint-sized fuel, own weather; grid = Sprint Qualifying order", async () => {
        const g = await careerGrid("team-aurora"), order = [...g.roster].reverse().map(r => r.driverId);
        const sprint = raceRepository(g, order, { kind: "SPRINT", eventIndex: 1 }), race = raceRepository(g, null, { kind: "RACE", eventIndex: 1 });
        await startIncidentCareerRace(sprint.repository, g.career.id, sprint.eventId, {}, 9);
        await startIncidentCareerRace(race.repository, g.career.id, race.eventId, {}, 9);
        const s = sprint.get().state!, r = race.get().state!, circuit = g.world.circuits.find(c => c.id === g.progress.events[1].careerCircuitId)!;
        expect(s.simulationVersion).toBe(7);
        expect(s.input.totalLaps).toBe(sprintLapCount(circuit.lengthMeters));
        expect(r.input.totalLaps).toBe(circuit.defaultLapCount);
        expect(s.input.initialFuelKg).toBeLessThan(r.input.initialFuelKg * 0.5);
        expect(s.input.interaction).toEqual(r.input.interaction);
        expect(s.input.pits).toEqual(r.input.pits);
        for (const e of s.input.entrants) expect(e.gridPosition).toBe(order.indexOf(e.driverId) + 1);
    });
    it("Sprint and Grand Prix Career weather are seeded apart (same Career, event and circuit)", async () => {
        const { careerRaceWeather } = await import("../src/features/race/weather-scenarios");
        const gp = careerRaceWeather("c", "e", "k", 19), sp = careerRaceWeather("c", "e", "k", 19, "SPRINT");
        expect(sp).not.toEqual(gp);
        expect(careerRaceWeather("c", "e", "k", 19, "RACE")).toEqual(gp); // Grand Prix identity unchanged
    });
    it("Simulate Sprint: both player cars auto-managed by the same legal AI, real result, session completed", async () => {
        const { sprint, g } = await sprintData();
        await simulateCareerRace(sprint.repository, g.career.id, sprint.eventId);
        const d = sprint.get(), s = d.state!;
        expect(s.status).toBe("FINISHED");
        expect(s.input.entrants.every(e => e.strategyController === "DEVELOPMENT_AI")).toBe(true);
        const result = raceResult(s);
        expect(result.map(r => r.position)).toEqual(result.map((_, i) => i + 1));
        expect(d.progress.events[1].weekend!.sessions[0]).toMatchObject({ type: "SPRINT", status: "COMPLETED" });
        validateIncidentState(s);
    });
    it("Simulate Remainder from mid-Sprint equals the offline replay from the exact saved state; earlier player commands stand", async () => {
        const { sprint, g } = await sprintData();
        await startIncidentCareerRace(sprint.repository, g.career.id, sprint.eventId, {}, 21);
        await advanceCareerRace(sprint.repository, g.career.id, sprint.eventId, 0, 5);
        const mine = sprint.get().state!.input.entrants.find(e => e.teamId === g.playerTeamId)!;
        const e = sprint.get().state!.entrants.find(x => x.entrantId === mine.entrantId)!;
        await changeCareerPitRequest(sprint.repository, g.career.id, sprint.eventId, mine.entrantId, 5, e.pit!.commandRevision, "SOFT");
        const saved: RaceSimulationState = structuredClone(sprint.get().state!);
        await simulateCareerRaceRemainder(sprint.repository, g.career.id, sprint.eventId, 5);
        const done = sprint.get().state!;
        expect(done).toEqual(advanceRace(autoManagePlayerCars(saved), saved.input.totalLaps));
        expect(done.entrants.find(x => x.entrantId === mine.entrantId)!.pit!.stops[0]).toMatchObject({ lap: 6, newCompound: "SOFT" });
        await expect(simulateCareerRaceRemainder(sprint.repository, g.career.id, sprint.eventId, done.lap)).rejects.toMatchObject({ code: "INVALID_ACTION" });
    });
    it("dry Sprint: short distance — most cars finish without stopping (no stop is forced or forbidden)", async () => {
        const { sprint, g } = await sprintData();
        await startIncidentCareerRace(sprint.repository, g.career.id, sprint.eventId, {}, 5);
        const dry = constantWeather(0), s0 = sprint.get().state!;
        const s = advanceRace(autoManagePlayerCars({ ...s0, weather: structuredClone(dry.initial), input: { ...s0.input, weather: dry } }), 1000);
        const stopped = s.entrants.filter(e => e.pit!.stops.length > 0).length;
        expect(stopped).toBeLessThan(s.entrants.length / 2);
    });
    it("mixed Sprint: current-condition crossover still brings cars in for wet-weather tyres", async () => {
        const { sprint, g } = await sprintData();
        await startIncidentCareerRace(sprint.repository, g.career.id, sprint.eventId, {}, 42); // explicit seed → development (mixed) weather
        const s = advanceRace(autoManagePlayerCars(sprint.get().state!), 1000);
        const wet = s.entrants.filter(e => e.pit!.stops.some(x => x.newCompound === "INTERMEDIATE" || x.newCompound === "WET")).length;
        expect(wet).toBeGreaterThan(s.entrants.length / 2);
    });
    it("SC / VSC / incidents / retirement in a Sprint keep a valid classification and history", async () => {
        const { sprint, g } = await sprintData();
        await startIncidentCareerRace(sprint.repository, g.career.id, sprint.eventId, {}, 3);
        for (const mode of ["SAFETY_CAR", "VSC"] as const) {
            const s = advanceRace(neutralise(advanceRace(sprint.get().state!, 3), mode, 2), 1000);
            validateIncidentState(s);
            expect(raceResult(s).map(r => r.position)).toEqual(s.entrants.map((_, i) => i + 1));
        }
        const retired = advanceRace(forceMechanical(sprint.get().state!, true), 1000);
        expect(retired.entrants.some(e => e.incident!.status === "RETIRED")).toBe(true);
        for (const e of retired.entrants) expect(stintProblems(e.pit!.stints, e.pit!.stops)).toEqual([]);
    });
    it("A1 in a Sprint: pit + same-lap retirement never creates a zero-length stint", async () => {
        const { sprint, g } = await sprintData();
        await startIncidentCareerRace(sprint.repository, g.career.id, sprint.eventId, {}, 11);
        const s0 = advanceRace(sprint.get().state!, 4), index = s0.input.entrants.findIndex(e => e.strategyController === "PLAYER");
        const s = advanceRace(pitAndRetireNextLap(s0, index), 1000);
        const e = s.entrants.find(x => x.entrantId === s0.input.entrants[index].entrantId)!;
        expect(e.incident!.status).toBe("RETIRED");
        expect(stintProblems(e.pit!.stints, e.pit!.stops)).toEqual([]);
        expect(e.pit!.stints.at(-1)).toMatchObject({ startLap: 5, endLap: null });
    });
    it("a Sprint retirement does not remove the driver from the rest of the weekend (entrants come from the Career roster)", async () => {
        const { sprint, race, g } = await sprintData();
        await startIncidentCareerRace(sprint.repository, g.career.id, sprint.eventId, {}, 3);
        const s = advanceRace(forceMechanical(sprint.get().state!, true), 1000);
        const out = s.entrants.filter(e => e.incident!.status === "RETIRED").map(e => s.input.entrants.find(x => x.entrantId === e.entrantId)!.driverId);
        expect(out.length).toBeGreaterThan(0);
        await startIncidentCareerRace(race.repository, g.career.id, race.eventId, {}, 3);
        const gpDrivers = race.get().state!.input.entrants.map(e => e.driverId);
        for (const id of out) expect(gpDrivers).toContain(id);
    });
});

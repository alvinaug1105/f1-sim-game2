import { describe, expect, it, vi, afterEach } from "vitest";
import {
    callIn, changeSetup, createPractice, enableAutoPlayer, runPracticeToEnd, sendOut, stepPractice, advancePractice, weatherTicks, PracticeRuleError,
} from "../src/simulation/practice/engine";
import { autoGarageDecision } from "../src/simulation/practice/policy";
import {
    NEUTRAL_SETUP, PRACTICE_DURATION_MS, PRACTICE_STEP_MS, PRACTICE_WEATHER_TICK_MS, SETUP_DIMENSIONS, SETUP_WORK_MS, confidenceAfterRun, maxRunLaps,
    type PracticeInput, type PracticeState, type Setup,
} from "../src/simulation/practice/model";
import { createSeededRandom } from "../src/simulation/core/random";
import { weatherTyreConfiguration } from "../src/simulation/race/tyres/profiles";
import { scenarioFor, scenarioWeather, raceWeatherSeed } from "../src/features/race/weather-scenarios";
import {
    advancePracticeSession, practiceCommand, simulatePracticeRemainder, simulatePracticeSession, simulateRemainingPractice, startPracticeSession,
} from "../src/features/practice/service";
import { practiceView } from "../src/features/practice/view-model";
import { assessPracticeCheckpoint, initialPracticeAttention, practiceAdapter } from "../src/features/practice/playback";
import { PlaybackController } from "../src/features/race/viewer/playback";
import { BROWSER_SESSION_INTENTS, runScaffoldingAction } from "../src/features/career/progression";
import { practiceWorld, sessionOf } from "./helpers/practice";
afterEach(() => vi.useRealTimers());
const IDEAL: Setup = { AERO: 62, MECHANICAL: 41, RIDE: 55, BRAKE: 47, TYRE: 36 };
function practiceInput(seed = 7, scenario?: Parameters<typeof scenarioWeather>[2], ideal: Setup = IDEAL): PracticeInput {
    const ticks = weatherTicks({ durationMs: PRACTICE_DURATION_MS.PRACTICE_1, weatherTickMs: PRACTICE_WEATHER_TICK_MS });
    return {
        version: 1, sessionType: "PRACTICE_1", seed, durationMs: PRACTICE_DURATION_MS.PRACTICE_1, stepMs: PRACTICE_STEP_MS, weatherTickMs: PRACTICE_WEATHER_TICK_MS,
        baseLapTimeMs: 90_000, tyres: weatherTyreConfiguration(), weather: scenarioWeather(seed, ticks, scenario ?? "DRY"),
        entrants: Array.from({ length: 6 }, (_, i) => ({
            entrantId: `e${i}`, driverId: `d${i}`, teamId: i < 2 ? "player" : `t${i}`, controller: i < 2 ? "PLAYER" as const : "AI" as const,
            driver: { pace: 90 - i, consistency: 88 }, car: { performance: 92 - i }, ideal: i === 0 ? ideal : { ...IDEAL, AERO: 30 + i * 5 },
        })),
    };
}
const plan = { compound: "MEDIUM" as const, targetLaps: 4, pace: "BALANCED" as const };
const rev = (s: PracticeState, i = 0) => s.entrants[i].commandRevision;
/** Steps until entrant `i` is back in the garage (bounded). */
function untilGarage(s: PracticeState, i = 0) { for (let n = 0; n < 200 && s.entrants[i].location !== "GARAGE"; n++) s = stepPractice(s); return s; }
function keys(value: unknown, into = new Set<string>()): Set<string> {
    if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); keys(v, into); }
    return into;
}
describe("practice engine", () => {
    it("advances the session clock by exactly one step and replays deterministically", () => {
        const a = createPractice(practiceInput()), b = createPractice(practiceInput());
        expect(stepPractice(a).elapsedMs).toBe(PRACTICE_STEP_MS);
        expect(advancePractice(a, 50)).toEqual(advancePractice(b, 50));
        const end = runPracticeToEnd(a);
        expect(end.status).toBe("FINISHED");
        expect(end.elapsedMs).toBeGreaterThanOrEqual(end.input.durationMs);
        expect(end.entrants.every(e => e.location === "GARAGE" && e.run === null)).toBe(true);
        expect(runPracticeToEnd(b)).toEqual(end);
        expect(stepPractice(end)).toBe(end);
    });
    it("runs out lap → timed laps → in lap → garage, timing only flying laps", () => {
        let s = sendOut(createPractice(practiceInput()), "e0", 0, plan);
        expect(s.entrants[0].location).toBe("OUT_LAP");
        const seen = new Set<string>();
        for (let n = 0; n < 200 && s.entrants[0].location !== "GARAGE"; n++) { s = stepPractice(s); seen.add(s.entrants[0].location); }
        const e = s.entrants[0];
        expect([...seen]).toEqual(expect.arrayContaining(["FLYING", "IN_LAP", "GARAGE"]));
        expect(e.timedLaps).toBe(4);
        expect(e.lapsCompleted).toBe(6); // out lap + 4 timed + in lap
        expect(e.runs).toHaveLength(1);
        expect(e.runs[0]).toMatchObject({ number: 1, plan, timedLaps: 4, bestLapMs: e.bestLapMs });
        expect(e.readyAtMs).toBeGreaterThan(e.runs[0].endedAtMs!);
    });
    it("validates commands: revision, garage-only, readiness and plans that must fit the remaining time", () => {
        const s = createPractice(practiceInput());
        expect(() => sendOut(s, "e0", 5, plan)).toThrow(expect.objectContaining({ code: "STALE" }));
        expect(() => sendOut(s, "e0", 0, { ...plan, targetLaps: 0 })).toThrow(expect.objectContaining({ code: "PLAN_INVALID" }));
        expect(() => sendOut(s, "e2", 0, plan)).toThrow(expect.objectContaining({ code: "NOT_READY" })); // AI starts later
        const late = { ...s, elapsedMs: s.input.durationMs - 4 * 60_000 };
        expect(maxRunLaps(late)).toBeLessThan(plan.targetLaps);
        expect(() => sendOut(late, "e0", 0, plan)).toThrow(expect.objectContaining({ code: "PLAN_TOO_LONG" }));
        const out = sendOut(s, "e0", 0, plan);
        expect(() => sendOut(out, "e0", 1, plan)).toThrow(expect.objectContaining({ code: "NOT_IN_GARAGE" }));
        expect(() => changeSetup(out, "e0", 1, { ...NEUTRAL_SETUP, AERO: 70 })).toThrow(expect.objectContaining({ code: "NOT_IN_GARAGE" }));
        expect(() => callIn(s, "e0", 0)).toThrow(PracticeRuleError);
    });
    it("call in finishes the current lap, then completes an in lap", () => {
        let s = sendOut(createPractice(practiceInput()), "e0", 0, { ...plan, targetLaps: 10 });
        s = stepPractice(stepPractice(stepPractice(stepPractice(s))));
        s = callIn(s, "e0", rev(s));
        const timed = s.entrants[0].timedLaps;
        s = untilGarage(s);
        expect(s.entrants[0].timedLaps - timed).toBeLessThanOrEqual(1);
        expect(s.entrants[0].runs[0].callIn).toBe(true);
    });
    it("setup changes are garage work: they delay readiness, cost confidence and make feedback stale", () => {
        let s = untilGarage(sendOut(createPractice(practiceInput()), "e0", 0, plan));
        const before = s.entrants[0].preparation;
        expect(before.feedback).not.toBeNull();
        expect(before.feedbackRevision).toBe(before.setupRevision);
        s = changeSetup(s, "e0", rev(s), { ...before.setup, AERO: before.setup.AERO + 10 });
        const after = s.entrants[0];
        expect(after.readyAtMs).toBeGreaterThanOrEqual(s.elapsedMs + SETUP_WORK_MS);
        expect(after.preparation.confidence).toBeLessThan(before.confidence);
        expect(after.preparation.feedbackRevision).not.toBe(after.preparation.setupRevision);
        expect(() => sendOut(s, "e0", rev(s), plan)).toThrow(expect.objectContaining({ code: "NOT_READY" }));
    });
    it("driver feedback points towards the hidden ideal and is qualitative only", () => {
        const far: Setup = Object.fromEntries(SETUP_DIMENSIONS.map(d => [d, Math.min(100, IDEAL[d] + 35)])) as Setup;
        let s = createPractice(practiceInput());
        s = changeSetup(s, "e0", 0, far);
        s = { ...s, entrants: s.entrants.map((e, i) => i === 0 ? { ...e, readyAtMs: 0 } : e) };
        s = untilGarage(sendOut(s, "e0", rev(s), { ...plan, targetLaps: 8 }));
        const f = s.entrants[0].preparation.feedback!;
        expect(SETUP_DIMENSIONS.filter(d => f[d] > 0).length).toBeGreaterThanOrEqual(4);
        for (const d of SETUP_DIMENSIONS) expect([-2, -1, 0, 1, 2]).toContain(f[d]);
    });
    it("acclimatisation and tyre knowledge grow with representative running and carry forward", () => {
        let s = untilGarage(sendOut(createPractice(practiceInput()), "e0", 0, { ...plan, targetLaps: 6 }));
        const p = s.entrants[0].preparation;
        expect(p.acclimatisation).toBeGreaterThan(0);
        expect(p.representativeLaps).toBe(6);
        expect(p.tyreKnowledge.MEDIUM).toBeGreaterThan(p.tyreKnowledge.SOFT);
        // A later session created with this preparation starts from it.
        s = createPractice(practiceInput(), { e0: p });
        expect(s.entrants[0].preparation).toEqual(p);
    });
    it("unsuited tyres teach less than suited ones", () => {
        const dry = untilGarage(sendOut(createPractice(practiceInput()), "e0", 0, { ...plan, compound: "WET" }));
        const med = untilGarage(sendOut(createPractice(practiceInput()), "e0", 0, plan));
        expect(dry.entrants[0].preparation.tyreKnowledge.WET).toBeLessThan(med.entrants[0].preparation.tyreKnowledge.MEDIUM);
    });
    it("setup confidence is distinct from distance to the optimum", () => {
        const near = untilGarage(sendOut(createPractice(practiceInput(7, "DRY", NEUTRAL_SETUP)), "e0", 0, plan));
        const far = untilGarage(sendOut(createPractice(practiceInput(7, "DRY", { AERO: 95, MECHANICAL: 5, RIDE: 95, BRAKE: 5, TYRE: 95 })), "e0", 0, plan));
        expect(far.entrants[0].bestLapMs!).toBeGreaterThan(near.entrants[0].bestLapMs!);
        expect(far.entrants[0].preparation.confidence).toBe(near.entrants[0].preparation.confidence);
        expect(confidenceAfterRun(300, 4, 200)).toBeGreaterThan(300);
    });
    it("the auto manager never reads the hidden ideal (AI and auto-simulated player cars)", () => {
        const s = runPracticeToEnd(createPractice(practiceInput()));
        const other = { ...s, elapsedMs: 600_000, input: { ...s.input, entrants: s.input.entrants.map(e => ({ ...e, ideal: NEUTRAL_SETUP })) } };
        const same = { ...s, elapsedMs: 600_000 };
        for (let i = 0; i < s.entrants.length; i++) expect(autoGarageDecision(other, i, createSeededRandom(3))).toEqual(autoGarageDecision(same, i, createSeededRandom(3)));
    });
    it("AI teams run programmes but do not find a perfect setup", () => {
        const s = runPracticeToEnd(createPractice(practiceInput()));
        const ai = s.entrants.slice(2);
        expect(ai.every(e => e.runs.length >= 2 && e.timedLaps > 5)).toBe(true);
        expect(ai.some(e => SETUP_DIMENSIONS.some(d => e.preparation.setup[d] !== s.input.entrants[s.entrants.indexOf(e)].ideal[d]))).toBe(true);
        // Player cars stay in the garage unless commanded or auto-simulated.
        expect(s.entrants[0].runs).toHaveLength(0);
        expect(runPracticeToEnd(enableAutoPlayer(createPractice(practiceInput()))).entrants[0].runs.length).toBeGreaterThan(1);
    });
    it("weather varies deterministically between sessions; the timeline is frozen in the input", () => {
        const wet = runPracticeToEnd(createPractice(practiceInput(11, "WET")));
        expect(wet.input.weather.timeline.some(seg => seg.rainfall > 0)).toBe(true);
        // The same auto manager reads the current conditions and switches to wet-weather tyres.
        expect(wet.entrants.slice(2).some(e => e.runs.some(r => r.plan.compound === "INTERMEDIATE" || r.plan.compound === "WET"))).toBe(true);
        expect(runPracticeToEnd(createPractice(practiceInput(11, "WET")))).toEqual(wet);
        const scenarios = new Set(Array.from({ length: 40 }, (_, i) => scenarioFor(raceWeatherSeed(["career", "event", "circuit", `PRACTICE_${i}`]))));
        expect(scenarios.size).toBeGreaterThan(2);
    });
    it("Simulate Remainder continues from the exact saved state with the same mechanics", () => {
        let s = sendOut(createPractice(practiceInput()), "e0", 0, plan);
        s = advancePractice(s, 30);
        const a = runPracticeToEnd(enableAutoPlayer(s)), b = runPracticeToEnd(enableAutoPlayer(structuredClone(s)));
        expect(a).toEqual(b);
        expect(a.entrants[0].runs[0].plan).toEqual(plan);
        expect(a.entrants[0].runs[0].startedAtMs).toBe(0);
        expect(a.status).toBe("FINISHED");
    });
});
describe("practice service and weekend lifecycle", () => {
    it("P1 → P2 → P3 with manual running; completion happens exactly once", async () => {
        const w = await practiceWorld(), [p1, p2] = w.sessions;
        let data = await startPracticeSession(w.repo, w.careerId, w.eventId, p1.id);
        expect(sessionOf(w.repo, w.eventId, p1.id).status).toBe("IN_PROGRESS");
        const mine = data.state!.input.entrants.find(e => e.controller === "PLAYER")!;
        data = await practiceCommand(w.repo, w.careerId, w.eventId, p1.id, 0, { kind: "send", entrantId: mine.entrantId, revision: 0, plan });
        await expect(advancePracticeSession(w.repo, w.careerId, w.eventId, p1.id, 30_000)).rejects.toMatchObject({ code: "STALE" });
        const ai = data.state!.input.entrants.find(e => e.controller === "AI")!;
        await expect(practiceCommand(w.repo, w.careerId, w.eventId, p1.id, 0, { kind: "callIn", entrantId: ai.entrantId, revision: 0 })).rejects.toMatchObject({ code: "INVALID_ACTION" });
        while (data.state!.status !== "FINISHED") data = await advancePracticeSession(w.repo, w.careerId, w.eventId, p1.id, data.state!.elapsedMs);
        expect(sessionOf(w.repo, w.eventId, p1.id).status).toBe("COMPLETED");
        expect(sessionOf(w.repo, w.eventId, p2.id).status).toBe("AVAILABLE");
        await expect(advancePracticeSession(w.repo, w.careerId, w.eventId, p1.id, data.state!.elapsedMs)).rejects.toMatchObject({ code: "INVALID_ACTION" });
        // Learning from P1 carries into P2.
        const learned = data.state!.entrants.find(e => e.entrantId === mine.entrantId)!.preparation;
        const next = await startPracticeSession(w.repo, w.careerId, w.eventId, p2.id);
        const carried = next.state!.entrants[next.state!.input.entrants.findIndex(e => e.driverId === mine.driverId)].preparation;
        expect(carried).toEqual(learned);
        expect(learned.representativeLaps).toBeGreaterThan(0);
    });
    it("Simulate Session and Simulate All Remaining Practice complete sessions deterministically", async () => {
        const w = await practiceWorld(), copy = w.repo.clone();
        const a = await simulatePracticeSession(w.repo, w.careerId, w.eventId, w.sessions[0].id);
        expect(a.state!.status).toBe("FINISHED");
        expect(a.state!.autoPlayer).toBe(true);
        expect(sessionOf(w.repo, w.eventId, w.sessions[0].id).status).toBe("COMPLETED");
        const n = await simulateRemainingPractice(w.repo, async () => w.repo.progress, w.careerId, w.eventId);
        expect(n).toBe(2);
        expect(w.sessions.slice(0, 3).map(s => sessionOf(w.repo, w.eventId, s.id).status)).toEqual(["COMPLETED", "COMPLETED", "COMPLETED"]);
        expect(sessionOf(w.repo, w.eventId, w.sessions[3].id).status).toBe("AVAILABLE"); // Qualifying ready, not run
        await expect(simulateRemainingPractice(w.repo, async () => w.repo.progress, w.careerId, w.eventId)).rejects.toMatchObject({ code: "INVALID_ACTION" });
        // Same Career + stable identity → same session (entrant ids are storage identity only).
        const b = await simulatePracticeSession(copy, w.careerId, w.eventId, w.sessions[0].id);
        const strip = (s: PracticeState) => s.entrants.map(e => ({ ...e, entrantId: "", preparation: e.preparation, runs: e.runs }));
        expect(strip(b.state!)).toEqual(strip(a.state!));
    });
    it("Simulate Remainder keeps earlier manual running and finishes the session", async () => {
        const w = await practiceWorld(), p1 = w.sessions[0];
        let data = await startPracticeSession(w.repo, w.careerId, w.eventId, p1.id);
        const mine = data.state!.input.entrants.find(e => e.controller === "PLAYER")!;
        data = await practiceCommand(w.repo, w.careerId, w.eventId, p1.id, 0, { kind: "send", entrantId: mine.entrantId, revision: 0, plan });
        for (let i = 0; i < 20; i++) data = await advancePracticeSession(w.repo, w.careerId, w.eventId, p1.id, data.state!.elapsedMs);
        await expect(simulatePracticeRemainder(w.repo, w.careerId, w.eventId, p1.id, 0)).rejects.toMatchObject({ code: "STALE" });
        const done = await simulatePracticeRemainder(w.repo, w.careerId, w.eventId, p1.id, data.state!.elapsedMs);
        const e = done.state!.entrants.find(x => x.entrantId === mine.entrantId)!;
        expect(e.runs[0].plan).toEqual(plan);
        expect(e.runs.length).toBeGreaterThan(1);
        expect(sessionOf(w.repo, w.eventId, p1.id).status).toBe("COMPLETED");
        await expect(practiceCommand(w.repo, w.careerId, w.eventId, p1.id, done.state!.elapsedMs, { kind: "callIn", entrantId: mine.entrantId, revision: 1 })).rejects.toMatchObject({ code: "INVALID_ACTION" });
    });
    it("a failed change commits nothing", async () => {
        const w = await practiceWorld(), p1 = w.sessions[0];
        const data = await startPracticeSession(w.repo, w.careerId, w.eventId, p1.id), writes = w.repo.writes;
        const mine = data.state!.input.entrants.find(e => e.controller === "PLAYER")!;
        await expect(practiceCommand(w.repo, w.careerId, w.eventId, p1.id, 0, { kind: "send", entrantId: mine.entrantId, revision: 0, plan: { ...plan, targetLaps: 99 } })).rejects.toMatchObject({ code: "PLAN_INVALID" });
        expect(w.repo.writes).toBe(writes);
        expect((await w.repo.getPractice(w.careerId, w.eventId, p1.id))!.state).toEqual(data.state);
    });
    it("no player path can bypass Practice: browser scaffolding rejects every Practice intent, including skip", async () => {
        const w = await practiceWorld();
        const progression = { getProgress: async () => w.repo.progress, transition: async (_: string, change: (p: typeof w.repo.progress) => typeof w.repo.progress) => change(w.repo.progress) };
        for (const intent of ["simulatePractice", "start", "skipPractice", "completeDevelopment"] as const)
            await expect(runScaffoldingAction(progression as never, w.careerId, w.eventId, w.sessions[0].id, intent)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
        expect(BROWSER_SESSION_INTENTS).not.toContain("skipPractice");
        expect(BROWSER_SESSION_INTENTS).not.toContain("simulatePractice");
        expect(sessionOf(w.repo, w.eventId, w.sessions[0].id).status).toBe("AVAILABLE");
        // The player's "don't manage it" path is Simulate Session: real running, real preparation, COMPLETED (not SKIPPED).
        const data = await simulatePracticeSession(w.repo, w.careerId, w.eventId, w.sessions[0].id);
        expect(sessionOf(w.repo, w.eventId, w.sessions[0].id).status).toBe("COMPLETED");
        for (const e of data.state!.entrants) expect(e.timedLaps).toBeGreaterThan(0);
        expect(data.preparations.every(p => p.preparation.representativeLaps > 0)).toBe(true);
    });
});
describe("practice information boundary", () => {
    it("the browser view never carries the hidden ideal, weather timeline, RNG or rival preparation", async () => {
        const w = await practiceWorld();
        const data = await simulatePracticeSession(w.repo, w.careerId, w.eventId, w.sessions[0].id);
        const view = practiceView(data), all = keys(view);
        for (const forbidden of ["ideal", "timeline", "rngState", "seed", "input", "weatherTick", "evolution", "entrantDrivers", "preparations"]) expect(all.has(forbidden)).toBe(false);
        const text = JSON.stringify(view);
        for (const p of data.preparations) expect(text).not.toContain(JSON.stringify(p.ideal));
        for (const e of view.entrants) expect(e.own !== null).toBe(e.teamId === w.playerTeamId);
        expect(view.entrants.filter(e => e.own)).toHaveLength(2);
        // The forecast is the public approximate windows only.
        for (const f of view.forecast) expect(Object.keys(f).sort()).toEqual(["fromMinute", "rainfallMax", "rainfallMin", "toMinute"]);
        const fresh = practiceView((await w.repo.getPractice(w.careerId, w.eventId, w.sessions[1].id))!);
        expect(fresh.status).toBe("NOT_STARTED");
        expect(fresh.entrants.every(e => e.own === null)).toBe(true);
    });
});
describe("practice playback", () => {
    it("attention: own car back in the garage, a water band change and the five-minute warning (once)", async () => {
        const w = await practiceWorld(), p1 = w.sessions[0];
        let data = await startPracticeSession(w.repo, w.careerId, w.eventId, p1.id);
        const mine = data.state!.input.entrants.find(e => e.controller === "PLAYER")!;
        data = await practiceCommand(w.repo, w.careerId, w.eventId, p1.id, 0, { kind: "send", entrantId: mine.entrantId, revision: 0, plan: { ...plan, targetLaps: 1 } });
        let memory = initialPracticeAttention(practiceView(data)), found: string[] = [];
        while (data.state!.status !== "FINISHED") {
            data = await advancePracticeSession(w.repo, w.careerId, w.eventId, p1.id, data.state!.elapsedMs);
            const r = assessPracticeCheckpoint(memory, practiceView(data)); memory = r.memory;
            found = [...found, ...r.items.map(i => `${i.reason}:${i.entrantId ?? ""}`)];
        }
        expect(found[0]).toBe(`GARAGE:${mine.entrantId}`);
        expect(found.filter(f => f.startsWith("CLOCK"))).toHaveLength(1);
        const v = practiceView(data);
        const wetter = { ...v, weather: { ...v.weather!, trackWater: 500 } };
        expect(assessPracticeCheckpoint(initialPracticeAttention(v), wetter).items.map(i => i.reason)).toContain("WEATHER");
    });
    it("Next Relevant Event advances committed steps one at a time and stops on the attention item", async () => {
        vi.useFakeTimers();
        const w = await practiceWorld(), p1 = w.sessions[0];
        let data = await startPracticeSession(w.repo, w.careerId, w.eventId, p1.id);
        const mine = data.state!.input.entrants.find(e => e.controller === "PLAYER")!;
        data = await practiceCommand(w.repo, w.careerId, w.eventId, p1.id, 0, { kind: "send", entrantId: mine.entrantId, revision: 0, plan: { ...plan, targetLaps: 1 } });
        const seen: number[] = [];
        const c = new PlaybackController(practiceView(data), practiceAdapter, async v => {
            seen.push(v.elapsedMs);
            return practiceView(await advancePracticeSession(w.repo, w.careerId, w.eventId, p1.id, v.elapsedMs));
        });
        c.skip();
        await vi.advanceTimersByTimeAsync(60_000);
        const snap = c.getSnapshot();
        expect(snap.reason).toBe("GARAGE");
        expect(snap.attention?.entrantId).toBe(mine.entrantId);
        expect(seen).toEqual(seen.map((_, i) => i * PRACTICE_STEP_MS));
        expect(c.getState().entrants.find(e => e.entrantId === mine.entrantId)!.location).toBe("GARAGE");
    });
});

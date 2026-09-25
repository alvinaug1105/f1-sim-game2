import { describe, expect, it } from "vitest";
import {
    advanceQualifyingSession, continueQualifyingPhase, qualifyingCommand, simulateQualifyingRemainder, simulateQualifyingSession, startQualifyingSession,
} from "../src/features/qualifying/service";
import { qualifyingView } from "../src/features/qualifying/view-model";
import { enableAutoPlayer, runQualifyingToEnd } from "../src/simulation/qualifying/engine";
import { finalClassification } from "../src/simulation/qualifying/classification";
import { initialPreparation, NEUTRAL_SETUP } from "../src/simulation/practice/model";
import { startIncidentCareerRace } from "../src/features/race/service";
import { simulatePracticeSession, startPracticeSession, practiceCommand } from "../src/features/practice/service";
import { transitionSession } from "../src/game/domain/progression";
import legacy from "./fixtures/development-content-before-real-names.json";
import type { ContentDataset } from "../src/game/domain/content-dataset";
import { MemoryPracticeRepository } from "./helpers/practice";
import { qualifyingWorld, sessionStatus } from "./helpers/qualifying";
import { raceRepository } from "./helpers/grid";
const plan = { compound: "SOFT" as const, pushLaps: 1 };
function keys(value: unknown, into = new Set<string>()): Set<string> {
    if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); keys(v, into); }
    return into;
}
describe("player ownership (any team): 2 player cars, 20 AI", () => {
    it.each(["team-aurora", "team-mclaren", "team-cadillac"])("%s", async key => {
        const w = await qualifyingWorld(key);
        const data = await startQualifyingSession(w.repo, w.careerId, w.eventId);
        const s = data.state!, mine = s.input.entrants.filter(e => e.controller === "PLAYER");
        expect(s.input.entrants).toHaveLength(22);
        expect(mine.map(e => e.teamId)).toEqual([w.playerTeamId, w.playerTeamId]);
        const ai = s.input.entrants.find(e => e.controller === "AI")!;
        await expect(qualifyingCommand(w.repo, w.careerId, w.eventId, 0, { kind: "send", entrantId: ai.entrantId, revision: 0, plan })).rejects.toMatchObject({ code: "INVALID_ACTION" });
        // Both player cars are independently controllable.
        let d = await qualifyingCommand(w.repo, w.careerId, w.eventId, 0, { kind: "send", entrantId: mine[0].entrantId, revision: 0, plan });
        d = await qualifyingCommand(w.repo, w.careerId, w.eventId, 0, { kind: "send", entrantId: mine[1].entrantId, revision: 0, plan: { ...plan, pushLaps: 2 } });
        const [a, b] = mine.map(m => d.state!.entrants.find(e => e.entrantId === m.entrantId)!);
        expect([a.location, b.location, a.run!.plan.pushLaps, b.run!.plan.pushLaps]).toEqual(["OUT_LAP", "OUT_LAP", 1, 2]);
        await expect(qualifyingCommand(w.repo, w.careerId, w.eventId, 0, { kind: "send", entrantId: mine[0].entrantId, revision: 0, plan })).rejects.toMatchObject({ code: "STALE" });
    });
});
describe("Practice carry-over", () => {
    it("manual and auto-managed Practice preparation both feed Qualifying; no preparation → neutral fallback", async () => {
        const w = await qualifyingWorld("team-mclaren", { practice: false });
        // Run real Practice through its own service on a Practice repository sharing the same Career progress.
        const practice = new MemoryPracticeRepository(w.repo.progress, w.g.roster);
        let p = await startPracticeSession(practice, w.careerId, w.eventId, w.sessions[0].id);
        const own = p.state!.input.entrants.find(e => e.controller === "PLAYER")!;
        p = await practiceCommand(practice, w.careerId, w.eventId, w.sessions[0].id, 0, { kind: "send", entrantId: own.entrantId, revision: 0, plan: { compound: "MEDIUM", targetLaps: 4, pace: "BALANCED" } });
        await simulatePracticeSession(practice, w.careerId, w.eventId, w.sessions[0].id);   // manual start, auto remainder
        await simulatePracticeSession(practice, w.careerId, w.eventId, w.sessions[1].id);   // fully auto-managed
        await simulatePracticeSession(practice, w.careerId, w.eventId, w.sessions[2].id);
        w.repo.progress = practice.progress;
        w.repo.preparations = practice.preparations.get(p.weekendId)!;
        w.repo.practiceOrder = [...practice.states.get(w.sessions[2].id)!.entrants].map((e, i) => ({ e, driverId: practice.states.get(w.sessions[2].id)!.input.entrants[i].driverId }))
            .sort((a, b) => (a.e.bestLapMs ?? Infinity) - (b.e.bestLapMs ?? Infinity)).map(x => x.driverId);
        const q = await startQualifyingSession(w.repo, w.careerId, w.eventId);
        for (const e of q.state!.input.entrants) {
            const record = w.repo.preparations.find(r => r.driverId === e.driverId)!;
            expect(e.preparation).toEqual({ setup: record.preparation.setup, ideal: record.ideal, confidence: record.preparation.confidence, acclimatisation: record.preparation.acclimatisation, tyreKnowledge: record.preparation.tyreKnowledge });
            expect(e.preparation.acclimatisation).toBeGreaterThan(0);
            expect(e.fallbackRank).toBe(w.repo.practiceOrder.indexOf(e.driverId) + 1);
        }
        // No Practice preparation (old Career / skipped Practice): neutral setup and zero learning.
        const bare = await qualifyingWorld("team-mclaren");
        const b = await startQualifyingSession(bare.repo, bare.careerId, bare.eventId);
        for (const e of b.state!.input.entrants) expect(e.preparation).toMatchObject({ setup: NEUTRAL_SETUP, confidence: 0, acclimatisation: initialPreparation().acclimatisation });
    });
});
describe("session lifecycle", () => {
    it("manual phases pause for Continue; duplicates and stale tokens are rejected; completion happens once", async () => {
        const w = await qualifyingWorld("team-aurora");
        let d = await startQualifyingSession(w.repo, w.careerId, w.eventId);
        expect(sessionStatus(w.repo, w.eventId, w.qualifyingId)).toBe("IN_PROGRESS");
        expect((await startQualifyingSession(w.repo, w.careerId, w.eventId)).state).toEqual(d.state); // idempotent resume
        await expect(advanceQualifyingSession(w.repo, w.careerId, w.eventId, 20_000)).rejects.toMatchObject({ code: "STALE" });
        while (!d.state!.phaseStatus.startsWith("COMPLETE")) d = await advanceQualifyingSession(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs);
        await expect(advanceQualifyingSession(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs)).rejects.toMatchObject({ code: "PHASE_COMPLETE" });
        const token = d.state!.sessionElapsedMs;
        d = await continueQualifyingPhase(w.repo, w.careerId, w.eventId, token, "Q1");
        expect(d.state!.phase).toBe("Q2");
        await expect(continueQualifyingPhase(w.repo, w.careerId, w.eventId, token, "Q1")).rejects.toMatchObject({ code: "STALE" });
        // A player car eliminated in Q1 is read-only; its teammate (if through) can still be sent out.
        const players = d.state!.input.entrants.map((e, i) => ({ e, s: d.state!.entrants[i] })).filter(x => x.e.controller === "PLAYER");
        for (const p of players) {
            const attempt = qualifyingCommand(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs, { kind: "send", entrantId: p.e.entrantId, revision: p.s.commandRevision, plan });
            if (p.s.eliminatedIn) await expect(attempt).rejects.toMatchObject({ code: "ELIMINATED" });
            else { d = await attempt; break; }
        }
        const done = await simulateQualifyingRemainder(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs);
        expect(done.state!.status).toBe("FINISHED");
        expect(sessionStatus(w.repo, w.eventId, w.qualifyingId)).toBe("COMPLETED");
        expect(sessionStatus(w.repo, w.eventId, w.sessions[4].id)).toBe("AVAILABLE");     // the Race unlocks
        await expect(simulateQualifyingRemainder(w.repo, w.careerId, w.eventId)).rejects.toMatchObject({ code: "INVALID_ACTION" });
        await expect(simulateQualifyingSession(w.repo, w.careerId, w.eventId)).rejects.toMatchObject({ code: "INVALID_ACTION" });
    });
    it("Simulate Remainder continues from the exact saved state, equal to an offline replay", async () => {
        const w = await qualifyingWorld("team-cadillac");
        let d = await startQualifyingSession(w.repo, w.careerId, w.eventId);
        const own = d.state!.input.entrants.find(e => e.controller === "PLAYER")!;
        d = await qualifyingCommand(w.repo, w.careerId, w.eventId, 0, { kind: "send", entrantId: own.entrantId, revision: 0, plan: { compound: "SOFT", pushLaps: 2 } });
        for (let i = 0; i < 20; i++) d = await advanceQualifyingSession(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs);
        const offline = runQualifyingToEnd(enableAutoPlayer(structuredClone(d.state!)));
        const done = await simulateQualifyingRemainder(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs);
        expect(done.state).toEqual(offline);
        expect(done.state!.entrants.find(e => e.entrantId === own.entrantId)!.best.Q1).not.toBeNull();
    });
    it("Simulate Qualifying before start runs the same engine and is reproducible for the same Career", async () => {
        const w = await qualifyingWorld("team-mclaren"), copy = w.repo.clone();
        const a = await simulateQualifyingSession(w.repo, w.careerId, w.eventId), b = await simulateQualifyingSession(copy, w.careerId, w.eventId);
        const summary = (s: typeof a.state) => finalClassification(s!).map(i => [s!.input.entrants[i].driverId, s!.entrants[i].best.Q1?.ms ?? null]);
        expect(summary(a.state)).toEqual(summary(b.state));
        expect(a.state!.entrants.filter(e => e.eliminatedIn === "Q1")).toHaveLength(6);
        expect(sessionStatus(w.repo, w.eventId, w.qualifyingId)).toBe("COMPLETED");
    });
});
describe("legacy Careers", () => {
    it("a 4-car legacy Career runs real Qualifying (all cars through Q1–Q3)", async () => {
        const w = await qualifyingWorld("team-aurora", { data: legacy as unknown as ContentDataset });
        const d = await simulateQualifyingSession(w.repo, w.careerId, w.eventId);
        expect(d.state!.input.entrants).toHaveLength(4);
        expect(d.state!.entrants.every(e => e.eliminatedIn === null && e.finalPosition !== null)).toBe(true);
    });
    it("an IN_PROGRESS placeholder without a simulation bootstraps deterministically (no deadlock, not completed)", async () => {
        const w = await qualifyingWorld("team-aurora");
        w.repo.progress = transitionSession(w.repo.progress, w.eventId, w.qualifyingId, "start");   // the old placeholder flow
        const copy = w.repo.clone();
        expect(qualifyingView((await w.repo.getQualifying(w.careerId, w.eventId))!)).toMatchObject({ status: "NOT_STARTED", legacyInProgress: true });
        const a = await startQualifyingSession(w.repo, w.careerId, w.eventId), b = await startQualifyingSession(copy, w.careerId, w.eventId);
        expect(a.state!.sessionElapsedMs).toBe(0);
        expect(a.state!.entrants.every(e => e.lapsCompleted === 0 && e.best.Q1 === null)).toBe(true);
        expect(sessionStatus(w.repo, w.eventId, w.qualifyingId)).toBe("IN_PROGRESS");
        const strip = (s: typeof a.state) => ({ ...s!, input: { ...s!.input, entrants: s!.input.entrants.map(e => ({ ...e, entrantId: "" })) }, entrants: s!.entrants.map(e => ({ ...e, entrantId: "" })) });
        expect(strip(a.state)).toEqual(strip(b.state));
        expect((await startQualifyingSession(w.repo, w.careerId, w.eventId)).state).toEqual(a.state);   // idempotent
        // The legacy remainder path also works directly.
        const c = await simulateQualifyingRemainder(copy, w.careerId, w.eventId);
        expect(c.state!.status).toBe("FINISHED");
    });
    it("a COMPLETED placeholder keeps its history: no results, no restart", async () => {
        const w = await qualifyingWorld("team-aurora");
        w.repo.progress = transitionSession(transitionSession(w.repo.progress, w.eventId, w.qualifyingId, "start"), w.eventId, w.qualifyingId, "completeDevelopment");
        expect(qualifyingView((await w.repo.getQualifying(w.careerId, w.eventId))!).status).toBe("LEGACY_COMPLETED");
        await expect(startQualifyingSession(w.repo, w.careerId, w.eventId)).rejects.toMatchObject({ code: "INVALID_ACTION" });
        await expect(simulateQualifyingSession(w.repo, w.careerId, w.eventId)).rejects.toMatchObject({ code: "INVALID_ACTION" });
        expect(sessionStatus(w.repo, w.eventId, w.sessions[4].id)).toBe("AVAILABLE");
    });
});
describe("view ordering", () => {
    it("lists every car exactly once in every phase state, eliminated cars below with their frozen positions", async () => {
        const w = await qualifyingWorld("team-mclaren");
        let d = await startQualifyingSession(w.repo, w.careerId, w.eventId);
        const check = () => {
            const v = qualifyingView(d), ids = v.entrants.map(e => e.entrantId);
            expect(new Set(ids).size).toBe(22);
            expect(v.entrants.map(e => e.position)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
            const firstOut = v.entrants.findIndex(e => e.eliminatedIn !== null);
            if (firstOut >= 0) expect(v.entrants.slice(firstOut).every(e => e.eliminatedIn !== null)).toBe(true);
        };
        for (const phase of ["Q1", "Q2"] as const) {
            check();
            while (d.state!.phaseStatus !== "COMPLETE") d = await advanceQualifyingSession(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs);
            check();                                                        // the just-completed phase's eliminations appear once
            d = await continueQualifyingPhase(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs, phase);
        }
        check();
        expect(qualifyingView(d).entrants.slice(10, 16).every(e => e.eliminatedIn === "Q2")).toBe(true);
        expect(qualifyingView(d).entrants.slice(16).every(e => e.eliminatedIn === "Q1")).toBe(true);
    });
});
describe("information boundary", () => {
    it("the browser view carries no seed, RNG, weather timeline, setup target, AI plans or unfinished-lap traffic", async () => {
        const w = await qualifyingWorld("team-mclaren");
        let d = await startQualifyingSession(w.repo, w.careerId, w.eventId);
        for (let i = 0; i < 25; i++) d = await advanceQualifyingSession(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs);
        const view = qualifyingView(d), all = keys(view);
        for (const k of ["seed", "rngState", "timeline", "ideal", "input", "releaseAtMs", "windowOffsetMs", "lapTrafficMs", "lastLapTrafficMs", "fallbackRank", "evolution"]) expect(all.has(k), k).toBe(false);
        for (const e of view.entrants) expect(e.own !== null).toBe(e.teamId === w.playerTeamId);
        expect(view.entrants.filter(e => e.own)).toHaveLength(2);
        for (const f of view.forecast) expect(Object.keys(f).sort()).toEqual(["fromMinute", "rainfallMax", "rainfallMin", "toMinute"]);
    });
});
describe("Qualifying → Race grid", () => {
    it("the finished classification becomes the Race starting grid, P1–P22 exactly", async () => {
        const w = await qualifyingWorld("team-williams");
        const d = await simulateQualifyingSession(w.repo, w.careerId, w.eventId), s = d.state!;
        const grid = finalClassification(s).map(i => s.input.entrants[i].driverId);
        const race = raceRepository(w.g, grid);
        await startIncidentCareerRace(race.repository, w.careerId, race.eventId, {});
        const r = race.get().state!;
        expect(r.simulationVersion).toBe(7);
        const gridOf = (driverId: string) => r.input.entrants.find(e => e.driverId === driverId)!.gridPosition;
        for (const [i, driverId] of grid.entries()) expect(gridOf(driverId)).toBe(i + 1);
        const pos = (i: number) => s.entrants[i].finalPosition!;
        s.entrants.forEach((e, i) => {
            const g = gridOf(s.input.entrants[i].driverId);
            expect(g).toBe(pos(i));
            if (e.eliminatedIn === "Q1") expect(g).toBeGreaterThanOrEqual(17);
            else if (e.eliminatedIn === "Q2") expect(g >= 11 && g <= 16).toBe(true);
            else expect(g).toBeLessThanOrEqual(10);
        });
        expect(r.entrants.find(e => e.position === 1)!.entrantId).toBe(r.input.entrants.find(e => e.gridPosition === 1)!.entrantId);
        // Labels still belong to the right drivers after reordering.
        for (const l of race.get().labels) expect(r.input.entrants.find(e => e.entrantId === l.entrantId)).toBeTruthy();
    });
    it("without a real Qualifying result the legacy roster-order grid applies", async () => {
        const w = await qualifyingWorld("team-williams"), race = raceRepository(w.g, null);
        await startIncidentCareerRace(race.repository, w.careerId, race.eventId, {});
        expect(race.get().state!.input.entrants.map(e => e.driverId)).toEqual(w.g.roster.map(r => r.driverId));
        expect(race.get().state!.input.entrants.map(e => e.gridPosition)).toEqual(w.g.roster.map((_, i) => i + 1));
    });
});

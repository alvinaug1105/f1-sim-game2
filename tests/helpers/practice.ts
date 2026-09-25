import { createCareer } from "../../src/features/career/create-career";
import { enterNextEvent, progressSummary, type CareerProgress } from "../../src/game/domain/progression";
import type { CareerPracticeData, CareerPracticeRepository, PracticeChange, PracticeRosterEntry, WeekendPreparationRecord } from "../../src/game/domain/practice-repository";
import { PracticeError } from "../../src/game/domain/practice-repository";
import type { PracticeSessionType, PracticeState } from "../../src/simulation/practice/model";
import { MemoryCareerRepository, input, runtime } from "./memory-career";
/**
 * Transactional in-memory Practice repository TEST DOUBLE: a change either commits state, weekend learning and
 * progression together or (when it throws) leaves everything untouched.
 */
export class MemoryPracticeRepository implements CareerPracticeRepository {
    states = new Map<string, PracticeState>();
    preparations = new Map<string, WeekendPreparationRecord[]>();
    writes = 0;
    constructor(public progress: CareerProgress, readonly roster: readonly PracticeRosterEntry[]) {}
    clone() {
        const copy = new MemoryPracticeRepository(structuredClone(this.progress), this.roster);
        copy.states = structuredClone(this.states); copy.preparations = structuredClone(this.preparations);
        return copy;
    }
    private data(eventId: string, sessionId: string): CareerPracticeData | null {
        const event = this.progress.events.find(e => e.id === eventId), weekend = event?.weekend, session = weekend?.sessions.find(s => s.id === sessionId);
        if (!event || !weekend || !session || !session.type.startsWith("PRACTICE")) return null;
        const state = this.states.get(sessionId) ?? null;
        return structuredClone({
            progress: this.progress, eventId, weekendId: weekend.id, sessionId, sessionType: session.type as PracticeSessionType, state, roster: this.roster,
            entrantDrivers: Object.fromEntries(state?.input.entrants.map(e => [e.entrantId, e.driverId]) ?? []),
            circuit: { sourceCircuitId: null, lengthMeters: 5000 }, preparations: this.preparations.get(weekend.id) ?? [],
        });
    }
    async getPractice(careerId: string, eventId: string, sessionId: string) { return careerId === this.progress.career.id ? this.data(eventId, sessionId) : null; }
    async changePractice(careerId: string, eventId: string, sessionId: string, change: (data: CareerPracticeData) => PracticeChange) {
        const before = careerId === this.progress.career.id ? this.data(eventId, sessionId) : null;
        if (!before) throw new PracticeError("NOT_FOUND");
        const result = change(before);
        this.states.set(sessionId, structuredClone(result.state));
        this.preparations.set(before.weekendId, result.state.input.entrants.map((e, i) => ({ driverId: e.driverId, ideal: e.ideal, preparation: structuredClone(result.state.entrants[i].preparation) })));
        this.progress = structuredClone(result.progress);
        this.writes++;
        return this.data(eventId, sessionId)!;
    }
}
/** A Career in its first weekend with a 10-car roster: the player's team (2 cars) and four AI teams. */
export async function practiceWorld() {
    const careers = new MemoryCareerRepository();
    const career = await createCareer(careers, input, runtime);
    const world = careers.worlds.get(career.id)!;
    let progress: CareerProgress = { career, events: world.events.map(e => ({ ...e, circuitName: "Circuit", weekend: null })) };
    progress = enterNextEvent(progress, progressSummary(progress).next!.id, () => crypto.randomUUID());
    const teams = [career.playerTeamId, ...Array.from({ length: 4 }, (_, i) => `ai-team-${i + 1}`)];
    const roster: PracticeRosterEntry[] = teams.flatMap((teamId, t) => [0, 1].map(d => ({
        driverId: `driver-${t + 1}-${d + 1}`, teamId, driverName: `Driver ${t + 1}.${d + 1}`, teamName: `Team ${t + 1}`, teamOrder: t + 1,
        abbreviation: `D${t + 1}${d + 1}`, teamColor: "#336699", carNumber: t * 2 + d + 1,
    })));
    const repo = new MemoryPracticeRepository(progress, roster);
    const event = progressSummary(progress).active!;
    const sessions = [...event.weekend!.sessions].sort((a, b) => a.order - b.order);
    return { repo, careerId: career.id, eventId: event.id, playerTeamId: career.playerTeamId, sessions };
}
export const sessionOf = (repo: MemoryPracticeRepository, eventId: string, sessionId: string) =>
    repo.progress.events.find(e => e.id === eventId)!.weekend!.sessions.find(s => s.id === sessionId)!;

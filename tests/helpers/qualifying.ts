import { enterNextEvent, progressSummary, transitionSession, type CareerProgress } from "../../src/game/domain/progression";
import { QualifyingError, type CareerQualifyingData, type CareerQualifyingRepository, type QualifyingChange, type QualifyingKind } from "../../src/game/domain/qualifying-repository";
import type { PracticeRosterEntry, WeekendPreparationRecord } from "../../src/game/domain/practice-repository";
import type { QualifyingState } from "../../src/simulation/qualifying/model";
import type { ContentDataset } from "../../src/game/domain/content-dataset";
import { careerGrid } from "./grid";
/** Transactional in-memory Qualifying repository TEST DOUBLE (a throwing change commits nothing). */
export class MemoryQualifyingRepository implements CareerQualifyingRepository {
    states = new Map<string, QualifyingState>();
    writes = 0;
    /** Session kind this instance serves (as the Prisma repository is constructed per kind). */
    kind: QualifyingKind = "QUALIFYING";
    constructor(public progress: CareerProgress, readonly roster: readonly PracticeRosterEntry[], public preparations: readonly WeekendPreparationRecord[] = [],
        public practiceOrder: readonly string[] = [], readonly circuit = { sourceCircuitId: null as string | null, lengthMeters: 5000 }) {}
    clone() {
        const copy = new MemoryQualifyingRepository(structuredClone(this.progress), this.roster, structuredClone(this.preparations), [...this.practiceOrder], this.circuit);
        copy.states = structuredClone(this.states);
        copy.kind = this.kind;
        return copy;
    }
    private data(eventId: string): CareerQualifyingData | null {
        const event = this.progress.events.find(e => e.id === eventId), weekend = event?.weekend, session = weekend?.sessions.find(s => s.type === this.kind);
        if (!event || !weekend || !session) return null;
        return structuredClone({ progress: this.progress, eventId, weekendId: weekend.id, kind: this.kind, sessionId: session.id, state: this.states.get(session.id) ?? null,
            roster: this.roster, circuit: this.circuit, preparations: this.preparations, practiceOrder: this.practiceOrder });
    }
    async getQualifying(careerId: string, eventId: string) { return careerId === this.progress.career.id ? this.data(eventId) : null; }
    async changeQualifying(careerId: string, eventId: string, change: (data: CareerQualifyingData) => QualifyingChange) {
        const before = careerId === this.progress.career.id ? this.data(eventId) : null;
        if (!before) throw new QualifyingError("NOT_FOUND");
        const result = change(before);
        this.states.set(before.sessionId, structuredClone(result.state));
        this.progress = structuredClone(result.progress);
        this.writes++;
        return this.data(eventId)!;
    }
}
/** Deterministic IDs for weekend/session rows (session seeds derive from stable identity). */
export function sequentialIds(start = 800) { let n = start; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; }
/**
 * A real Career snapshot (any team) at its first weekend with Practice done (development transitions), so
 * QUALIFYING is AVAILABLE. `practice: false` leaves the weekend at P1.
 */
export async function qualifyingWorld(teamKey = "team-aurora", options: { data?: ContentDataset; practice?: boolean } = {}) {
    const g = await careerGrid(teamKey, options.data);
    let progress = enterNextEvent(g.progress, progressSummary(g.progress).next!.id, sequentialIds());
    const event = progressSummary(progress).active!, sessions = [...event.weekend!.sessions].sort((a, b) => a.order - b.order);
    if (options.practice !== false) for (const s of sessions.slice(0, 3)) progress = transitionSession(progress, event.id, s.id, "simulatePractice");
    const repo = new MemoryQualifyingRepository(progress, g.roster);
    return { repo, g, careerId: g.career.id, eventId: event.id, sessions, qualifyingId: sessions[3].id, playerTeamId: g.playerTeamId };
}
export const sessionStatus = (repo: MemoryQualifyingRepository, eventId: string, sessionId: string) =>
    repo.progress.events.find(e => e.id === eventId)!.weekend!.sessions.find(s => s.id === sessionId)!.status;

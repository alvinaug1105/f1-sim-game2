import { createCareer } from "../../src/features/career/create-career";
import { developmentContent } from "../../src/data/seed/content-development";
import { rosterBalance, type CareerRaceData, type CareerRaceRepository } from "../../src/game/domain/race-repository";
import type { PracticeRosterEntry } from "../../src/game/domain/practice-repository";
import type { CareerProgress } from "../../src/game/domain/progression";
import type { ContentDataset } from "../../src/game/domain/content-dataset";
import { MemoryCareerRepository, input, runtime } from "./memory-career";
/**
 * A real Career snapshot (createCareer over the source content) with the Race/Practice roster derived from it the
 * same way the Prisma repositories do: race drivers ordered by team entry order, then source driver ID; balance
 * taken from the snapshotted season entries.
 */
export async function careerGrid(playerTeamKey: string, data: ContentDataset = developmentContent) {
    const careers = new MemoryCareerRepository();
    careers.data = structuredClone(data) as typeof careers.data;
    const playerTeamId = data.teams.find(t => t.key === playerTeamKey)!.id;
    const career = await createCareer(careers, { ...input, playerTeamId }, runtime);
    const world = careers.worlds.get(career.id)!;
    const teamEntry = (id: string) => world.teamEntries.find(e => e.id === id)!;
    const roster: PracticeRosterEntry[] = world.driverEntries
        .filter(e => e.role === "RACE_DRIVER")
        .map(e => ({ e, t: teamEntry(e.careerSeasonTeamEntryId), d: world.drivers.find(d => d.id === e.careerDriverId)! }))
        .sort((a, b) => a.t.entryOrder - b.t.entryOrder || String(a.d.sourceDriverId).localeCompare(String(b.d.sourceDriverId)))
        .map(({ e, t, d }) => {
            const team = world.teams.find(x => x.id === t.careerTeamId)!;
            return {
                driverId: d.id, teamId: team.id, driverName: `${d.firstName} ${d.lastName}`, teamName: team.name, teamOrder: t.entryOrder,
                abbreviation: d.abbreviation, teamColor: team.color, carNumber: e.carNumber, balance: rosterBalance({ ...e, teamEntry: t }),
            };
        });
    const progress: CareerProgress = {
        career,
        events: world.events.map(ev => ({ ...ev, circuitName: world.circuits.find(c => c.id === ev.careerCircuitId)!.name, weekend: null })),
    };
    return { career, world, roster, progress, playerTeamId: career.playerTeamId };
}
/** In-memory Race repository at an IN_PROGRESS Race session of the Career's first event (as the weekend would be). */
export function raceRepository(grid: Awaited<ReturnType<typeof careerGrid>>) {
    const event = grid.progress.events[0], circuit = grid.world.circuits.find(c => c.id === event.careerCircuitId)!;
    const weekend = { id: "weekend", careerId: grid.career.id, careerSeasonId: event.careerSeasonId, careerCalendarEventId: event.id, status: "ACTIVE" as const,
        sessions: [{ id: "race-session", careerId: grid.career.id, careerRaceWeekendId: "weekend", type: "RACE" as const, order: 5, status: "IN_PROGRESS" as const, startedAtCareerDate: null, completedAtCareerDate: null }] };
    let data: CareerRaceData = {
        progress: { ...grid.progress, events: grid.progress.events.map((e, i) => i === 0 ? { ...e, status: "CURRENT" as const, weekend } : e) },
        eventId: event.id, sessionId: "race-session", state: null, labels: [],
        roster: grid.roster.map(r => ({ ...r, carNumber: r.carNumber! })),
        circuit: { sourceCircuitId: circuit.sourceCircuitId, lengthMeters: circuit.lengthMeters, defaultLapCount: circuit.defaultLapCount },
    };
    const repository: CareerRaceRepository = {
        getRace: async () => structuredClone(data),
        changeRace: async (_c, _e, change) => {
            const result = change(structuredClone(data));
            const labels = result.labels.map(l => { const r = grid.roster.find(x => x.driverName === l.driverName)!; return { ...l, abbreviation: r.abbreviation, teamColor: r.teamColor, carNumber: r.carNumber }; });
            data = { ...data, ...result, labels };
        },
    };
    return { repository, get: () => data, eventId: event.id };
}

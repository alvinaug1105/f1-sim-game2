import type { PrismaClient } from "../generated/prisma/client";
import { assertContentId } from "../../game/domain/content-repository";
import { countGreenLaps, scoringRulesOf } from "../../game/domain/championship";
import type { ChampionshipRepository, ChampionshipSession, ChampionshipSource } from "../../game/domain/championship-repository";
import type { EntrantIncidentState, RaceEvent } from "../../simulation/race/incidents/model";
/** Safety Car / VSC periods from the structured Race control events (a start without an end ran to the flag). */
function neutralisedPeriods(events: readonly RaceEvent[] | undefined) {
  const periods: { startLap: number; endLap: number | null }[] = [];
  for (const e of [...(events ?? [])].sort((a, b) => a.sequence - b.sequence)) {
    if (e.type === "SAFETY_CAR_START" || e.type === "VSC_START") periods.push({ startLap: e.lap, endLap: null });
    else if ((e.type === "SAFETY_CAR_END" || e.type === "VSC_END") && periods.at(-1)?.endLap === null) periods.at(-1)!.endLap = e.lap;
  }
  return periods;
}
/**
 * Loads the current season's championship inputs in a fixed number of queries (no per-round or per-car reads). Only a
 * COMPLETED session whose simulation is FINISHED contributes a classification; hidden simulation state (seed, RNG,
 * weather timeline, reliability, strategy) is never selected.
 */
export class PrismaChampionshipRepository implements ChampionshipRepository {
  constructor(private readonly client: PrismaClient) {}
  async load(careerId: string): Promise<ChampionshipSource | null> {
    assertContentId(careerId);
    const career = await this.client.career.findUnique({
      where: { id: careerId },
      select: {
        id: true,
        playerTeamId: true,
        currentSeason: { select: { id: true, name: true, year: true, scoringRulesVersion: true } },
      },
    });
    if (!career) return null;
    const seasonId = career.currentSeason.id;
    const completed = { status: "COMPLETED" as const, weekend: { careerSeasonId: seasonId } };
    const eventOf = { session: { select: { weekend: { select: { careerCalendarEventId: true } } } } };
    const [events, races, qualifying, teamEntries, driverEntries, drivers, teams] = await Promise.all([
      this.client.careerCalendarEvent.findMany({
        where: { careerId, careerSeasonId: seasonId },
        select: {
          id: true, round: true, name: true, status: true, weekendFormat: true,
          circuit: { select: { name: true } },
          weekend: { select: { sessions: { select: { type: true, status: true }, orderBy: { order: "asc" } } } },
        },
        orderBy: [{ round: "asc" }, { startDate: "asc" }],
      }),
      this.client.careerRaceSimulation.findMany({
        where: { careerId, status: "FINISHED", sessionType: { in: ["RACE", "SPRINT"] }, session: completed },
        select: {
          sessionType: true, totalLaps: true, ...eventOf,
          entrants: {
            select: { id: true, careerDriverId: true, careerTeamId: true, position: true, gridPosition: true, completedLaps: true, elapsedTimeMs: true, stopCount: true },
            orderBy: { position: "asc" },
          },
          // Only the per-car status map (RUNNING/FINISHED/RETIRED) and the public Race control log (for green laps).
          incidentProfile: { select: { entrants: true, events: true } },
        },
      }),
      this.client.careerQualifyingSimulation.findMany({
        where: { careerId, status: "FINISHED", sessionType: "QUALIFYING", session: completed },
        select: {
          ...eventOf,
          entrants: { select: { careerDriverId: true, careerTeamId: true, finalPosition: true }, orderBy: { finalPosition: "asc" } },
        },
      }),
      this.client.careerSeasonTeamEntry.findMany({
        where: { careerId, careerSeasonId: seasonId },
        select: { id: true, careerTeamId: true, entryOrder: true },
        orderBy: [{ entryOrder: "asc" }, { id: "asc" }],
      }),
      this.client.careerSeasonDriverEntry.findMany({
        // Race drivers only; anyone else who is ever classified still enters the tables through their results.
        where: { careerId, careerSeasonId: seasonId, role: "RACE_DRIVER" },
        select: { careerDriverId: true, careerSeasonTeamEntryId: true, carNumber: true },
      }),
      this.client.careerDriver.findMany({ where: { careerId }, select: { id: true, firstName: true, lastName: true, abbreviation: true } }),
      this.client.careerTeam.findMany({ where: { careerId }, select: { id: true, name: true, shortName: true, color: true } }),
    ]);
    const sessions = new Map<string, { sprint?: ChampionshipSession; race?: ChampionshipSession }>();
    for (const sim of races) {
      const eventId = sim.session.weekend.careerCalendarEventId;
      const status = sim.incidentProfile?.entrants as unknown as Record<string, EntrantIncidentState> | undefined;
      const leaderLaps = Math.min(sim.entrants.find((e) => e.position === 1)?.completedLaps ?? 0, sim.totalLaps);
      const session: ChampionshipSession = {
        scheduledLaps: sim.totalLaps,
        leaderGreenLaps: countGreenLaps(leaderLaps, neutralisedPeriods(sim.incidentProfile?.events as unknown as RaceEvent[] | undefined)),
        entrants: sim.entrants.map((e) => ({
          driverId: e.careerDriverId,
          teamId: e.careerTeamId,
          position: e.position,
          gridPosition: e.gridPosition,
          completedLaps: e.completedLaps,
          elapsedTimeMs: e.elapsedTimeMs,
          retired: status?.[e.id]?.status === "RETIRED",
          stops: e.stopCount ?? null,
        })),
      };
      sessions.set(eventId, { ...sessions.get(eventId), [sim.sessionType === "SPRINT" ? "sprint" : "race"]: session });
    }
    const grids = new Map(qualifying.map((q) => [
      q.session.weekend.careerCalendarEventId,
      q.entrants.filter((e) => e.finalPosition !== null).map((e) => ({ driverId: e.careerDriverId, teamId: e.careerTeamId, position: e.finalPosition! })),
    ]));
    const teamOfEntry = new Map(teamEntries.map((t) => [t.id, t]));
    const roster = driverEntries
      .map((d) => ({ driverId: d.careerDriverId, teamId: teamOfEntry.get(d.careerSeasonTeamEntryId)!.careerTeamId, carNumber: d.carNumber, order: teamOfEntry.get(d.careerSeasonTeamEntryId)!.entryOrder }))
      .sort((a, b) => a.order - b.order || (a.carNumber ?? 0) - (b.carNumber ?? 0) || (a.driverId < b.driverId ? -1 : 1))
      .map(({ driverId, teamId, carNumber }) => ({ driverId, teamId, carNumber }));
    return {
      careerId: career.id,
      playerTeamId: career.playerTeamId,
      season: { ...career.currentSeason, scoringRulesVersion: scoringRulesOf(career.currentSeason.scoringRulesVersion) },
      events: events.map((e) => ({
        id: e.id,
        round: e.round,
        name: e.name,
        circuitName: e.circuit.name,
        format: e.weekendFormat === "SPRINT" ? "SPRINT" : "STANDARD",
        status: e.status,
        sessions: e.weekend?.sessions ?? [],
        sprint: sessions.get(e.id)?.sprint ?? null,
        race: sessions.get(e.id)?.race ?? null,
        qualifying: grids.get(e.id) ?? null,
      })),
      roster,
      teams: teamEntries.map((t) => t.careerTeamId),
      driverLabels: Object.fromEntries(drivers.map(({ id, ...label }) => [id, label])),
      teamLabels: Object.fromEntries(teams.map(({ id, ...label }) => [id, label])),
    };
  }
}

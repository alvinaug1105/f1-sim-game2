import type { CareerOverview } from "../../game/domain/career";
import type { SessionType } from "../../game/domain/progression";
import type { ChampionshipSource } from "../../game/domain/championship-repository";
import { championshipSummary } from "../championship/model";
import { playerFinishes, type EventBrief, type PlayerFinish } from "./command-centre";
/**
 * Race Weekend Hub extras (UIX-A): presentation-only facts for one event, projected from existing read models — the
 * circuit (when the Career overview carries it), the player's classified results of this event's completed Grand Prix
 * Qualifying, Sprint and Grand Prix, and the player's drivers. Everything is optional: the hub renders from the
 * progression calendar alone when any of it is missing.
 */
export interface WeekendHubExtras {
  readonly circuit: EventBrief["circuit"];
  readonly results: Partial<Record<SessionType, readonly PlayerFinish[]>>;
  readonly drivers: readonly { readonly id: string; readonly name: string; readonly abbreviation: string; readonly carNumber: number | null; readonly position: number; readonly tied: boolean; readonly units: number; readonly scored: boolean }[];
}
export function weekendHubExtras(eventId: string, overview: CareerOverview | null, source: ChampionshipSource | null): WeekendHubExtras {
  const next = overview?.nextEvent && overview.nextEvent.event.id === eventId ? overview.nextEvent.circuit : null;
  const event = source?.events.find((e) => e.id === eventId) ?? null;
  const results: Partial<Record<SessionType, readonly PlayerFinish[]>> = {};
  if (source && event) {
    const race = playerFinishes(event.race, source), sprint = playerFinishes(event.sprint, source);
    if (race?.length) results.RACE = race;
    if (sprint?.length) results.SPRINT = sprint;
    const qualifying = (event.qualifying ?? [])
      .filter((row) => row.teamId === source.playerTeamId)
      .map((row) => ({ driverId: row.driverId, abbreviation: source.driverLabels[row.driverId]?.abbreviation ?? row.driverId, position: row.position, retired: false, disqualified: false }))
      .sort((a, b) => a.position - b.position);
    if (qualifying.length) results.QUALIFYING = qualifying;
  }
  const summary = source ? championshipSummary(source) : null;
  return {
    circuit: next ? { lengthMeters: next.lengthMeters, laps: next.defaultLapCount, countryCode: next.countryCode, city: next.city } : null,
    results,
    drivers: (summary?.playerDrivers ?? []).map((d) => ({ id: d.driver.id, name: d.driver.name, abbreviation: d.driver.abbreviation, carNumber: d.driver.carNumber, position: d.position, tied: d.tied, units: d.units, scored: !!summary?.through })),
  };
}

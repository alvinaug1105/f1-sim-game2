import { progressSummary, weekendFormatOf, type CareerProgress, type SessionStatus, type SessionType } from "../../game/domain/progression";
import type { CareerOverview } from "../../game/domain/career";
import type { WeekendFormat } from "../../game/domain/content";
import type { ChampionshipSession, ChampionshipSource } from "../../game/domain/championship-repository";
import { championshipSummary, type ChampionshipSummary } from "../championship/model";
import { safeTeamColor } from "./shell-context";
/**
 * Career Command Centre view model (UIX-A). A pure, serializable projection of three existing read models — the Career
 * overview, the progression calendar and the Championship read model — built on the server and handed to the client
 * view. Nothing here is new game state; it only orders what the player needs to see first.
 */
export interface EventBrief {
  readonly id: string;
  readonly round: number;
  readonly name: string;
  readonly circuitName: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly format: WeekendFormat;
  /** Circuit facts, only when the Career overview carries this event's circuit (the current / next event). */
  readonly circuit: { readonly lengthMeters: number; readonly laps: number; readonly countryCode: string; readonly city: string | null } | null;
}
export interface SessionStep {
  readonly id: string;
  readonly type: SessionType;
  readonly status: SessionStatus;
}
export type Mission =
  | { readonly kind: "ACTIVE"; readonly event: EventBrief; readonly sessions: readonly SessionStep[]; readonly current: SessionStep | null }
  | { readonly kind: "NEXT"; readonly event: EventBrief }
  | { readonly kind: "COMPLETE" };
/** A player car's classified finish in one completed session. */
export interface PlayerFinish {
  readonly driverId: string;
  readonly abbreviation: string;
  readonly position: number;
  readonly retired: boolean;
  readonly disqualified: boolean;
}
export interface RecentRound {
  readonly eventId: string;
  readonly round: number;
  readonly name: string;
  readonly sprint: readonly PlayerFinish[] | null;
  readonly race: readonly PlayerFinish[] | null;
}
export interface CalendarRound {
  readonly id: string;
  readonly round: number;
  readonly name: string;
  readonly circuitName: string;
  readonly startDate: string;
  readonly status: "UPCOMING" | "CURRENT" | "COMPLETED";
  readonly format: WeekendFormat;
}
export interface CommandCentreModel {
  readonly careerId: string;
  readonly careerName: string;
  readonly team: { readonly name: string; readonly shortName: string; readonly color: string | null };
  readonly seasonName: string;
  readonly currentDate: string;
  readonly completedRounds: number;
  readonly totalRounds: number;
  readonly mission: Mission;
  /** null when the Championship read model could not be read: the page degrades to a link. */
  readonly championship: ChampionshipSummary | null;
  readonly recent: readonly RecentRound[];
  readonly calendar: readonly CalendarRound[];
}
const RECENT_ROUNDS = 5;
/** The player's cars in a classification, best finish first. */
export function playerFinishes(session: ChampionshipSession | null, source: ChampionshipSource): readonly PlayerFinish[] | null {
  if (!session) return null;
  return session.entrants
    .filter((row) => row.teamId === source.playerTeamId)
    .map((row) => ({ driverId: row.driverId, abbreviation: source.driverLabels[row.driverId]?.abbreviation ?? row.driverId, position: row.position, retired: row.retired, disqualified: row.disqualified }))
    .sort((a, b) => a.position - b.position);
}
export function commandCentreModel(overview: CareerOverview, progress: CareerProgress, source: ChampionshipSource | null): CommandCentreModel {
  const { active, next, completed, total } = progressSummary(progress);
  const brief = (event: CareerProgress["events"][number]): EventBrief => {
    const circuit = overview.nextEvent && overview.nextEvent.event.id === event.id ? overview.nextEvent.circuit : null;
    return {
      id: event.id, round: event.round, name: event.name, circuitName: event.circuitName, startDate: event.startDate, endDate: event.endDate,
      format: weekendFormatOf(event),
      circuit: circuit ? { lengthMeters: circuit.lengthMeters, laps: circuit.defaultLapCount, countryCode: circuit.countryCode, city: circuit.city } : null,
    };
  };
  let mission: Mission;
  if (active) {
    const sessions = [...(active.weekend?.sessions ?? [])].sort((a, b) => a.order - b.order).map(({ id, type, status }) => ({ id, type, status }));
    mission = { kind: "ACTIVE", event: brief(active), sessions, current: sessions.find((s) => s.status === "AVAILABLE" || s.status === "IN_PROGRESS") ?? null };
  } else mission = next ? { kind: "NEXT", event: brief(next) } : { kind: "COMPLETE" };
  const recent: RecentRound[] = source
    ? [...source.events]
        .filter((e) => e.race || e.sprint)
        .sort((a, b) => b.round - a.round)
        .slice(0, RECENT_ROUNDS)
        .map((e) => ({ eventId: e.id, round: e.round, name: e.name, sprint: playerFinishes(e.sprint, source), race: playerFinishes(e.race, source) }))
    : [];
  return {
    careerId: progress.career.id,
    careerName: progress.career.name,
    team: { name: overview.playerTeam.name, shortName: overview.playerTeam.shortName, color: safeTeamColor(overview.playerTeam.color) },
    seasonName: overview.season.name,
    currentDate: progress.career.currentDate,
    completedRounds: completed,
    totalRounds: total,
    mission,
    championship: source ? championshipSummary(source) : null,
    recent,
    calendar: [...progress.events]
      .sort((a, b) => a.round - b.round || a.startDate.localeCompare(b.startDate))
      .map((e) => ({ id: e.id, round: e.round, name: e.name, circuitName: e.circuitName, startDate: e.startDate, status: e.status, format: weekendFormatOf(e) })),
  };
}

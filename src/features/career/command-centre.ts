import type { CareerOverview } from "../../game/domain/career";
import type { WeekendFormat } from "../../game/domain/content";
import type { ChampionshipSource, ChampionshipSession } from "../../game/domain/championship-repository";
import {
  getSessionSequence,
  progressSummary,
  weekendFormatOf,
  type CareerProgress,
  type ProgressEvent,
  type SessionStatus,
  type SessionType,
} from "../../game/domain/progression";
import { standingsPage } from "../championship/model";
import type { CircuitCard } from "./circuit-card";
/**
 * Career Command Centre view model (UIX-A REDO). A pure projection of the existing read models — overview, progress
 * and the Championship source — into what the screen shows. Nothing is invented: every figure is persisted data or
 * arithmetic on it. Points stay in exact half-point units; the view formats them.
 */
export interface Finish {
  readonly position: number;
  readonly retired: boolean;
  readonly disqualified: boolean;
}
export interface MissionEvent {
  readonly id: string;
  readonly round: number;
  readonly name: string;
  readonly circuitName: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly format: WeekendFormat;
  readonly sessions: readonly { readonly type: SessionType; readonly status: SessionStatus | "UPCOMING" }[];
}
export type Mission =
  | { readonly kind: "ACTIVE"; readonly event: MissionEvent; readonly current: { readonly type: SessionType; readonly status: SessionStatus } | null }
  | { readonly kind: "NEXT"; readonly event: MissionEvent }
  | { readonly kind: "COMPLETE" };
export interface ConstructorRow {
  readonly position: number;
  readonly tied: boolean;
  readonly name: string;
  readonly color: string;
  readonly units: number;
  readonly player: boolean;
}
export interface CommandCentreChampionship {
  /** False until a Sprint or Grand Prix has been classified. */
  readonly started: boolean;
  readonly through: { readonly round: number; readonly stage: "SPRINT" | "RACE"; readonly eventName: string } | null;
  readonly player: { readonly position: number; readonly tied: boolean; readonly units: number; readonly gapUnits: number } | null;
  /** Top five, then the player's row when it is outside them (`gap` marks the break). */
  readonly rows: readonly ConstructorRow[];
  readonly gap: boolean;
  readonly seasonComplete: boolean;
}
export interface CommandCentreDriver {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly carNumber: number | null;
  /** Null until a Sprint or Grand Prix is classified (everyone would otherwise read as tied first). */
  readonly position: number | null;
  readonly tied: boolean;
  readonly units: number;
  readonly wins: number;
  readonly lastRace: Finish | null;
}
export interface FormRow {
  readonly eventId: string;
  readonly round: number;
  readonly name: string;
  readonly format: WeekendFormat;
  readonly results: readonly { readonly driverId: string; readonly abbreviation: string; readonly sprint: Finish | null; readonly race: Finish | null }[];
}
export interface SeasonRound {
  readonly eventId: string;
  readonly round: number;
  readonly name: string;
  readonly format: WeekendFormat;
  readonly state: "done" | "current" | "next" | "upcoming";
}
export interface CommandCentreModel {
  readonly careerId: string;
  readonly careerName: string;
  readonly seasonName: string;
  readonly currentDate: string;
  readonly team: { readonly name: string; readonly shortName: string; readonly color: string };
  readonly progress: { readonly completed: number; readonly total: number };
  readonly mission: Mission;
  /** Null when the Championship read model is unavailable (the screen degrades to links). */
  readonly championship: CommandCentreChampionship | null;
  readonly drivers: readonly CommandCentreDriver[] | null;
  readonly form: readonly FormRow[] | null;
  readonly season: readonly SeasonRound[];
  readonly focus: { readonly eventId: string; readonly round: number; readonly name: string; readonly format: WeekendFormat; readonly circuit: CircuitCard | null } | null;
}
function missionEvent(event: ProgressEvent): MissionEvent {
  const format = weekendFormatOf(event);
  const sessions = event.weekend
    ? [...event.weekend.sessions].sort((a, b) => a.order - b.order).map((s) => ({ type: s.type, status: s.status }))
    : getSessionSequence(format).map((type) => ({ type, status: "UPCOMING" as const }));
  return { id: event.id, round: event.round, name: event.name, circuitName: event.circuitName, startDate: event.startDate, endDate: event.endDate, format, sessions };
}
function finish(session: ChampionshipSession | null, driverId: string): Finish | null {
  const row = session?.entrants.find((e) => e.driverId === driverId);
  return row ? { position: row.position, retired: row.retired, disqualified: row.disqualified } : null;
}
export const FORM_ROUNDS = 5;
export const TABLE_ROWS = 5;
export function commandCentreModel(
  overview: CareerOverview,
  progress: CareerProgress,
  source: ChampionshipSource | null,
  /** The overview's current/next event circuit card; shown only when that event is the focus round. */
  circuit: CircuitCard | null,
): CommandCentreModel {
  const { active, next, completed, total } = progressSummary(progress);
  const mission: Mission = active
    ? {
        kind: "ACTIVE",
        event: missionEvent(active),
        current: active.weekend?.sessions.find((s) => s.status === "AVAILABLE" || s.status === "IN_PROGRESS") ?? null,
      }
    : next
      ? { kind: "NEXT", event: missionEvent(next) }
      : { kind: "COMPLETE" };
  const focusEvent = active ?? next;
  const ordered = [...progress.events].sort((a, b) => a.round - b.round);
  let championship: CommandCentreChampionship | null = null;
  let drivers: CommandCentreDriver[] | null = null;
  let form: FormRow[] | null = null;
  if (source) {
    const page = standingsPage(source, null);
    const leader = page.constructors[0]?.units ?? 0;
    const playerIndex = page.constructors.findIndex((r) => r.team.player);
    const row = (r: (typeof page.constructors)[number]): ConstructorRow => ({
      position: r.position, tied: r.tied, name: r.team.name, color: r.team.color, units: r.units, player: r.team.player,
    });
    const top = page.constructors.slice(0, TABLE_ROWS).map(row);
    const outside = playerIndex >= TABLE_ROWS;
    const player = playerIndex >= 0 ? page.constructors[playerIndex] : null;
    championship = {
      started: page.through !== null,
      through: page.through,
      player: player ? { position: player.position, tied: player.tied, units: player.units, gapUnits: leader - player.units } : null,
      rows: outside ? [...top, row(page.constructors[playerIndex])] : top,
      gap: outside,
      seasonComplete: page.seasonComplete,
    };
    const lastRaced = [...source.events].filter((e) => e.race).sort((a, b) => b.round - a.round)[0] ?? null;
    drivers = page.drivers
      .filter((d) => d.driver.player)
      .map((d) => ({
        id: d.driver.id,
        name: d.driver.name,
        abbreviation: d.driver.abbreviation,
        carNumber: d.driver.carNumber,
        position: page.through ? d.position : null,
        tied: d.tied,
        units: d.units,
        wins: d.wins,
        lastRace: lastRaced ? finish(lastRaced.race, d.driver.id) : null,
      }))
      // Car order: the roster lists the player's cars in entry order.
      .sort((a, b) => source.roster.findIndex((r) => r.driverId === a.id) - source.roster.findIndex((r) => r.driverId === b.id));
    form = [...source.events]
      .filter((e) => e.race || e.sprint)
      .sort((a, b) => b.round - a.round)
      .slice(0, FORM_ROUNDS)
      .map((e) => ({
        eventId: e.id,
        round: e.round,
        name: e.name,
        format: e.format,
        results: (drivers ?? []).map((d) => ({ driverId: d.id, abbreviation: d.abbreviation, sprint: finish(e.sprint, d.id), race: finish(e.race, d.id) })),
      }));
  }
  const focusCircuit = focusEvent && overview.nextEvent?.event.id === focusEvent.id ? circuit : null;
  return {
    careerId: progress.career.id,
    careerName: progress.career.name,
    seasonName: overview.season.name,
    currentDate: progress.career.currentDate,
    team: { name: overview.playerTeam.name, shortName: overview.playerTeam.shortName, color: overview.playerTeam.color },
    progress: { completed, total },
    mission,
    championship,
    drivers,
    form,
    season: ordered.map((e) => ({
      eventId: e.id,
      round: e.round,
      name: e.name,
      format: weekendFormatOf(e),
      state: e.status === "COMPLETED" ? "done" : e.status === "CURRENT" ? "current" : e.id === next?.id && !active ? "next" : "upcoming",
    })),
    focus: focusEvent
      ? { eventId: focusEvent.id, round: focusEvent.round, name: focusEvent.name, format: weekendFormatOf(focusEvent), circuit: focusCircuit }
      : null,
  };
}

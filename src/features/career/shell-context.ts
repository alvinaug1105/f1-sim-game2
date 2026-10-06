import type { CareerOverview } from "../../game/domain/career";
import { progressSummary, type CareerProgress, type SessionType } from "../../game/domain/progression";
/**
 * The Career context the global shell shows on every Career page (UIX-A REDO): team identity, season, round position
 * and the active Race Weekend. A pure projection of the existing overview + progress read models.
 */
export type RoundState = "done" | "current" | "upcoming";
export interface ShellCareer {
  readonly id: string;
  readonly name: string;
  readonly teamName: string;
  readonly teamShortName: string;
  readonly teamColor: string | null;
  readonly seasonName: string;
  readonly currentDate: string;
  /** The active round, else the next one, else the last (calendar complete). */
  readonly round: number | null;
  readonly totalRounds: number;
  readonly rounds: readonly RoundState[];
  readonly activeEvent: { readonly id: string; readonly name: string; readonly sessions: Readonly<Record<string, SessionType>> } | null;
}
export function careerShellContext(overview: CareerOverview, progress: CareerProgress): ShellCareer {
  const { active, next } = progressSummary(progress);
  const ordered = [...progress.events].sort((a, b) => a.round - b.round);
  const focus = active ?? next ?? ordered.at(-1) ?? null;
  return {
    id: progress.career.id,
    name: progress.career.name,
    teamName: overview.playerTeam.name,
    teamShortName: overview.playerTeam.shortName,
    teamColor: overview.playerTeam.color,
    seasonName: overview.season.name,
    currentDate: progress.career.currentDate,
    round: focus?.round ?? null,
    totalRounds: ordered.length,
    rounds: ordered.map((e) => (e.status === "COMPLETED" ? "done" : e.status === "CURRENT" ? "current" : "upcoming")),
    activeEvent: active
      ? { id: active.id, name: active.name, sessions: Object.fromEntries((active.weekend?.sessions ?? []).map((s) => [s.id, s.type])) }
      : null,
  };
}

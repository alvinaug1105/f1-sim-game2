import { progressSummary, type CareerProgress } from "../../game/domain/progression";
import type { CareerOverview } from "../../game/domain/career";
/**
 * Career context shown by the global application shell on every Career page: who you are (team, Career), when you are
 * (season, round, date) and where the game is (active weekend). A pure, serializable projection of data the Career
 * pages already read; no new persistence or API.
 */
export interface CareerShellContext {
  readonly careerId: string;
  readonly careerName: string;
  readonly team: { readonly name: string; readonly shortName: string; readonly color: string | null };
  readonly seasonName: string;
  readonly currentDate: string;
  readonly completedRounds: number;
  readonly totalRounds: number;
  readonly activeEvent: { readonly id: string; readonly name: string; readonly round: number } | null;
}
/** Only a plain hex colour may become a CSS custom property (content data is never injected as raw CSS). */
export function safeTeamColor(color: string | null | undefined): string | null {
  return color && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color.trim()) ? color.trim() : null;
}
export function careerShellContext(overview: CareerOverview, progress: CareerProgress): CareerShellContext {
  const { active, completed, total } = progressSummary(progress);
  return {
    careerId: progress.career.id,
    careerName: progress.career.name,
    team: { name: overview.playerTeam.name, shortName: overview.playerTeam.shortName, color: safeTeamColor(overview.playerTeam.color) },
    seasonName: overview.season.name,
    currentDate: progress.career.currentDate,
    completedRounds: completed,
    totalRounds: total,
    activeEvent: active ? { id: active.id, name: active.name, round: active.round } : null,
  };
}

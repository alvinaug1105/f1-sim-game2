import type { ScoringRulesVersion, WeekendFormat } from "./content";
import type { SessionStatus, SessionType } from "./progression";
/**
 * Read model for the Championship: the Career's current season, its calendar and the authoritative classifications of
 * every *completed* Sprint, Grand Prix and Grand Prix Qualifying. Nothing here is a hidden simulation input (no seed,
 * RNG state, weather timeline, reliability or AI strategy) — it is safe to project into any page.
 */
export interface ChampionshipResultRow {
  readonly driverId: string;
  /** Team the car was entered for at that session (transfer-safe attribution). */
  readonly teamId: string;
  readonly position: number;
  readonly gridPosition: number | null;
  readonly completedLaps: number;
  readonly elapsedTimeMs: number;
  readonly retired: boolean;
  readonly stops: number | null;
}
export interface ChampionshipSession {
  readonly scheduledLaps: number;
  readonly entrants: readonly ChampionshipResultRow[];
}
export interface ChampionshipEvent {
  readonly id: string;
  readonly round: number;
  readonly name: string;
  readonly circuitName: string;
  readonly format: WeekendFormat;
  readonly status: "UPCOMING" | "CURRENT" | "COMPLETED";
  readonly sessions: readonly { readonly type: SessionType; readonly status: SessionStatus }[];
  /** Completed (session COMPLETED and simulation FINISHED) classifications only; null otherwise. */
  readonly sprint: ChampionshipSession | null;
  readonly race: ChampionshipSession | null;
  readonly qualifying: readonly { readonly driverId: string; readonly teamId: string; readonly position: number }[] | null;
}
export interface ChampionshipSource {
  readonly careerId: string;
  readonly playerTeamId: string;
  readonly season: { readonly id: string; readonly name: string; readonly year: number; readonly scoringRulesVersion: ScoringRulesVersion };
  readonly events: readonly ChampionshipEvent[];
  /** Season entry list: drivers with their entered team, in team entry order then car order. */
  readonly roster: readonly { readonly driverId: string; readonly teamId: string; readonly carNumber: number | null }[];
  /** Season teams in entry order. */
  readonly teams: readonly string[];
  readonly driverLabels: Readonly<Record<string, { readonly firstName: string; readonly lastName: string; readonly abbreviation: string }>>;
  readonly teamLabels: Readonly<Record<string, { readonly name: string; readonly shortName: string; readonly color: string }>>;
}
export interface ChampionshipRepository {
  /** Bounded reads (a fixed number of queries, independent of rounds or cars); null when the Career does not exist. */
  load(careerId: string): Promise<ChampionshipSource | null>;
}

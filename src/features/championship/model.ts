import {
  computeStandings,
  isSeasonComplete,
  reachedCutoffs,
  seasonHistory,
  weekendPoints,
  type ChampionshipInput,
  type Movement,
  type RoundResult,
  type SessionClassification,
  type StandingRow,
  type StandingsCutoff,
} from "../../game/domain/championship";
import type { ChampionshipEvent, ChampionshipSession, ChampionshipSource } from "../../game/domain/championship-repository";
import type { WeekendFormat } from "../../game/domain/content";
/**
 * Championship view models: pure projections of the persisted, completed results (no Prisma, React, locale or clock).
 * Points travel as exact half-point units; the UI formats them.
 */
function classification(session: ChampionshipSession | null): SessionClassification | null {
  if (!session || session.entrants.length === 0) return null;
  const leader = session.entrants.reduce((a, b) => (b.position < a.position ? b : a));
  return {
    scheduledLaps: session.scheduledLaps,
    leaderLaps: Math.min(leader.completedLaps, session.scheduledLaps),
    entries: session.entrants.map(({ driverId, teamId, position }) => ({ driverId, teamId, position })),
  };
}
export function championshipInput(source: ChampionshipSource): ChampionshipInput {
  return {
    version: source.season.scoringRulesVersion,
    rounds: source.events.map((e) => ({
      eventId: e.id,
      round: e.round,
      sprint: classification(e.sprint),
      race: classification(e.race),
      qualifying: e.qualifying && e.qualifying.length ? e.qualifying : null,
    })),
    drivers: source.roster.map((r) => ({ id: r.driverId, teamId: r.teamId })),
    teams: source.teams,
  };
}
/** Completed Grand Prix session = the event can no longer change its championship contribution. */
function raceCompleted(e: ChampionshipEvent) {
  return e.sessions.some((s) => s.type === "RACE" && s.status === "COMPLETED");
}
export function cutoffValue(c: StandingsCutoff) {
  return c.stage === "RACE" ? `r${c.round}` : c.stage === "SPRINT" ? `r${c.round}-sprint` : `before-r${c.round}`;
}
/** `r3` (after round 3), `r3-sprint` (after round 3's Sprint), `before-r3`; anything else → latest (null). */
export function parseCutoff(value: string | null | undefined): StandingsCutoff | null {
  const m = /^(before-)?r(\d{1,3})(-sprint)?$/.exec(value ?? "");
  if (!m || (m[1] && m[3])) return null;
  const round = Number(m[2]);
  if (round < 1) return null;
  return { round, stage: m[1] ? "BEFORE" : m[3] ? "SPRINT" : "RACE" };
}
export interface DriverLabel {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly carNumber: number | null;
  readonly teamId: string;
  readonly teamName: string;
  readonly color: string;
  readonly player: boolean;
}
export interface TeamLabel {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly player: boolean;
}
function labels(source: ChampionshipSource) {
  const carNumber = new Map(source.roster.map((r) => [r.driverId, r.carNumber]));
  const team = (id: string): TeamLabel => {
    const t = source.teamLabels[id];
    return { id, name: t?.name ?? id, color: t?.color ?? "#a0a6af", player: id === source.playerTeamId };
  };
  const driver = (id: string, teamId: string): DriverLabel => {
    const d = source.driverLabels[id], t = team(teamId);
    return {
      id,
      name: d ? `${d.firstName} ${d.lastName}` : id,
      abbreviation: d?.abbreviation ?? "—",
      carNumber: carNumber.get(id) ?? null,
      teamId,
      teamName: t.name,
      color: t.color,
      player: t.player,
    };
  };
  return { team, driver };
}
export interface StandingView {
  readonly position: number;
  readonly tied: boolean;
  readonly units: number;
  readonly wins: number;
  readonly movement: Movement | null;
  readonly previousPosition: number | null;
  readonly rounds: readonly RoundResult[];
}
export interface DriverStandingView extends StandingView {
  readonly driver: DriverLabel;
}
export interface TeamStandingView extends StandingView {
  readonly team: TeamLabel;
}
function view(row: StandingRow): StandingView {
  const { position, tied, units, wins, movement, previousPosition, rounds } = row;
  return { position, tied, units, wins, movement, previousPosition, rounds };
}
export interface CutoffOption {
  readonly value: string;
  readonly round: number;
  readonly stage: "SPRINT" | "RACE";
  readonly eventName: string;
}
export interface RoundOption {
  readonly eventId: string;
  readonly round: number;
  readonly name: string;
  readonly format: WeekendFormat;
  readonly hasResults: boolean;
}
export interface StandingsPage {
  readonly careerId: string;
  readonly seasonName: string;
  readonly scoringRulesVersion: string;
  readonly drivers: readonly DriverStandingView[];
  readonly constructors: readonly TeamStandingView[];
  readonly through: { readonly round: number; readonly stage: "SPRINT" | "RACE"; readonly eventName: string } | null;
  readonly cutoffs: readonly CutoffOption[];
  /** The selected cutoff value, or null for the live (latest) standings. */
  readonly selected: string | null;
  readonly rounds: readonly RoundOption[];
  readonly history: readonly { readonly eventId: string; readonly round: number; readonly eventName: string; readonly driverLeaders: readonly DriverLabel[]; readonly constructorLeaders: readonly TeamLabel[]; readonly raceWinner: DriverLabel | null; readonly sprintWinner: DriverLabel | null }[];
  /** Set only when every event has a completed Grand Prix and the live standings are shown. */
  readonly champions: { readonly drivers: readonly DriverLabel[]; readonly constructors: readonly TeamLabel[] } | null;
  readonly seasonComplete: boolean;
}
function standingsViews(source: ChampionshipSource, input: ChampionshipInput, cutoff: StandingsCutoff | null) {
  const { team, driver } = labels(source), standings = computeStandings(input, cutoff);
  return {
    standings,
    drivers: standings.drivers.map((r): DriverStandingView => ({ ...view(r), driver: driver(r.id, r.teamId ?? "") })),
    constructors: standings.constructors.map((r): TeamStandingView => ({ ...view(r), team: team(r.id) })),
  };
}
const eventName = (source: ChampionshipSource, round: number) => source.events.find((e) => e.round === round)?.name ?? "";
function winner(session: ChampionshipSession | null, driver: (id: string, teamId: string) => DriverLabel) {
  const w = session?.entrants.find((e) => e.position === 1);
  return w ? driver(w.driverId, w.teamId) : null;
}
export function standingsPage(source: ChampionshipSource, requested: StandingsCutoff | null): StandingsPage {
  const input = championshipInput(source), reached = reachedCutoffs(input.rounds);
  const known = requested && (requested.stage === "BEFORE" ? source.events.some((e) => e.round === requested.round) : reached.some((c) => c.round === requested.round && c.stage === requested.stage));
  const cutoff = known ? requested : null;
  const { standings, drivers, constructors } = standingsViews(source, input, cutoff);
  const { team, driver } = labels(source);
  const seasonComplete = isSeasonComplete(source.events.map((e) => ({ raceCompleted: raceCompleted(e) })));
  const history = seasonHistory(input).map((h) => {
    const event = source.events.find((e) => e.id === h.eventId)!;
    const s = computeStandings(input, { round: h.round, stage: "RACE" });
    const teamOf = new Map(s.drivers.map((r) => [r.id, r.teamId ?? ""]));
    return {
      eventId: h.eventId,
      round: h.round,
      eventName: event.name,
      driverLeaders: h.driverLeaders.map((id) => driver(id, teamOf.get(id) ?? "")),
      constructorLeaders: h.constructorLeaders.map(team),
      raceWinner: winner(event.race, driver),
      sprintWinner: winner(event.sprint, driver),
    };
  });
  return {
    careerId: source.careerId,
    seasonName: source.season.name,
    scoringRulesVersion: source.season.scoringRulesVersion,
    drivers,
    constructors,
    through: standings.through ? { ...standings.through, eventName: eventName(source, standings.through.round) } : null,
    cutoffs: reached.map((c) => ({ value: cutoffValue(c), round: c.round, stage: c.stage as "SPRINT" | "RACE", eventName: eventName(source, c.round) })),
    selected: cutoff ? cutoffValue(cutoff) : null,
    rounds: source.events.map((e) => ({ eventId: e.id, round: e.round, name: e.name, format: e.format, hasResults: Boolean(e.sprint || e.race) })),
    history,
    champions: seasonComplete && !cutoff
      ? { drivers: drivers.filter((r) => r.position === 1).map((r) => r.driver), constructors: constructors.filter((r) => r.position === 1).map((r) => r.team) }
      : null,
    seasonComplete,
  };
}
export interface ResultRowView {
  readonly driver: DriverLabel;
  readonly position: number;
  readonly gridPosition: number | null;
  readonly completedLaps: number;
  /** Gap to the winner in ms on the lead lap; null for the winner or a lapped/retired car. */
  readonly gapMs: number | null;
  readonly lapsDown: number;
  readonly elapsedTimeMs: number;
  readonly retired: boolean;
  readonly stops: number | null;
  readonly units: number;
}
export interface SessionResultView {
  readonly scheduledLaps: number;
  readonly leaderLaps: number;
  readonly rows: readonly ResultRowView[];
}
export interface WeekendResultsPage {
  readonly careerId: string;
  readonly eventId: string;
  readonly round: number;
  readonly name: string;
  readonly circuitName: string;
  readonly format: WeekendFormat;
  readonly sprint: SessionResultView | null;
  readonly race: SessionResultView | null;
  readonly weekend: readonly { readonly driver: DriverLabel; readonly sprint: number | null; readonly race: number | null; readonly total: number; readonly championship: { readonly position: number; readonly tied: boolean; readonly movement: Movement | null; readonly units: number } | null }[];
  readonly constructors: readonly { readonly team: TeamLabel; readonly total: number; readonly championship: { readonly position: number; readonly tied: boolean; readonly movement: Movement | null; readonly units: number } }[];
  /** The standings stage the championship columns reflect (after the Sprint or after the Grand Prix). */
  readonly through: "SPRINT" | "RACE" | null;
}
function sessionView(version: ChampionshipInput["version"], kind: "SPRINT" | "RACE", session: ChampionshipSession | null, driver: (id: string, teamId: string) => DriverLabel): SessionResultView | null {
  const c = classification(session);
  if (!session || !c) return null;
  const units = new Map([...weekendPoints(version, kind === "SPRINT" ? { sprint: c, race: null } : { sprint: null, race: c })].map(([id, p]) => [id, p.total]));
  const leader = session.entrants.find((e) => e.position === 1) ?? session.entrants[0];
  return {
    scheduledLaps: session.scheduledLaps,
    leaderLaps: c.leaderLaps,
    rows: [...session.entrants].sort((a, b) => a.position - b.position).map((e) => {
      const lapsDown = Math.max(0, leader.completedLaps - e.completedLaps);
      return {
        driver: driver(e.driverId, e.teamId),
        position: e.position,
        gridPosition: e.gridPosition,
        completedLaps: e.completedLaps,
        gapMs: e.position === leader.position || e.retired || lapsDown > 0 ? null : e.elapsedTimeMs - leader.elapsedTimeMs,
        lapsDown,
        elapsedTimeMs: e.elapsedTimeMs,
        retired: e.retired,
        stops: e.stops,
        units: units.get(e.driverId) ?? 0,
      };
    }),
  };
}
/** Weekend results; tolerates a partial weekend (a completed Sprint before the Grand Prix, or nothing yet). */
export function weekendResultsPage(source: ChampionshipSource, eventId: string): WeekendResultsPage | null {
  const event = source.events.find((e) => e.id === eventId);
  if (!event) return null;
  const input = championshipInput(source), { team, driver } = labels(source);
  const round = input.rounds.find((r) => r.eventId === eventId)!;
  const through = round.race ? "RACE" : round.sprint ? "SPRINT" : null;
  const standings = through ? computeStandings(input, { round: event.round, stage: through }) : null;
  const byDriver = new Map(standings?.drivers.map((r) => [r.id, r]) ?? []);
  const points = weekendPoints(input.version, round);
  const teamOf = new Map<string, string>();
  for (const s of [event.sprint, event.race]) for (const e of s?.entrants ?? []) teamOf.set(e.driverId, e.teamId);
  const champ = (r: StandingRow | undefined) => (r ? { position: r.position, tied: r.tied, movement: r.movement, units: r.units } : null);
  const weekend = [...teamOf.keys()]
    .map((id) => {
      const p = points.get(id) ?? { sprint: null, race: null, total: 0 };
      return { driver: driver(id, teamOf.get(id)!), sprint: p.sprint, race: p.race, total: p.total, championship: champ(byDriver.get(id)) };
    })
    .sort((a, b) => (a.championship?.position ?? 1e9) - (b.championship?.position ?? 1e9) || b.total - a.total || (a.driver.id < b.driver.id ? -1 : 1));
  const teamTotals = new Map<string, number>();
  for (const [id, p] of points) teamTotals.set(teamOf.get(id)!, (teamTotals.get(teamOf.get(id)!) ?? 0) + p.total);
  const constructors = standings
    ? standings.constructors.map((r) => ({ team: team(r.id), total: teamTotals.get(r.id) ?? 0, championship: champ(r)! }))
    : [];
  return {
    careerId: source.careerId,
    eventId: event.id,
    round: event.round,
    name: event.name,
    circuitName: event.circuitName,
    format: event.format,
    sprint: sessionView(input.version, "SPRINT", event.sprint, driver),
    race: sessionView(input.version, "RACE", event.race, driver),
    weekend,
    constructors,
    through,
  };
}
export interface ChampionshipSummary {
  readonly careerId: string;
  readonly through: { readonly round: number; readonly stage: "SPRINT" | "RACE"; readonly eventName: string } | null;
  readonly driverLeaders: readonly { readonly driver: DriverLabel; readonly units: number }[];
  readonly constructorLeaders: readonly { readonly team: TeamLabel; readonly units: number }[];
  readonly playerDrivers: readonly { readonly driver: DriverLabel; readonly position: number; readonly tied: boolean; readonly units: number }[];
  readonly playerTeam: { readonly team: TeamLabel; readonly position: number; readonly tied: boolean; readonly units: number } | null;
  readonly seasonComplete: boolean;
}
/** Compact dashboard summary of the live standings. */
export function championshipSummary(source: ChampionshipSource): ChampionshipSummary {
  const input = championshipInput(source);
  const { standings, drivers, constructors } = standingsViews(source, input, null);
  const player = constructors.find((r) => r.team.id === source.playerTeamId) ?? null;
  const playerDriverIds = new Set(source.roster.filter((r) => r.teamId === source.playerTeamId).map((r) => r.driverId));
  return {
    careerId: source.careerId,
    through: standings.through ? { ...standings.through, eventName: eventName(source, standings.through.round) } : null,
    driverLeaders: drivers.filter((r) => r.position === 1).map((r) => ({ driver: r.driver, units: r.units })),
    constructorLeaders: constructors.filter((r) => r.position === 1).map((r) => ({ team: r.team, units: r.units })),
    playerDrivers: drivers.filter((r) => playerDriverIds.has(r.driver.id)).map((r) => ({ driver: r.driver, position: r.position, tied: r.tied, units: r.units })),
    playerTeam: player ? { team: player.team, position: player.position, tied: player.tied, units: player.units } : null,
    seasonComplete: isSeasonComplete(source.events.map((e) => ({ raceCompleted: raceCompleted(e) }))),
  };
}

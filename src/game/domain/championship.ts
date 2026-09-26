import type { ScoringRulesVersion } from "./content";
/**
 * Championship scoring — a pure policy over authoritative classifications. No React, persistence, locale or clock:
 * standings are always *derived* from completed Sprint and Grand Prix results, never stored or accumulated.
 *
 * Points are exact integers in half-point units (1 point = {@link POINT_UNITS} units) so a two-way dead heat always
 * shares exactly. Race v7 persists unique positions (a database constraint), so dead heats are unreachable from the
 * engine today; the policy still defines them (the pooled points shared equally) and refuses a share that half-point
 * units could not represent rather than rounding it.
 */
export const POINT_UNITS = 2;
export type ScoredSessionKind = "SPRINT" | "RACE";
interface RuleSet {
  /** Grand Prix points by position at full points. */
  readonly race: readonly number[];
  /** Shortened Grand Prix bands, longest first: leader distance ≥ num/den of the scheduled distance → table. */
  readonly raceBands: readonly { readonly num: number; readonly den: number; readonly points: readonly number[] }[];
  /** Below the shortest band but at least `raceMinLaps` leader laps. */
  readonly raceShort: readonly number[];
  readonly raceMinLaps: number;
  readonly sprint: readonly number[];
  /** The Sprint scores only when the leader covered at least num/den of the scheduled distance. */
  readonly sprintMin: { readonly num: number; readonly den: number };
}
const RULES: Readonly<Record<ScoringRulesVersion, RuleSet>> = {
  // 2026: no fastest-lap point; Qualifying and Sprint Qualifying award nothing.
  F1_2026: {
    race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    raceBands: [
      { num: 3, den: 4, points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] },
      { num: 1, den: 2, points: [19, 14, 12, 10, 8, 6, 4, 3, 2, 1] },
      { num: 1, den: 4, points: [13, 10, 8, 6, 5, 4, 3, 2, 1] },
    ],
    raceShort: [6, 4, 3, 2, 1],
    raceMinLaps: 2,
    sprint: [8, 7, 6, 5, 4, 3, 2, 1],
    sprintMin: { num: 1, den: 2 },
  },
};
/** The Career's frozen rule set. NULL (a Career created before Phase 16, or legacy content) scores under F1_2026. */
export function scoringRulesOf(version: string | null | undefined): ScoringRulesVersion {
  if (version == null || version === "F1_2026") return "F1_2026";
  throw new RangeError(`Unknown scoring rules version: ${version}`);
}
function integer(value: number, label: string, min: number) {
  if (!Number.isInteger(value) || value < min) throw new RangeError(`${label} must be an integer ≥ ${min}`);
}
/**
 * Whole points by classified position for one session, from the leader's distance (exact integer comparisons, so
 * 25 %, 50 % and 75 % boundaries belong to the higher band). An empty table means the session awards nothing.
 */
export function pointsTable(version: ScoringRulesVersion, kind: ScoredSessionKind, leaderLaps: number, scheduledLaps: number): readonly number[] {
  integer(scheduledLaps, "Scheduled laps", 1);
  integer(leaderLaps, "Leader laps", 0);
  if (leaderLaps > scheduledLaps) throw new RangeError("Leader laps exceed the scheduled distance");
  const rules = RULES[version];
  if (kind === "SPRINT") return leaderLaps * rules.sprintMin.den >= scheduledLaps * rules.sprintMin.num ? rules.sprint : [];
  for (const band of rules.raceBands) if (leaderLaps * band.den >= scheduledLaps * band.num) return band.points;
  return leaderLaps >= rules.raceMinLaps ? rules.raceShort : [];
}
export interface ClassifiedEntry {
  /** Career driver ID — the championship identity (never a name). */
  readonly driverId: string;
  /** The Career team the car was entered for at that session — the constructor it scores for. */
  readonly teamId: string;
  /** Final classified position; equal positions are a dead heat (the next position skips accordingly). */
  readonly position: number;
}
export interface SessionClassification {
  readonly scheduledLaps: number;
  /** Laps completed by the classified leader. */
  readonly leaderLaps: number;
  readonly entries: readonly ClassifiedEntry[];
}
export interface ScoredEntry extends ClassifiedEntry {
  /** Points in half-point units. */
  readonly units: number;
}
function validateEntries(entries: readonly ClassifiedEntry[]) {
  const drivers = new Set<string>();
  for (const e of entries) {
    integer(e.position, "Position", 1);
    if (drivers.has(e.driverId)) throw new RangeError("A driver is classified twice");
    drivers.add(e.driverId);
  }
}
/** Points per classified car (retired or not — the authoritative final classification decides). */
export function scoreSession(version: ScoringRulesVersion, kind: ScoredSessionKind, session: SessionClassification): readonly ScoredEntry[] {
  validateEntries(session.entries);
  const table = pointsTable(version, kind, session.leaderLaps, session.scheduledLaps);
  const byPosition = new Map<number, ClassifiedEntry[]>();
  for (const e of session.entries) byPosition.set(e.position, [...(byPosition.get(e.position) ?? []), e]);
  const shares = new Map<number, number>();
  for (const [position, group] of byPosition) {
    let pool = 0;
    for (let i = 0; i < group.length; i++) pool += (table[position - 1 + i] ?? 0) * POINT_UNITS;
    if (pool % group.length !== 0) throw new RangeError("Dead-heat share is not representable in half points");
    shares.set(position, pool / group.length);
  }
  return [...session.entries].sort((a, b) => a.position - b.position || cmp(a.driverId, b.driverId)).map((e) => ({ ...e, units: shares.get(e.position)! }));
}
/** Plain code-unit order (locale-free); used only to render perfectly tied rows in a stable order. */
function cmp(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
export interface ScoredRound {
  readonly eventId: string;
  readonly round: number;
  /** Completed Sprint classification (Sprint weekends only); null when absent or not completed. */
  readonly sprint: SessionClassification | null;
  /** Completed Grand Prix classification; null when not completed. */
  readonly race: SessionClassification | null;
  /** Completed Grand Prix Qualifying classification — countback only, never points. Sprint Qualifying never counts. */
  readonly qualifying: readonly ClassifiedEntry[] | null;
}
export type CutoffStage = "BEFORE" | "SPRINT" | "RACE";
/**
 * A point in the season: everything from earlier rounds, plus — within `round` — nothing (BEFORE), the Sprint
 * (SPRINT) or the whole weekend (RACE). Grand Prix Qualifying enters the countback together with its Grand Prix.
 */
export interface StandingsCutoff {
  readonly round: number;
  readonly stage: CutoffStage;
}
function includes(cutoff: StandingsCutoff | null, round: number, part: "SPRINT" | "RACE") {
  if (!cutoff || round < cutoff.round) return true;
  if (round > cutoff.round) return false;
  return cutoff.stage === "RACE" || (cutoff.stage === "SPRINT" && part === "SPRINT");
}
export interface RoundResult {
  readonly eventId: string;
  readonly round: number;
  readonly sprint: { readonly position: number; readonly units: number } | null;
  readonly race: { readonly position: number; readonly units: number } | null;
}
export type Movement = "UP" | "DOWN" | "SAME";
export interface StandingRow {
  /** Career driver ID (WDC) or Career team ID (WCC). */
  readonly id: string;
  /** Shared by rows that remain perfectly tied after countback. */
  readonly position: number;
  readonly tied: boolean;
  readonly units: number;
  /** Grand Prix wins. */
  readonly wins: number;
  /** Grand Prix finishes by position: [P1 count, P2 count, …]. */
  readonly raceCountback: readonly number[];
  /** Grand Prix Qualifying positions: [P1 count, P2 count, …]. */
  readonly qualifyingCountback: readonly number[];
  /** Position before the latest round in this table; null in the first scored round. */
  readonly previousPosition: number | null;
  readonly movement: Movement | null;
  /** Per-round results for this driver/team, in round order (a team lists each of its cars' results summed). */
  readonly rounds: readonly RoundResult[];
  /** WDC only: the team of the driver's latest counted entry (or roster team). */
  readonly teamId?: string;
}
export interface Standings {
  readonly drivers: readonly StandingRow[];
  readonly constructors: readonly StandingRow[];
  /** The latest included session, or null when nothing has scored yet. */
  readonly through: { readonly round: number; readonly stage: "SPRINT" | "RACE" } | null;
}
export interface ChampionshipInput {
  readonly version: ScoringRulesVersion;
  readonly rounds: readonly ScoredRound[];
  /** Roster: every season driver with their entered team, listed even before scoring. */
  readonly drivers: readonly { readonly id: string; readonly teamId: string }[];
  /** Roster: every season team. */
  readonly teams: readonly string[];
}
interface Tally {
  units: number;
  race: number[];
  qualifying: number[];
  rounds: Map<string, { eventId: string; round: number; sprint: { position: number; units: number } | null; race: { position: number; units: number } | null }>;
  teamId?: string;
  teamRound?: number;
}
function tally(): Tally {
  return { units: 0, race: [], qualifying: [], rounds: new Map() };
}
function bump(vector: number[], position: number) {
  while (vector.length < position) vector.push(0);
  vector[position - 1] += 1;
}
/** Larger count at the first differing position ranks higher. */
function compareVector(a: readonly number[], b: readonly number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
/** Championship order: points, then Grand Prix countback, then Grand Prix Qualifying countback. 0 = perfect tie. */
export function compareStanding(a: Pick<StandingRow, "units" | "raceCountback" | "qualifyingCountback">, b: Pick<StandingRow, "units" | "raceCountback" | "qualifyingCountback">) {
  return b.units - a.units || compareVector(a.raceCountback, b.raceCountback) || compareVector(a.qualifyingCountback, b.qualifyingCountback);
}
function roundEntry(t: Tally, r: ScoredRound) {
  let row = t.rounds.get(r.eventId);
  if (!row) t.rounds.set(r.eventId, (row = { eventId: r.eventId, round: r.round, sprint: null, race: null }));
  return row;
}
function add(slot: { position: number; units: number } | null, position: number, units: number) {
  // A team's round slot keeps its best car's position and the sum of both cars' points.
  return slot ? { position: Math.min(slot.position, position), units: slot.units + units } : { position, units };
}
function rank(tallies: Map<string, Tally>, previous: Map<string, number> | null, driver: boolean): StandingRow[] {
  const rows = [...tallies].map(([id, t]) => ({
    id,
    units: t.units,
    wins: t.race[0] ?? 0,
    raceCountback: [...t.race],
    qualifyingCountback: [...t.qualifying],
    rounds: [...t.rounds.values()].sort((a, b) => a.round - b.round),
    ...(driver && t.teamId ? { teamId: t.teamId } : {}),
  }));
  rows.sort((a, b) => compareStanding(a, b) || cmp(a.id, b.id));
  return rows.map((row, i) => {
    let first = i;
    while (first > 0 && compareStanding(rows[first - 1], row) === 0) first--;
    const position = first + 1;
    const tied = (i > 0 && compareStanding(rows[i - 1], row) === 0) || (i + 1 < rows.length && compareStanding(rows[i + 1], row) === 0);
    const previousPosition = previous?.get(row.id) ?? null;
    const movement: Movement | null = previousPosition === null ? null : position < previousPosition ? "UP" : position > previousPosition ? "DOWN" : "SAME";
    return { ...row, position, tied, previousPosition, movement };
  });
}
function accumulate(input: ChampionshipInput, cutoff: StandingsCutoff | null) {
  const drivers = new Map<string, Tally>(), teams = new Map<string, Tally>();
  for (const d of input.drivers) drivers.set(d.id, { ...tally(), teamId: d.teamId, teamRound: -Infinity });
  for (const id of input.teams) teams.set(id, tally());
  const at = (map: Map<string, Tally>, id: string) => map.get(id) ?? map.set(id, tally()).get(id)!;
  let through: Standings["through"] = null;
  const rounds = [...input.rounds].sort((a, b) => a.round - b.round);
  for (const r of rounds) {
    for (const part of ["SPRINT", "RACE"] as const) {
      const session = part === "SPRINT" ? r.sprint : r.race;
      if (!session || !includes(cutoff, r.round, part)) continue;
      through = { round: r.round, stage: part };
      for (const e of scoreSession(input.version, part, session)) {
        const d = at(drivers, e.driverId), t = at(teams, e.teamId);
        d.units += e.units;
        t.units += e.units;
        if (d.teamRound === undefined || r.round >= d.teamRound) {
          d.teamId = e.teamId;
          d.teamRound = r.round;
        }
        const key = part === "SPRINT" ? "sprint" : "race";
        const dr = roundEntry(d, r), tr = roundEntry(t, r);
        dr[key] = add(dr[key], e.position, e.units);
        tr[key] = add(tr[key], e.position, e.units);
        if (part === "RACE") {
          bump(d.race, e.position);
          bump(t.race, e.position);
        }
      }
      if (part === "RACE" && r.qualifying) {
        validateEntries(r.qualifying);
        for (const q of r.qualifying) {
          bump(at(drivers, q.driverId).qualifying, q.position);
          bump(at(teams, q.teamId).qualifying, q.position);
        }
      }
    }
  }
  return { drivers, teams, through };
}
/**
 * Drivers' and Constructors' standings at a cutoff (null = everything supplied, i.e. every completed session).
 * Callers pass only completed sessions, so a live weekend never leaks an unfinished result.
 */
export function computeStandings(input: ChampionshipInput, cutoff: StandingsCutoff | null = null): Standings {
  const now = accumulate(input, cutoff);
  let previous: ReturnType<typeof accumulate> | null = null;
  if (now.through) {
    const before = accumulate(input, { round: now.through.round, stage: "BEFORE" });
    if (before.through) previous = before;
  }
  const positions = (rows: StandingRow[]) => new Map(rows.map((r) => [r.id, r.position]));
  return {
    drivers: rank(now.drivers, previous ? positions(rank(previous.drivers, null, true)) : null, true),
    constructors: rank(now.teams, previous ? positions(rank(previous.teams, null, false)) : null, false),
    through: now.through,
  };
}
/** Every cutoff the season has reached, in order: after each completed Sprint and each completed Grand Prix. */
export function reachedCutoffs(rounds: readonly ScoredRound[]): readonly StandingsCutoff[] {
  const out: StandingsCutoff[] = [];
  for (const r of [...rounds].sort((a, b) => a.round - b.round)) {
    if (r.sprint) out.push({ round: r.round, stage: "SPRINT" });
    if (r.race) out.push({ round: r.round, stage: "RACE" });
  }
  return out;
}
/** Season history: the championship leaders after each round whose Grand Prix is complete. */
export function seasonHistory(input: ChampionshipInput) {
  return [...input.rounds]
    .filter((r) => r.race)
    .sort((a, b) => a.round - b.round)
    .map((r) => {
      const s = computeStandings(input, { round: r.round, stage: "RACE" });
      const leaders = (rows: readonly StandingRow[]) => rows.filter((x) => x.position === 1).map((x) => x.id);
      return { eventId: r.eventId, round: r.round, driverLeaders: leaders(s.drivers), constructorLeaders: leaders(s.constructors) };
    });
}
/** The season is decided only when every calendar event has a completed Grand Prix — never an early clinch. */
export function isSeasonComplete(events: readonly { readonly raceCompleted: boolean }[]) {
  return events.length > 0 && events.every((e) => e.raceCompleted);
}
/** Weekend points for one round (Sprint + Grand Prix), by driver. */
export function weekendPoints(version: ScoringRulesVersion, round: Pick<ScoredRound, "sprint" | "race">) {
  const out = new Map<string, { sprint: number | null; race: number | null; total: number }>();
  for (const part of ["SPRINT", "RACE"] as const) {
    const session = part === "SPRINT" ? round.sprint : round.race;
    if (!session) continue;
    for (const e of scoreSession(version, part, session)) {
      const row = out.get(e.driverId) ?? { sprint: null, race: null, total: 0 };
      out.set(e.driverId, { ...row, [part === "SPRINT" ? "sprint" : "race"]: e.units, total: row.total + e.units });
    }
  }
  return out;
}

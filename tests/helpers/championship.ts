import type { ChampionshipEvent, ChampionshipSession, ChampionshipSource } from "../../src/game/domain/championship-repository";
import type { SessionStatus, SessionType } from "../../src/game/domain/progression";
/** A small synthetic Career season: 3 teams × 2 drivers; the player runs team "t1" (drivers d1, d2). */
export const TEAMS = ["t1", "t2", "t3"] as const;
export const DRIVERS = ["d1", "d2", "d3", "d4", "d5", "d6"] as const;
export const teamOf = (d: string) => `t${Math.ceil(Number(d.slice(1)) / 2)}`;
export function session(order: readonly string[], opts: { scheduled?: number; leader?: number; retired?: readonly string[]; team?: (d: string) => string } = {}): ChampionshipSession {
  const scheduled = opts.scheduled ?? 20, leader = opts.leader ?? scheduled;
  return {
    scheduledLaps: scheduled,
    entrants: order.map((driverId, i) => ({
      driverId,
      teamId: (opts.team ?? teamOf)(driverId),
      position: i + 1,
      gridPosition: order.length - i,
      completedLaps: opts.retired?.includes(driverId) ? Math.max(0, leader - 5) : leader,
      elapsedTimeMs: 3_600_000 + i * 1_500,
      retired: Boolean(opts.retired?.includes(driverId)),
      stops: 1,
    })),
  };
}
const standard: SessionType[] = ["PRACTICE_1", "PRACTICE_2", "PRACTICE_3", "QUALIFYING", "RACE"];
const sprint: SessionType[] = ["PRACTICE_1", "SPRINT_QUALIFYING", "SPRINT", "QUALIFYING", "RACE"];
export function event(round: number, parts: { format?: "STANDARD" | "SPRINT"; sprint?: ChampionshipSession | null; race?: ChampionshipSession | null; qualifying?: ChampionshipEvent["qualifying"]; entered?: boolean } = {}): ChampionshipEvent {
  const format = parts.format ?? "STANDARD";
  const done = (type: SessionType): SessionStatus => (type === "RACE" ? (parts.race ? "COMPLETED" : "LOCKED") : type === "SPRINT" ? (parts.sprint ? "COMPLETED" : parts.race ? "COMPLETED" : "AVAILABLE") : "COMPLETED");
  return {
    id: `e${round}`,
    round,
    name: `Event ${round}`,
    circuitName: `Circuit ${round}`,
    format,
    status: parts.race ? "COMPLETED" : parts.entered || parts.sprint ? "CURRENT" : "UPCOMING",
    sessions: parts.race || parts.sprint || parts.entered ? (format === "SPRINT" ? sprint : standard).map((type) => ({ type, status: done(type) })) : [],
    sprint: parts.sprint ?? null,
    race: parts.race ?? null,
    qualifying: parts.qualifying ?? null,
  };
}
export function source(events: readonly ChampionshipEvent[]): ChampionshipSource {
  return {
    careerId: "00000000-0000-4000-8000-00000000c001",
    playerTeamId: "t1",
    season: { id: "s", name: "2026 Test Championship", year: 2026, scoringRulesVersion: "F1_2026" },
    events,
    roster: DRIVERS.map((driverId, i) => ({ driverId, teamId: teamOf(driverId), carNumber: i + 1 })),
    teams: [...TEAMS],
    driverLabels: Object.fromEntries(DRIVERS.map((d, i) => [d, { firstName: `First${i + 1}`, lastName: `Last${i + 1}`, abbreviation: `DR${i + 1}` }])),
    teamLabels: { t1: { name: "Player Racing", shortName: "PLR", color: "#ff8000" }, t2: { name: "Rival Motorsport", shortName: "RIV", color: "#3671c6" }, t3: { name: "Third Works", shortName: "THW", color: "#27f4d2" } },
  };
}

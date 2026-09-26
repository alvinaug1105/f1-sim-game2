import type { GameDatabase, Season } from "./content";
import {
  assertContentId,
  type SeasonTeam,
  type SeasonDriver,
  type ScheduledEvent,
} from "./content-repository";
import { validateContentDataset } from "./content-dataset";
import {
  CareerError,
  type CreateCareerInput,
  type CareerWorld,
} from "./career";
export const CAREER_NAME_LIMIT = 80;
export const PRESEASON_DAYS = 14;
export function validateCareerInput(
  input: CreateCareerInput,
): CreateCareerInput {
  const name = input.name.trim();
  if (!name || name.length > CAREER_NAME_LIMIT)
    throw new CareerError("INVALID_NAME");
  try {
    assertContentId(input.gameDatabaseId);
    assertContentId(input.seasonId);
    assertContentId(input.playerTeamId);
  } catch (cause) {
    throw new CareerError("INVALID_ID", { cause });
  }
  return {
    ...input,
    name,
    gameDatabaseId: input.gameDatabaseId.toLowerCase(),
    seasonId: input.seasonId.toLowerCase(),
    playerTeamId: input.playerTeamId.toLowerCase(),
  };
}
export interface CareerSnapshotSource {
  readonly database: GameDatabase;
  readonly season: Season;
  readonly teams: readonly SeasonTeam[];
  readonly drivers: readonly SeasonDriver[];
  readonly events: readonly ScheduledEvent[];
}
/** Pure clone and ID remapping. Language and Prisma are intentionally absent. */
export function buildCareerWorld(
  input: CreateCareerInput,
  source: CareerSnapshotSource,
  newId: () => string,
  now: string,
): CareerWorld {
  const request = validateCareerInput(input);
  const { database, season, teams, drivers, events } = source;
  if (database.id !== request.gameDatabaseId)
    throw new CareerError("DATABASE_NOT_FOUND");
  if (season.id !== request.seasonId || season.gameDatabaseId !== database.id)
    throw new CareerError("SEASON_NOT_FOUND");
  if (!teams.some((row) => row.team.id === request.playerTeamId))
    throw new CareerError("TEAM_NOT_PARTICIPATING");
  const circuits = [
    ...new Map(events.map((row) => [row.circuit.id, row.circuit])).values(),
  ];
  try {
    for (const row of teams)
      if (row.entry.teamId !== row.team.id || row.entry.seasonId !== season.id)
        throw new Error("Invalid team join.");
    for (const row of drivers)
      if (
        row.entry.driverId !== row.driver.id ||
        row.entry.seasonId !== season.id
      )
        throw new Error("Invalid driver join.");
    for (const row of events)
      if (
        row.event.circuitId !== row.circuit.id ||
        row.event.seasonId !== season.id
      )
        throw new Error("Invalid calendar join.");
    validateContentDataset({
      database,
      teams: teams.map((row) => row.team),
      drivers: drivers.map((row) => row.driver),
      circuits,
      seasons: [season],
      teamEntries: teams.map((row) => row.entry),
      driverEntries: drivers.map((row) => row.entry),
      events: events.map((row) => row.event),
    });
  } catch (cause) {
    throw new CareerError("INVALID_SOURCE", { cause });
  }
  const sourceIds = new Set([
    database.id,
    season.id,
    ...teams.flatMap((row) => [row.team.id, row.entry.id]),
    ...drivers.flatMap((row) => [row.driver.id, row.entry.id]),
    ...events.flatMap((row) => [row.event.id, row.circuit.id]),
  ]);
  const allocated = new Set<string>();
  const allocate = () => {
    const id = newId();
    assertContentId(id);
    if (allocated.has(id) || sourceIds.has(id))
      throw new Error("Career ID allocator produced a reused ID.");
    allocated.add(id);
    return id;
  };
  const careerId = allocate(),
    careerSeasonId = allocate();
  const teamMap = new Map(teams.map((row) => [row.team.id, allocate()]));
  const driverMap = new Map(drivers.map((row) => [row.driver.id, allocate()]));
  const circuitMap = new Map(circuits.map((row) => [row.id, allocate()]));
  const entryMap = new Map(teams.map((row) => [row.team.id, allocate()]));
  const mapped = (map: ReadonlyMap<string, string>, id: string) => {
    const result = map.get(id);
    if (!result) throw new CareerError("INVALID_SOURCE");
    return result;
  };
  const starts = events.map((row) => row.event.startDate).sort(),
    ends = events.map((row) => row.event.endDate).sort();
  // Earliest scheduled weekend minus 14 UTC days; an empty calendar starts January 1 of the season year.
  const currentDate = starts.length
    ? new Date(
        Date.parse(`${starts[0]}T00:00:00.000Z`) - PRESEASON_DAYS * 86400000,
      )
        .toISOString()
        .slice(0, 10)
    : `${String(season.year).padStart(4, "0")}-01-01`;
  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(currentDate) ||
    currentDate.startsWith("0000")
  )
    throw new CareerError("INVALID_SOURCE");
  const audit = { createdAt: now, updatedAt: now };
  return {
    career: {
      id: careerId,
      name: request.name,
      sourceGameDatabaseId: database.id,
      sourceGameDatabaseVersion: database.version,
      sourceSeasonId: season.id,
      playerTeamId: mapped(teamMap, request.playerTeamId),
      currentSeasonId: careerSeasonId,
      currentDate,
      status: "ACTIVE",
      ...audit,
    },
    teams: teams.map(({ team }) => ({
      id: mapped(teamMap, team.id),
      careerId,
      sourceTeamId: team.id,
      key: team.key,
      name: team.name,
      shortName: team.shortName,
      color: team.color,
      secondaryColor: team.secondaryColor,
      countryCode: team.countryCode,
      foundedYear: team.foundedYear,
      ...audit,
    })),
    drivers: drivers.map(({ driver }) => ({
      id: mapped(driverMap, driver.id),
      careerId,
      sourceDriverId: driver.id,
      key: driver.key,
      firstName: driver.firstName,
      lastName: driver.lastName,
      abbreviation: driver.abbreviation,
      dateOfBirth: driver.dateOfBirth,
      nationalityCode: driver.nationalityCode,
      preferredNumber: driver.preferredNumber,
      ...audit,
    })),
    circuits: circuits.map((circuit) => ({
      id: mapped(circuitMap, circuit.id),
      careerId,
      sourceCircuitId: circuit.id,
      key: circuit.key,
      name: circuit.name,
      countryCode: circuit.countryCode,
      city: circuit.city,
      lengthMeters: circuit.lengthMeters,
      defaultLapCount: circuit.defaultLapCount,
      overtakingDifficulty: circuit.overtakingDifficulty ?? null,
      dirtyAirSensitivityPermille: circuit.dirtyAirSensitivityPermille ?? null,
      drsEffectivenessPermille: circuit.drsEffectivenessPermille ?? null,
    })),
    season: {
      id: careerSeasonId,
      careerId,
      sourceSeasonId: season.id,
      year: season.year,
      name: season.name,
      status: "UPCOMING",
      scoringRulesVersion: season.scoringRulesVersion ?? "F1_2026",
      startDate: starts[0] ?? null,
      endDate: ends.at(-1) ?? null,
    },
    teamEntries: teams.map(({ entry }) => ({
      id: mapped(entryMap, entry.teamId),
      careerId,
      careerSeasonId,
      careerTeamId: mapped(teamMap, entry.teamId),
      entryOrder: entry.entryOrder,
      carPerformance: entry.carPerformance ?? null,
    })),
    driverEntries: drivers.map(({ entry }) => ({
      id: allocate(),
      careerId,
      careerSeasonId,
      careerDriverId: mapped(driverMap, entry.driverId),
      careerSeasonTeamEntryId: mapped(entryMap, entry.teamId),
      carNumber: entry.carNumber,
      role: entry.role,
      pace: entry.pace ?? null,
      consistency: entry.consistency ?? null,
    })),
    events: events.map(({ event }) => ({
      id: allocate(),
      careerId,
      careerSeasonId,
      careerCircuitId: mapped(circuitMap, event.circuitId),
      sourceCalendarEventId: event.id,
      round: event.round,
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      status: "UPCOMING",
      weekendFormat: event.weekendFormat ?? "STANDARD",
    })),
  };
}

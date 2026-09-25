import type {
  AuditedContent,
  GameDatabase,
  Team,
  Driver,
  Circuit,
  Season,
  SeasonTeamEntry,
  SeasonDriverEntry,
  CalendarEvent,
} from "./content";
import { assertContentId } from "./content-repository";
type Source<T> = Omit<T, keyof AuditedContent>;
export interface ContentDataset {
  readonly database: Source<GameDatabase>;
  readonly teams: readonly Source<Team>[];
  readonly drivers: readonly Source<Driver>[];
  readonly circuits: readonly Source<Circuit>[];
  readonly seasons: readonly Source<Season>[];
  readonly teamEntries: readonly SeasonTeamEntry[];
  readonly driverEntries: readonly SeasonDriverEntry[];
  readonly events: readonly CalendarEvent[];
}
export class ContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentValidationError";
  }
}
function requireValid(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ContentValidationError(message);
}
function unique(values: readonly (string | number)[], label: string) {
  requireValid(new Set(values).size === values.length, `Duplicate ${label}.`);
}
function positive(value: number, label: string) {
  requireValid(
    Number.isInteger(value) && value > 0,
    `${label} must be a positive integer.`,
  );
}
/** Optional game-balance value: an integer 0–100 when present. */
function balance(value: number | null | undefined, label: string) {
  if (value == null) return;
  requireValid(
    Number.isInteger(value) && value >= 0 && value <= 100,
    `${label} must be an integer from 0 to 100.`,
  );
}
function date(value: string) {
  requireValid(
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Invalid ISO calendar date.",
  );
}
/** Lightweight seed/import preparation; SQL constraints remain the final integrity boundary. */
export function validateContentDataset(data: ContentDataset): void {
  const {
    database,
    teams,
    drivers,
    circuits,
    seasons,
    teamEntries,
    driverEntries,
    events,
  } = data;
  assertContentId(database.id);
  positive(database.schemaVersion, "Schema version");
  requireValid(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(database.key),
    "Invalid database key.",
  );
  requireValid(
    Boolean(database.name.trim() && database.version.trim()),
    "Database name and version are required.",
  );
  const groups = [teams, drivers, circuits, seasons];
  const all = [
    ...teams,
    ...drivers,
    ...circuits,
    ...seasons,
    ...teamEntries,
    ...driverEntries,
    ...events,
  ];
  unique([database.id, ...all.map((row) => row.id)], "entity ID");
  for (const row of all) {
    assertContentId(row.id);
    requireValid(
      row.gameDatabaseId === database.id,
      "Cross-database reference.",
    );
  }
  for (const rows of groups) {
    unique(
      rows.map((row) => row.key),
      "scoped key",
    );
    for (const row of rows)
      requireValid(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.key),
        "Invalid content key.",
      );
  }
  const country = (value: string) =>
    requireValid(
      /^[A-Z]{2}$/.test(value),
      "Country/nationality must be a two-letter uppercase code.",
    );
  for (const row of teams) {
    country(row.countryCode);
    requireValid(
      Boolean(row.name.trim() && row.shortName.trim()),
      "Team name is required.",
    );
    requireValid(
      /^#[0-9a-f]{6}$/i.test(row.color) &&
        (row.secondaryColor === null ||
          /^#[0-9a-f]{6}$/i.test(row.secondaryColor)),
      "Invalid team colour.",
    );
    if (row.foundedYear !== null) positive(row.foundedYear, "Founded year");
  }
  for (const row of drivers) {
    country(row.nationalityCode);
    date(row.dateOfBirth);
    requireValid(
      Boolean(
        row.firstName.trim() && row.lastName.trim() && row.abbreviation.trim(),
      ),
      "Driver identity is required.",
    );
    if (row.preferredNumber !== null)
      positive(row.preferredNumber, "Preferred number");
  }
  for (const row of circuits) {
    country(row.countryCode);
    requireValid(Boolean(row.name.trim()), "Circuit name is required.");
    positive(row.lengthMeters, "Circuit length");
    positive(row.defaultLapCount, "Lap count");
  }
  for (const row of seasons) {
    positive(row.year, "Season year");
    requireValid(Boolean(row.name.trim()), "Season name is required.");
  }
  const teamIds = new Set(teams.map((row) => row.id)),
    driverIds = new Set(drivers.map((row) => row.id)),
    circuitIds = new Set(circuits.map((row) => row.id)),
    seasonIds = new Set(seasons.map((row) => row.id));
  unique(
    teamEntries.map((row) => `${row.seasonId}/${row.teamId}`),
    "season team",
  );
  unique(
    teamEntries.map((row) => `${row.seasonId}/${row.entryOrder}`),
    "entry order",
  );
  for (const row of teamEntries) {
    requireValid(
      seasonIds.has(row.seasonId) && teamIds.has(row.teamId),
      "Team entry references a missing or foreign season/team.",
    );
    positive(row.entryOrder, "Entry order");
    balance(row.carPerformance, "Car performance");
  }
  const participatingTeams = new Set(
    teamEntries.map((row) => `${row.seasonId}/${row.teamId}`),
  );
  unique(
    driverEntries.map((row) => `${row.seasonId}/${row.driverId}`),
    "season driver",
  );
  unique(
    driverEntries
      .filter((row) => row.carNumber !== null)
      .map((row) => `${row.seasonId}/${row.carNumber}`),
    "season car number",
  );
  for (const row of driverEntries) {
    requireValid(
      driverIds.has(row.driverId) &&
        participatingTeams.has(`${row.seasonId}/${row.teamId}`),
      "Driver entry references a missing or foreign driver/team entry.",
    );
    requireValid(
      row.role === "RACE_DRIVER" || row.role === "RESERVE_DRIVER",
      "Invalid driver role.",
    );
    requireValid(
      row.role !== "RACE_DRIVER" || row.carNumber !== null,
      "Race driver requires a car number.",
    );
    if (row.carNumber !== null) positive(row.carNumber, "Car number");
    balance(row.pace, "Driver pace");
    balance(row.consistency, "Driver consistency");
    requireValid(
      (row.pace == null) === (row.consistency == null),
      "Driver balance must be complete or absent.",
    );
  }
  // Season grid integrity (any season, no names): every participating team fields exactly two primary race
  // drivers, and race-driver abbreviations are unique within the season (they identify cars in timing and on
  // the map). Exact grid sizes (e.g. 11 teams / 22 drivers for the 2026 development dataset) are owned by the
  // shipped-content tests, not this season-agnostic validator.
  const abbreviation = new Map(drivers.map((row) => [row.id, row.abbreviation]));
  for (const team of teamEntries) {
    const race = driverEntries.filter(
      (row) =>
        row.role === "RACE_DRIVER" &&
        row.seasonId === team.seasonId &&
        row.teamId === team.teamId,
    );
    requireValid(
      race.length === 2,
      "Each participating team needs exactly two race drivers.",
    );
  }
  unique(
    driverEntries
      .filter((row) => row.role === "RACE_DRIVER")
      .map((row) => `${row.seasonId}/${abbreviation.get(row.driverId)}`),
    "race driver abbreviation",
  );
  unique(
    events.map((row) => `${row.seasonId}/${row.round}`),
    "event round",
  );
  for (const row of events) {
    requireValid(
      seasonIds.has(row.seasonId) && circuitIds.has(row.circuitId),
      "Event references a missing or foreign season/circuit.",
    );
    positive(row.round, "Round");
    requireValid(Boolean(row.name.trim()), "Event name is required.");
    date(row.startDate);
    date(row.endDate);
    requireValid(row.startDate <= row.endDate, "Event ends before it starts.");
  }
}

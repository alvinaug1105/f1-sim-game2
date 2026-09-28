import type { ContentDataset } from "../../game/domain/content-dataset";
import type { CircuitClimateProfile, WeekendFormat } from "../../game/domain/content";
// Stable source identifiers, unrelated to display names. Existing IDs/keys are never renumbered or renamed
// (the Mercedes/Ferrari, Albert Park/Suzuka keys pre-date the real-name pass and stay as they are).
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const gameDatabaseId = id(1),
  seasonId = id(400);

/**
 * REAL-WORLD IDENTITY DATA (Content Expansion Pass A): the 2026 grid of 11 teams / 22 race drivers.
 * Names, abbreviations, numbers, nationalities and dates of birth are identity metadata only; they never drive logic.
 * Colours are real-life-inspired display directions (not official brand specifications). No logos or liveries.
 */
type TeamRow = readonly [n: number, key: string, name: string, shortName: string, color: string, secondaryColor: string, countryCode: string, foundedYear: number];
const TEAMS: readonly TeamRow[] = [
  [100, "team-aurora", "Mercedes", "MER", "#00D2BE", "#0E2B29", "DE", 2010], // turquoise
  [101, "team-nova", "Ferrari", "FER", "#E10600", "#2E0B0A", "IT", 1929], // racing red
  [102, "team-mclaren", "McLaren", "MCL", "#FF8000", "#47C7FC", "GB", 1963], // papaya
  [103, "team-red-bull-racing", "Red Bull Racing", "RBR", "#3671C6", "#1B2A4A", "AT", 2005], // navy + strong blue
  [104, "team-racing-bulls", "Racing Bulls", "RB", "#6692FF", "#F2F4F8", "IT", 2024], // blue / white
  [105, "team-alpine", "Alpine", "ALP", "#FF87BC", "#0093CC", "FR", 2021], // pink / blue
  [106, "team-haas", "Haas", "HAA", "#B6BABD", "#E6002B", "US", 2016], // neutral / red
  [107, "team-audi", "Audi", "AUD", "#F50537", "#1C1C1C", "DE", 2026], // red / dark
  [108, "team-williams", "Williams", "WIL", "#1E90FF", "#041E42", "GB", 1977], // strong blue
  [109, "team-aston-martin", "Aston Martin", "AMR", "#229971", "#CEDC00", "GB", 2021], // racing green
  [110, "team-cadillac", "Cadillac", "CAD", "#C9A45C", "#1E1F22", "US", 2026], // metallic / gold accent
];
type DriverRow = readonly [n: number, key: string, firstName: string, lastName: string, abbreviation: string, dateOfBirth: string, nationalityCode: string, number: number, team: number];
const DRIVERS: readonly DriverRow[] = [
  [200, "driver-alex-smith", "George", "Russell", "RUS", "1998-02-15", "GB", 63, 100],
  [201, "driver-mika-lee", "Kimi", "Antonelli", "ANT", "2006-08-25", "IT", 12, 100],
  [202, "driver-ren-sato", "Charles", "Leclerc", "LEC", "1997-10-16", "MC", 16, 101],
  [203, "driver-luca-moretti", "Lewis", "Hamilton", "HAM", "1985-01-07", "GB", 44, 101],
  [204, "driver-lando-norris", "Lando", "Norris", "NOR", "1999-11-13", "GB", 1, 102],
  [205, "driver-oscar-piastri", "Oscar", "Piastri", "PIA", "2001-04-06", "AU", 81, 102],
  [206, "driver-max-verstappen", "Max", "Verstappen", "VER", "1997-09-30", "NL", 3, 103],
  [207, "driver-isack-hadjar", "Isack", "Hadjar", "HAD", "2004-09-28", "FR", 6, 103],
  [208, "driver-liam-lawson", "Liam", "Lawson", "LAW", "2002-02-11", "NZ", 30, 104],
  [209, "driver-arvid-lindblad", "Arvid", "Lindblad", "LIN", "2007-08-08", "GB", 41, 104],
  [210, "driver-pierre-gasly", "Pierre", "Gasly", "GAS", "1996-02-07", "FR", 10, 105],
  [211, "driver-franco-colapinto", "Franco", "Colapinto", "COL", "2003-05-27", "AR", 43, 105],
  [212, "driver-esteban-ocon", "Esteban", "Ocon", "OCO", "1996-09-17", "FR", 31, 106],
  [213, "driver-oliver-bearman", "Oliver", "Bearman", "BEA", "2005-05-08", "GB", 87, 106],
  [214, "driver-nico-hulkenberg", "Nico", "Hulkenberg", "HUL", "1987-08-19", "DE", 27, 107],
  [215, "driver-gabriel-bortoleto", "Gabriel", "Bortoleto", "BOR", "2004-10-14", "BR", 5, 107],
  [216, "driver-carlos-sainz", "Carlos", "Sainz", "SAI", "1994-09-01", "ES", 55, 108],
  [217, "driver-alexander-albon", "Alexander", "Albon", "ALB", "1996-03-23", "TH", 23, 108],
  [218, "driver-fernando-alonso", "Fernando", "Alonso", "ALO", "1981-07-29", "ES", 14, 109],
  [219, "driver-lance-stroll", "Lance", "Stroll", "STR", "1998-10-29", "CA", 18, 109],
  [220, "driver-sergio-perez", "Sergio", "Perez", "PER", "1990-01-26", "MX", 11, 110],
  [221, "driver-valtteri-bottas", "Valtteri", "Bottas", "BOT", "1989-08-28", "FI", 77, 110],
];

/**
 * GAME-BALANCE DATA (development values, NOT official or real-world ratings). Stored on the 2026 season entries,
 * separately from identity, and snapshotted into each new Career. Subjective starting points chosen only to give a
 * plausible deterministic field spread (battles, traffic, a classification with gaps); final balancing comes later.
 * Scale 0–100 as consumed by the unchanged Race v7 and Practice engines.
 */
const CAR_PERFORMANCE: Readonly<Record<number, number>> = {
  102: 94, 100: 93, 103: 92, 101: 92, 108: 88, 104: 87, 109: 86, 106: 86, 107: 85, 105: 84, 110: 82,
};
const DRIVER_BALANCE: Readonly<Record<number, readonly [pace: number, consistency: number]>> = {
  206: [96, 93], 204: [95, 91], 202: [95, 89], 205: [94, 92], 200: [94, 92], 203: [93, 91], 218: [93, 94],
  216: [92, 92], 201: [91, 85], 217: [91, 90], 207: [90, 86], 210: [90, 89], 220: [90, 88], 214: [89, 91],
  212: [89, 88], 213: [89, 86], 221: [89, 90], 208: [88, 86], 215: [88, 87], 211: [87, 84], 209: [87, 84],
  219: [86, 85],
};

/** Original announced 2026 calendar content (Pass B). Stable IDs/keys survive round changes. */
type CircuitRow = readonly [n: number, key: string, name: string, countryCode: string, city: string, lengthMeters: number, defaultLapCount: number];
const CIRCUITS: readonly CircuitRow[] = [
  [300, "circuit-silver-coast", "Albert Park Grand Prix Circuit", "AU", "Melbourne", 5278, 58],
  [301, "circuit-mountain-park", "Suzuka Circuit", "JP", "Suzuka", 5807, 53],
  [302, "circuit-shanghai", "Shanghai International Circuit", "CN", "Shanghai", 5451, 56],
  [303, "circuit-bahrain", "Bahrain International Circuit", "BH", "Sakhir", 5412, 57],
  [304, "circuit-monaco", "Circuit de Monaco", "MC", "Monaco", 3337, 78],
  [305, "circuit-silverstone", "Silverstone Circuit", "GB", "Silverstone", 5891, 52],
  [306, "circuit-spa-francorchamps", "Circuit de Spa-Francorchamps", "BE", "Stavelot", 7004, 44],
  [307, "circuit-marina-bay", "Marina Bay Street Circuit", "SG", "Singapore", 4927, 62],
  [308, "circuit-jeddah", "Jeddah Corniche Circuit", "SA", "Jeddah", 6174, 50],
  [309, "circuit-miami", "Miami International Autodrome", "US", "Miami", 5412, 57],
  [310, "circuit-montreal", "Circuit Gilles Villeneuve", "CA", "Montreal", 4361, 70],
  [311, "circuit-barcelona", "Circuit de Barcelona-Catalunya", "ES", "Montmeló", 4657, 66],
  [312, "circuit-red-bull-ring", "Red Bull Ring", "AT", "Spielberg", 4326, 71],
  [313, "circuit-hungaroring", "Hungaroring", "HU", "Mogyoród", 4381, 70],
  [314, "circuit-zandvoort", "Circuit Zandvoort", "NL", "Zandvoort", 4259, 72],
  [315, "circuit-monza", "Autodromo Nazionale Monza", "IT", "Monza", 5793, 53],
  [316, "circuit-madrid", "Madring", "ES", "Madrid", 5414, 57],
  [317, "circuit-baku", "Baku City Circuit", "AZ", "Baku", 6003, 51],
  [318, "circuit-cota", "Circuit of the Americas", "US", "Austin", 5513, 56],
  [319, "circuit-mexico-city", "Autódromo Hermanos Rodríguez", "MX", "Mexico City", 4304, 71],
  [320, "circuit-interlagos", "Autódromo José Carlos Pace (Interlagos)", "BR", "São Paulo", 4309, 71],
  [321, "circuit-las-vegas", "Las Vegas Strip Circuit", "US", "Las Vegas", 6201, 50],
  [322, "circuit-lusail", "Lusail International Circuit", "QA", "Lusail", 5419, 57],
  [323, "circuit-yas-marina", "Yas Marina Circuit", "AE", "Abu Dhabi", 5281, 58],
];
/**
 * Race interaction identity per circuit (game-balance directions, not official ratings): [overtaking difficulty 0–100,
 * dirty-air sensitivity ‰, DRS effectiveness ‰]. Neutral legacy default is [35, 1000, 1000].
 */
const CIRCUIT_RACE_PROFILE: Readonly<Record<number, readonly [overtakingDifficulty: number, dirtyAirSensitivityPermille: number, drsEffectivenessPermille: number]>> = {
  300: [40, 1100, 950], // Albert Park: moderate
  301: [50, 1150, 850], // Suzuka: moderate / difficult
  302: [25, 950, 1150], // Shanghai: meaningful passing
  303: [18, 900, 1300], // Bahrain: strong passing
  304: [85, 1500, 350], // Monaco: very difficult, dirty air matters most
  305: [26, 950, 1150], // Silverstone: meaningful passing
  306: [15, 900, 1350], // Spa-Francorchamps: strong passing
  307: [62, 1300, 650], // Marina Bay: relatively difficult
  308: [23, 950, 1200], // jeddah
  309: [35, 1000, 1100], // miami
  310: [28, 950, 1150], // montreal
  311: [48, 1200, 850], // barcelona
  312: [24, 900, 1250], // red-bull-ring
  313: [65, 1350, 650], // hungaroring
  314: [62, 1300, 700], // zandvoort
  315: [18, 850, 1300], // monza
  316: [45, 1100, 1000], // madrid
  317: [20, 900, 1350], // baku
  318: [30, 1050, 1150], // cota
  319: [35, 1100, 1100], // mexico-city
  320: [28, 1000, 1150], // interlagos
  321: [18, 850, 1400], // las-vegas
  322: [48, 1200, 850], // lusail
  323: [32, 1000, 1100], // yas-marina
};
/** Broad occurrence priors, game-content values rather than measured meteorological probabilities. */
const CIRCUIT_CLIMATE: Readonly<Record<number, CircuitClimateProfile>> = {
  300: "TEMPERATE",
  301: "VARIABLE",
  302: "TEMPERATE",
  303: "ARID",
  304: "TEMPERATE",
  305: "VARIABLE",
  306: "VARIABLE",
  307: "HUMID",
  308: "ARID",
  309: "HUMID",
  310: "VARIABLE",
  311: "DRY",
  312: "VARIABLE",
  313: "TEMPERATE",
  314: "VARIABLE",
  315: "TEMPERATE",
  316: "DRY",
  317: "DRY",
  318: "TEMPERATE",
  319: "DRY",
  320: "HUMID",
  321: "ARID",
  322: "ARID",
  323: "ARID",
};
/** Weekend format is calendar data (six original 2026 Sprint weekends), never derived from a name. */
type EventRow = readonly [n: number, circuit: number, round: number, name: string, startDate: string, endDate: string, weekendFormat: WeekendFormat];
const EVENTS: readonly EventRow[] = [
  [700, 300, 1, "Australian Grand Prix", "2026-03-06", "2026-03-08", "STANDARD"],
  [702, 302, 2, "Chinese Grand Prix", "2026-03-13", "2026-03-15", "SPRINT"],
  [701, 301, 3, "Japanese Grand Prix", "2026-03-27", "2026-03-29", "STANDARD"],
  [703, 303, 4, "Bahrain Grand Prix", "2026-04-10", "2026-04-12", "STANDARD"],
  [708, 308, 5, "Saudi Arabian Grand Prix", "2026-04-17", "2026-04-19", "STANDARD"],
  [709, 309, 6, "Miami Grand Prix", "2026-05-01", "2026-05-03", "SPRINT"],
  [710, 310, 7, "Canadian Grand Prix", "2026-05-22", "2026-05-24", "SPRINT"],
  [704, 304, 8, "Monaco Grand Prix", "2026-06-05", "2026-06-07", "STANDARD"],
  [711, 311, 9, "Barcelona-Catalunya Grand Prix", "2026-06-12", "2026-06-14", "STANDARD"],
  [712, 312, 10, "Austrian Grand Prix", "2026-06-26", "2026-06-28", "STANDARD"],
  [705, 305, 11, "British Grand Prix", "2026-07-03", "2026-07-05", "SPRINT"],
  [706, 306, 12, "Belgian Grand Prix", "2026-07-17", "2026-07-19", "STANDARD"],
  [713, 313, 13, "Hungarian Grand Prix", "2026-07-24", "2026-07-26", "STANDARD"],
  [714, 314, 14, "Dutch Grand Prix", "2026-08-21", "2026-08-23", "SPRINT"],
  [715, 315, 15, "Italian Grand Prix", "2026-09-04", "2026-09-06", "STANDARD"],
  [716, 316, 16, "Spanish Grand Prix", "2026-09-11", "2026-09-13", "STANDARD"],
  [717, 317, 17, "Azerbaijan Grand Prix", "2026-09-24", "2026-09-26", "STANDARD"],
  [707, 307, 18, "Singapore Grand Prix", "2026-10-09", "2026-10-11", "SPRINT"],
  [718, 318, 19, "United States Grand Prix", "2026-10-23", "2026-10-25", "STANDARD"],
  [719, 319, 20, "Mexico City Grand Prix", "2026-10-30", "2026-11-01", "STANDARD"],
  [720, 320, 21, "São Paulo Grand Prix", "2026-11-06", "2026-11-08", "STANDARD"],
  [721, 321, 22, "Las Vegas Grand Prix", "2026-11-19", "2026-11-21", "STANDARD"],
  [722, 322, 23, "Qatar Grand Prix", "2026-11-27", "2026-11-29", "STANDARD"],
  [723, 323, 24, "Abu Dhabi Grand Prix", "2026-12-04", "2026-12-06", "STANDARD"],

];

export const developmentContent = {
  database: {
    id: gameDatabaseId,
    key: "fictional-formula-development",
    name: "Fictional Formula Development",
    version: "1.2.0",
    schemaVersion: 1,
    description:
      "Original 2026 24-round world with circuit climate snapshots. No active Career.",
    isBuiltIn: true,
  },
  teams: TEAMS.map(([n, key, name, shortName, color, secondaryColor, countryCode, foundedYear]) => ({
    id: id(n), gameDatabaseId, key, name, shortName, color, secondaryColor, countryCode, foundedYear,
  })),
  drivers: DRIVERS.map(([n, key, firstName, lastName, abbreviation, dateOfBirth, nationalityCode, preferredNumber]) => ({
    id: id(n), gameDatabaseId, key, firstName, lastName, abbreviation, dateOfBirth, nationalityCode, preferredNumber,
  })),
  circuits: CIRCUITS.map(([n, key, name, countryCode, city, lengthMeters, defaultLapCount]) => ({
    id: id(n), gameDatabaseId, key, name, countryCode, city, lengthMeters, defaultLapCount, climateProfile: CIRCUIT_CLIMATE[n],
    overtakingDifficulty: CIRCUIT_RACE_PROFILE[n][0], dirtyAirSensitivityPermille: CIRCUIT_RACE_PROFILE[n][1], drsEffectivenessPermille: CIRCUIT_RACE_PROFILE[n][2],
  })),
  seasons: [
    {
      id: seasonId,
      gameDatabaseId,
      key: "season-2026",
      year: 2026,
      name: "2026 Fictional Formula Championship",
      scoringRulesVersion: "F1_2026",
    },
  ],
  // Entry IDs 500+ / 600+ follow the team / driver order above (Mercedes 500, Ferrari 501; RUS 600 … HAM 603).
  teamEntries: TEAMS.map(([n], index) => ({
    id: id(400 + n), gameDatabaseId, seasonId, teamId: id(n), entryOrder: index + 1, carPerformance: CAR_PERFORMANCE[n],
    lowSpeedPerformance: CAR_PERFORMANCE[n], mediumSpeedPerformance: CAR_PERFORMANCE[n], highSpeedPerformance: CAR_PERFORMANCE[n],
    dragReductionPerformance: CAR_PERFORMANCE[n], drsEfficiencyPerformance: CAR_PERFORMANCE[n],
  })),
  driverEntries: DRIVERS.map(([n, , , , , , , carNumber, team]) => ({
    id: id(400 + n), gameDatabaseId, seasonId, teamId: id(team), driverId: id(n), carNumber, role: "RACE_DRIVER" as const,
    pace: DRIVER_BALANCE[n][0], consistency: DRIVER_BALANCE[n][1],
  })),
  events: EVENTS.map(([n, circuit, round, name, startDate, endDate, weekendFormat]) => ({
    id: id(n), gameDatabaseId, seasonId, circuitId: id(circuit), round, name, startDate, endDate, weekendFormat,
  })),
} satisfies ContentDataset;

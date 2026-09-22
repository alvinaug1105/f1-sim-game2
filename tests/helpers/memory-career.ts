import type {
  CareerRepository,
  CareerCreationTransaction,
} from "../../src/game/domain/career-repository";
import type {
  Career,
  CareerWorld,
  CareerOverview,
  CareerSummary,
} from "../../src/game/domain/career";
import type { ContentDataset } from "../../src/game/domain/content-dataset";
import type { GameContentRepository } from "../../src/game/domain/content-repository";
import { developmentContent } from "../../src/data/seed/content-development";
export const audit = {
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
/** Transactional in-memory TEST DOUBLE; never used by the application as a fallback. */
export class MemoryCareerRepository implements CareerRepository {
  data: ContentDataset | null = structuredClone(developmentContent);
  worlds = new Map<string, CareerWorld>();
  failAfterSave = false;
  source: GameContentRepository = {
    getGameDatabaseById: async (id) =>
      this.data?.database.id === id
        ? { ...this.data.database, ...audit }
        : null,
    getSeasonById: async (db, id) => {
      const row = this.data?.seasons.find(
        (s) => s.id === id && s.gameDatabaseId === db,
      );
      return row ? { ...row, ...audit } : null;
    },
    listTeamsForSeason: async (db, season) =>
      this.data?.teamEntries
        .filter((e) => e.gameDatabaseId === db && e.seasonId === season)
        .map((entry) => {
          const team = this.data?.teams.find((row) => row.id === entry.teamId);
          if (!team) throw new Error("Broken team fixture");
          return { entry, team: { ...team, ...audit } };
        }) ?? [],
    listDriversForSeason: async (db, season) =>
      this.data?.driverEntries
        .filter((e) => e.gameDatabaseId === db && e.seasonId === season)
        .map((entry) => {
          const driver = this.data?.drivers.find(
            (row) => row.id === entry.driverId,
          );
          if (!driver) throw new Error("Broken driver fixture");
          return { entry, driver: { ...driver, ...audit } };
        }) ?? [],
    listCalendarEvents: async (db, season) =>
      this.data?.events
        .filter((e) => e.gameDatabaseId === db && e.seasonId === season)
        .map((event) => {
          const circuit = this.data?.circuits.find(
            (row) => row.id === event.circuitId,
          );
          if (!circuit) throw new Error("Broken circuit fixture");
          return { event, circuit: { ...circuit, ...audit } };
        }) ?? [],
  };
  async createAtomically(
    work: (tx: CareerCreationTransaction) => Promise<Career>,
  ) {
    const staged = new Map(this.worlds);
    const result = await work({
      source: this.source,
      saveWorld: async (world) => {
        staged.set(world.career.id, structuredClone(world));
        if (this.failAfterSave)
          throw new Error("Injected snapshot-write failure");
      },
    });
    this.worlds = staged;
    return result;
  }
  async getCareerById(id: string) {
    return this.worlds.get(id)?.career ?? null;
  }
  async getCareerOverview(id: string): Promise<CareerOverview | null> {
    const world = this.worlds.get(id);
    if (!world) return null;
    const playerTeam = world.teams.find(
      (team) => team.id === world.career.playerTeamId,
    );
    if (!playerTeam) throw new Error("Broken world");
    const event = [...world.events]
      .sort(
        (a, b) => a.startDate.localeCompare(b.startDate) || a.round - b.round,
      )
      .find(
        (event) =>
          event.endDate >= world.career.currentDate &&
          event.status !== "COMPLETED",
      );
    const circuit = event
      ? world.circuits.find((row) => row.id === event.careerCircuitId)
      : null;
    return structuredClone({
      career: world.career,
      playerTeam,
      season: world.season,
      nextEvent: event && circuit ? { event, circuit } : null,
    });
  }
  async listCareers(): Promise<readonly CareerSummary[]> {
    return Promise.all(
      [...this.worlds.keys()].map(async (id) => {
        const overview = await this.getCareerOverview(id);
        if (!overview) throw new Error("Broken world");
        return overview;
      }),
    );
  }
  async getCreationOptions() {
    return { databases: [] };
  }
}
let sequence = 10000;
export const runtime = {
  newId: () =>
    `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  now: () => audit.createdAt,
};
export const input = {
  name: "My Career",
  gameDatabaseId: developmentContent.database.id,
  seasonId: developmentContent.seasons[0].id,
  playerTeamId: developmentContent.teams[0].id,
};

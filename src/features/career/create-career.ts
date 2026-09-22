import { randomUUID } from "node:crypto";
import { CareerError, type CreateCareerInput } from "../../game/domain/career";
import type { CareerRepository } from "../../game/domain/career-repository";
import {
  buildCareerWorld,
  validateCareerInput,
} from "../../game/domain/career-snapshot";
export async function createCareer(
  repository: CareerRepository,
  input: CreateCareerInput,
  runtime: { newId: () => string; now: () => string } = {
    newId: randomUUID,
    now: () => new Date().toISOString(),
  },
) {
  const request = validateCareerInput(input);
  return repository.createAtomically(async (tx) => {
    const database = await tx.source.getGameDatabaseById(
      request.gameDatabaseId,
    );
    if (!database) throw new CareerError("DATABASE_NOT_FOUND");
    const season = await tx.source.getSeasonById(
      request.gameDatabaseId,
      request.seasonId,
    );
    if (!season) throw new CareerError("SEASON_NOT_FOUND");
    const teams = await tx.source.listTeamsForSeason(database.id, season.id);
    if (!teams.some((row) => row.team.id === request.playerTeamId))
      throw new CareerError("TEAM_NOT_PARTICIPATING");
    const drivers = await tx.source.listDriversForSeason(
      database.id,
      season.id,
    );
    const events = await tx.source.listCalendarEvents(database.id, season.id);
    const world = buildCareerWorld(
      request,
      { database, season, teams, drivers, events },
      runtime.newId,
      runtime.now(),
    );
    await tx.saveWorld(world);
    return world.career;
  });
}

import {
  assertEntityId,
  type EntityId,
  type TeamIdentity,
} from "../../game/domain/identity";
export interface EventPreview {
  readonly id: EntityId;
  readonly name: string;
  readonly venue: string;
  readonly scheduledAt: string | null;
}
export interface DashboardRepository {
  findTeam(id: EntityId): Promise<TeamIdentity | null>;
  getNextEvent(): Promise<EventPreview | null>;
}
export async function getDashboard(
  repository: DashboardRepository,
  teamId: EntityId,
) {
  assertEntityId(teamId);
  const [team, event] = await Promise.all([
    repository.findTeam(teamId),
    repository.getNextEvent(),
  ]);
  if (team) {
    assertEntityId(team.id);
    if (team.id !== teamId)
      throw new Error("Repository returned a different team ID.");
  }
  if (event) assertEntityId(event.id);
  return { team, event };
}

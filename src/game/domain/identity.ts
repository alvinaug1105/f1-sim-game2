export type EntityId = string;
export interface TeamIdentity {
  readonly id: EntityId;
  readonly name: string;
  readonly shortName: string;
}
export interface DriverIdentity {
  readonly id: EntityId;
  readonly firstName: string;
  readonly lastName: string;
  readonly abbreviation: string;
}
export interface DriverAssignment {
  readonly driverId: EntityId;
  readonly teamId: EntityId;
}
export function assertEntityId(id: EntityId): void {
  if (!id.trim() || id !== id.trim())
    throw new Error(
      "Entity ID must be non-empty and have no surrounding whitespace.",
    );
}
export function isAssignedToTeam(
  assignment: DriverAssignment,
  teamId: EntityId,
): boolean {
  assertEntityId(assignment.driverId);
  assertEntityId(assignment.teamId);
  assertEntityId(teamId);
  return assignment.teamId === teamId;
}

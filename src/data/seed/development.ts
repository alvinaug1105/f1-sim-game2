import type { TeamIdentity } from "../../game/domain/identity";
/** Temporary fixtures; replace the repository adapter during the database phase. */
export const developmentTeam: TeamIdentity = {
  id: "team-dev-001",
  name: "Development Racing",
  shortName: "DEV",
};
export const developmentEvent = {
  id: "event-dev-001",
  name: "Pre-season test",
  venue: "Development circuit",
  scheduledAt: null,
} as const;

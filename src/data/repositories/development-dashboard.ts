import type { DashboardRepository } from "../../features/dashboard/get-dashboard";
import { developmentEvent, developmentTeam } from "../seed/development";
export const developmentDashboardRepository: DashboardRepository = {
  async findTeam(id) {
    return id === developmentTeam.id ? { ...developmentTeam } : null;
  },
  async getNextEvent() {
    return { ...developmentEvent };
  },
};

import { developmentDashboardRepository } from "@/data/repositories/development-dashboard";
import { developmentTeam } from "@/data/seed/development";
import { getDashboard } from "@/features/dashboard/get-dashboard";
import { DashboardView } from "@/features/dashboard/dashboard-view";
export default async function DashboardPage() {
  const data = await getDashboard(
    developmentDashboardRepository,
    developmentTeam.id,
  );
  return <DashboardView {...data} />;
}

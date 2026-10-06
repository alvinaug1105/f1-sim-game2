import { AppShell } from "@/components/layout/app-shell";
import { readCareerOverview, readCareerProgress } from "@/features/career/cached-reads";
import { careerShellContext } from "@/features/career/shell-context";
import { assertContentId } from "@/game/domain/content-repository";
/**
 * Every Career page renders inside the shell with its Career context (team, season, round, active weekend). If the
 * context cannot be read the shell still renders from the URL; the page itself reports the problem.
 */
export default async function CareerLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ careerId: string }> }>) {
  const { careerId } = await params;
  let valid = true;
  try {
    assertContentId(careerId);
  } catch {
    valid = false;
  }
  if (!valid) return <AppShell>{children}</AppShell>;
  const [overview, progress] = await Promise.all([readCareerOverview(careerId), readCareerProgress(careerId)]);
  const career = overview.ok && overview.data && progress.ok && progress.data ? careerShellContext(overview.data, progress.data) : null;
  return <AppShell career={career}>{children}</AppShell>;
}

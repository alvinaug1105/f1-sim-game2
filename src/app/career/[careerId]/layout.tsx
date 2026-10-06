import { AppShell } from "@/components/layout/app-shell";
import { readCareerOverview, readCareerProgress } from "@/features/career/cached-reads";
import { careerShellContext } from "@/features/career/shell-context";
import { assertContentId } from "@/game/domain/content-repository";
/**
 * Every Career page renders inside the global shell with its Career context (team identity, season, round, active
 * weekend). If the context cannot be read the shell still renders from the URL; the page reports the problem itself.
 */
export default async function CareerLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ careerId: string }> }>) {
  const { careerId } = await params;
  try {
    assertContentId(careerId);
  } catch {
    return <AppShell>{children}</AppShell>;
  }
  const [overview, progress] = await Promise.all([readCareerOverview(careerId), readCareerProgress(careerId)]);
  const career = overview.ok && overview.data && progress.ok && progress.data ? careerShellContext(overview.data, progress.data) : null;
  return <AppShell career={career}>{children}</AppShell>;
}

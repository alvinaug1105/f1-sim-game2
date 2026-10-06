import { notFound } from "next/navigation";
import { readCareerOverview, readCareerProgress, readChampionshipSource } from "@/features/career/cached-reads";
import { CareerUnavailable } from "@/features/career/views";
import { WeekendView } from "@/features/career/progression-views";
import { weekendHubExtras } from "@/features/career/weekend-hub";
import { assertContentId } from "@/game/domain/content-repository";
export const dynamic = "force-dynamic";
/** Race Weekend Hub. Circuit facts, results and drivers are optional context; the hub works from progression alone. */
export default async function WeekendPage({
  params,
}: {
  params: Promise<{ careerId: string; eventId: string }>;
}) {
  const { careerId, eventId } = await params;
  try {
    assertContentId(careerId);
    assertContentId(eventId);
  } catch {
    notFound();
  }
  const result = await readCareerProgress(careerId);
  if (!result.ok) return <CareerUnavailable titleKey="progression.weekend" />;
  if (!result.data || !result.data.events.some((e) => e.id === eventId))
    notFound();
  const [overview, source] = await Promise.all([readCareerOverview(careerId), readChampionshipSource(careerId)]);
  const extras = weekendHubExtras(eventId, overview.ok ? overview.data : null, source);
  return <WeekendView progress={result.data} eventId={eventId} extras={extras} />;
}

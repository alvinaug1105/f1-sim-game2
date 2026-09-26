import { notFound } from "next/navigation";
import { getChampionshipRepository } from "@/features/career/server";
import { CareerUnavailable } from "@/features/career/views";
import { weekendResultsPage } from "@/features/championship/model";
import { WeekendResultsView } from "@/features/championship/views";
import { assertContentId } from "@/game/domain/content-repository";
export const dynamic = "force-dynamic";
export default async function WeekendResultsPage({
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
  let source;
  try {
    source = await getChampionshipRepository().load(careerId);
  } catch (error) {
    console.error("Weekend results read failed", error);
    return <CareerUnavailable titleKey="championship.weekendResults" />;
  }
  if (!source) notFound();
  const page = weekendResultsPage(source, eventId);
  if (!page) notFound();
  return <WeekendResultsView page={page} />;
}

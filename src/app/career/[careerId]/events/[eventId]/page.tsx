import { notFound } from "next/navigation";
import {
  getProgressionRepository,
  loadCareerData,
} from "@/features/career/server";
import { CareerUnavailable } from "@/features/career/views";
import { WeekendView } from "@/features/career/progression-views";
import { assertContentId } from "@/game/domain/content-repository";
export const dynamic = "force-dynamic";
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
  const result = await loadCareerData(() =>
    getProgressionRepository().getProgress(careerId),
  );
  if (!result.ok) return <CareerUnavailable titleKey="progression.weekend" />;
  if (!result.data || !result.data.events.some((e) => e.id === eventId))
    notFound();
  return <WeekendView progress={result.data} eventId={eventId} />;
}

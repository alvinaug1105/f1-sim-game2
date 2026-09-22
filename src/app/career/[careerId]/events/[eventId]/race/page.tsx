import { notFound } from "next/navigation";
import { assertContentId } from "@/game/domain/content-repository";
import { getRaceRepository, loadCareerData } from "@/features/career/server";
import { CareerUnavailable } from "@/features/career/views";
import { RaceView } from "@/features/race/view";
export const dynamic = "force-dynamic";
export default async function RacePage({
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
    getRaceRepository().getRace(careerId, eventId),
  );
  if (!result.ok) return <CareerUnavailable titleKey="race.title" />;
  if (!result.data) notFound();
  return <RaceView data={result.data} />;
}

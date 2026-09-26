import { notFound } from "next/navigation";
import { assertContentId } from "@/game/domain/content-repository";
import { getRaceRepository, loadCareerData } from "@/features/career/server";
import { CareerUnavailable } from "@/features/career/views";
import { RaceView } from "@/features/race/view";
import { projectRaceView } from "@/features/race/projection";
export const dynamic = "force-dynamic";
/** The Sprint: the same Race v7 screen and engine, on the weekend's SPRINT session (Sprint Qualifying grid). */
export default async function SprintPage({
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
    getRaceRepository("SPRINT").getRace(careerId, eventId),
  );
  if (!result.ok) return <CareerUnavailable titleKey="sprint.title" />;
  if (!result.data) notFound();
  // Only the public projection crosses into the client: never the authoritative Race state.
  return <RaceView data={projectRaceView(result.data)} />;
}

import { notFound } from "next/navigation";
import { assertContentId } from "@/game/domain/content-repository";
import { getQualifyingRepository, loadCareerData } from "@/features/career/server";
import { CareerUnavailable } from "@/features/career/views";
import { QualifyingScreen } from "@/features/qualifying/qualifying-screen";
import { qualifyingView } from "@/features/qualifying/view-model";
export const dynamic = "force-dynamic";
export default async function QualifyingPage({
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
  // Only the lossy view projection crosses to the client component.
  const result = await loadCareerData(async () => {
    const data = await getQualifyingRepository().getQualifying(careerId, eventId);
    return data && qualifyingView(data);
  });
  if (!result.ok) return <CareerUnavailable titleKey="qualifying.title" />;
  if (!result.data) notFound();
  return <QualifyingScreen initial={result.data} />;
}

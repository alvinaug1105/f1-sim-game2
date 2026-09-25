import { notFound } from "next/navigation";
import { assertContentId } from "@/game/domain/content-repository";
import { getPracticeRepository, loadCareerData } from "@/features/career/server";
import { CareerUnavailable } from "@/features/career/views";
import { PracticeScreen } from "@/features/practice/practice-screen";
import { practiceView } from "@/features/practice/view-model";
export const dynamic = "force-dynamic";
export default async function PracticePage({
  params,
}: {
  params: Promise<{ careerId: string; eventId: string; sessionId: string }>;
}) {
  const { careerId, eventId, sessionId } = await params;
  try {
    assertContentId(careerId);
    assertContentId(eventId);
    assertContentId(sessionId);
  } catch {
    notFound();
  }
  // Only the lossy view projection crosses to the client component.
  const result = await loadCareerData(async () => {
    const data = await getPracticeRepository().getPractice(careerId, eventId, sessionId);
    return data && practiceView(data);
  });
  if (!result.ok) return <CareerUnavailable titleKey="practice.title" />;
  if (!result.data) notFound();
  return <PracticeScreen initial={result.data} />;
}

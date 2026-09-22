import { notFound } from "next/navigation";
import {
  getProgressionRepository,
  loadCareerData,
} from "@/features/career/server";
import { CareerOverviewView, CareerUnavailable } from "@/features/career/views";
import { assertContentId } from "@/game/domain/content-repository";
export const dynamic = "force-dynamic";
export default async function CareerPage({
  params,
}: {
  params: Promise<{ careerId: string }>;
}) {
  const { careerId } = await params;
  try {
    assertContentId(careerId);
  } catch {
    notFound();
  }
  const result = await loadCareerData((repository) =>
    repository.getCareerOverview(careerId),
  );
  if (!result.ok)
    return <CareerUnavailable titleKey="metadata.career" code={result.code} />;
  if (!result.data) notFound();
  const progress = await loadCareerData(() =>
    getProgressionRepository().getProgress(careerId),
  );
  if (!progress.ok) return <CareerUnavailable titleKey="metadata.career" />;
  if (!progress.data) notFound();
  return <CareerOverviewView overview={result.data} progress={progress.data} />;
}

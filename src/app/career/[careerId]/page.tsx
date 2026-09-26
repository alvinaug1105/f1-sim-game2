import { notFound } from "next/navigation";
import {
  getChampionshipRepository,
  getProgressionRepository,
  loadCareerData,
} from "@/features/career/server";
import { championshipSummary } from "@/features/championship/model";
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
  // The dashboard still renders if the standings cannot be read; the panel simply falls back to its link.
  const championship = await getChampionshipRepository()
    .load(careerId)
    .then((source) => (source ? championshipSummary(source) : null))
    .catch((error) => {
      console.error("Championship summary read failed", error);
      return null;
    });
  return (
    <CareerOverviewView
      overview={result.data}
      progress={progress.data}
      championship={championship}
    />
  );
}

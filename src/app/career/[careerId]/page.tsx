import { notFound } from "next/navigation";
import { readCareerOverview, readCareerProgress, readChampionshipSource } from "@/features/career/cached-reads";
import { circuitCard } from "@/features/career/circuit-card";
import { commandCentreModel } from "@/features/career/command-centre";
import { CommandCentreView } from "@/features/career/command-centre-view";
import { CareerUnavailable } from "@/features/career/views";
import { assertContentId } from "@/game/domain/content-repository";
import { weekendFormatOf } from "@/game/domain/progression";
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
  const result = await readCareerOverview(careerId);
  if (!result.ok)
    return <CareerUnavailable titleKey="metadata.career" code={result.code} />;
  if (!result.data) notFound();
  const progress = await readCareerProgress(careerId);
  if (!progress.ok) return <CareerUnavailable titleKey="metadata.career" />;
  if (!progress.data) notFound();
  // The Command Centre still renders if the Championship cannot be read; its modules degrade to links.
  const source = await readChampionshipSource(careerId);
  const next = result.data.nextEvent;
  const circuit = next ? circuitCard(next.circuit, weekendFormatOf(next.event)) : null;
  return <CommandCentreView model={commandCentreModel(result.data, progress.data, source, circuit)} />;
}

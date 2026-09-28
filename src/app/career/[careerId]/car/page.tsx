import { notFound } from "next/navigation";
import { assertContentId } from "@/game/domain/content-repository";
import { loadCareerData } from "@/features/career/server";
import { CarDevelopmentView } from "@/features/career/car-development-view";
import { CareerUnavailable } from "@/features/career/views";
export const dynamic = "force-dynamic";
export default async function CareerCarPage({ params }: { params: Promise<{ careerId: string }> }) {
  const { careerId } = await params;
  try { assertContentId(careerId); } catch { notFound(); }
  const result = await loadCareerData(repository => repository.getPlayerCar(careerId));
  if (!result.ok) return <CareerUnavailable titleKey="metadata.car" code={result.code} />;
  if (!result.data) notFound();
  return <CarDevelopmentView car={result.data} />;
}

import { notFound } from "next/navigation";
import { assertContentId } from "@/game/domain/content-repository";
import { getCarDesignRepository } from "@/features/career/server";
import { CarDevelopmentView } from "@/features/career/car-development-view";
import { CareerUnavailable } from "@/features/career/views";
export const dynamic = "force-dynamic";
export default async function CareerCarPage({ params }: { params: Promise<{ careerId: string }> }) {
  const { careerId } = await params;
  try { assertContentId(careerId); } catch { notFound(); }
  let overview;
  try {
    overview = await getCarDesignRepository().getOverview(careerId);
  } catch (error) {
    console.error("Car development read failed", error);
    return <CareerUnavailable titleKey="metadata.car" />;
  }
  if (!overview) notFound();
  return <CarDevelopmentView overview={overview} />;
}

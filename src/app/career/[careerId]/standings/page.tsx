import { notFound } from "next/navigation";
import { getChampionshipRepository } from "@/features/career/server";
import { CareerUnavailable } from "@/features/career/views";
import { parseCutoff, standingsPage } from "@/features/championship/model";
import { StandingsView } from "@/features/championship/views";
import { assertContentId } from "@/game/domain/content-repository";
export const dynamic = "force-dynamic";
export default async function StandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ careerId: string }>;
  searchParams: Promise<{ after?: string | string[]; tab?: string | string[] }>;
}) {
  const { careerId } = await params;
  const query = await searchParams;
  try {
    assertContentId(careerId);
  } catch {
    notFound();
  }
  let source;
  try {
    source = await getChampionshipRepository().load(careerId);
  } catch (error) {
    console.error("Championship read failed", error);
    return <CareerUnavailable titleKey="championship.standings" />;
  }
  if (!source) notFound();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // Derived at request time from completed results only: live, and never ahead of the Career.
  const page = standingsPage(source, parseCutoff(one(query.after)));
  return <StandingsView page={page} initialTab={one(query.tab) === "constructors" ? "constructors" : "drivers"} />;
}

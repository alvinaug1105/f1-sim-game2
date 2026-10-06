import { notFound } from "next/navigation";
import { readCareerOverview, readCareerProgress, readChampionshipSource } from "@/features/career/cached-reads";
import { circuitCard } from "@/features/career/circuit-card";
import { weekendDrivers } from "@/features/career/weekend-hub";
import { CareerUnavailable } from "@/features/career/views";
import { WeekendView } from "@/features/career/progression-views";
import { assertContentId } from "@/game/domain/content-repository";
import { weekendFormatOf } from "@/game/domain/progression";
export const dynamic = "force-dynamic";
export default async function WeekendPage({
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
  const result = await readCareerProgress(careerId);
  if (!result.ok) return <CareerUnavailable titleKey="progression.weekend" />;
  if (!result.data || !result.data.events.some((e) => e.id === eventId))
    notFound();
  // Presentation extras only: the hub renders without them if either read fails.
  const [overview, source] = await Promise.all([readCareerOverview(careerId), readChampionshipSource(careerId)]);
  const next = overview.ok ? overview.data?.nextEvent : null;
  return (
    <WeekendView
      progress={result.data}
      eventId={eventId}
      extras={{
        teamColor: overview.ok ? overview.data?.playerTeam.color : null,
        circuit: next && next.event.id === eventId ? circuitCard(next.circuit, weekendFormatOf(next.event)) : null,
        drivers: source ? weekendDrivers(source, eventId) : null,
      }}
    />
  );
}

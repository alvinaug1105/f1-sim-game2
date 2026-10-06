import { loadCareerData } from "@/features/career/server";
import { CareerListView, CareerUnavailable } from "@/features/career/views";
export const dynamic = "force-dynamic";
export default async function CareersPage() {
  const result = await loadCareerData((repository) => repository.listCareers());
  return result.ok ? (
    <CareerListView careers={result.data} />
  ) : (
    <CareerUnavailable titleKey="metadata.careers" code={result.code} />
  );
}

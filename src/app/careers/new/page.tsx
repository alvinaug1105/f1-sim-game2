import { loadCareerData } from "@/features/career/server";
import { NewCareerView, CareerUnavailable } from "@/features/career/views";
export const dynamic = "force-dynamic";
export default async function NewCareerPage() {
  const result = await loadCareerData((repository) =>
    repository.getCreationOptions(),
  );
  return result.ok ? (
    <NewCareerView options={result.data} />
  ) : (
    <CareerUnavailable titleKey="metadata.newCareer" code={result.code} />
  );
}

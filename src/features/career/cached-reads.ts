import "server-only";
import { cache } from "react";
import { getChampionshipRepository, getProgressionRepository, loadCareerData } from "./server";
/**
 * Request-scoped read de-duplication (UIX-A REDO). The Career layout (shell context) and the page below it read the
 * same overview / progress in one request; React `cache` makes each a single repository call. Same repositories, same
 * data, same error handling — presentation plumbing only.
 */
export const readCareerOverview = cache((careerId: string) => loadCareerData((repository) => repository.getCareerOverview(careerId)));
export const readCareerProgress = cache((careerId: string) => loadCareerData(() => getProgressionRepository().getProgress(careerId)));
/** The Championship read model; null when it cannot be read (pages degrade instead of failing). */
export const readChampionshipSource = cache((careerId: string) =>
  getChampionshipRepository()
    .load(careerId)
    .catch((error) => {
      console.error("Championship read failed", error);
      return null;
    }),
);

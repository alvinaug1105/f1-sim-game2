-- Phase 16 — Championship / Results (additive only; historical migrations untouched, existing rows preserved).

-- Standings are derived from the persisted, completed Sprint and Grand Prix classifications through a pure scoring
-- policy; no points totals or standings are stored. The only persisted input is which rule set a season scores under,
-- frozen into each Career. NULL = legacy content / Career created before Phase 16, which scores under F1_2026.
-- CreateEnum
CREATE TYPE "ScoringRulesVersion" AS ENUM ('F1_2026');

-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "scoringRulesVersion" "ScoringRulesVersion";

-- AlterTable
ALTER TABLE "CareerSeason" ADD COLUMN     "scoringRulesVersion" "ScoringRulesVersion";

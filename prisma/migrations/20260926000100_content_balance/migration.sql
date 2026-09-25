-- Content Expansion Pass A: nullable game-balance columns on season entries (additive).
-- NULL = legacy content/Careers created before Pass A, which keep the legacy development profile.
-- AlterTable
ALTER TABLE "SeasonTeamEntry" ADD COLUMN     "carPerformance" INTEGER;

-- AlterTable
ALTER TABLE "SeasonDriverEntry" ADD COLUMN     "consistency" INTEGER,
ADD COLUMN     "pace" INTEGER;

-- AlterTable
ALTER TABLE "CareerSeasonTeamEntry" ADD COLUMN     "carPerformance" INTEGER;

-- AlterTable
ALTER TABLE "CareerSeasonDriverEntry" ADD COLUMN     "consistency" INTEGER,
ADD COLUMN     "pace" INTEGER;


-- Balance values are development ratings on a 0–100 scale when present; a driver's pair is complete or absent
-- (explicit IS NOT NULL: a NULL comparison would otherwise satisfy the CHECK).
ALTER TABLE "SeasonTeamEntry" ADD CONSTRAINT "SeasonTeamEntry_balance_range" CHECK ("carPerformance" IS NULL OR "carPerformance" BETWEEN 0 AND 100);
ALTER TABLE "SeasonDriverEntry" ADD CONSTRAINT "SeasonDriverEntry_balance_range" CHECK (("pace" IS NULL AND "consistency" IS NULL) OR ("pace" IS NOT NULL AND "consistency" IS NOT NULL AND "pace" BETWEEN 0 AND 100 AND "consistency" BETWEEN 0 AND 100));
ALTER TABLE "CareerSeasonTeamEntry" ADD CONSTRAINT "CareerSeasonTeamEntry_balance_range" CHECK ("carPerformance" IS NULL OR "carPerformance" BETWEEN 0 AND 100);
ALTER TABLE "CareerSeasonDriverEntry" ADD CONSTRAINT "CareerSeasonDriverEntry_balance_range" CHECK (("pace" IS NULL AND "consistency" IS NULL) OR ("pace" IS NOT NULL AND "consistency" IS NOT NULL AND "pace" BETWEEN 0 AND 100 AND "consistency" BETWEEN 0 AND 100));

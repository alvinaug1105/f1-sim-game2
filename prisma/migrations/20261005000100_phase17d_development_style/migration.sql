CREATE TYPE "CarDevelopmentStyle" AS ENUM ('BALANCED', 'FIX_WEAKNESS', 'BUILD_STRENGTH');
ALTER TABLE "SeasonTeamEntry" ADD COLUMN "developmentStyle" "CarDevelopmentStyle";
ALTER TABLE "CareerSeasonTeamEntry" ADD COLUMN "developmentStyle" "CarDevelopmentStyle";

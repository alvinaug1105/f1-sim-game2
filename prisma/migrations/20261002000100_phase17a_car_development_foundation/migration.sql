-- Additive management data. Existing source and Career ratings remain NULL; old sessions are untouched.
CREATE TYPE "CarPartType" AS ENUM ('FRONT_WING', 'REAR_WING', 'UNDERFLOOR', 'SIDEPODS', 'CHASSIS', 'SUSPENSION');

ALTER TABLE "SeasonTeamEntry"
  ADD COLUMN "lowSpeedPerformance" INTEGER,
  ADD COLUMN "mediumSpeedPerformance" INTEGER,
  ADD COLUMN "highSpeedPerformance" INTEGER,
  ADD COLUMN "dragReductionPerformance" INTEGER,
  ADD COLUMN "drsEfficiencyPerformance" INTEGER;

ALTER TABLE "CareerSeasonTeamEntry"
  ADD COLUMN "lowSpeedPerformance" INTEGER,
  ADD COLUMN "mediumSpeedPerformance" INTEGER,
  ADD COLUMN "highSpeedPerformance" INTEGER,
  ADD COLUMN "dragReductionPerformance" INTEGER,
  ADD COLUMN "drsEfficiencyPerformance" INTEGER;

ALTER TABLE "SeasonTeamEntry" ADD CONSTRAINT "SeasonTeamEntry_car_stats_check" CHECK (
  ("lowSpeedPerformance" BETWEEN 0 AND 100 OR "lowSpeedPerformance" IS NULL) AND
  ("mediumSpeedPerformance" BETWEEN 0 AND 100 OR "mediumSpeedPerformance" IS NULL) AND
  ("highSpeedPerformance" BETWEEN 0 AND 100 OR "highSpeedPerformance" IS NULL) AND
  ("dragReductionPerformance" BETWEEN 0 AND 100 OR "dragReductionPerformance" IS NULL) AND
  ("drsEfficiencyPerformance" BETWEEN 0 AND 100 OR "drsEfficiencyPerformance" IS NULL)
);
ALTER TABLE "CareerSeasonTeamEntry" ADD CONSTRAINT "CareerSeasonTeamEntry_car_stats_check" CHECK (
  ("lowSpeedPerformance" BETWEEN 0 AND 100 OR "lowSpeedPerformance" IS NULL) AND
  ("mediumSpeedPerformance" BETWEEN 0 AND 100 OR "mediumSpeedPerformance" IS NULL) AND
  ("highSpeedPerformance" BETWEEN 0 AND 100 OR "highSpeedPerformance" IS NULL) AND
  ("dragReductionPerformance" BETWEEN 0 AND 100 OR "dragReductionPerformance" IS NULL) AND
  ("drsEfficiencyPerformance" BETWEEN 0 AND 100 OR "drsEfficiencyPerformance" IS NULL)
);

CREATE TABLE "CareerCarPartDesign" (
  "id" UUID NOT NULL,
  "careerId" UUID NOT NULL,
  "careerSeasonId" UUID NOT NULL,
  "careerTeamId" UUID NOT NULL,
  "partType" "CarPartType" NOT NULL,
  "version" INTEGER NOT NULL,
  "lowSpeed" INTEGER NOT NULL,
  "mediumSpeed" INTEGER NOT NULL,
  "highSpeed" INTEGER NOT NULL,
  "dragReduction" INTEGER NOT NULL,
  "drsEfficiency" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareerCarPartDesign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CareerCarPartDesign_rating_check" CHECK (
    "version" > 0 AND
    "lowSpeed" BETWEEN 0 AND 100 AND
    "mediumSpeed" BETWEEN 0 AND 100 AND
    "highSpeed" BETWEEN 0 AND 100 AND
    "dragReduction" BETWEEN 0 AND 100 AND
    "drsEfficiency" BETWEEN 0 AND 100
  )
);

CREATE UNIQUE INDEX "CareerCarPartDesign_scope_type_version_key"
  ON "CareerCarPartDesign" ("careerId", "careerSeasonId", "careerTeamId", "partType", "version");
CREATE INDEX "CareerCarPartDesign_scope_idx"
  ON "CareerCarPartDesign" ("careerId", "careerSeasonId", "careerTeamId");
ALTER TABLE "CareerCarPartDesign" ADD CONSTRAINT "CareerCarPartDesign_teamEntry_fkey"
  FOREIGN KEY ("careerId", "careerSeasonId", "careerTeamId")
  REFERENCES "CareerSeasonTeamEntry" ("careerId", "careerSeasonId", "careerTeamId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

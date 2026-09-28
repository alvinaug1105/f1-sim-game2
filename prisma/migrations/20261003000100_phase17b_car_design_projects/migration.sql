CREATE TYPE "CarDesignFocus" AS ENUM ('BALANCED', 'LOW_SPEED', 'MEDIUM_SPEED', 'HIGH_SPEED', 'DRAG_REDUCTION', 'DRS_EFFICIENCY');
CREATE TYPE "CarDesignProgramme" AS ENUM ('STANDARD', 'EXTENSIVE');
CREATE TYPE "CarDesignProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- The scoped key makes a project's base design provably belong to the same Career, season, team and part type.
CREATE UNIQUE INDEX "CareerCarPartDesign_scope_type_id_key"
  ON "CareerCarPartDesign" ("careerId", "careerSeasonId", "careerTeamId", "partType", "id");

CREATE TABLE "CareerCarDesignProject" (
  "id" UUID NOT NULL,
  "careerId" UUID NOT NULL,
  "careerSeasonId" UUID NOT NULL,
  "careerTeamId" UUID NOT NULL,
  "partType" "CarPartType" NOT NULL,
  "newVersion" INTEGER NOT NULL,
  "focus" "CarDesignFocus" NOT NULL,
  "programme" "CarDesignProgramme" NOT NULL,
  "status" "CarDesignProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAtCareerDate" DATE NOT NULL,
  "completesAtCareerDate" DATE NOT NULL,
  "basePartDesignId" UUID NOT NULL,
  "plannedLowSpeed" INTEGER NOT NULL,
  "plannedMediumSpeed" INTEGER NOT NULL,
  "plannedHighSpeed" INTEGER NOT NULL,
  "plannedDragReduction" INTEGER NOT NULL,
  "plannedDrsEfficiency" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  "completedAtCareerDate" DATE,
  CONSTRAINT "CareerCarDesignProject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CareerCarDesignProject_values_check" CHECK (
    "newVersion" > 1 AND
    "completesAtCareerDate" > "startedAtCareerDate" AND
    "plannedLowSpeed" BETWEEN 0 AND 100 AND
    "plannedMediumSpeed" BETWEEN 0 AND 100 AND
    "plannedHighSpeed" BETWEEN 0 AND 100 AND
    "plannedDragReduction" BETWEEN 0 AND 100 AND
    "plannedDrsEfficiency" BETWEEN 0 AND 100 AND
    (("status" = 'ACTIVE' AND "completedAt" IS NULL AND "completedAtCareerDate" IS NULL) OR
     ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedAtCareerDate" >= "completesAtCareerDate"))
  )
);

CREATE UNIQUE INDEX "CareerCarDesignProject_scope_type_version_key"
  ON "CareerCarDesignProject" ("careerId", "careerSeasonId", "careerTeamId", "partType", "newVersion");
CREATE UNIQUE INDEX "CareerCarDesignProject_one_active_type_key"
  ON "CareerCarDesignProject" ("careerId", "careerTeamId", "partType") WHERE "status" = 'ACTIVE';
CREATE INDEX "CareerCarDesignProject_scope_status_idx"
  ON "CareerCarDesignProject" ("careerId", "careerSeasonId", "careerTeamId", "status");
CREATE INDEX "CareerCarDesignProject_due_idx"
  ON "CareerCarDesignProject" ("careerId", "status", "completesAtCareerDate");
ALTER TABLE "CareerCarDesignProject" ADD CONSTRAINT "CareerCarDesignProject_teamEntry_fkey"
  FOREIGN KEY ("careerId", "careerSeasonId", "careerTeamId")
  REFERENCES "CareerSeasonTeamEntry" ("careerId", "careerSeasonId", "careerTeamId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CareerCarDesignProject" ADD CONSTRAINT "CareerCarDesignProject_basePart_fkey"
  FOREIGN KEY ("careerId", "careerSeasonId", "careerTeamId", "partType", "basePartDesignId")
  REFERENCES "CareerCarPartDesign" ("careerId", "careerSeasonId", "careerTeamId", "partType", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

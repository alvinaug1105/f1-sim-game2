CREATE TYPE "CarSlot" AS ENUM ('CAR_1', 'CAR_2');
CREATE TYPE "CarManufacturingStatus" AS ENUM ('ACTIVE', 'COMPLETED');

ALTER TABLE "CareerSeasonDriverEntry" ADD COLUMN "carSlot" "CarSlot";
CREATE UNIQUE INDEX "CareerSeasonDriverEntry_team_slot_key"
  ON "CareerSeasonDriverEntry" ("careerId", "careerSeasonId", "careerSeasonTeamEntryId", "carSlot");
ALTER TABLE "CareerSeasonDriverEntry" ADD CONSTRAINT "CareerSeasonDriverEntry_slot_role_check"
  CHECK ("carSlot" IS NULL OR "role" = 'RACE_DRIVER');

CREATE TABLE "CareerCarPartUnit" (
  "id" UUID NOT NULL,
  "careerId" UUID NOT NULL,
  "careerSeasonId" UUID NOT NULL,
  "careerTeamId" UUID NOT NULL,
  "partType" "CarPartType" NOT NULL,
  "designId" UUID NOT NULL,
  "unitNumber" INTEGER NOT NULL,
  "manufacturedAtCareerDate" DATE NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CareerCarPartUnit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CareerCarPartUnit_unitNumber_check" CHECK ("unitNumber" > 0),
  CONSTRAINT "CareerCarPartUnit_teamEntry_fkey" FOREIGN KEY ("careerId", "careerSeasonId", "careerTeamId")
    REFERENCES "CareerSeasonTeamEntry" ("careerId", "careerSeasonId", "careerTeamId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CareerCarPartUnit_design_fkey" FOREIGN KEY ("careerId", "careerSeasonId", "careerTeamId", "partType", "designId")
    REFERENCES "CareerCarPartDesign" ("careerId", "careerSeasonId", "careerTeamId", "partType", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "CareerCarPartUnit_designId_unitNumber_key" ON "CareerCarPartUnit" ("designId", "unitNumber");
CREATE UNIQUE INDEX "CareerCarPartUnit_scope_type_id_key"
  ON "CareerCarPartUnit" ("careerId", "careerSeasonId", "careerTeamId", "partType", "id");
CREATE INDEX "CareerCarPartUnit_scope_design_idx"
  ON "CareerCarPartUnit" ("careerId", "careerSeasonId", "careerTeamId", "designId");

CREATE TABLE "CareerCarFitment" (
  "careerId" UUID NOT NULL,
  "careerSeasonId" UUID NOT NULL,
  "careerTeamId" UUID NOT NULL,
  "carSlot" "CarSlot" NOT NULL,
  "partType" "CarPartType" NOT NULL,
  "partUnitId" UUID NOT NULL,
  CONSTRAINT "CareerCarFitment_pkey" PRIMARY KEY ("careerId", "careerSeasonId", "careerTeamId", "carSlot", "partType"),
  CONSTRAINT "CareerCarFitment_teamEntry_fkey" FOREIGN KEY ("careerId", "careerSeasonId", "careerTeamId")
    REFERENCES "CareerSeasonTeamEntry" ("careerId", "careerSeasonId", "careerTeamId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CareerCarFitment_unit_fkey" FOREIGN KEY ("careerId", "careerSeasonId", "careerTeamId", "partType", "partUnitId")
    REFERENCES "CareerCarPartUnit" ("careerId", "careerSeasonId", "careerTeamId", "partType", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "CareerCarFitment_partUnitId_key" ON "CareerCarFitment" ("partUnitId");
CREATE UNIQUE INDEX "CareerCarFitment_scope_type_unit_key"
  ON "CareerCarFitment" ("careerId", "careerSeasonId", "careerTeamId", "partType", "partUnitId");

CREATE TABLE "CareerCarManufacturingOrder" (
  "id" UUID NOT NULL,
  "careerId" UUID NOT NULL,
  "careerSeasonId" UUID NOT NULL,
  "careerTeamId" UUID NOT NULL,
  "partType" "CarPartType" NOT NULL,
  "designId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "CarManufacturingStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAtCareerDate" DATE NOT NULL,
  "completesAtCareerDate" DATE NOT NULL,
  "completedAtCareerDate" DATE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "CareerCarManufacturingOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CareerCarManufacturingOrder_values_check" CHECK (
    "quantity" IN (1, 2) AND "completesAtCareerDate" > "startedAtCareerDate" AND
    (("status" = 'ACTIVE' AND "completedAt" IS NULL AND "completedAtCareerDate" IS NULL) OR
     ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedAtCareerDate" >= "completesAtCareerDate"))
  ),
  CONSTRAINT "CareerCarManufacturingOrder_teamEntry_fkey" FOREIGN KEY ("careerId", "careerSeasonId", "careerTeamId")
    REFERENCES "CareerSeasonTeamEntry" ("careerId", "careerSeasonId", "careerTeamId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CareerCarManufacturingOrder_design_fkey" FOREIGN KEY ("careerId", "careerSeasonId", "careerTeamId", "partType", "designId")
    REFERENCES "CareerCarPartDesign" ("careerId", "careerSeasonId", "careerTeamId", "partType", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "CareerCarManufacturingOrder_one_active_design_key"
  ON "CareerCarManufacturingOrder" ("designId") WHERE "status" = 'ACTIVE';
CREATE INDEX "CareerCarManufacturingOrder_due_idx" ON "CareerCarManufacturingOrder" ("careerId", "status", "completesAtCareerDate");
CREATE INDEX "CareerCarManufacturingOrder_scope_status_idx" ON "CareerCarManufacturingOrder" ("careerId", "careerSeasonId", "careerTeamId", "status");

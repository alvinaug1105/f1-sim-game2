-- CreateEnum
CREATE TYPE "CareerStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CareerSeasonStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CareerEventStatus" AS ENUM ('UPCOMING', 'CURRENT', 'COMPLETED');

-- CreateTable
CREATE TABLE "Career" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sourceGameDatabaseId" UUID NOT NULL,
    "sourceGameDatabaseVersion" TEXT NOT NULL,
    "sourceSeasonId" UUID NOT NULL,
    "currentDate" DATE NOT NULL,
    "playerTeamId" UUID NOT NULL,
    "currentSeasonId" UUID NOT NULL,
    "status" "CareerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Career_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerTeam" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "sourceTeamId" UUID,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "secondaryColor" VARCHAR(7),
    "countryCode" VARCHAR(2) NOT NULL,
    "foundedYear" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CareerTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerDriver" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "sourceDriverId" UUID,
    "key" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "nationalityCode" VARCHAR(2) NOT NULL,
    "preferredNumber" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CareerDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerCircuit" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "sourceCircuitId" UUID,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "city" TEXT,
    "lengthMeters" INTEGER NOT NULL,
    "defaultLapCount" INTEGER NOT NULL,

    CONSTRAINT "CareerCircuit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerSeason" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "sourceSeasonId" UUID,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CareerSeasonStatus" NOT NULL DEFAULT 'UPCOMING',
    "startDate" DATE,
    "endDate" DATE,

    CONSTRAINT "CareerSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerSeasonTeamEntry" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerSeasonId" UUID NOT NULL,
    "careerTeamId" UUID NOT NULL,
    "entryOrder" INTEGER NOT NULL,

    CONSTRAINT "CareerSeasonTeamEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerSeasonDriverEntry" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerSeasonId" UUID NOT NULL,
    "careerDriverId" UUID NOT NULL,
    "careerSeasonTeamEntryId" UUID NOT NULL,
    "carNumber" INTEGER,
    "role" "DriverRole" NOT NULL,

    CONSTRAINT "CareerSeasonDriverEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerCalendarEvent" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerSeasonId" UUID NOT NULL,
    "careerCircuitId" UUID NOT NULL,
    "sourceCalendarEventId" UUID,
    "round" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "CareerEventStatus" NOT NULL DEFAULT 'UPCOMING',

    CONSTRAINT "CareerCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Career_updatedAt_id_idx" ON "Career"("updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerTeam_careerId_id_key" ON "CareerTeam"("careerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerTeam_careerId_key_key" ON "CareerTeam"("careerId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CareerDriver_careerId_id_key" ON "CareerDriver"("careerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerDriver_careerId_key_key" ON "CareerDriver"("careerId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CareerCircuit_careerId_id_key" ON "CareerCircuit"("careerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerCircuit_careerId_key_key" ON "CareerCircuit"("careerId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSeason_careerId_id_key" ON "CareerSeason"("careerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSeason_careerId_year_key" ON "CareerSeason"("careerId", "year");

-- CreateIndex
CREATE INDEX "CareerSeasonTeamEntry_careerId_careerTeamId_idx" ON "CareerSeasonTeamEntry"("careerId", "careerTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSeasonTeamEntry_careerId_careerSeasonId_id_key" ON "CareerSeasonTeamEntry"("careerId", "careerSeasonId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSeasonTeamEntry_careerId_careerSeasonId_careerTeamId_key" ON "CareerSeasonTeamEntry"("careerId", "careerSeasonId", "careerTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSeasonTeamEntry_careerId_careerSeasonId_entryOrder_key" ON "CareerSeasonTeamEntry"("careerId", "careerSeasonId", "entryOrder");

-- CreateIndex
CREATE INDEX "CareerSeasonDriverEntry_careerId_careerDriverId_idx" ON "CareerSeasonDriverEntry"("careerId", "careerDriverId");

-- CreateIndex
CREATE INDEX "CareerSeasonDriverEntry_careerId_careerSeasonId_careerSeaso_idx" ON "CareerSeasonDriverEntry"("careerId", "careerSeasonId", "careerSeasonTeamEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSeasonDriverEntry_careerId_careerSeasonId_careerDrive_key" ON "CareerSeasonDriverEntry"("careerId", "careerSeasonId", "careerDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSeasonDriverEntry_careerId_careerSeasonId_carNumber_key" ON "CareerSeasonDriverEntry"("careerId", "careerSeasonId", "carNumber");

-- CreateIndex
CREATE INDEX "CareerCalendarEvent_careerId_careerCircuitId_idx" ON "CareerCalendarEvent"("careerId", "careerCircuitId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerCalendarEvent_careerId_careerSeasonId_round_key" ON "CareerCalendarEvent"("careerId", "careerSeasonId", "round");

-- AddForeignKey
ALTER TABLE "Career" ADD CONSTRAINT "Career_id_playerTeamId_fkey" FOREIGN KEY ("id", "playerTeamId") REFERENCES "CareerTeam"("careerId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Career" ADD CONSTRAINT "Career_id_currentSeasonId_fkey" FOREIGN KEY ("id", "currentSeasonId") REFERENCES "CareerSeason"("careerId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CareerTeam" ADD CONSTRAINT "CareerTeam_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "Career"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerDriver" ADD CONSTRAINT "CareerDriver_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "Career"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerCircuit" ADD CONSTRAINT "CareerCircuit_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "Career"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerSeason" ADD CONSTRAINT "CareerSeason_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "Career"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerSeasonTeamEntry" ADD CONSTRAINT "CareerSeasonTeamEntry_careerId_careerSeasonId_fkey" FOREIGN KEY ("careerId", "careerSeasonId") REFERENCES "CareerSeason"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerSeasonTeamEntry" ADD CONSTRAINT "CareerSeasonTeamEntry_careerId_careerTeamId_fkey" FOREIGN KEY ("careerId", "careerTeamId") REFERENCES "CareerTeam"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerSeasonDriverEntry" ADD CONSTRAINT "CareerSeasonDriverEntry_careerId_careerSeasonId_careerSeas_fkey" FOREIGN KEY ("careerId", "careerSeasonId", "careerSeasonTeamEntryId") REFERENCES "CareerSeasonTeamEntry"("careerId", "careerSeasonId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerSeasonDriverEntry" ADD CONSTRAINT "CareerSeasonDriverEntry_careerId_careerDriverId_fkey" FOREIGN KEY ("careerId", "careerDriverId") REFERENCES "CareerDriver"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerCalendarEvent" ADD CONSTRAINT "CareerCalendarEvent_careerId_careerSeasonId_fkey" FOREIGN KEY ("careerId", "careerSeasonId") REFERENCES "CareerSeason"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerCalendarEvent" ADD CONSTRAINT "CareerCalendarEvent_careerId_careerCircuitId_fkey" FOREIGN KEY ("careerId", "careerCircuitId") REFERENCES "CareerCircuit"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma cannot express deferrability. Preallocated IDs allow NOT NULL root pointers;
-- validate their Career-scoped foreign keys only after the world has been inserted atomically.
ALTER TABLE "Career" ALTER CONSTRAINT "Career_id_playerTeamId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Career" ALTER CONSTRAINT "Career_id_currentSeasonId_fkey" DEFERRABLE INITIALLY DEFERRED;
-- Scalar invariants follow source-content validation, without any source-row foreign keys.
ALTER TABLE "Career" ADD CONSTRAINT "Career_name_check" CHECK (btrim("name") <> '');
ALTER TABLE "CareerTeam" ADD CONSTRAINT "CareerTeam_values_check" CHECK (btrim("name") <> '' AND btrim("shortName") <> '' AND "countryCode" ~ '^[A-Z]{2}$' AND "color" ~ '^#[0-9A-Fa-f]{6}$' AND ("secondaryColor" IS NULL OR "secondaryColor" ~ '^#[0-9A-Fa-f]{6}$') AND ("foundedYear" IS NULL OR "foundedYear" > 0));
ALTER TABLE "CareerDriver" ADD CONSTRAINT "CareerDriver_values_check" CHECK (btrim("firstName") <> '' AND btrim("lastName") <> '' AND btrim("abbreviation") <> '' AND "nationalityCode" ~ '^[A-Z]{2}$' AND ("preferredNumber" IS NULL OR "preferredNumber" > 0));
ALTER TABLE "CareerCircuit" ADD CONSTRAINT "CareerCircuit_values_check" CHECK (btrim("name") <> '' AND "countryCode" ~ '^[A-Z]{2}$' AND "lengthMeters" > 0 AND "defaultLapCount" > 0);
ALTER TABLE "CareerSeason" ADD CONSTRAINT "CareerSeason_values_check" CHECK ("year" > 0 AND btrim("name") <> '' AND ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate"));
ALTER TABLE "CareerSeasonTeamEntry" ADD CONSTRAINT "CareerSeasonTeamEntry_order_check" CHECK ("entryOrder" > 0);
ALTER TABLE "CareerSeasonDriverEntry" ADD CONSTRAINT "CareerSeasonDriverEntry_number_check" CHECK (("carNumber" IS NULL OR "carNumber" > 0) AND ("role" <> 'RACE_DRIVER' OR "carNumber" IS NOT NULL));
ALTER TABLE "CareerCalendarEvent" ADD CONSTRAINT "CareerCalendarEvent_values_check" CHECK ("round" > 0 AND btrim("name") <> '' AND "endDate" >= "startDate");
ALTER TABLE "CareerTeam" ADD CONSTRAINT "CareerTeam_key_check" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "CareerDriver" ADD CONSTRAINT "CareerDriver_key_check" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "CareerCircuit" ADD CONSTRAINT "CareerCircuit_key_check" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

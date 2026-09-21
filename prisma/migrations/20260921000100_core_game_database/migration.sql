-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DriverRole" AS ENUM ('RACE_DRIVER', 'RESERVE_DRIVER');

-- CreateTable
CREATE TABLE "GameDatabase" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GameDatabase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "gameDatabaseId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "secondaryColor" VARCHAR(7),
    "countryCode" VARCHAR(2) NOT NULL,
    "foundedYear" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" UUID NOT NULL,
    "gameDatabaseId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "nationalityCode" VARCHAR(2) NOT NULL,
    "preferredNumber" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Circuit" (
    "id" UUID NOT NULL,
    "gameDatabaseId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "city" TEXT,
    "lengthMeters" INTEGER NOT NULL,
    "defaultLapCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Circuit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" UUID NOT NULL,
    "gameDatabaseId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonTeamEntry" (
    "id" UUID NOT NULL,
    "gameDatabaseId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "entryOrder" INTEGER NOT NULL,

    CONSTRAINT "SeasonTeamEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonDriverEntry" (
    "id" UUID NOT NULL,
    "gameDatabaseId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "carNumber" INTEGER,
    "role" "DriverRole" NOT NULL,

    CONSTRAINT "SeasonDriverEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL,
    "gameDatabaseId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "circuitId" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameDatabase_key_key" ON "GameDatabase"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Team_gameDatabaseId_key_key" ON "Team"("gameDatabaseId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Team_gameDatabaseId_id_key" ON "Team"("gameDatabaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_gameDatabaseId_key_key" ON "Driver"("gameDatabaseId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_gameDatabaseId_id_key" ON "Driver"("gameDatabaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Circuit_gameDatabaseId_key_key" ON "Circuit"("gameDatabaseId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Circuit_gameDatabaseId_id_key" ON "Circuit"("gameDatabaseId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Season_gameDatabaseId_key_key" ON "Season"("gameDatabaseId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Season_gameDatabaseId_id_key" ON "Season"("gameDatabaseId", "id");

-- CreateIndex
CREATE INDEX "SeasonTeamEntry_gameDatabaseId_teamId_idx" ON "SeasonTeamEntry"("gameDatabaseId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonTeamEntry_gameDatabaseId_seasonId_teamId_key" ON "SeasonTeamEntry"("gameDatabaseId", "seasonId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonTeamEntry_gameDatabaseId_seasonId_entryOrder_key" ON "SeasonTeamEntry"("gameDatabaseId", "seasonId", "entryOrder");

-- CreateIndex
CREATE INDEX "SeasonDriverEntry_gameDatabaseId_driverId_idx" ON "SeasonDriverEntry"("gameDatabaseId", "driverId");

-- CreateIndex
CREATE INDEX "SeasonDriverEntry_gameDatabaseId_seasonId_teamId_idx" ON "SeasonDriverEntry"("gameDatabaseId", "seasonId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonDriverEntry_gameDatabaseId_seasonId_driverId_key" ON "SeasonDriverEntry"("gameDatabaseId", "seasonId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonDriverEntry_gameDatabaseId_seasonId_carNumber_key" ON "SeasonDriverEntry"("gameDatabaseId", "seasonId", "carNumber");

-- CreateIndex
CREATE INDEX "CalendarEvent_gameDatabaseId_circuitId_idx" ON "CalendarEvent"("gameDatabaseId", "circuitId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_gameDatabaseId_seasonId_round_key" ON "CalendarEvent"("gameDatabaseId", "seasonId", "round");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_gameDatabaseId_fkey" FOREIGN KEY ("gameDatabaseId") REFERENCES "GameDatabase"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_gameDatabaseId_fkey" FOREIGN KEY ("gameDatabaseId") REFERENCES "GameDatabase"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Circuit" ADD CONSTRAINT "Circuit_gameDatabaseId_fkey" FOREIGN KEY ("gameDatabaseId") REFERENCES "GameDatabase"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_gameDatabaseId_fkey" FOREIGN KEY ("gameDatabaseId") REFERENCES "GameDatabase"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeasonTeamEntry" ADD CONSTRAINT "SeasonTeamEntry_gameDatabaseId_seasonId_fkey" FOREIGN KEY ("gameDatabaseId", "seasonId") REFERENCES "Season"("gameDatabaseId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeasonTeamEntry" ADD CONSTRAINT "SeasonTeamEntry_gameDatabaseId_teamId_fkey" FOREIGN KEY ("gameDatabaseId", "teamId") REFERENCES "Team"("gameDatabaseId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeasonDriverEntry" ADD CONSTRAINT "SeasonDriverEntry_gameDatabaseId_seasonId_teamId_fkey" FOREIGN KEY ("gameDatabaseId", "seasonId", "teamId") REFERENCES "SeasonTeamEntry"("gameDatabaseId", "seasonId", "teamId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "SeasonDriverEntry" ADD CONSTRAINT "SeasonDriverEntry_gameDatabaseId_driverId_fkey" FOREIGN KEY ("gameDatabaseId", "driverId") REFERENCES "Driver"("gameDatabaseId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_gameDatabaseId_seasonId_fkey" FOREIGN KEY ("gameDatabaseId", "seasonId") REFERENCES "Season"("gameDatabaseId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_gameDatabaseId_circuitId_fkey" FOREIGN KEY ("gameDatabaseId", "circuitId") REFERENCES "Circuit"("gameDatabaseId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Custom CHECK constraints: Prisma's schema DSL cannot express these scalar invariants.
ALTER TABLE "GameDatabase" ADD CONSTRAINT "GameDatabase_content_check" CHECK ("schemaVersion" > 0 AND "key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND btrim("name") <> '' AND btrim("version") <> '');
ALTER TABLE "Team" ADD CONSTRAINT "Team_key_check" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_key_check" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Circuit" ADD CONSTRAINT "Circuit_key_check" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Season" ADD CONSTRAINT "Season_key_check" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "Team" ADD CONSTRAINT "Team_content_check" CHECK (btrim("name") <> '' AND btrim("shortName") <> '' AND "countryCode" ~ '^[A-Z]{2}$' AND "color" ~ '^#[0-9A-Fa-f]{6}$' AND ("secondaryColor" IS NULL OR "secondaryColor" ~ '^#[0-9A-Fa-f]{6}$') AND ("foundedYear" IS NULL OR "foundedYear" > 0));
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_content_check" CHECK (btrim("firstName") <> '' AND btrim("lastName") <> '' AND btrim("abbreviation") <> '' AND "nationalityCode" ~ '^[A-Z]{2}$' AND ("preferredNumber" IS NULL OR "preferredNumber" > 0));
ALTER TABLE "Circuit" ADD CONSTRAINT "Circuit_content_check" CHECK (btrim("name") <> '' AND "countryCode" ~ '^[A-Z]{2}$' AND "lengthMeters" > 0 AND "defaultLapCount" > 0);
ALTER TABLE "Season" ADD CONSTRAINT "Season_content_check" CHECK (btrim("name") <> '' AND "year" > 0);
ALTER TABLE "SeasonTeamEntry" ADD CONSTRAINT "SeasonTeamEntry_order_check" CHECK ("entryOrder" > 0);
ALTER TABLE "SeasonDriverEntry" ADD CONSTRAINT "SeasonDriverEntry_number_check" CHECK (("carNumber" IS NULL OR "carNumber" > 0) AND ("role" <> 'RACE_DRIVER' OR "carNumber" IS NOT NULL));
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_content_check" CHECK (btrim("name") <> '' AND "round" > 0 AND "endDate" >= "startDate");

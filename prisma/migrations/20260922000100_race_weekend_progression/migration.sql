-- CreateEnum
CREATE TYPE "CareerWeekendStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CareerSessionType" AS ENUM ('PRACTICE_1', 'PRACTICE_2', 'PRACTICE_3', 'QUALIFYING', 'RACE');

-- CreateEnum
CREATE TYPE "CareerSessionStatus" AS ENUM ('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateTable
CREATE TABLE "CareerRaceWeekend" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerSeasonId" UUID NOT NULL,
    "careerCalendarEventId" UUID NOT NULL,
    "status" "CareerWeekendStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CareerRaceWeekend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerSession" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerRaceWeekendId" UUID NOT NULL,
    "type" "CareerSessionType" NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "CareerSessionStatus" NOT NULL,
    "startedAtCareerDate" DATE,
    "completedAtCareerDate" DATE,

    CONSTRAINT "CareerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareerRaceWeekend_careerCalendarEventId_key" ON "CareerRaceWeekend"("careerCalendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerRaceWeekend_careerId_id_key" ON "CareerRaceWeekend"("careerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerRaceWeekend_careerId_careerSeasonId_careerCalendarEve_key" ON "CareerRaceWeekend"("careerId", "careerSeasonId", "careerCalendarEventId");

-- CreateIndex
CREATE INDEX "CareerSession_careerId_careerRaceWeekendId_idx" ON "CareerSession"("careerId", "careerRaceWeekendId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSession_careerRaceWeekendId_type_key" ON "CareerSession"("careerRaceWeekendId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSession_careerRaceWeekendId_order_key" ON "CareerSession"("careerRaceWeekendId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CareerCalendarEvent_careerId_careerSeasonId_id_key" ON "CareerCalendarEvent"("careerId", "careerSeasonId", "id");

-- AddForeignKey
ALTER TABLE "CareerRaceWeekend" ADD CONSTRAINT "CareerRaceWeekend_careerId_careerSeasonId_careerCalendarEv_fkey" FOREIGN KEY ("careerId", "careerSeasonId", "careerCalendarEventId") REFERENCES "CareerCalendarEvent"("careerId", "careerSeasonId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerSession" ADD CONSTRAINT "CareerSession_careerId_careerRaceWeekendId_fkey" FOREIGN KEY ("careerId", "careerRaceWeekendId") REFERENCES "CareerRaceWeekend"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Lifecycle constraints not expressible in Prisma's schema DSL.
CREATE UNIQUE INDEX "Career_one_current_event" ON "CareerCalendarEvent" ("careerId") WHERE "status" = 'CURRENT';
CREATE UNIQUE INDEX "Career_one_active_weekend" ON "CareerRaceWeekend" ("careerId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "Weekend_one_current_session" ON "CareerSession" ("careerRaceWeekendId") WHERE "status" IN ('AVAILABLE', 'IN_PROGRESS');
ALTER TABLE "CareerSession" ADD CONSTRAINT "Session_positive_order" CHECK ("order" > 0);
ALTER TABLE "CareerSession" ADD CONSTRAINT "Session_skip_practice_only" CHECK ("status" <> 'SKIPPED' OR "type" IN ('PRACTICE_1', 'PRACTICE_2', 'PRACTICE_3'));
ALTER TABLE "CareerSession" ADD CONSTRAINT "Session_dates" CHECK (
  ("completedAtCareerDate" IS NULL OR "startedAtCareerDate" IS NULL OR "completedAtCareerDate" >= "startedAtCareerDate") AND
  (("status" IN ('LOCKED', 'AVAILABLE') AND "startedAtCareerDate" IS NULL AND "completedAtCareerDate" IS NULL) OR
   ("status" = 'IN_PROGRESS' AND "startedAtCareerDate" IS NOT NULL AND "completedAtCareerDate" IS NULL) OR
   ("status" = 'COMPLETED' AND "startedAtCareerDate" IS NOT NULL AND "completedAtCareerDate" IS NOT NULL) OR
   ("status" = 'SKIPPED' AND "startedAtCareerDate" IS NULL AND "completedAtCareerDate" IS NOT NULL))
);
ALTER TABLE "CareerRaceWeekend" ADD CONSTRAINT "Weekend_completion_timestamp" CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));

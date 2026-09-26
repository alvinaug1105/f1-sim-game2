-- Phase 15 — Sprint Weekend (additive only; historical migrations untouched, existing rows preserved).

-- Weekend format: calendar data snapshotted into each Career event. NULL = legacy content / Career created before
-- Phase 15, which always runs the STANDARD weekend (P1 → P2 → P3 → Q → Race).
-- CreateEnum
CREATE TYPE "WeekendFormat" AS ENUM ('STANDARD', 'SPRINT');

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "weekendFormat" "WeekendFormat";

-- AlterTable
ALTER TABLE "CareerCalendarEvent" ADD COLUMN     "weekendFormat" "WeekendFormat";

-- New session types for Sprint weekends (P1 → SPRINT_QUALIFYING → SPRINT → QUALIFYING → RACE).
-- AlterEnum
ALTER TYPE "CareerSessionType" ADD VALUE 'SPRINT_QUALIFYING';
ALTER TYPE "CareerSessionType" ADD VALUE 'SPRINT';

-- Widen the simulation session-type checks. The new enum values cannot be referenced as enum literals in the same
-- transaction that adds them, so the checks compare the text form (equivalent, and still exact).
-- Qualifying persistence is shared by Grand Prix Qualifying and Sprint Qualifying (disambiguated by session type).
ALTER TABLE "CareerQualifyingSimulation" DROP CONSTRAINT "CareerQualifyingSimulation_ranges";
ALTER TABLE "CareerQualifyingSimulation" ADD CONSTRAINT "CareerQualifyingSimulation_ranges" CHECK (
  "sessionType"::text IN ('QUALIFYING', 'SPRINT_QUALIFYING') AND "qualifyingVersion" = 1 AND "seed" BETWEEN 0 AND 4294967295 AND "rngState" BETWEEN 0 AND 4294967295
  AND "stepMs" > 0 AND "weatherTickMs" >= "stepMs" AND "baseLapTimeMs" > 0 AND "phaseElapsedMs" >= 0 AND "sessionElapsedMs" >= 0
  AND "evolution" BETWEEN 0 AND 1000 AND "trackWater" BETWEEN 0 AND 1000 AND "weatherTick" >= 1
  AND ("status" = 'RUNNING' OR ("phase" = 'Q3' AND "phaseStatus" = 'COMPLETE'))
);
-- Race persistence is shared by the Grand Prix and the Sprint (disambiguated by session type).
ALTER TABLE "CareerRaceSimulation" DROP CONSTRAINT "Race_session_type";
ALTER TABLE "CareerRaceSimulation" ADD CONSTRAINT "Race_session_type" CHECK ("sessionType"::text IN ('RACE', 'SPRINT'));

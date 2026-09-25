-- Phase 14: Qualifying (additive). One Career QUALIFYING session with internal Q1/Q2/Q3 phases.
-- CreateEnum
CREATE TYPE "QualifyingPhase" AS ENUM ('Q1', 'Q2', 'Q3');

-- CreateEnum
CREATE TYPE "QualifyingPhaseStatus" AS ENUM ('RUNNING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "QualifyingStatus" AS ENUM ('RUNNING', 'FINISHED');

-- CreateEnum
CREATE TYPE "QualifyingLocation" AS ENUM ('GARAGE', 'OUT_LAP', 'FLYING', 'IN_LAP');

-- CreateEnum
CREATE TYPE "QualifyingController" AS ENUM ('PLAYER', 'AI');

-- CreateTable
CREATE TABLE "CareerQualifyingSimulation" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerSessionId" UUID NOT NULL,
    "sessionType" "CareerSessionType" NOT NULL,
    "qualifyingVersion" INTEGER NOT NULL,
    "seed" BIGINT NOT NULL,
    "rngState" BIGINT NOT NULL,
    "stepMs" INTEGER NOT NULL,
    "weatherTickMs" INTEGER NOT NULL,
    "baseLapTimeMs" INTEGER NOT NULL,
    "formatProfile" JSONB NOT NULL,
    "tyreProfile" JSONB NOT NULL,
    "weatherProfile" JSONB NOT NULL,
    "status" "QualifyingStatus" NOT NULL,
    "phase" "QualifyingPhase" NOT NULL,
    "phaseStatus" "QualifyingPhaseStatus" NOT NULL,
    "phaseElapsedMs" INTEGER NOT NULL,
    "sessionElapsedMs" INTEGER NOT NULL,
    "rainfallIntensity" INTEGER NOT NULL,
    "airTemperatureMilliC" INTEGER NOT NULL,
    "trackTemperatureMilliC" INTEGER NOT NULL,
    "trackWater" INTEGER NOT NULL,
    "drsState" TEXT NOT NULL,
    "weatherTick" INTEGER NOT NULL,
    "evolution" INTEGER NOT NULL,
    "autoPlayer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CareerQualifyingSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerQualifyingEntrant" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerQualifyingSimulationId" UUID NOT NULL,
    "careerDriverId" UUID NOT NULL,
    "careerTeamId" UUID NOT NULL,
    "driverName" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "entryOrder" INTEGER NOT NULL,
    "controller" "QualifyingController" NOT NULL,
    "driverPace" DOUBLE PRECISION NOT NULL,
    "driverConsistency" DOUBLE PRECISION NOT NULL,
    "carPerformance" DOUBLE PRECISION NOT NULL,
    "preparationProfile" JSONB NOT NULL,
    "fallbackRank" INTEGER NOT NULL,
    "location" "QualifyingLocation" NOT NULL,
    "distanceMicrolaps" BIGINT NOT NULL,
    "lapElapsedMs" INTEGER NOT NULL,
    "lapTimeMs" INTEGER NOT NULL,
    "lapTrafficMs" INTEGER NOT NULL,
    "tyreCompound" "TyreCompound",
    "tyreAgeLaps" INTEGER,
    "tyreWearPermille" INTEGER,
    "tyreTemperatureMilliC" INTEGER,
    "runCompound" "TyreCompound",
    "runPushLaps" INTEGER,
    "runPushDone" INTEGER,
    "runCallIn" BOOLEAN,
    "runStartedAtMs" INTEGER,
    "readyAtMs" INTEGER NOT NULL,
    "releaseAtMs" INTEGER NOT NULL,
    "windowOffsetMs" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL,
    "eliminatedIn" "QualifyingPhase",
    "q1BestMs" INTEGER,
    "q1SetAtMs" INTEGER,
    "q2BestMs" INTEGER,
    "q2SetAtMs" INTEGER,
    "q3BestMs" INTEGER,
    "q3SetAtMs" INTEGER,
    "lastLapMs" INTEGER,
    "lastLapTrafficMs" INTEGER NOT NULL,
    "lapsCompleted" INTEGER NOT NULL,
    "commandRevision" INTEGER NOT NULL,
    "finalPosition" INTEGER,

    CONSTRAINT "CareerQualifyingEntrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareerQualifyingSimulation_careerSessionId_key" ON "CareerQualifyingSimulation"("careerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerQualifyingSimulation_careerId_id_key" ON "CareerQualifyingSimulation"("careerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerQualifyingSimulation_careerId_careerSessionId_session_key" ON "CareerQualifyingSimulation"("careerId", "careerSessionId", "sessionType");

-- CreateIndex
CREATE UNIQUE INDEX "CareerQualifyingEntrant_careerId_id_key" ON "CareerQualifyingEntrant"("careerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerQualifyingEntrant_careerQualifyingSimulationId_career_key" ON "CareerQualifyingEntrant"("careerQualifyingSimulationId", "careerDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerQualifyingEntrant_careerQualifyingSimulationId_entryO_key" ON "CareerQualifyingEntrant"("careerQualifyingSimulationId", "entryOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CareerQualifyingEntrant_careerQualifyingSimulationId_finalP_key" ON "CareerQualifyingEntrant"("careerQualifyingSimulationId", "finalPosition");

-- AddForeignKey
ALTER TABLE "CareerQualifyingSimulation" ADD CONSTRAINT "CareerQualifyingSimulation_careerId_careerSessionId_sessio_fkey" FOREIGN KEY ("careerId", "careerSessionId", "sessionType") REFERENCES "CareerSession"("careerId", "id", "type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerQualifyingEntrant" ADD CONSTRAINT "CareerQualifyingEntrant_careerId_careerQualifyingSimulatio_fkey" FOREIGN KEY ("careerId", "careerQualifyingSimulationId") REFERENCES "CareerQualifyingSimulation"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerQualifyingEntrant" ADD CONSTRAINT "CareerQualifyingEntrant_careerId_careerDriverId_fkey" FOREIGN KEY ("careerId", "careerDriverId") REFERENCES "CareerDriver"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerQualifyingEntrant" ADD CONSTRAINT "CareerQualifyingEntrant_careerId_careerTeamId_fkey" FOREIGN KEY ("careerId", "careerTeamId") REFERENCES "CareerTeam"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Integrity ranges (the engine validates the same; SQL is the final boundary).
ALTER TABLE "CareerQualifyingSimulation" ADD CONSTRAINT "CareerQualifyingSimulation_ranges" CHECK (
  "sessionType" = 'QUALIFYING' AND "qualifyingVersion" = 1 AND "seed" BETWEEN 0 AND 4294967295 AND "rngState" BETWEEN 0 AND 4294967295
  AND "stepMs" > 0 AND "weatherTickMs" >= "stepMs" AND "baseLapTimeMs" > 0 AND "phaseElapsedMs" >= 0 AND "sessionElapsedMs" >= 0
  AND "evolution" BETWEEN 0 AND 1000 AND "trackWater" BETWEEN 0 AND 1000 AND "weatherTick" >= 1
  AND ("status" = 'RUNNING' OR ("phase" = 'Q3' AND "phaseStatus" = 'COMPLETE'))
);
ALTER TABLE "CareerQualifyingEntrant" ADD CONSTRAINT "CareerQualifyingEntrant_ranges" CHECK (
  "entryOrder" >= 1 AND "fallbackRank" >= 0 AND "driverPace" BETWEEN 0 AND 100 AND "driverConsistency" BETWEEN 0 AND 100 AND "carPerformance" BETWEEN 0 AND 100
  AND "distanceMicrolaps" >= 0 AND "lapElapsedMs" >= 0 AND "lapTimeMs" >= 0 AND "lapTrafficMs" >= 0 AND "lastLapTrafficMs" >= 0
  AND "readyAtMs" >= 0 AND "releaseAtMs" >= 0 AND "windowOffsetMs" >= 0 AND "attempts" >= 0 AND "lapsCompleted" >= 0 AND "commandRevision" >= 0
  AND ("finalPosition" IS NULL OR "finalPosition" >= 1)
  AND ("q1BestMs" IS NULL) = ("q1SetAtMs" IS NULL) AND ("q2BestMs" IS NULL) = ("q2SetAtMs" IS NULL) AND ("q3BestMs" IS NULL) = ("q3SetAtMs" IS NULL)
  AND ("location" = 'GARAGE') = ("runCompound" IS NULL) AND ("location" = 'GARAGE') = ("tyreCompound" IS NULL)
  AND ("runCompound" IS NULL OR ("runPushLaps" BETWEEN 1 AND 3 AND "runPushDone" BETWEEN 0 AND 3 AND "runCallIn" IS NOT NULL AND "runStartedAtMs" >= 0))
);

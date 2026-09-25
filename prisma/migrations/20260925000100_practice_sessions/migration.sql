-- Phase 13: Practice sessions (additive).
-- CreateEnum
CREATE TYPE "PracticeStatus" AS ENUM ('RUNNING', 'FINISHED');

-- CreateEnum
CREATE TYPE "PracticeLocation" AS ENUM ('GARAGE', 'OUT_LAP', 'FLYING', 'IN_LAP');

-- CreateEnum
CREATE TYPE "PracticeController" AS ENUM ('PLAYER', 'AI');

-- CreateEnum
CREATE TYPE "PracticePace" AS ENUM ('CONSERVATIVE', 'BALANCED', 'PERFORMANCE');

-- CreateTable
CREATE TABLE "CareerPracticeSimulation" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerSessionId" UUID NOT NULL,
    "sessionType" "CareerSessionType" NOT NULL,
    "practiceVersion" INTEGER NOT NULL,
    "seed" BIGINT NOT NULL,
    "rngState" BIGINT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "stepMs" INTEGER NOT NULL,
    "weatherTickMs" INTEGER NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "status" "PracticeStatus" NOT NULL,
    "baseLapTimeMs" INTEGER NOT NULL,
    "tyreProfile" JSONB NOT NULL,
    "weatherProfile" JSONB NOT NULL,
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

    CONSTRAINT "CareerPracticeSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPracticeEntrant" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerPracticeSimulationId" UUID NOT NULL,
    "careerDriverId" UUID NOT NULL,
    "careerTeamId" UUID NOT NULL,
    "driverName" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "entryOrder" INTEGER NOT NULL,
    "controller" "PracticeController" NOT NULL,
    "driverPace" DOUBLE PRECISION NOT NULL,
    "driverConsistency" DOUBLE PRECISION NOT NULL,
    "carPerformance" DOUBLE PRECISION NOT NULL,
    "location" "PracticeLocation" NOT NULL,
    "distanceMicrolaps" BIGINT NOT NULL,
    "lapElapsedMs" INTEGER NOT NULL,
    "lapTimeMs" INTEGER NOT NULL,
    "tyreCompound" "TyreCompound",
    "tyreAgeLaps" INTEGER,
    "tyreWearPermille" INTEGER,
    "tyreTemperatureMilliC" INTEGER,
    "runNumber" INTEGER,
    "runCompound" "TyreCompound",
    "runTargetLaps" INTEGER,
    "runPace" "PracticePace",
    "runTimedLaps" INTEGER,
    "runBestLapMs" INTEGER,
    "runCallIn" BOOLEAN,
    "runStartedAtMs" INTEGER,
    "readyAtMs" INTEGER NOT NULL,
    "lapsCompleted" INTEGER NOT NULL,
    "timedLaps" INTEGER NOT NULL,
    "lastLapMs" INTEGER,
    "bestLapMs" INTEGER,
    "bestLapCompound" "TyreCompound",
    "commandRevision" INTEGER NOT NULL,

    CONSTRAINT "CareerPracticeEntrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPracticeRun" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerPracticeEntrantId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "compound" "TyreCompound" NOT NULL,
    "targetLaps" INTEGER NOT NULL,
    "pace" "PracticePace" NOT NULL,
    "timedLaps" INTEGER NOT NULL,
    "bestLapMs" INTEGER,
    "startedAtMs" INTEGER NOT NULL,
    "endedAtMs" INTEGER NOT NULL,

    CONSTRAINT "CareerPracticeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerWeekendPreparation" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerRaceWeekendId" UUID NOT NULL,
    "careerDriverId" UUID NOT NULL,
    "idealAero" INTEGER NOT NULL,
    "idealMechanical" INTEGER NOT NULL,
    "idealRide" INTEGER NOT NULL,
    "idealBrake" INTEGER NOT NULL,
    "idealTyre" INTEGER NOT NULL,
    "setupAero" INTEGER NOT NULL,
    "setupMechanical" INTEGER NOT NULL,
    "setupRide" INTEGER NOT NULL,
    "setupBrake" INTEGER NOT NULL,
    "setupTyre" INTEGER NOT NULL,
    "setupRevision" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "acclimatisation" INTEGER NOT NULL,
    "knowledgeSoft" INTEGER NOT NULL,
    "knowledgeMedium" INTEGER NOT NULL,
    "knowledgeHard" INTEGER NOT NULL,
    "knowledgeIntermediate" INTEGER NOT NULL,
    "knowledgeWet" INTEGER NOT NULL,
    "feedbackAero" INTEGER,
    "feedbackMechanical" INTEGER,
    "feedbackRide" INTEGER,
    "feedbackBrake" INTEGER,
    "feedbackTyre" INTEGER,
    "feedbackReliability" INTEGER NOT NULL,
    "feedbackRevision" INTEGER NOT NULL,
    "representativeLaps" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CareerWeekendPreparation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareerPracticeSimulation_careerSessionId_key" ON "CareerPracticeSimulation"("careerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPracticeSimulation_careerId_id_key" ON "CareerPracticeSimulation"("careerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPracticeSimulation_careerId_careerSessionId_sessionTy_key" ON "CareerPracticeSimulation"("careerId", "careerSessionId", "sessionType");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPracticeEntrant_careerId_id_key" ON "CareerPracticeEntrant"("careerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPracticeEntrant_careerPracticeSimulationId_careerDriv_key" ON "CareerPracticeEntrant"("careerPracticeSimulationId", "careerDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPracticeEntrant_careerPracticeSimulationId_entryOrder_key" ON "CareerPracticeEntrant"("careerPracticeSimulationId", "entryOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CareerPracticeRun_careerPracticeEntrantId_number_key" ON "CareerPracticeRun"("careerPracticeEntrantId", "number");

-- CreateIndex
CREATE INDEX "CareerWeekendPreparation_careerId_careerDriverId_idx" ON "CareerWeekendPreparation"("careerId", "careerDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerWeekendPreparation_careerRaceWeekendId_careerDriverId_key" ON "CareerWeekendPreparation"("careerRaceWeekendId", "careerDriverId");

-- AddForeignKey
ALTER TABLE "CareerPracticeSimulation" ADD CONSTRAINT "CareerPracticeSimulation_careerId_careerSessionId_sessionT_fkey" FOREIGN KEY ("careerId", "careerSessionId", "sessionType") REFERENCES "CareerSession"("careerId", "id", "type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerPracticeEntrant" ADD CONSTRAINT "CareerPracticeEntrant_careerId_careerPracticeSimulationId_fkey" FOREIGN KEY ("careerId", "careerPracticeSimulationId") REFERENCES "CareerPracticeSimulation"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerPracticeEntrant" ADD CONSTRAINT "CareerPracticeEntrant_careerId_careerDriverId_fkey" FOREIGN KEY ("careerId", "careerDriverId") REFERENCES "CareerDriver"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerPracticeEntrant" ADD CONSTRAINT "CareerPracticeEntrant_careerId_careerTeamId_fkey" FOREIGN KEY ("careerId", "careerTeamId") REFERENCES "CareerTeam"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerPracticeRun" ADD CONSTRAINT "CareerPracticeRun_careerId_careerPracticeEntrantId_fkey" FOREIGN KEY ("careerId", "careerPracticeEntrantId") REFERENCES "CareerPracticeEntrant"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerWeekendPreparation" ADD CONSTRAINT "CareerWeekendPreparation_careerId_careerRaceWeekendId_fkey" FOREIGN KEY ("careerId", "careerRaceWeekendId") REFERENCES "CareerRaceWeekend"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerWeekendPreparation" ADD CONSTRAINT "CareerWeekendPreparation_careerId_careerDriverId_fkey" FOREIGN KEY ("careerId", "careerDriverId") REFERENCES "CareerDriver"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Range checks: authoritative Practice values can never be persisted out of bounds.
ALTER TABLE "CareerPracticeSimulation" ADD CONSTRAINT "CareerPracticeSimulation_ranges" CHECK (
  "sessionType" IN ('PRACTICE_1','PRACTICE_2','PRACTICE_3') AND "practiceVersion" = 1 AND "durationMs" > 0 AND "stepMs" > 0
  AND "weatherTickMs" >= "stepMs" AND "elapsedMs" >= 0 AND "baseLapTimeMs" > 0 AND "weatherTick" >= 1
  AND "rainfallIntensity" BETWEEN 0 AND 1000 AND "trackWater" BETWEEN 0 AND 1000 AND "evolution" BETWEEN 0 AND 1000
  AND "drsState" IN ('DRS_ENABLED','DRS_DISABLED_WET'));
ALTER TABLE "CareerPracticeEntrant" ADD CONSTRAINT "CareerPracticeEntrant_ranges" CHECK (
  "entryOrder" >= 1 AND "distanceMicrolaps" >= 0 AND "lapElapsedMs" >= 0 AND "lapTimeMs" >= 0 AND "readyAtMs" >= 0
  AND "timedLaps" >= 0 AND "lapsCompleted" >= "timedLaps" AND "commandRevision" >= 0
  AND ("tyreWearPermille" IS NULL OR "tyreWearPermille" BETWEEN 0 AND 1000)
  AND ("runTargetLaps" IS NULL OR "runTargetLaps" BETWEEN 1 AND 15)
  AND (("location" = 'GARAGE') = ("runNumber" IS NULL)));
ALTER TABLE "CareerPracticeRun" ADD CONSTRAINT "CareerPracticeRun_ranges" CHECK (
  "number" >= 1 AND "targetLaps" BETWEEN 1 AND 15 AND "timedLaps" >= 0 AND "endedAtMs" >= "startedAtMs");
ALTER TABLE "CareerWeekendPreparation" ADD CONSTRAINT "CareerWeekendPreparation_ranges" CHECK (
  "idealAero" BETWEEN 0 AND 100 AND "idealMechanical" BETWEEN 0 AND 100 AND "idealRide" BETWEEN 0 AND 100 AND "idealBrake" BETWEEN 0 AND 100 AND "idealTyre" BETWEEN 0 AND 100
  AND "setupAero" BETWEEN 0 AND 100 AND "setupMechanical" BETWEEN 0 AND 100 AND "setupRide" BETWEEN 0 AND 100 AND "setupBrake" BETWEEN 0 AND 100 AND "setupTyre" BETWEEN 0 AND 100
  AND "confidence" BETWEEN 0 AND 1000 AND "acclimatisation" BETWEEN 0 AND 1000 AND "feedbackReliability" BETWEEN 0 AND 1000
  AND "knowledgeSoft" BETWEEN 0 AND 1000 AND "knowledgeMedium" BETWEEN 0 AND 1000 AND "knowledgeHard" BETWEEN 0 AND 1000
  AND "knowledgeIntermediate" BETWEEN 0 AND 1000 AND "knowledgeWet" BETWEEN 0 AND 1000
  AND COALESCE("feedbackAero", 0) BETWEEN -2 AND 2 AND COALESCE("feedbackMechanical", 0) BETWEEN -2 AND 2 AND COALESCE("feedbackRide", 0) BETWEEN -2 AND 2
  AND COALESCE("feedbackBrake", 0) BETWEEN -2 AND 2 AND COALESCE("feedbackTyre", 0) BETWEEN -2 AND 2
  AND "setupRevision" >= 0 AND "representativeLaps" >= 0);

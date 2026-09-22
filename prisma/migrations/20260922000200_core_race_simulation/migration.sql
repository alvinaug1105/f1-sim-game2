-- CreateEnum
CREATE TYPE "RaceSimulationStatus" AS ENUM ('RUNNING', 'FINISHED');

-- CreateTable
CREATE TABLE "CareerRaceSimulation" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerSessionId" UUID NOT NULL,
    "sessionType" "CareerSessionType" NOT NULL DEFAULT 'RACE',
    "simulationVersion" INTEGER NOT NULL,
    "seed" BIGINT NOT NULL,
    "rngState" BIGINT NOT NULL,
    "currentLap" INTEGER NOT NULL,
    "totalLaps" INTEGER NOT NULL,
    "status" "RaceSimulationStatus" NOT NULL,
    "baseLapTimeMs" INTEGER NOT NULL,
    "fuelEffectMsPerKg" DOUBLE PRECISION NOT NULL,
    "initialFuelGrams" INTEGER NOT NULL,
    "fuelBurnPerLapGrams" INTEGER NOT NULL,
    "carPerformanceRangeMs" INTEGER NOT NULL,
    "driverPerformanceRangeMs" INTEGER NOT NULL,
    "minVariationMs" INTEGER NOT NULL,
    "maxVariationMs" INTEGER NOT NULL,
    "gridOffsetMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CareerRaceSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerRaceEntrant" (
    "id" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "careerRaceSimulationId" UUID NOT NULL,
    "careerDriverId" UUID NOT NULL,
    "careerTeamId" UUID NOT NULL,
    "driverName" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "gridPosition" INTEGER NOT NULL,
    "driverPace" DOUBLE PRECISION NOT NULL,
    "driverConsistency" DOUBLE PRECISION NOT NULL,
    "carPerformance" DOUBLE PRECISION NOT NULL,
    "completedLaps" INTEGER NOT NULL,
    "elapsedTimeMs" INTEGER NOT NULL,
    "lastLapTimeMs" INTEGER,
    "bestLapTimeMs" INTEGER,
    "fuelMassGrams" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "gapToLeaderMs" INTEGER,
    "intervalToAheadMs" INTEGER,

    CONSTRAINT "CareerRaceEntrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareerRaceSimulation_careerSessionId_key" ON "CareerRaceSimulation"("careerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerRaceSimulation_careerId_id_key" ON "CareerRaceSimulation"("careerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CareerRaceSimulation_careerId_careerSessionId_sessionType_key" ON "CareerRaceSimulation"("careerId", "careerSessionId", "sessionType");

-- CreateIndex
CREATE INDEX "CareerRaceEntrant_careerId_careerDriverId_idx" ON "CareerRaceEntrant"("careerId", "careerDriverId");

-- CreateIndex
CREATE INDEX "CareerRaceEntrant_careerId_careerTeamId_idx" ON "CareerRaceEntrant"("careerId", "careerTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerRaceEntrant_careerRaceSimulationId_careerDriverId_key" ON "CareerRaceEntrant"("careerRaceSimulationId", "careerDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerRaceEntrant_careerRaceSimulationId_gridPosition_key" ON "CareerRaceEntrant"("careerRaceSimulationId", "gridPosition");

-- CreateIndex
CREATE UNIQUE INDEX "CareerSession_careerId_id_type_key" ON "CareerSession"("careerId", "id", "type");

-- AddForeignKey
ALTER TABLE "CareerRaceSimulation" ADD CONSTRAINT "CareerRaceSimulation_careerId_careerSessionId_sessionType_fkey" FOREIGN KEY ("careerId", "careerSessionId", "sessionType") REFERENCES "CareerSession"("careerId", "id", "type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerRaceEntrant" ADD CONSTRAINT "CareerRaceEntrant_careerId_careerRaceSimulationId_fkey" FOREIGN KEY ("careerId", "careerRaceSimulationId") REFERENCES "CareerRaceSimulation"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerRaceEntrant" ADD CONSTRAINT "CareerRaceEntrant_careerId_careerDriverId_fkey" FOREIGN KEY ("careerId", "careerDriverId") REFERENCES "CareerDriver"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerRaceEntrant" ADD CONSTRAINT "CareerRaceEntrant_careerId_careerTeamId_fkey" FOREIGN KEY ("careerId", "careerTeamId") REFERENCES "CareerTeam"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Race-only ownership combines a constant CHECK with the composite session foreign key.
ALTER TABLE "CareerRaceSimulation" ADD CONSTRAINT "Race_session_type" CHECK ("sessionType" = 'RACE');
ALTER TABLE "CareerRaceSimulation" ADD CONSTRAINT "Race_metadata" CHECK (
  "simulationVersion" > 0 AND "seed" BETWEEN 0 AND 4294967295 AND "rngState" BETWEEN 0 AND 4294967295 AND
  "totalLaps" BETWEEN 1 AND 1000 AND "currentLap" BETWEEN 0 AND "totalLaps" AND
  (("status" = 'FINISHED') = ("currentLap" = "totalLaps")) AND
  "baseLapTimeMs" BETWEEN 1000 AND 600000 AND "fuelEffectMsPerKg" BETWEEN 0 AND 100 AND
  "initialFuelGrams" BETWEEN 0 AND 1000000 AND "fuelBurnPerLapGrams" BETWEEN 0 AND 20000 AND
  "carPerformanceRangeMs" BETWEEN 0 AND 10000 AND "driverPerformanceRangeMs" BETWEEN 0 AND 10000 AND
  "minVariationMs" BETWEEN 0 AND 500 AND "maxVariationMs" BETWEEN "minVariationMs" AND 500 AND "gridOffsetMs" BETWEEN 0 AND 10000
);
ALTER TABLE "CareerRaceEntrant" ADD CONSTRAINT "Race_entrant_values" CHECK (
  "gridPosition" BETWEEN 1 AND 100 AND "position" BETWEEN 1 AND 100 AND
  "driverPace" BETWEEN 0 AND 100 AND "driverConsistency" BETWEEN 0 AND 100 AND "carPerformance" BETWEEN 0 AND 100 AND
  "completedLaps" BETWEEN 0 AND 1000 AND "elapsedTimeMs" >= 0 AND "fuelMassGrams" BETWEEN 0 AND 1000000 AND
  ("gapToLeaderMs" IS NULL OR "gapToLeaderMs" >= 0) AND ("intervalToAheadMs" IS NULL OR "intervalToAheadMs" >= 0) AND
  (("completedLaps" = 0 AND "lastLapTimeMs" IS NULL AND "bestLapTimeMs" IS NULL) OR
   ("completedLaps" > 0 AND "lastLapTimeMs" IS NOT NULL AND "bestLapTimeMs" IS NOT NULL AND "lastLapTimeMs" > 0 AND "bestLapTimeMs" > 0 AND "bestLapTimeMs" <= "lastLapTimeMs"))
);

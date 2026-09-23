-- AlterTable
ALTER TABLE "CareerRaceEntrant" ADD COLUMN     "attempted" BOOLEAN,
ADD COLUMN     "dirtyAirMs" INTEGER,
ADD COLUMN     "driverDefending" INTEGER,
ADD COLUMN     "driverOvertaking" INTEGER,
ADD COLUMN     "drsBenefitMs" INTEGER,
ADD COLUMN     "drsEligible" BOOLEAN,
ADD COLUMN     "overtakesCompleted" INTEGER,
ADD COLUMN     "passed" BOOLEAN,
ADD COLUMN     "potentialLapTimeMs" INTEGER,
ADD COLUMN     "trackProgressMicrolaps" BIGINT,
ADD COLUMN     "trafficLossMs" INTEGER;

-- CreateTable
CREATE TABLE "CareerRaceInteractionProfile" (
    "careerRaceSimulationId" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "overtakingDifficulty" INTEGER NOT NULL,
    "dirtyAirSensitivityPermille" INTEGER NOT NULL,
    "drsEffectivenessPermille" INTEGER NOT NULL,
    "drsZoneCount" INTEGER NOT NULL,
    "dirtyAirThresholdMs" INTEGER NOT NULL,
    "maxDirtyAirMs" INTEGER NOT NULL,
    "attackThresholdMs" INTEGER NOT NULL,
    "minimumGapMs" INTEGER NOT NULL,
    "minimumPaceAdvantageMs" INTEGER NOT NULL,
    "opportunityIntervalLaps" INTEGER NOT NULL,
    "drsActivationLap" INTEGER NOT NULL,
    "drsThresholdMs" INTEGER NOT NULL,
    "drsMsPerZone" INTEGER NOT NULL,
    "maxDrsBenefitMs" INTEGER NOT NULL,

    CONSTRAINT "CareerRaceInteractionProfile_pkey" PRIMARY KEY ("careerRaceSimulationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareerRaceInteractionProfile_careerId_careerRaceSimulationI_key" ON "CareerRaceInteractionProfile"("careerId", "careerRaceSimulationId");

-- CreateIndex
ALTER TABLE "CareerRaceEntrant" ADD CONSTRAINT "CareerRaceEntrant_careerRaceSimulationId_position_key" UNIQUE ("careerRaceSimulationId", "position") DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "CareerRaceInteractionProfile" ADD CONSTRAINT "CareerRaceInteractionProfile_careerId_careerRaceSimulation_fkey" FOREIGN KEY ("careerId", "careerRaceSimulationId") REFERENCES "CareerRaceSimulation"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Deferred uniqueness permits atomic adjacent swaps while rejecting duplicate final positions.
ALTER TABLE "CareerRaceEntrant" ADD CONSTRAINT "Race_track_state" CHECK (
 num_nonnulls("attempted","dirtyAirMs","driverDefending","driverOvertaking","drsBenefitMs","drsEligible","overtakesCompleted","passed","potentialLapTimeMs","trackProgressMicrolaps","trafficLossMs") IN (0,11) AND
 ("driverOvertaking" IS NULL OR "driverOvertaking" BETWEEN 0 AND 100) AND
 ("driverDefending" IS NULL OR "driverDefending" BETWEEN 0 AND 100) AND
 ("overtakesCompleted" IS NULL OR "overtakesCompleted" BETWEEN 0 AND "completedLaps") AND
 ("potentialLapTimeMs" IS NULL OR "potentialLapTimeMs" >= 0) AND
 ("dirtyAirMs" IS NULL OR "dirtyAirMs" BETWEEN 0 AND 4000) AND
 ("drsBenefitMs" IS NULL OR "drsBenefitMs" BETWEEN 0 AND 500) AND
 ("trafficLossMs" IS NULL OR "trafficLossMs" >= 0) AND
 ("passed" IS NULL OR NOT "passed" OR "attempted")
);
ALTER TABLE "CareerRaceInteractionProfile" ADD CONSTRAINT "Interaction_profile_bounds" CHECK (
 "overtakingDifficulty" BETWEEN 0 AND 100 AND "dirtyAirSensitivityPermille" BETWEEN 0 AND 2000 AND "drsEffectivenessPermille" BETWEEN 0 AND 2000 AND "drsZoneCount" BETWEEN 0 AND 4 AND
 "dirtyAirThresholdMs" BETWEEN 1 AND 10000 AND "maxDirtyAirMs" BETWEEN 0 AND 2000 AND "minimumGapMs" BETWEEN 1 AND 500 AND "attackThresholdMs" BETWEEN "minimumGapMs" AND 2000 AND "minimumPaceAdvantageMs" BETWEEN 0 AND 2000 AND
 "opportunityIntervalLaps" BETWEEN 1 AND 10 AND "drsActivationLap" BETWEEN 1 AND 1000 AND "drsThresholdMs" BETWEEN 1 AND 5000 AND "drsMsPerZone" BETWEEN 0 AND 500 AND "maxDrsBenefitMs" BETWEEN 0 AND 500
);
ALTER TABLE "CareerRaceSimulation" ADD CONSTRAINT "Race_v3_tyres" CHECK ("simulationVersion" <> 3 OR ("tyreWearMultiplierPermille" IS NOT NULL AND "tyreEnergyMultiplierPermille" IS NOT NULL));

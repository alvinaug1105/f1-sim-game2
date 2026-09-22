-- CreateEnum
CREATE TYPE "TyreCompound" AS ENUM ('SOFT', 'MEDIUM', 'HARD');

-- AlterTable
ALTER TABLE "CareerRaceSimulation" ADD COLUMN     "tyreEnergyMultiplierPermille" INTEGER,
ADD COLUMN     "tyreWearMultiplierPermille" INTEGER;

-- AlterTable
ALTER TABLE "CareerRaceEntrant" ADD COLUMN     "compound" "TyreCompound",
ADD COLUMN     "startingCompound" "TyreCompound",
ADD COLUMN     "startingTyreAgeLaps" INTEGER,
ADD COLUMN     "startingTyreTemperatureMilliC" INTEGER,
ADD COLUMN     "startingTyreWearPermille" INTEGER,
ADD COLUMN     "stintNumber" INTEGER,
ADD COLUMN     "stintStartedAtLap" INTEGER,
ADD COLUMN     "tyreAgeLaps" INTEGER,
ADD COLUMN     "tyreTemperatureMilliC" INTEGER,
ADD COLUMN     "tyreWearPermille" INTEGER;

-- CreateTable
CREATE TABLE "CareerRaceTyreProfile" (
    "careerId" UUID NOT NULL,
    "careerRaceSimulationId" UUID NOT NULL,
    "compound" "TyreCompound" NOT NULL,
    "baseGripDeltaMs" INTEGER NOT NULL,
    "idealTemperatureMinMilliC" INTEGER NOT NULL,
    "idealTemperatureMaxMilliC" INTEGER NOT NULL,
    "coldPenaltyMsPerC" INTEGER NOT NULL,
    "hotPenaltyMsPerC" INTEGER NOT NULL,
    "maxTemperaturePenaltyMs" INTEGER NOT NULL,
    "targetTemperatureMilliC" INTEGER NOT NULL,
    "thermalResponsePermille" INTEGER NOT NULL,
    "baseWearPerLapPermille" INTEGER NOT NULL,
    "degradationStartWear" INTEGER NOT NULL,
    "cliffWear" INTEGER NOT NULL,
    "stablePenaltyMs" INTEGER NOT NULL,
    "progressivePenaltyMs" INTEGER NOT NULL,
    "cliffPenaltyMs" INTEGER NOT NULL,

    CONSTRAINT "CareerRaceTyreProfile_pkey" PRIMARY KEY ("careerRaceSimulationId","compound")
);

-- AddForeignKey
ALTER TABLE "CareerRaceTyreProfile" ADD CONSTRAINT "CareerRaceTyreProfile_careerId_careerRaceSimulationId_fkey" FOREIGN KEY ("careerId", "careerRaceSimulationId") REFERENCES "CareerRaceSimulation"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- NULL tyre fields preserve existing version-1 semantics. Version 2 requires snapshotted stress.
ALTER TABLE "CareerRaceSimulation" ADD CONSTRAINT "Race_tyre_stress" CHECK (
 ("simulationVersion" <> 2 OR ("tyreWearMultiplierPermille" IS NOT NULL AND "tyreEnergyMultiplierPermille" IS NOT NULL)) AND
 ("tyreWearMultiplierPermille" IS NULL OR "tyreWearMultiplierPermille" BETWEEN 250 AND 3000) AND
 ("tyreEnergyMultiplierPermille" IS NULL OR "tyreEnergyMultiplierPermille" BETWEEN 250 AND 3000) AND
 ("simulationVersion" <> 1 OR ("tyreWearMultiplierPermille" IS NULL AND "tyreEnergyMultiplierPermille" IS NULL))
);
ALTER TABLE "CareerRaceEntrant" ADD CONSTRAINT "Race_tyre_state" CHECK (
 num_nonnulls("startingCompound","startingTyreAgeLaps","startingTyreWearPermille","startingTyreTemperatureMilliC","compound","tyreAgeLaps","tyreWearPermille","tyreTemperatureMilliC","stintNumber","stintStartedAtLap") IN (0,10) AND
 ("startingTyreAgeLaps" IS NULL OR "startingTyreAgeLaps" BETWEEN 0 AND 100000) AND
 ("tyreAgeLaps" IS NULL OR "tyreAgeLaps" BETWEEN 0 AND 100000) AND
 ("startingTyreWearPermille" IS NULL OR "startingTyreWearPermille" BETWEEN 0 AND 1000) AND
 ("tyreWearPermille" IS NULL OR "tyreWearPermille" BETWEEN 0 AND 1000) AND
 ("startingTyreTemperatureMilliC" IS NULL OR "startingTyreTemperatureMilliC" BETWEEN 0 AND 160000) AND
 ("tyreTemperatureMilliC" IS NULL OR "tyreTemperatureMilliC" BETWEEN 0 AND 160000) AND
 ("stintNumber" IS NULL OR "stintNumber" > 0) AND
 ("stintStartedAtLap" IS NULL OR "stintStartedAtLap" BETWEEN 0 AND "completedLaps")
);
ALTER TABLE "CareerRaceTyreProfile" ADD CONSTRAINT "Tyre_profile_bounds" CHECK (
 "baseGripDeltaMs" BETWEEN -1000 AND 1000 AND
 "idealTemperatureMinMilliC" BETWEEN 0 AND 159999 AND "idealTemperatureMaxMilliC" > "idealTemperatureMinMilliC" AND "idealTemperatureMaxMilliC" <= 160000 AND
 "coldPenaltyMsPerC" BETWEEN 0 AND 100 AND "hotPenaltyMsPerC" BETWEEN 0 AND 100 AND "maxTemperaturePenaltyMs" BETWEEN 0 AND 3000 AND
 "targetTemperatureMilliC" BETWEEN 0 AND 160000 AND "thermalResponsePermille" BETWEEN 1 AND 500 AND "baseWearPerLapPermille" BETWEEN 1 AND 100 AND
 "degradationStartWear" BETWEEN 1 AND 998 AND "cliffWear" > "degradationStartWear" AND "cliffWear" < 1000 AND
 "stablePenaltyMs" BETWEEN 0 AND 1000 AND "progressivePenaltyMs" BETWEEN "stablePenaltyMs" AND 5000 AND "cliffPenaltyMs" BETWEEN 0 AND 10000
);

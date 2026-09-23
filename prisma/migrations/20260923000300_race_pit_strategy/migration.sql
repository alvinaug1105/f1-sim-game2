-- CreateEnum
CREATE TYPE "RaceStrategyController" AS ENUM ('PLAYER', 'DEVELOPMENT_AI');

-- AlterTable
ALTER TABLE "CareerRaceEntrant" ADD COLUMN     "pendingPitCompound" "TyreCompound",
ADD COLUMN     "pitCommandRevision" INTEGER,
ADD COLUMN     "stopCount" INTEGER,
ADD COLUMN     "strategyController" "RaceStrategyController";

-- CreateTable
CREATE TABLE "CareerRacePitProfile" (
    "careerRaceSimulationId" UUID NOT NULL,
    "careerId" UUID NOT NULL,
    "pitLaneLossMs" INTEGER NOT NULL,
    "stationaryBaseMs" INTEGER NOT NULL,
    "stationaryVariationMs" INTEGER NOT NULL,
    "newTyreTemperatureMilliC" INTEGER NOT NULL,
    "aiWearThresholdPermille" INTEGER NOT NULL,
    "aiMinimumStintLaps" INTEGER NOT NULL,

    CONSTRAINT "CareerRacePitProfile_pkey" PRIMARY KEY ("careerRaceSimulationId")
);

-- CreateTable
CREATE TABLE "CareerRaceStint" (
    "careerId" UUID NOT NULL,
    "careerRaceSimulationId" UUID NOT NULL,
    "entrantId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "startLap" INTEGER NOT NULL,
    "endLap" INTEGER,
    "compound" "TyreCompound" NOT NULL,
    "startingAgeLaps" INTEGER NOT NULL,
    "startingWearPermille" INTEGER NOT NULL,
    "startingTemperatureMilliC" INTEGER NOT NULL,
    "endingAgeLaps" INTEGER,
    "endingWearPermille" INTEGER,
    "endingTemperatureMilliC" INTEGER,

    CONSTRAINT "CareerRaceStint_pkey" PRIMARY KEY ("entrantId","number")
);

-- CreateTable
CREATE TABLE "CareerRacePitStop" (
    "careerId" UUID NOT NULL,
    "careerRaceSimulationId" UUID NOT NULL,
    "entrantId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "lap" INTEGER NOT NULL,
    "oldCompound" "TyreCompound" NOT NULL,
    "newCompound" "TyreCompound" NOT NULL,
    "pitLaneLossMs" INTEGER NOT NULL,
    "stationaryTimeMs" INTEGER NOT NULL,
    "totalLossMs" INTEGER NOT NULL,

    CONSTRAINT "CareerRacePitStop_pkey" PRIMARY KEY ("entrantId","number")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareerRacePitProfile_careerId_careerRaceSimulationId_key" ON "CareerRacePitProfile"("careerId", "careerRaceSimulationId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerRacePitStop_entrantId_lap_key" ON "CareerRacePitStop"("entrantId", "lap");

-- CreateIndex
CREATE UNIQUE INDEX "CareerRaceEntrant_careerId_careerRaceSimulationId_id_key" ON "CareerRaceEntrant"("careerId", "careerRaceSimulationId", "id");

-- AddForeignKey
ALTER TABLE "CareerRacePitProfile" ADD CONSTRAINT "CareerRacePitProfile_careerId_careerRaceSimulationId_fkey" FOREIGN KEY ("careerId", "careerRaceSimulationId") REFERENCES "CareerRaceSimulation"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerRaceStint" ADD CONSTRAINT "CareerRaceStint_careerId_careerRaceSimulationId_entrantId_fkey" FOREIGN KEY ("careerId", "careerRaceSimulationId", "entrantId") REFERENCES "CareerRaceEntrant"("careerId", "careerRaceSimulationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CareerRacePitStop" ADD CONSTRAINT "CareerRacePitStop_careerId_careerRaceSimulationId_entrantI_fkey" FOREIGN KEY ("careerId", "careerRaceSimulationId", "entrantId") REFERENCES "CareerRaceEntrant"("careerId", "careerRaceSimulationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Legacy versions retain NULL pit fields. V4 state is written atomically with owned history.
ALTER TABLE "CareerRaceEntrant" ADD CONSTRAINT "Race_pit_state" CHECK (
 num_nonnulls("strategyController","pitCommandRevision","stopCount") IN (0,3) AND
 ("pendingPitCompound" IS NULL OR "strategyController" IS NOT NULL) AND
 ("pitCommandRevision" IS NULL OR "pitCommandRevision" >= 0) AND
 ("stopCount" IS NULL OR "stopCount" BETWEEN 0 AND "completedLaps")
);
ALTER TABLE "CareerRacePitProfile" ADD CONSTRAINT "Pit_profile_bounds" CHECK (
 "pitLaneLossMs" BETWEEN 1000 AND 120000 AND "stationaryBaseMs" BETWEEN 1000 AND 10000 AND
 "stationaryVariationMs" BETWEEN 0 AND 1000 AND "stationaryVariationMs" < "stationaryBaseMs" AND
 "newTyreTemperatureMilliC" BETWEEN 0 AND 160000 AND "aiWearThresholdPermille" BETWEEN 100 AND 1000 AND "aiMinimumStintLaps" BETWEEN 1 AND 100
);
ALTER TABLE "CareerRaceStint" ADD CONSTRAINT "Stint_bounds" CHECK (
 "number" > 0 AND "startLap" BETWEEN 0 AND 999 AND
 num_nonnulls("endLap","endingAgeLaps","endingWearPermille","endingTemperatureMilliC") IN (0,4) AND
 ("endLap" IS NULL OR ("endLap" > "startLap" AND "endLap" <= 1000)) AND
 "startingAgeLaps" BETWEEN 0 AND 100000 AND "startingWearPermille" BETWEEN 0 AND 1000 AND "startingTemperatureMilliC" BETWEEN 0 AND 160000 AND
 ("endingAgeLaps" IS NULL OR "endingAgeLaps" BETWEEN "startingAgeLaps" AND 100000) AND
 ("endingWearPermille" IS NULL OR "endingWearPermille" BETWEEN "startingWearPermille" AND 1000) AND
 ("endingTemperatureMilliC" IS NULL OR "endingTemperatureMilliC" BETWEEN 0 AND 160000)
);
CREATE UNIQUE INDEX "Stint_one_open_per_entrant" ON "CareerRaceStint" ("entrantId") WHERE "endLap" IS NULL;
ALTER TABLE "CareerRacePitStop" ADD CONSTRAINT "Pit_stop_bounds" CHECK (
 "number" > 0 AND "lap" BETWEEN 1 AND 999 AND "pitLaneLossMs" BETWEEN 1000 AND 120000 AND
 "stationaryTimeMs" BETWEEN 1 AND 11000 AND "totalLossMs" = "pitLaneLossMs" + "stationaryTimeMs"
);
ALTER TABLE "CareerRaceSimulation" ADD CONSTRAINT "Race_v4_tyres" CHECK ("simulationVersion" <> 4 OR ("tyreWearMultiplierPermille" IS NOT NULL AND "tyreEnergyMultiplierPermille" IS NOT NULL));

-- Additive v5 state; old races keep NULL command state.
CREATE TABLE "CareerRaceCommandProfile" (
 "careerRaceSimulationId" UUID PRIMARY KEY,
 "careerId" UUID NOT NULL,
 UNIQUE ("careerId", "careerRaceSimulationId"),
 "profile" JSONB NOT NULL CHECK (jsonb_typeof("profile") = 'object'),
 FOREIGN KEY ("careerId", "careerRaceSimulationId") REFERENCES "CareerRaceSimulation"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
ALTER TABLE "CareerRaceEntrant" ADD COLUMN "paceMode" TEXT, ADD COLUMN "fuelMode" TEXT, ADD COLUMN "ersMode" TEXT, ADD COLUMN "ersCharge" INTEGER, ADD COLUMN "commandRevision" INTEGER;
ALTER TABLE "CareerRaceEntrant" ADD CONSTRAINT "driver_commands_valid" CHECK (
  ("paceMode" IS NULL AND "fuelMode" IS NULL AND "ersMode" IS NULL AND "ersCharge" IS NULL AND "commandRevision" IS NULL) OR
  ("paceMode" IS NOT NULL AND "fuelMode" IS NOT NULL AND "ersMode" IS NOT NULL AND "ersCharge" IS NOT NULL AND "commandRevision" IS NOT NULL AND
   "paceMode" IN ('CONSERVE','LIGHT','STANDARD','PUSH','ATTACK') AND "fuelMode" IN ('CONSERVE','BALANCED','PUSH') AND "ersMode" IN ('HARVEST','NEUTRAL','DEPLOY','OVERTAKE') AND "ersCharge" BETWEEN 0 AND 1000 AND "commandRevision" BETWEEN 0 AND 2147483646));

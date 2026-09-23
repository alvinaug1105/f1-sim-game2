-- v6 only; older races receive no weather rows or additional tyre profiles.
ALTER TYPE "TyreCompound" ADD VALUE 'INTERMEDIATE';
ALTER TYPE "TyreCompound" ADD VALUE 'WET';
CREATE TABLE "CareerRaceWeather" (
 "careerRaceSimulationId" UUID PRIMARY KEY,
 "careerId" UUID NOT NULL,
 "profile" JSONB NOT NULL CHECK (jsonb_typeof("profile") = 'object'),
 "rainfallIntensity" INTEGER NOT NULL CHECK ("rainfallIntensity" BETWEEN 0 AND 1000),
 "airTemperatureMilliC" INTEGER NOT NULL CHECK ("airTemperatureMilliC" BETWEEN -20000 AND 60000),
 "trackTemperatureMilliC" INTEGER NOT NULL CHECK ("trackTemperatureMilliC" BETWEEN -20000 AND 80000),
 "trackWater" INTEGER NOT NULL CHECK ("trackWater" BETWEEN 0 AND 1000),
 "drsState" TEXT NOT NULL CHECK ("drsState" IN ('DRS_ENABLED', 'DRS_DISABLED_WET')),
 UNIQUE ("careerId", "careerRaceSimulationId"),
 FOREIGN KEY ("careerId", "careerRaceSimulationId") REFERENCES "CareerRaceSimulation"("careerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- The enum is shared, but wet compounds must never enter legacy simulations.
CREATE FUNCTION "guard_v6_compounds"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE race_version INTEGER; row_json JSONB;
BEGIN
 row_json := to_jsonb(NEW);
 IF EXISTS (SELECT 1 FROM jsonb_each_text(row_json) WHERE key IN ('compound','startingCompound','pendingPitCompound','oldCompound','newCompound') AND value IN ('INTERMEDIATE','WET')) THEN
  EXECUTE format('SELECT "simulationVersion" FROM %I."CareerRaceSimulation" WHERE "id" = $1 AND "careerId" = $2', TG_TABLE_SCHEMA) INTO race_version USING NEW."careerRaceSimulationId", NEW."careerId";
  IF race_version IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'Wet compounds require simulation v6' USING ERRCODE = '23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "v6_entrant_compounds" BEFORE INSERT OR UPDATE ON "CareerRaceEntrant" FOR EACH ROW EXECUTE FUNCTION "guard_v6_compounds"();
CREATE TRIGGER "v6_profile_compounds" BEFORE INSERT OR UPDATE ON "CareerRaceTyreProfile" FOR EACH ROW EXECUTE FUNCTION "guard_v6_compounds"();
CREATE TRIGGER "v6_stint_compounds" BEFORE INSERT OR UPDATE ON "CareerRaceStint" FOR EACH ROW EXECUTE FUNCTION "guard_v6_compounds"();
CREATE TRIGGER "v6_stop_compounds" BEFORE INSERT OR UPDATE ON "CareerRacePitStop" FOR EACH ROW EXECUTE FUNCTION "guard_v6_compounds"();

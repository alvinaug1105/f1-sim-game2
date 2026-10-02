-- Additive v8 snapshot; no existing Race is converted or rewritten.
ALTER TABLE "CareerRaceSimulation" ADD COLUMN "progression" JSONB;
ALTER TABLE "CareerRaceSimulation" ADD CONSTRAINT "Race_v8_progression" CHECK (
 ("simulationVersion" = 8 AND "progression" IS NOT NULL AND jsonb_typeof("progression") = 'object'
  AND jsonb_typeof("progression"->'configuration') = 'object' AND jsonb_typeof("progression"->'state') = 'object') IS TRUE
 OR ("simulationVersion" <> 8 AND "progression" IS NULL)
);
-- v8 can complete more than one physical pass per race lap (including lap-down cars). Legacy bound is retained by
-- the version-aware trigger below; every other pre-existing track constraint remains the same.
ALTER TABLE "CareerRaceEntrant" DROP CONSTRAINT "Race_track_state";
ALTER TABLE "CareerRaceEntrant" ADD CONSTRAINT "Race_track_state" CHECK (
 num_nonnulls("attempted","dirtyAirMs","driverDefending","driverOvertaking","drsBenefitMs","drsEligible","overtakesCompleted","passed","potentialLapTimeMs","trackProgressMicrolaps","trafficLossMs") IN (0,11) AND
 ("driverOvertaking" IS NULL OR "driverOvertaking" BETWEEN 0 AND 100) AND
 ("driverDefending" IS NULL OR "driverDefending" BETWEEN 0 AND 100) AND
 ("overtakesCompleted" IS NULL OR "overtakesCompleted" BETWEEN 0 AND 100000) AND
 ("potentialLapTimeMs" IS NULL OR "potentialLapTimeMs" >= 0) AND
 ("dirtyAirMs" IS NULL OR "dirtyAirMs" BETWEEN 0 AND 4000) AND
 ("drsBenefitMs" IS NULL OR "drsBenefitMs" BETWEEN 0 AND 500) AND
 ("trafficLossMs" IS NULL OR "trafficLossMs" >= 0) AND
 ("passed" IS NULL OR NOT "passed" OR "attempted")
);
CREATE FUNCTION "guard_race_progression"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE race_version INTEGER;
BEGIN
 EXECUTE format('SELECT "simulationVersion" FROM %I."CareerRaceSimulation" WHERE "id"=$1 AND "careerId"=$2',TG_TABLE_SCHEMA) INTO race_version USING NEW."careerRaceSimulationId",NEW."careerId";
 IF race_version = 8 THEN
  IF NEW."trackProgressMicrolaps" IS NULL OR NEW."trackProgressMicrolaps" < 0 OR NEW."completedLaps" <> NEW."trackProgressMicrolaps" / 1000000 THEN
   RAISE EXCEPTION 'v8 distance / lap mismatch' USING ERRCODE='23514';
  END IF;
 ELSIF NEW."overtakesCompleted" > NEW."completedLaps" THEN
  RAISE EXCEPTION 'Legacy overtake bound' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "race_progression" BEFORE INSERT OR UPDATE ON "CareerRaceEntrant" FOR EACH ROW EXECUTE FUNCTION "guard_race_progression"();
CREATE OR REPLACE FUNCTION "guard_v7_incidents"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE race_version INTEGER; participant TEXT; owned BOOLEAN; entry JSONB;
BEGIN
 EXECUTE format('SELECT "simulationVersion" FROM %I."CareerRaceSimulation" WHERE "id"=$1 AND "careerId"=$2',TG_TABLE_SCHEMA) INTO race_version USING NEW."careerRaceSimulationId",NEW."careerId";
 IF race_version IS NULL OR race_version NOT IN (7,8) THEN RAISE EXCEPTION 'Incidents require v7 or v8' USING ERRCODE='23514'; END IF;
 FOR participant IN SELECT jsonb_object_keys(NEW."entrants") UNION SELECT jsonb_object_keys(NEW."reliability") UNION SELECT jsonb_array_elements_text(event->'entrantIds') FROM jsonb_array_elements(NEW."events") event LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CareerRaceEntrant" WHERE "id"::text=$1 AND "careerId"=$2 AND "careerRaceSimulationId"=$3)',TG_TABLE_SCHEMA) INTO owned USING participant,NEW."careerId",NEW."careerRaceSimulationId";
  IF NOT owned THEN RAISE EXCEPTION 'Incident participant ownership mismatch' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR entry IN SELECT value FROM jsonb_each(NEW."entrants") LOOP
  IF (entry->>'status' IN ('RUNNING','FINISHED','RETIRED') AND (entry->>'mechanicalPenaltyMs')::int BETWEEN 0 AND 10000) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Invalid incident entrant' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION "guard_v6_compounds"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE race_version INTEGER; row_json JSONB;
BEGIN
 row_json := to_jsonb(NEW);
 IF EXISTS (SELECT 1 FROM jsonb_each_text(row_json) WHERE key IN ('compound','startingCompound','pendingPitCompound','oldCompound','newCompound') AND value IN ('INTERMEDIATE','WET')) THEN
  EXECUTE format('SELECT "simulationVersion" FROM %I."CareerRaceSimulation" WHERE "id" = $1 AND "careerId" = $2', TG_TABLE_SCHEMA) INTO race_version USING NEW."careerRaceSimulationId", NEW."careerId";
  IF race_version IS NULL OR race_version NOT IN (6,7,8) THEN RAISE EXCEPTION 'Wet compounds require simulation v6, v7 or v8' USING ERRCODE = '23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

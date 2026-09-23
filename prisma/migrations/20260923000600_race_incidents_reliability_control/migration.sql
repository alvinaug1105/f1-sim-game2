CREATE TABLE "CareerRaceIncidents" (
 "careerRaceSimulationId" UUID PRIMARY KEY,
 "careerId" UUID NOT NULL,
 "profile" JSONB NOT NULL CHECK (jsonb_typeof("profile") = 'object'),
 "reliability" JSONB NOT NULL CHECK (jsonb_typeof("reliability") = 'object'),
 "entrants" JSONB NOT NULL CHECK (jsonb_typeof("entrants") = 'object'),
 "events" JSONB NOT NULL CHECK (jsonb_typeof("events") = 'array'),
 "rngState" BIGINT NOT NULL CHECK ("rngState" BETWEEN 0 AND 4294967295),
 "mode" TEXT NOT NULL CHECK ("mode" IN ('GREEN','VSC','SAFETY_CAR')),
 "startedLap" INTEGER CHECK ("startedLap" >= 0),
 "remainingLaps" INTEGER NOT NULL CHECK ("remainingLaps" BETWEEN 0 AND 10),
 "drsDelay" INTEGER NOT NULL CHECK ("drsDelay" BETWEEN 0 AND 10),
 CHECK (("mode" = 'GREEN') = ("remainingLaps" = 0)),
 UNIQUE ("careerId", "careerRaceSimulationId"),
 FOREIGN KEY ("careerId", "careerRaceSimulationId") REFERENCES "CareerRaceSimulation"("careerId","id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE FUNCTION "guard_v7_incidents"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE race_version INTEGER; participant TEXT; owned BOOLEAN; entry JSONB;
BEGIN
 EXECUTE format('SELECT "simulationVersion" FROM %I."CareerRaceSimulation" WHERE "id"=$1 AND "careerId"=$2',TG_TABLE_SCHEMA) INTO race_version USING NEW."careerRaceSimulationId",NEW."careerId";
 IF race_version IS DISTINCT FROM 7 THEN RAISE EXCEPTION 'Incidents require v7' USING ERRCODE='23514'; END IF;
 FOR participant IN SELECT jsonb_object_keys(NEW."entrants") UNION SELECT jsonb_object_keys(NEW."reliability") UNION SELECT jsonb_array_elements_text(event->'entrantIds') FROM jsonb_array_elements(NEW."events") event LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CareerRaceEntrant" WHERE "id"::text=$1 AND "careerId"=$2 AND "careerRaceSimulationId"=$3)',TG_TABLE_SCHEMA) INTO owned USING participant,NEW."careerId",NEW."careerRaceSimulationId";
  IF NOT owned THEN RAISE EXCEPTION 'Incident participant ownership mismatch' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR entry IN SELECT value FROM jsonb_each(NEW."entrants") LOOP
  IF (entry->>'status' IN ('RUNNING','FINISHED','RETIRED') AND (entry->>'mechanicalPenaltyMs')::int BETWEEN 0 AND 10000) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Invalid incident entrant' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER "v7_incidents" BEFORE INSERT OR UPDATE ON "CareerRaceIncidents" FOR EACH ROW EXECUTE FUNCTION "guard_v7_incidents"();
CREATE OR REPLACE FUNCTION "guard_v6_compounds"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE race_version INTEGER; row_json JSONB;
BEGIN
 row_json := to_jsonb(NEW);
 IF EXISTS (SELECT 1 FROM jsonb_each_text(row_json) WHERE key IN ('compound','startingCompound','pendingPitCompound','oldCompound','newCompound') AND value IN ('INTERMEDIATE','WET')) THEN
  EXECUTE format('SELECT "simulationVersion" FROM %I."CareerRaceSimulation" WHERE "id" = $1 AND "careerId" = $2', TG_TABLE_SCHEMA) INTO race_version USING NEW."careerRaceSimulationId", NEW."careerId";
  IF race_version IS NULL OR race_version NOT IN (6,7) THEN RAISE EXCEPTION 'Wet compounds require simulation v6 or v7' USING ERRCODE = '23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

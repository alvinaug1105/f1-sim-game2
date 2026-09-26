-- Post-Phase-14 Race Dynamics (additive only).
-- Circuit Race interaction identity: nullable; NULL = legacy content / Careers created before this pass, which keep
-- the neutral Race interaction defaults. A started Race keeps its own snapshotted interaction profile.
-- AlterTable
ALTER TABLE "Circuit" ADD COLUMN     "dirtyAirSensitivityPermille" INTEGER,
ADD COLUMN     "drsEffectivenessPermille" INTEGER,
ADD COLUMN     "overtakingDifficulty" INTEGER;

-- AlterTable
ALTER TABLE "CareerCircuit" ADD COLUMN     "dirtyAirSensitivityPermille" INTEGER,
ADD COLUMN     "drsEffectivenessPermille" INTEGER,
ADD COLUMN     "overtakingDifficulty" INTEGER;

-- AI pit strategy configuration frozen at Race start; NULL = Race started before this pass (legacy AI policy).
-- AlterTable
ALTER TABLE "CareerRacePitProfile" ADD COLUMN     "strategy" JSONB;

-- All three or none (explicit IS NOT NULL: a NULL comparison would otherwise satisfy the CHECK); same ranges as the
-- Race interaction profile.
ALTER TABLE "Circuit" ADD CONSTRAINT "Circuit_race_profile" CHECK (("overtakingDifficulty" IS NULL AND "dirtyAirSensitivityPermille" IS NULL AND "drsEffectivenessPermille" IS NULL) OR ("overtakingDifficulty" IS NOT NULL AND "dirtyAirSensitivityPermille" IS NOT NULL AND "drsEffectivenessPermille" IS NOT NULL AND "overtakingDifficulty" BETWEEN 0 AND 100 AND "dirtyAirSensitivityPermille" BETWEEN 0 AND 2000 AND "drsEffectivenessPermille" BETWEEN 0 AND 2000));
ALTER TABLE "CareerCircuit" ADD CONSTRAINT "CareerCircuit_race_profile" CHECK (("overtakingDifficulty" IS NULL AND "dirtyAirSensitivityPermille" IS NULL AND "drsEffectivenessPermille" IS NULL) OR ("overtakingDifficulty" IS NOT NULL AND "dirtyAirSensitivityPermille" IS NOT NULL AND "drsEffectivenessPermille" IS NOT NULL AND "overtakingDifficulty" BETWEEN 0 AND 100 AND "dirtyAirSensitivityPermille" BETWEEN 0 AND 2000 AND "drsEffectivenessPermille" BETWEEN 0 AND 2000));
ALTER TABLE "CareerRacePitProfile" ADD CONSTRAINT "Pit_profile_strategy_object" CHECK ("strategy" IS NULL OR jsonb_typeof("strategy") = 'object');

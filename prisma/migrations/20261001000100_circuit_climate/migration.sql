-- Additive only: existing source and Career rows stay NULL (legacy weather).
CREATE TYPE "CircuitClimateProfile" AS ENUM ('ARID', 'DRY', 'TEMPERATE', 'VARIABLE', 'HUMID');
ALTER TABLE "Circuit" ADD COLUMN "climateProfile" "CircuitClimateProfile";
ALTER TABLE "CareerCircuit" ADD COLUMN "climateProfile" "CircuitClimateProfile";

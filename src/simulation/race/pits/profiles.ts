import type { PitConfiguration } from "./types";
/** Provisional v4 game tuning, not measured F1 specifications. */
export function defaultPitConfiguration(): PitConfiguration {
  return {
    pitLaneLossMs: 19500,
    stationaryBaseMs: 2500,
    stationaryVariationMs: 250,
    newTyreTemperatureMilliC: 80000,
    aiWearThresholdPermille: 750,
    aiMinimumStintLaps: 5,
  };
}
export function validatePitConfiguration(c: PitConfiguration) {
  const integer = (n: number, min: number, max: number) => {
    if (!Number.isSafeInteger(n) || n < min || n > max)
      throw new RangeError("Invalid pit configuration");
  };
  integer(c.pitLaneLossMs, 1000, 120000);
  integer(c.stationaryBaseMs, 1000, 10000);
  integer(c.stationaryVariationMs, 0, Math.min(1000, c.stationaryBaseMs - 1));
  integer(c.newTyreTemperatureMilliC, 0, 160000);
  integer(c.aiWearThresholdPermille, 100, 1000);
  integer(c.aiMinimumStintLaps, 1, 100);
}

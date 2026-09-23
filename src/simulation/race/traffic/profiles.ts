import type {
  InteractionConfiguration,
  DriverInteractionProfile,
} from "./model";
/** Version-3 game tuning, not real-world regulations or calibration. */
export function defaultInteractionConfiguration(): InteractionConfiguration {
  return {
    overtakingDifficulty: 35,
    dirtyAirSensitivityPermille: 1000,
    drsEffectivenessPermille: 1000,
    drsZoneCount: 2,
    dirtyAirThresholdMs: 1500,
    maxDirtyAirMs: 300,
    attackThresholdMs: 300,
    minimumGapMs: 80,
    minimumPaceAdvantageMs: 100,
    opportunityIntervalLaps: 2,
    drsActivationLap: 3,
    drsThresholdMs: 1000,
    drsMsPerZone: 80,
    maxDrsBenefitMs: 300,
  };
}
export function developmentDriverInteraction(): DriverInteractionProfile {
  return { overtaking: 65, defending: 65 };
}

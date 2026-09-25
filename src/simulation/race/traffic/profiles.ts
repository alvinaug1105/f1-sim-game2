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

/**
 * Small data-driven Race interaction identity of a circuit, snapshotted into the Career circuit and then into each
 * Race's interaction profile. It scales pass likelihood, dirty-air cost and DRS usefulness; it never scripts results.
 */
export interface CircuitRaceProfile {
  readonly overtakingDifficulty: number;
  readonly dirtyAirSensitivityPermille: number;
  readonly drsEffectivenessPermille: number;
}
/** New Race interaction profile for a circuit; no profile (legacy Careers/content) keeps the neutral defaults. */
export function circuitInteractionConfiguration(profile: CircuitRaceProfile | null | undefined): InteractionConfiguration {
  const base = defaultInteractionConfiguration();
  return profile
    ? { ...base, overtakingDifficulty: profile.overtakingDifficulty, dirtyAirSensitivityPermille: profile.dirtyAirSensitivityPermille, drsEffectivenessPermille: profile.drsEffectivenessPermille }
    : base;
}

import type { CommandConfiguration, CommandState } from "./commands/model";
import type {
  PitConfiguration,
  PitState,
  StrategyController,
} from "./pits/types";
import type {
  InteractionConfiguration,
  DriverInteractionProfile,
  TrackState,
} from "./traffic/model";
import type { TyreConfiguration, TyreState, StintState } from "./tyres/model";
export interface DriverPerformanceProfile {
  readonly pace: number;
  readonly consistency: number;
}
export interface CarPerformanceProfile {
  readonly performance: number;
}
export interface RaceCircuitProfile {
  readonly baseLapTimeMs: number;
  readonly fuelEffectMsPerKg: number;
}
export interface RaceParameters {
  readonly carPerformanceRangeMs: number;
  readonly driverPerformanceRangeMs: number;
  readonly minVariationMs: number;
  readonly maxVariationMs: number;
  readonly gridOffsetMs: number;
}
export interface RaceEntrant {
  readonly strategyController?: StrategyController;
  readonly interaction?: DriverInteractionProfile;
  readonly entrantId: string;
  readonly driverId: string;
  readonly teamId: string;
  readonly gridPosition: number;
  readonly driver: DriverPerformanceProfile;
  readonly car: CarPerformanceProfile;
  readonly startingTyre?: TyreState;
}
export interface RaceSimulationInput {
  readonly commands?: CommandConfiguration;
  readonly pits?: PitConfiguration;
  readonly interaction?: InteractionConfiguration;
  readonly tyres?: TyreConfiguration;
  readonly seed: number;
  readonly totalLaps: number;
  readonly circuit: RaceCircuitProfile;
  readonly initialFuelKg: number;
  readonly fuelBurnPerLapKg: number;
  readonly parameters: RaceParameters;
  readonly entrants: readonly RaceEntrant[];
}
export interface RaceEntrantState {
  readonly commands?: CommandState;
  readonly pit?: PitState;
  readonly track?: TrackState;
  readonly stint?: StintState;
  readonly entrantId: string;
  readonly completedLaps: number;
  readonly elapsedTimeMs: number;
  readonly lastLapTimeMs: number | null;
  readonly bestLapTimeMs: number | null;
  readonly fuelMassKg: number;
  readonly position: number;
  readonly gapToLeaderMs: number | null;
  readonly intervalToAheadMs: number | null;
}
export interface RaceSimulationState {
  readonly simulationVersion: number;
  readonly input: RaceSimulationInput;
  readonly rngState: number;
  readonly lap: number;
  readonly status: "RUNNING" | "FINISHED";
  readonly entrants: readonly RaceEntrantState[];
}
export interface RaceResult {
  readonly position: number;
  readonly entrantId: string;
  readonly driverId: string;
  readonly teamId: string;
  readonly totalTimeMs: number;
  readonly bestLapTimeMs: number;
}

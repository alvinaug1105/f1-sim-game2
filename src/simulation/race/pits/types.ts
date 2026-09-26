import type { TyreCompound, TyreState } from "../tyres/model";
import type { AiStrategyConfiguration } from "./ai-strategy";
export type StrategyController = "PLAYER" | "DEVELOPMENT_AI";
export interface PitConfiguration {
  readonly pitLaneLossMs: number;
  readonly stationaryBaseMs: number;
  readonly stationaryVariationMs: number;
  readonly newTyreTemperatureMilliC: number;
  readonly aiWearThresholdPermille: number;
  readonly aiMinimumStintLaps: number;
  /** Post-Phase-14 AI pit strategy (v7 weather Races). Absent on Races saved before it: the legacy policy applies. */
  readonly strategy?: AiStrategyConfiguration;
}
export interface RaceStint {
  readonly number: number;
  /** Completed-lap boundary: startLap 18 means first racing lap is 19. */
  readonly startLap: number;
  readonly endLap: number | null;
  readonly startingTyre: TyreState;
  readonly endingTyre: TyreState | null;
}
export interface RacePitStop {
  readonly number: number;
  /** Stop AFTER this lap, before the next lap. */
  readonly lap: number;
  readonly oldCompound: TyreCompound;
  readonly newCompound: TyreCompound;
  readonly pitLaneLossMs: number;
  readonly stationaryTimeMs: number;
  readonly totalLossMs: number;
}
export interface PitState {
  readonly pendingCompound: TyreCompound | null;
  readonly commandRevision: number;
  readonly stints: readonly RaceStint[];
  readonly stops: readonly RacePitStop[];
}

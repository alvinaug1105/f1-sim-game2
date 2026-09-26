/**
 * The Race / Sprint **browser view** — the only Race shape a client component may receive.
 *
 * It is a distinct type from the authoritative `RaceSimulationState` (not a Partial of it): it has no seed, no RNG
 * state, no weather truth timeline, no weather/incident/reliability/AI configuration, no hidden AI decisions and no
 * future Race Control schedule. The server builds it with `projectRaceView` / `projectRaceState` (projection.ts);
 * this file holds types only, so importing it never pulls simulation code into a client bundle.
 */
import type { CareerProgress } from "../../game/domain/progression";
import type { RaceKind, RaceLabel } from "../../game/domain/race-repository";
import type { CommandState } from "../../simulation/race/commands/model";
import type { EntrantIncidentState, RaceControlMode, RaceEvent } from "../../simulation/race/incidents/model";
import type { RacePitStop } from "../../simulation/race/pits/types";
import type { TyreCompound } from "../../simulation/race/tyres/model";
import type { ForecastWindow, WeatherState } from "../../simulation/race/weather/model";
/** Tyre as seen from the pit wall: compound and age for every car; wear and temperature only for the player's cars. */
export interface PublicTyre {
  readonly compound: TyreCompound;
  readonly ageLaps: number;
  readonly wearPermille: number | null;
  readonly temperatureMilliC: number | null;
}
export interface PublicStint {
  readonly number: number;
  readonly startedAtLap: number;
  readonly tyre: PublicTyre;
}
export interface PublicPitStint {
  readonly number: number;
  readonly startLap: number;
  readonly endLap: number | null;
  readonly startingTyre: PublicTyre;
  readonly endingTyre: PublicTyre | null;
}
export interface PublicPit {
  /** The player's own pending pit request; always null for rival cars (an AI's pending stop is a hidden decision). */
  readonly pendingCompound: TyreCompound | null;
  /** Player cars only (optimistic-concurrency token for pit commands); null for rivals. */
  readonly commandRevision: number | null;
  readonly stints: readonly PublicPitStint[];
  /** Completed stops (public timing record). */
  readonly stops: readonly RacePitStop[];
}
export interface PublicTrack {
  readonly progressMicrolaps: number;
  readonly drsEligible: boolean;
  readonly overtakesCompleted: number;
}
export type PublicIncident = Pick<EntrantIncidentState, "status" | "retiredLap" | "retirementOrder">;
export type ErsOutlook = { readonly kind: "LAPS"; readonly laps: number } | { readonly kind: "SUSTAINABLE" | "CHARGING" };
/** Server-derived figures for a player car, computed from hidden configuration so the configuration never ships. */
export interface PlayerCarInsight {
  /** Fuel at the flag in the current fuel mode (grams, negative = short); null when the Race has no commands. */
  readonly projectedFuelGrams: number | null;
  readonly ers: ErsOutlook | null;
  /** Presentation-only pit window estimate (laps to the current compound's cliff and the current stop cost). */
  readonly pitEstimate: { readonly lapsToCliff: number; readonly minimumLossMs: number; readonly maximumLossMs: number } | null;
}
export interface RacePublicEntrant {
  readonly entrantId: string;
  readonly completedLaps: number;
  readonly elapsedTimeMs: number;
  readonly lastLapTimeMs: number | null;
  readonly bestLapTimeMs: number | null;
  readonly position: number;
  readonly gapToLeaderMs: number | null;
  readonly intervalToAheadMs: number | null;
  /** Player cars only (a rival's fuel load is not public); null for rivals. */
  readonly fuelMassKg: number | null;
  readonly incident?: PublicIncident;
  readonly stint?: PublicStint;
  readonly pit?: PublicPit;
  readonly track?: PublicTrack;
  /** Player cars only: the player's own commands (modes, charge, revision). */
  readonly commands?: CommandState;
  /** Player cars only. */
  readonly insight?: PlayerCarInsight;
}
export interface RacePublicEntrantInfo {
  readonly entrantId: string;
  readonly driverId: string;
  readonly teamId: string;
  readonly gridPosition: number;
}
/** Tyre thresholds the warnings read (compound character only; no wear/grip/energy model constants). */
export interface PublicTyreThresholds {
  readonly degradationStartWear: number;
  readonly cliffWear: number;
  readonly idealTemperatureMinMilliC: number;
  readonly idealTemperatureMaxMilliC: number;
}
export interface RacePublicState {
  /** Brand: an authoritative RaceSimulationState can never be passed where a public view is expected. */
  readonly visibility: "PUBLIC";
  readonly simulationVersion: number;
  readonly lap: number;
  readonly status: "RUNNING" | "FINISHED";
  readonly input: {
    readonly totalLaps: number;
    readonly circuit: { readonly baseLapTimeMs: number };
    readonly entrants: readonly RacePublicEntrantInfo[];
    /** Feature flags / public rendering constants only. */
    readonly commands: { readonly capacity: number } | null;
    readonly tyres: { readonly profiles: Readonly<Partial<Record<TyreCompound, PublicTyreThresholds>>> } | null;
    readonly pits: boolean;
    readonly interaction: boolean;
  };
  /** Current, observed conditions. */
  readonly weather?: WeatherState;
  /** The public approximate forecast from the next lap on (never the truth timeline); null without weather. */
  readonly forecast: readonly ForecastWindow[] | null;
  /** Race Control as already announced: current mode, DRS restart delay and past events only. */
  readonly incidents?: {
    readonly mode: RaceControlMode;
    readonly drsDelay: number;
    /** "Safety Car / VSC in this lap" — announced on the final neutralised lap, as in real Race Control. */
    readonly endingThisLap: boolean;
    readonly events: readonly RaceEvent[];
  };
  readonly entrants: readonly RacePublicEntrant[];
}
/** Pre-start information for the preparation screen (public conditions and the approximate forecast only). */
export interface RacePreparationView {
  readonly laps: number;
  readonly conditions: WeatherState;
  readonly forecast: readonly ForecastWindow[];
  readonly defaultCompound: TyreCompound;
  readonly compounds: readonly TyreCompound[];
  readonly mine: readonly { readonly driverId: string; readonly driverName: string }[];
  readonly rivals: readonly { readonly driverId: string; readonly driverName: string; readonly teamName: string }[];
}
export interface RaceViewData {
  readonly visibility: "PUBLIC";
  readonly progress: CareerProgress;
  readonly eventId: string;
  readonly kind: RaceKind;
  readonly sessionId: string;
  readonly labels: readonly RaceLabel[];
  readonly circuit: { readonly sourceCircuitId: string | null; readonly lengthMeters: number };
  readonly state: RacePublicState | null;
  /** Present only before the session has started. */
  readonly preparation: RacePreparationView | null;
}

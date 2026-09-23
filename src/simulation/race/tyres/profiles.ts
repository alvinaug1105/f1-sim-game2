import type {
  TyreCompound,
  DryTyreCompound,
  TyreCompoundProfile,
  TyreConfiguration,
  TyreState,
} from "./model";
const common = {
  coldPenaltyMsPerC: 20,
  hotPenaltyMsPerC: 30,
  maxTemperaturePenaltyMs: 1500,
  thermalResponsePermille: 250,
  stablePenaltyMs: 100,
  cliffPenaltyMs: 6000,
};
/** Provisional version-2 game tuning, not factual F1 compound specifications. */
export const DEFAULT_TYRE_PROFILES: Readonly<
  Record<DryTyreCompound, TyreCompoundProfile>
> = Object.freeze({
  SOFT: Object.freeze({
    ...common,
    compound: "SOFT",
    baseGripDeltaMs: -350,
    idealTemperatureMinMilliC: 90000,
    idealTemperatureMaxMilliC: 105000,
    targetTemperatureMilliC: 98000,
    baseWearPerLapPermille: 32,
    degradationStartWear: 400,
    cliffWear: 800,
    progressivePenaltyMs: 1600,
  }),
  MEDIUM: Object.freeze({
    ...common,
    compound: "MEDIUM",
    baseGripDeltaMs: 0,
    idealTemperatureMinMilliC: 85000,
    idealTemperatureMaxMilliC: 105000,
    targetTemperatureMilliC: 97000,
    baseWearPerLapPermille: 22,
    degradationStartWear: 450,
    cliffWear: 850,
    progressivePenaltyMs: 1200,
  }),
  HARD: Object.freeze({
    ...common,
    compound: "HARD",
    baseGripDeltaMs: 300,
    idealTemperatureMinMilliC: 85000,
    idealTemperatureMaxMilliC: 110000,
    targetTemperatureMilliC: 100000,
    baseWearPerLapPermille: 15,
    degradationStartWear: 500,
    cliffWear: 900,
    progressivePenaltyMs: 900,
  }),
});
export function defaultTyreConfiguration(): TyreConfiguration {
  return {
    profiles: structuredClone(DEFAULT_TYRE_PROFILES),
    tyreWearMultiplierPermille: 1000,
    tyreEnergyMultiplierPermille: 1000,
  };
}
export function startingTyre(compound: TyreCompound = "MEDIUM"): TyreState {
  return { compound, ageLaps: 0, wearPermille: 0, temperatureMilliC: 80000 };
}

export function weatherTyreConfiguration(): TyreConfiguration {
 const dry=defaultTyreConfiguration();
 return {...dry, profiles:{...dry.profiles,
  INTERMEDIATE:{...dry.profiles.MEDIUM,compound:"INTERMEDIATE",baseGripDeltaMs:0,idealTemperatureMinMilliC:65000,idealTemperatureMaxMilliC:90000,targetTemperatureMilliC:78000,baseWearPerLapPermille:24},
  WET:{...dry.profiles.MEDIUM,compound:"WET",baseGripDeltaMs:0,idealTemperatureMinMilliC:55000,idealTemperatureMaxMilliC:80000,targetTemperatureMilliC:68000,baseWearPerLapPermille:20},
 }};
}

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

/**
 * Race v8D (progression revision 4) tyre calibration — GAME TUNING, not factual compound data. Only the wear curve
 * changes: degradation onset, cliff point, progressive penalty and post-cliff penalty. Base grip and base wear per
 * lap are unchanged, so a fresh SOFT is still the fastest tyre and the HARD still lasts longest; the earlier and
 * steeper cliffs make running a worn tyre to the flag a real cost rather than a free one-stop. The defaults above
 * stay frozen for every earlier Race.
 */
const V8D_DRY_CURVES: Readonly<Record<DryTyreCompound, Pick<TyreCompoundProfile, "degradationStartWear" | "cliffWear" | "progressivePenaltyMs" | "cliffPenaltyMs">>> = Object.freeze({
  SOFT: Object.freeze({ degradationStartWear: 400, cliffWear: 780, progressivePenaltyMs: 1700, cliffPenaltyMs: 8500 }),
  MEDIUM: Object.freeze({ degradationStartWear: 450, cliffWear: 830, progressivePenaltyMs: 1300, cliffPenaltyMs: 7000 }),
  HARD: Object.freeze({ degradationStartWear: 500, cliffWear: 880, progressivePenaltyMs: 1000, cliffPenaltyMs: 5500 }),
});
export function v8dTyreConfiguration(): TyreConfiguration {
  const dry = defaultTyreConfiguration();
  return { ...dry, profiles: {
    SOFT: { ...dry.profiles.SOFT, ...V8D_DRY_CURVES.SOFT },
    MEDIUM: { ...dry.profiles.MEDIUM, ...V8D_DRY_CURVES.MEDIUM },
    HARD: { ...dry.profiles.HARD, ...V8D_DRY_CURVES.HARD },
  } };
}
/**
 * Race v8D weather tyres: the v8D dry curves plus EXPLICIT intermediate / full-wet curves (GAME TUNING), so the wet
 * family no longer silently inherits whatever the medium is. Temperatures, grip and base wear match the accepted
 * weather profiles exactly.
 */
export function v8dWeatherTyreConfiguration(): TyreConfiguration {
  const dry = v8dTyreConfiguration(), accepted = weatherTyreConfiguration();
  return { ...dry, profiles: { ...dry.profiles,
    INTERMEDIATE: { ...accepted.profiles.INTERMEDIATE!, degradationStartWear: 420, cliffWear: 820, progressivePenaltyMs: 1300, cliffPenaltyMs: 7000 },
    WET: { ...accepted.profiles.WET!, degradationStartWear: 450, cliffWear: 850, progressivePenaltyMs: 1200, cliffPenaltyMs: 6500 },
  } };
}

/**
 * Race v8E (progression revision 5) dry tyres — GAME TUNING. The v8D cliff thresholds and post-cliff penalties are kept
 * (the cliff stays strategically active). What changes is the GRADUAL degradation before the cliff: a worn-but-healthy
 * tyre now costs noticeably more than a fresh one (linear loss to degradation onset, a steeper progressive phase), so
 * stopping earlier onto fresh tyres (undercut) gains real time, while the existing cold out-lap, pit loss and traffic
 * still make an overcut viable when the old tyre is healthy. Base grip, base wear and temperatures are unchanged.
 */
const V8E_DRY_SHAPE: Readonly<Record<DryTyreCompound, Pick<TyreCompoundProfile, "stablePenaltyMs" | "progressivePenaltyMs">>> = Object.freeze({
  SOFT: Object.freeze({ stablePenaltyMs: 300, progressivePenaltyMs: 2000 }),
  MEDIUM: Object.freeze({ stablePenaltyMs: 250, progressivePenaltyMs: 1550 }),
  HARD: Object.freeze({ stablePenaltyMs: 200, progressivePenaltyMs: 1200 }),
});
export function v8eTyreConfiguration(): TyreConfiguration {
  const d = v8dTyreConfiguration();
  return { ...d, profiles: {
    SOFT: { ...d.profiles.SOFT, ...V8E_DRY_SHAPE.SOFT },
    MEDIUM: { ...d.profiles.MEDIUM, ...V8E_DRY_SHAPE.MEDIUM },
    HARD: { ...d.profiles.HARD, ...V8E_DRY_SHAPE.HARD },
  } };
}
/** Race v8E weather tyres: the v8E dry shape plus the accepted v8D intermediate / full-wet profiles (unchanged). */
export function v8eWeatherTyreConfiguration(): TyreConfiguration {
  const w = v8dWeatherTyreConfiguration(), dry = v8eTyreConfiguration();
  return { ...w, profiles: { ...w.profiles, SOFT: dry.profiles.SOFT, MEDIUM: dry.profiles.MEDIUM, HARD: dry.profiles.HARD } };
}

export const TYRE_COMPOUNDS = ["SOFT", "MEDIUM", "HARD"] as const;
export type DryTyreCompound = (typeof TYRE_COMPOUNDS)[number];
export const WEATHER_TYRE_COMPOUNDS = [...TYRE_COMPOUNDS, "INTERMEDIATE", "WET"] as const;
export type TyreCompound = (typeof WEATHER_TYRE_COMPOUNDS)[number];
export interface TyreState {
  readonly compound: TyreCompound;
  readonly ageLaps: number;
  /** 0 fresh, 1000 maximum modeled wear (consumed). */
  readonly wearPermille: number;
  readonly temperatureMilliC: number;
}
export interface StintState {
  readonly number: number;
  readonly startedAtLap: number;
  readonly tyre: TyreState;
}
export interface TyreCompoundProfile {
  readonly compound: TyreCompound;
  readonly baseGripDeltaMs: number;
  readonly idealTemperatureMinMilliC: number;
  readonly idealTemperatureMaxMilliC: number;
  readonly coldPenaltyMsPerC: number;
  readonly hotPenaltyMsPerC: number;
  readonly maxTemperaturePenaltyMs: number;
  readonly targetTemperatureMilliC: number;
  readonly thermalResponsePermille: number;
  readonly baseWearPerLapPermille: number;
  readonly degradationStartWear: number;
  readonly cliffWear: number;
  readonly stablePenaltyMs: number;
  readonly progressivePenaltyMs: number;
  readonly cliffPenaltyMs: number;
}
export interface TyreConfiguration {
  readonly profiles: Readonly<Record<string, TyreCompoundProfile>>;
  readonly tyreWearMultiplierPermille: number;
  readonly tyreEnergyMultiplierPermille: number;
}
export const TYRE_TEMPERATURE_MIN = 0;
export const TYRE_TEMPERATURE_MAX = 160000;
function integer(value: number, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError("Invalid tyre numeric input");
}
export function isTyreCompound(value: unknown): value is TyreCompound {
  return WEATHER_TYRE_COMPOUNDS.some((c) => c === value);
}
export function validateTyreState(tyre: TyreState) {
  if (!isTyreCompound(tyre.compound))
    throw new RangeError("Invalid dry compound");
  integer(tyre.ageLaps, 0, 100000);
  integer(tyre.wearPermille, 0, 1000);
  integer(tyre.temperatureMilliC, TYRE_TEMPERATURE_MIN, TYRE_TEMPERATURE_MAX);
}
export function validateTyreConfiguration(config: TyreConfiguration) {
  integer(config.tyreWearMultiplierPermille, 250, 3000);
  integer(config.tyreEnergyMultiplierPermille, 250, 3000);
  for (const compound of [...TYRE_COMPOUNDS, ...WEATHER_TYRE_COMPOUNDS.filter(c => !TYRE_COMPOUNDS.includes(c as DryTyreCompound) && config.profiles[c])]) {
    const p = config.profiles[compound];
    if (!p || p.compound !== compound)
      throw new RangeError("Missing or mismatched compound profile");
    integer(p.baseGripDeltaMs, -1000, 1000);
    integer(p.idealTemperatureMinMilliC, 0, 159999);
    integer(
      p.idealTemperatureMaxMilliC,
      p.idealTemperatureMinMilliC + 1,
      160000,
    );
    integer(p.coldPenaltyMsPerC, 0, 100);
    integer(p.hotPenaltyMsPerC, 0, 100);
    integer(p.maxTemperaturePenaltyMs, 0, 3000);
    integer(p.targetTemperatureMilliC, 0, 160000);
    integer(p.thermalResponsePermille, 1, 500);
    integer(p.baseWearPerLapPermille, 1, 100);
    integer(p.degradationStartWear, 1, 998);
    integer(p.cliffWear, p.degradationStartWear + 1, 999);
    integer(p.stablePenaltyMs, 0, 1000);
    integer(p.progressivePenaltyMs, p.stablePenaltyMs, 5000);
    integer(p.cliffPenaltyMs, 0, 10000);
  }
}
export function getTyreProfile(
  config: TyreConfiguration,
  compound: TyreCompound,
) {
  const profile = config.profiles[compound];
  if (!profile || profile.compound !== compound)
    throw new RangeError("Missing compound profile");
  return profile;
}
/** Penalty is continuous: mild early loss, quadratic progression, then a steep quadratic cliff. */
export function tyreContributions(
  tyre: TyreState,
  profile: TyreCompoundProfile,
) {
  validateTyreState(tyre);
  if (tyre.compound !== profile.compound)
    throw new RangeError("Compound profile mismatch");
  const wear = tyre.wearPermille;
  const tyreWearMs = Math.round(
    wear <= profile.degradationStartWear
      ? (profile.stablePenaltyMs * wear) / profile.degradationStartWear
      : wear <= profile.cliffWear
        ? profile.stablePenaltyMs +
          (profile.progressivePenaltyMs - profile.stablePenaltyMs) *
            ((wear - profile.degradationStartWear) /
              (profile.cliffWear - profile.degradationStartWear)) **
              2
        : profile.progressivePenaltyMs +
          profile.cliffPenaltyMs *
            ((wear - profile.cliffWear) / (1000 - profile.cliffWear)) ** 2,
  );
  const below =
    Math.max(0, profile.idealTemperatureMinMilliC - tyre.temperatureMilliC) /
    1000;
  const above =
    Math.max(0, tyre.temperatureMilliC - profile.idealTemperatureMaxMilliC) /
    1000;
  return {
    tyreCompoundMs: profile.baseGripDeltaMs,
    tyreWearMs,
    tyreTemperatureMs: Math.min(
      profile.maxTemperaturePenaltyMs,
      Math.round(
        below * profile.coldPenaltyMsPerC + above * profile.hotPenaltyMsPerC,
      ),
    ),
  };
}
/** No RNG: update only after the lap used the previous tyre state. */
export function advanceTyre(
  tyre: TyreState,
  config: TyreConfiguration,
): TyreState {
  validateTyreState(tyre);
  if (tyre.ageLaps >= 100000) throw new RangeError("Tyre age limit reached");
  const p = getTyreProfile(config, tyre.compound);
  // Fixed dry target plus 10 C per +1000 energy permille; no weather model.
  const target = Math.max(
    TYRE_TEMPERATURE_MIN,
    Math.min(
      TYRE_TEMPERATURE_MAX,
      p.targetTemperatureMilliC +
        (config.tyreEnergyMultiplierPermille - 1000) * 10,
    ),
  );
  return {
    ...tyre,
    ageLaps: tyre.ageLaps + 1,
    wearPermille: Math.min(
      1000,
      tyre.wearPermille +
        Math.max(
          1,
          Math.round(
            (p.baseWearPerLapPermille * config.tyreWearMultiplierPermille) /
              1000,
          ),
        ),
    ),
    temperatureMilliC: Math.max(
      TYRE_TEMPERATURE_MIN,
      Math.min(
        TYRE_TEMPERATURE_MAX,
        tyre.temperatureMilliC +
          Math.round(
            ((target - tyre.temperatureMilliC) * p.thermalResponsePermille) /
              1000,
          ),
      ),
    ),
  };
}

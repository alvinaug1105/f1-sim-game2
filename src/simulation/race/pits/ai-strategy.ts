/**
 * AI pit strategy (Race v7, Post-Phase-14 tuning). Enabled per Race by a snapshotted `PitConfiguration.strategy`;
 * Races saved without it keep the legacy weather policy exactly.
 *
 * Instead of one synchronised threshold, each AI car evaluates a pit WINDOW with its own stable preferences and the
 * CURRENT Race picture: tyre condition, expected tyre gain, pit-release traffic, an undercut chance on the car
 * ahead, clear air to extend in, Race Control and public weather. It never reads the weather truth timeline, future
 * incidents, Race Control, rival commands or RNG outcomes. No RNG draw is consumed here, so strategy never shifts
 * the lap/traffic/incident streams; the per-car preferences are a pure hash of the Race seed and the car's frozen grid slot.
 */
import type { RaceEntrantState, RaceSimulationInput, RaceSimulationState } from "../types";
import { TYRE_COMPOUNDS, WEATHER_TYRE_COMPOUNDS, tyreContributions, type TyreCompound, type TyreState, type TyreConfiguration } from "../tyres/model";
import { advanceWeatherTyre, evolveWeather, forecastRain, waterPenaltyMs, type WeatherConfiguration, type WeatherState } from "../weather/model";
import { createSeededRandom } from "../../core/random";

/** Snapshotted game tuning (integers). Not real-world strategy data. */
export interface AiStrategyConfiguration {
  readonly version: 1;
  /** Tyre gain (as a share of the green stop cost) at which the pit window opens. */
  readonly windowOpenPermille: number;
  /** Neutral stop point: tyre gain (‰ of the green stop cost) at which a car with no bias and no adjustments stops. */
  readonly stopPointPermille: number;
  /** ± spread of each car's personal stop point around the neutral point (earlier ↔ longer-stint bias). */
  readonly preferenceSpreadPermille: number;
  /** A car within this time of the estimated rejoin point counts as release traffic. */
  readonly trafficWindowMs: number;
  /** Stop point raise per release-traffic car (scaled by the car's sensitivity and the circuit's passing difficulty). */
  readonly trafficCostPermille: number;
  readonly maxTrafficPermille: number;
  /** Stop point reduction for a clean release. */
  readonly cleanAirBonusPermille: number;
  /** Undercut: within this interval of a car ahead that is not on fresher tyres. */
  readonly undercutGapMs: number;
  readonly undercutBonusPermille: number;
  /** Extension/overcut: clear air ahead beyond this and no immediate threat behind. */
  readonly clearAirMs: number;
  readonly extendBonusPermille: number;
  /** Beyond this tyre gain the car stops regardless of traffic or preference. */
  readonly forceStopPermille: number;
  /** SC/VSC: a cheap stop is only taken when the tyre is at least this far into its life (± the car's own bias). */
  readonly neutralWindowPermille: number;
  /** Dry compounds whose whole-remaining-race plan is within this of the best are all sensible choices. */
  readonly compoundToleranceMs: number;
  /**
   * ± spread of each car's crossover point (dry ↔ wet family) around the established weather rule. The crossover
   * itself, the compound choice and the use of current conditions + public forecast are unchanged; cars simply do not
   * all commit on exactly the same lap.
   */
  readonly crossoverSpreadPermille: number;
  /**
   * Track position given up by each FURTHER stop when comparing whole-race compound plans (rejoining behind cars that
   * must then be re-passed), scaled by the circuit's passing difficulty. Planning only; never a time penalty.
   */
  readonly extraStopTrackPositionMs: number;
}
export function defaultAiStrategyConfiguration(): AiStrategyConfiguration {
  return {
    version: 1, windowOpenPermille: 400, stopPointPermille: 650, preferenceSpreadPermille: 140, trafficWindowMs: 1500, trafficCostPermille: 110,
    maxTrafficPermille: 400, cleanAirBonusPermille: 80, undercutGapMs: 1500, undercutBonusPermille: 220, clearAirMs: 2500,
    extendBonusPermille: 180, forceStopPermille: 1700, neutralWindowPermille: 700, compoundToleranceMs: 1500,
    crossoverSpreadPermille: 250, extraStopTrackPositionMs: 6000,
  };
}
export function validateAiStrategyConfiguration(c: AiStrategyConfiguration) {
  const integer = (n: number, min: number, max: number) => {
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new RangeError("Invalid AI strategy configuration");
  };
  if (c.version !== 1) throw new RangeError("Unsupported AI strategy configuration");
  integer(c.windowOpenPermille, 100, 1000);
  integer(c.stopPointPermille, c.windowOpenPermille, 3000);
  integer(c.preferenceSpreadPermille, 0, 500);
  integer(c.trafficWindowMs, 0, 10000);
  integer(c.trafficCostPermille, 0, 1000);
  integer(c.maxTrafficPermille, 0, 2000);
  integer(c.cleanAirBonusPermille, 0, 500);
  integer(c.undercutGapMs, 0, 10000);
  integer(c.undercutBonusPermille, 0, 1000);
  integer(c.clearAirMs, 0, 20000);
  integer(c.extendBonusPermille, 0, 1000);
  integer(c.forceStopPermille, 1000, 5000);
  integer(c.neutralWindowPermille, 0, 1000);
  integer(c.compoundToleranceMs, 0, 60000);
  integer(c.crossoverSpreadPermille, 0, 500);
  integer(c.extraStopTrackPositionMs, 0, 60000);
}

/** Stable per-car strategic character. Never exposed to the player; never derived from names. */
export interface StrategyPreference {
  /** −1 earliest-stopping … +1 longest-stint bias. */
  readonly stopBias: number;
  /** 0 … 1 appetite for an undercut (1 − this is the appetite to extend / overcut). */
  readonly undercut: number;
  /** 0.5 … 1.5 weight given to release traffic. */
  readonly trafficSensitivity: number;
  /** −1 softer … +1 harder compound preference among sensible choices. */
  readonly compound: number;
}
/**
 * FNV-1a (32-bit) of the Race seed and the entrant's frozen starting-grid slot, then a few seeded draws. The same Race
 * (seed + snapshot) always gives each car the same character — also across equivalent Career snapshots whose storage
 * IDs differ — and a new Race seed reshuffles it. Never derived from names, teams or storage IDs.
 */
export function strategyPreference(seed: number, gridPosition: number): StrategyPreference {
  let hash = 0x811c9dc5;
  for (const char of `${seed}␟${gridPosition}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  const random = createSeededRandom(hash >>> 0);
  random.next(); // decorrelate nearby hashes
  const unit = () => random.next() * 2 - 1;
  return { stopBias: unit(), undercut: random.next(), trafficSensitivity: 0.5 + random.next(), compound: unit() };
}

type PublicWeather = Omit<WeatherConfiguration, "timeline" | "initial">;
/** Public weather only: the truth timeline and initial state are removed before the policy sees the configuration. */
export function publicWeather(c: WeatherConfiguration): PublicWeather {
  const { timeline: _timeline, initial: _initial, ...rest } = c;
  void _timeline; void _initial;
  return rest;
}
/** 1.0 at the neutral overtaking difficulty (35); higher where passing is harder. */
const passingFactor = (input: RaceSimulationInput) => 0.5 + (input.interaction?.overtakingDifficulty ?? 35) / 70;
const isDry = (c: TyreCompound) => (TYRE_COMPOUNDS as readonly string[]).includes(c);

/**
 * Per-lap tyre + water cost of a stint from `initial`, as prefix sums (index n = first n laps), under the public
 * forecast. `life` is the longest stint the car can actually run: the stop rule forces a stop once wear reaches the
 * compound's cliff, so a stint may only start its last lap below the cliff.
 */
function stintCosts(initial: TyreState, laps: number, lap: number, weather: WeatherState, c: PublicWeather, tyres: TyreConfiguration) {
  const out = [0];
  let t = initial, w = weather, total = 0, life = laps;
  for (let n = 1; n <= laps; n++) {
    if (life === laps && t.wearPermille >= tyres.profiles[t.compound].cliffWear) life = n - 1;
    w = evolveWeather(w, forecastRain(c, lap + n + 1, w.rainfallIntensity), w.airTemperatureMilliC, c);
    const x = tyreContributions(t, tyres.profiles[t.compound]);
    total += x.tyreCompoundMs + x.tyreWearMs + x.tyreTemperatureMs + waterPenaltyMs(t.compound, w.trackWater, c);
    out.push(total);
    t = advanceWeatherTyre(t, tyres, w, c);
  }
  return Object.assign(out, { life });
}
function fresh(compound: TyreCompound, input: Pick<RaceSimulationInput, "pits">): TyreState {
  return { compound, ageLaps: 0, wearPermille: 0, temperatureMilliC: input.pits!.newTyreTemperatureMilliC };
}

export interface StrategyContext {
  readonly state: RaceSimulationState;
  readonly entrant: RaceEntrantState;
  readonly weather: WeatherState;
  readonly publicWeather: PublicWeather;
  /** Race Control mode at this checkpoint (current, never future). */
  readonly mode: "GREEN" | "VSC" | "SAFETY_CAR";
  /** Pit-lane loss under green running (the stop-cost reference for the window). */
  readonly greenPitLaneLossMs: number;
}
export interface StrategyAssessment {
  readonly compound: TyreCompound | null;
  readonly reason: "NO_WINDOW" | "WEATHER" | "FORCED" | "WINDOW" | "NEUTRAL" | "HOLD";
  /** Tyre gain over the planning horizon as a share of the green stop cost (‰). */
  readonly gainPermille: number;
  /** This car's stop point after preference, traffic, undercut and extension adjustments (‰). */
  readonly requiredPermille: number;
  readonly releaseTraffic: number;
}

/** Current rejoin estimate: cars whose present crossing time lies within the window around (own time + stop loss). */
export function releaseTraffic(state: RaceSimulationState, entrant: RaceEntrantState, stopLossMs: number, windowMs: number) {
  const rejoin = entrant.elapsedTimeMs + stopLossMs;
  return state.entrants.filter(e => e.entrantId !== entrant.entrantId && e.incident?.status !== "RETIRED" && e.completedLaps === entrant.completedLaps && Math.abs(e.elapsedTimeMs - rejoin) <= windowMs).length;
}

export function assessAiStop(ctx: StrategyContext, strategy: AiStrategyConfiguration, preference: StrategyPreference): StrategyAssessment {
  const { state, entrant: e } = ctx, input = state.input, lap = state.lap, c = ctx.publicWeather;
  const hold = (reason: StrategyAssessment["reason"], gainPermille = 0, requiredPermille = 0, traffic = 0): StrategyAssessment => ({ compound: null, reason, gainPermille, requiredPermille, releaseTraffic: traffic });
  const remaining = input.totalLaps - lap - 1; // a request commits after the next completed lap
  if (remaining < 1 || lap - e.stint!.startedAtLap < c.strategy.minimumStintLaps) return hold("NO_WINDOW");
  const pace = input.commands!.pace[e.commands!.paceMode];
  const tyres: TyreConfiguration = { ...input.tyres!, tyreWearMultiplierPermille: Math.round(input.tyres!.tyreWearMultiplierPermille * pace.tyreWearMultiplierPermille / 1000), tyreEnergyMultiplierPermille: Math.round(input.tyres!.tyreEnergyMultiplierPermille * pace.tyreEnergyMultiplierPermille / 1000) };
  const horizon = Math.min(remaining, c.strategy.horizonLaps);
  const current = advanceWeatherTyre(e.stint!.tyre, tyres, ctx.weather, c);
  const oldCost = stintCosts(current, horizon, lap, ctx.weather, c, tyres)[horizon];
  const available = WEATHER_TYRE_COMPOUNDS.filter(x => input.tyres!.profiles[x]);
  const options = available.map(compound => ({ compound, cost: stintCosts(fresh(compound, input), horizon, lap, ctx.weather, c, tyres)[horizon] }))
    .sort((a, b) => a.cost - b.cost || WEATHER_TYRE_COMPOUNDS.indexOf(a.compound) - WEATHER_TYRE_COMPOUNDS.indexOf(b.compound));
  const saving = oldCost - options[0].cost, service = input.pits!.stationaryBaseMs + c.strategy.marginMs;
  const effectiveThreshold = input.pits!.pitLaneLossMs + service, greenThreshold = ctx.greenPitLaneLossMs + service;
  // Weather crossover (dry ↔ wet family, or intermediate ↔ full wet): the established weather rule and compound
  // choice, with each car's own commitment point spread a little around it.
  if (!isDry(e.stint!.tyre.compound) || !isDry(options[0].compound)) {
    const required = Math.round(effectiveThreshold * (1000 + preference.stopBias * strategy.crossoverSpreadPermille) / 1000);
    return saving > required ? { ...hold("WEATHER"), compound: options[0].compound } : hold("NO_WINDOW");
  }
  const gain = Math.round(saving * 1000 / greenThreshold);
  // Future stints are planned at standard wear: the current pace mode (e.g. nursing a worn tyre) says nothing about
  // how the fresh set will be driven.
  const pick = () => dryCompound(ctx, strategy, preference, input.tyres!, remaining);
  const profile = input.tyres!.profiles[e.stint!.tyre.compound];
  if (gain >= strategy.forceStopPermille || e.stint!.tyre.wearPermille >= profile.cliffWear) return { ...hold("FORCED", gain), compound: pick() };
  const character = Math.round(preference.stopBias * strategy.preferenceSpreadPermille);
  // Each car's window floor is its own too (no shared lap where every early-biased car is clamped together).
  const floor = strategy.windowOpenPermille + Math.round(character / 2);
  if (gain < floor) return hold("NO_WINDOW", gain);
  if (ctx.mode !== "GREEN") {
    // A reduced-cost stop is attractive, but only for a tyre already well into its life, judged by each car's own
    // character (never the whole field on the same call).
    const required = strategy.neutralWindowPermille + character;
    return saving > effectiveThreshold && gain >= required ? { ...hold("NEUTRAL", gain, required), compound: pick() } : hold("HOLD", gain, required);
  }
  // The character shifts the green stop point only where that is a real strategic option, never a built-in handicap:
  // - a longer-stint bias applies only on a tyre that is still viable (the same limit as the extension option,
  //   halfway from degradation onset to the cliff) — past it the car would just be nursing a dying tyre;
  // - an earlier bias does not create a stop the Race does not need: none while the current tyre can reach the flag
  //   (standard wear, below its cliff), where only the neutral tyre-gain rule can call the car in.
  const viable = e.stint!.tyre.wearPermille < profile.degradationStartWear + Math.round((profile.cliffWear - profile.degradationStartWear) / 2);
  const reachesFlag = () => stintCosts(current, remaining, lap, ctx.weather, c, input.tyres!).life >= remaining;
  const bias = (preference.stopBias > 0 && !viable) || (preference.stopBias < 0 && reachesFlag()) ? 0 : character;
  // Release traffic: busier rejoin → wait (more so where passing is hard); a clean gap → go a little earlier.
  const traffic = releaseTraffic(state, e, input.pits!.pitLaneLossMs + input.pits!.stationaryBaseMs, strategy.trafficWindowMs);
  const passing = passingFactor(input);
  const trafficAdjust = traffic > 0
    ? Math.min(strategy.maxTrafficPermille, Math.round(traffic * strategy.trafficCostPermille * preference.trafficSensitivity * passing))
    : -Math.round(strategy.cleanAirBonusPermille * preference.trafficSensitivity);
  const ahead = state.entrants.find(x => x.position === e.position - 1 && x.incident?.status !== "RETIRED");
  const behind = state.entrants.find(x => x.position === e.position + 1 && x.incident?.status !== "RETIRED");
  const undercut = ahead && e.intervalToAheadMs !== null && e.intervalToAheadMs <= strategy.undercutGapMs && ahead.stint!.tyre.ageLaps + 2 >= e.stint!.tyre.ageLaps
    ? -Math.round(strategy.undercutBonusPermille * preference.undercut) : 0;
  const clearAhead = !ahead || e.intervalToAheadMs === null || e.intervalToAheadMs > strategy.clearAirMs;
  const safeBehind = !behind || behind.intervalToAheadMs === null || behind.intervalToAheadMs > 1000;
  const extend = clearAhead && safeBehind && viable
    ? Math.round(strategy.extendBonusPermille * (1 - preference.undercut)) : 0;
  const required = Math.max(floor, strategy.stopPointPermille + bias + trafficAdjust + undercut + extend);
  return gain >= required ? { ...hold("WINDOW", gain, required, traffic), compound: pick() } : hold("HOLD", gain, required, traffic);
}

/**
 * Dry compound for the rest of the Race: each fresh compound is costed as a whole-remaining-distance plan (run to
 * the flag, or one further stop onto the best follow-up compound). Every compound within the tolerance of the best
 * plan is a sensible choice and the car's own softer/harder preference picks among them; a compound that is clearly
 * worse is never chosen, so there is no fake diversity.
 */
export function dryCompound(ctx: StrategyContext, strategy: AiStrategyConfiguration, preference: StrategyPreference, tyres: TyreConfiguration, remaining: number): TyreCompound {
  const input = ctx.state.input, lap = ctx.state.lap;
  const dry: TyreCompound[] = TYRE_COMPOUNDS.filter(x => input.tyres!.profiles[x]);
  const prefix = new Map(dry.map(x => [x, stintCosts(fresh(x, input), remaining, lap, ctx.weather, ctx.publicWeather, tyres)]));
  // A further stop costs the pit loss, the strategy margin and the track position given up (harder to recover where
  // passing is difficult).
  const stop = ctx.greenPitLaneLossMs + input.pits!.stationaryBaseMs + ctx.publicWeather.strategy.marginMs + Math.round(strategy.extraStopTrackPositionMs * passingFactor(input)),
    minimum = ctx.publicWeather.strategy.minimumStintLaps;
  // Only plans the car can actually drive: a stint never runs past its compound's cliff (where the stop rule would
  // force an unplanned extra stop). If no compound can finish within one further stop, the constraint is relaxed.
  const plan = (x: TyreCompound, feasibleOnly: boolean) => {
    const costs = prefix.get(x)!, fits = (y: TyreCompound, laps: number) => !feasibleOnly || laps <= prefix.get(y)!.life;
    let best = fits(x, remaining) ? costs[remaining] : Infinity;
    for (let k = minimum; k <= remaining - minimum; k++)
      for (const y of dry) if (fits(x, k) && fits(y, remaining - k)) best = Math.min(best, costs[k] + stop + prefix.get(y)![remaining - k]);
    return best;
  };
  const feasible = dry.map(compound => ({ compound, cost: plan(compound, true) }));
  const plans = feasible.some(p => Number.isFinite(p.cost)) ? feasible : dry.map(compound => ({ compound, cost: plan(compound, false) }));
  const best = Math.min(...plans.map(p => p.cost));
  const sensible = plans.filter(p => p.cost - best <= strategy.compoundToleranceMs).map(p => p.compound); // softest → hardest
  const index = Math.min(sensible.length - 1, Math.max(0, Math.round((preference.compound + 1) / 2 * (sensible.length - 1))));
  return sensible[index];
}

/**
 * Dry-start tyre from the same character: most cars start on the medium, a strong soft preference starts on the soft.
 * Never the hard: without a two-compound rule a hard start can run the whole Race without stopping, which the current
 * (deliberately untouched) degradation makes dominant rather than a strategic alternative.
 */
export function aiDryStartingCompound(preference: StrategyPreference): TyreCompound {
  return preference.compound <= -0.55 ? "SOFT" : "MEDIUM";
}

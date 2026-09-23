import type { RandomSource } from "../../core/random";
import type { RaceEntrantState, RaceSimulationInput } from "../types";
export interface DriverInteractionProfile {
  readonly overtaking: number;
  readonly defending: number;
}
/** All integer provisional v3 tuning, snapshotted at race start. */
export interface InteractionConfiguration {
  readonly overtakingDifficulty: number;
  readonly dirtyAirSensitivityPermille: number;
  readonly drsEffectivenessPermille: number;
  readonly drsZoneCount: number;
  readonly dirtyAirThresholdMs: number;
  readonly maxDirtyAirMs: number;
  readonly attackThresholdMs: number;
  readonly minimumGapMs: number;
  readonly minimumPaceAdvantageMs: number;
  readonly opportunityIntervalLaps: number;
  readonly drsActivationLap: number;
  readonly drsThresholdMs: number;
  readonly drsMsPerZone: number;
  readonly maxDrsBenefitMs: number;
}
export interface TrackState {
  /** Leader-relative lap-equivalent distance at the lap checkpoint; may be negative on grid. */
  readonly progressMicrolaps: number;
  /** Eligibility at the most recent lap's detection checkpoint, not next-lap eligibility. */
  readonly drsEligible: boolean;
  readonly overtakesCompleted: number;
  readonly potentialLapTimeMs: number;
  readonly dirtyAirMs: number;
  readonly drsBenefitMs: number;
  readonly trafficLossMs: number;
  readonly attempted: boolean;
  readonly passed: boolean;
}
export interface OvertakeAttempt {
  readonly lap: number;
  readonly attackerId: string;
  readonly defenderId: string;
  readonly gapMs: number;
  readonly drs: boolean;
  readonly probabilityPermille: number;
  readonly success: boolean;
}
function integer(n: number, min: number, max: number) {
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new RangeError("Invalid interaction input");
}
export function validateInteraction(c: InteractionConfiguration) {
  integer(c.overtakingDifficulty, 0, 100);
  integer(c.dirtyAirSensitivityPermille, 0, 2000);
  integer(c.drsEffectivenessPermille, 0, 2000);
  integer(c.drsZoneCount, 0, 4);
  integer(c.dirtyAirThresholdMs, 1, 10000);
  integer(c.maxDirtyAirMs, 0, 2000);
  integer(c.minimumGapMs, 1, 500);
  integer(c.attackThresholdMs, c.minimumGapMs, 2000);
  integer(c.minimumPaceAdvantageMs, 0, 2000);
  integer(c.opportunityIntervalLaps, 1, 10);
  integer(c.drsActivationLap, 1, 1000);
  integer(c.drsThresholdMs, 1, 5000);
  integer(c.drsMsPerZone, 0, 500);
  integer(c.maxDrsBenefitMs, 0, 500);
}
export function validateDriverInteraction(p: DriverInteractionProfile) {
  integer(p.overtaking, 0, 100);
  integer(p.defending, 0, 100);
}
export function initialTrackState(): TrackState {
  return {
    progressMicrolaps: 0,
    drsEligible: false,
    overtakesCompleted: 0,
    potentialLapTimeMs: 0,
    dirtyAirMs: 0,
    drsBenefitMs: 0,
    trafficLossMs: 0,
    attempted: false,
    passed: false,
  };
}
export function followingEffects(
  gapMs: number | null,
  lap: number,
  c: InteractionConfiguration,
) {
  const drsEligible =
    gapMs !== null &&
    gapMs >= 0 &&
    gapMs <= c.drsThresholdMs &&
    lap >= c.drsActivationLap &&
    c.drsZoneCount > 0 &&
    c.drsEffectivenessPermille > 0;
  const dirtyAirMs =
    gapMs === null
      ? 0
      : Math.round(
          ((c.maxDirtyAirMs * c.dirtyAirSensitivityPermille) / 1000) *
            Math.max(0, 1 - gapMs / c.dirtyAirThresholdMs),
        );
  const drsBenefitMs = drsEligible
    ? Math.min(
        c.maxDrsBenefitMs,
        Math.round(
          (c.drsZoneCount * c.drsMsPerZone * c.drsEffectivenessPermille) / 1000,
        ),
      )
    : 0;
  return { drsEligible, dirtyAirMs, drsBenefitMs };
}
export function passProbability(
  paceAdvantageMs: number,
  attacker: DriverInteractionProfile,
  defender: DriverInteractionProfile,
  carDelta: number,
  drs: boolean,
  c: InteractionConfiguration,
) {
  return Math.max(
    0,
    Math.min(
      950,
      Math.round(
        30 +
          paceAdvantageMs * 0.4 +
          (attacker.overtaking - defender.defending) * 3 +
          carDelta * 3 -
          c.overtakingDifficulty * 3 +
          (drs ? (120 * c.drsEffectivenessPermille) / 1000 : 0),
      ),
    ),
  );
}
/** Preserve supplied physical order. Never sort by candidate elapsed time. */
export function orderedClassification(
  entrants: readonly RaceEntrantState[],
  input: RaceSimulationInput,
): RaceEntrantState[] {
  return entrants.map((e, i) => {
    const leader = entrants[0],
      ahead = entrants[i - 1];
    const gap =
      e.completedLaps === leader.completedLaps
        ? e.elapsedTimeMs - leader.elapsedTimeMs
        : null;
    const interval =
      i === 0
        ? 0
        : e.completedLaps === ahead.completedLaps
          ? e.elapsedTimeMs - ahead.elapsedTimeMs
          : null;
    if ((gap !== null && gap < 0) || (interval !== null && interval < 0))
      throw new RangeError("Invalid ordered crossing times");
    return {
      ...e,
      position: i + 1,
      gapToLeaderMs: gap,
      intervalToAheadMs: interval,
      track: {
        ...e.track!,
        progressMicrolaps:
          e.completedLaps * 1000000 -
          Math.round(
            ((e.elapsedTimeMs - leader.elapsedTimeMs) /
              input.circuit.baseLapTimeMs) *
              1000000,
          ),
      },
    };
  });
}
/** One opportunity every configured N laps, front-to-back, disjoint adjacent pairs.
 * All potential-lap RNG draws have already occurred in fixed grid order.
 * Consume exactly one extra draw per eligible attempt, including probability zero.
 */
export function resolveTraffic(
  previous: readonly RaceEntrantState[],
  potential: readonly RaceEntrantState[],
  input: RaceSimulationInput,
  lap: number,
  random: RandomSource,
) {
  const c = input.interaction!;
  const order = [...previous].sort((a, b) => a.position - b.position);
  if (order.some((e, i) => e.position !== i + 1 || !e.track))
    throw new RangeError("Invalid persisted track order");
  const oldById = new Map(order.map((e) => [e.entrantId, e]));
  const source = new Map(input.entrants.map((e) => [e.entrantId, e]));
  const raw = new Map(potential.map((e) => [e.entrantId, e]));
  const cars = order.map((old, i) => {
    const e = raw.get(old.entrantId)!;
    const ahead = order[i - 1];
    const effects = followingEffects(
      ahead && ahead.completedLaps === old.completedLaps
        ? old.elapsedTimeMs - ahead.elapsedTimeMs
        : null,
      lap,
      c,
    );
    const effective = Math.max(
      1,
      e.lastLapTimeMs! + effects.dirtyAirMs - effects.drsBenefitMs,
    );
    return {
      ...e,
      elapsedTimeMs: old.elapsedTimeMs + effective,
      track: {
        ...old.track!,
        ...effects,
        potentialLapTimeMs: e.lastLapTimeMs!,
        trafficLossMs: 0,
        attempted: false,
        passed: false,
      },
    };
  });
  const attempts: OvertakeAttempt[] = [];
  const paired = new Set<string>();
  for (let i = 1; i < cars.length; i++) {
    const defender = cars[i - 1],
      attacker = cars[i];
    const oldA = oldById.get(attacker.entrantId)!,
      oldD = oldById.get(defender.entrantId)!;
    if (oldA.completedLaps !== oldD.completedLaps) continue; // no blue-flag/lapped-car attacks
    const a = source.get(attacker.entrantId)!,
      d = source.get(defender.entrantId)!;
    const pace =
      defender.elapsedTimeMs -
      oldD.elapsedTimeMs -
      (attacker.elapsedTimeMs - oldA.elapsedTimeMs);
    const projectedGap = attacker.elapsedTimeMs - defender.elapsedTimeMs;
    if (
      lap % c.opportunityIntervalLaps === 0 &&
      projectedGap <= c.attackThresholdMs &&
      pace >= c.minimumPaceAdvantageMs &&
      !paired.has(attacker.entrantId) &&
      !paired.has(defender.entrantId)
    ) {
      const probabilityPermille = passProbability(
        pace,
        a.interaction!,
        d.interaction!,
        a.car.performance - d.car.performance,
        attacker.track.drsEligible,
        c,
      );
      const draw = random.next();
      if (!Number.isFinite(draw) || draw < 0 || draw >= 1)
        throw new RangeError("Invalid interaction RNG");
      const success = draw * 1000 < probabilityPermille;
      attempts.push({
        lap,
        attackerId: attacker.entrantId,
        defenderId: defender.entrantId,
        gapMs: Math.max(0, projectedGap),
        drs: attacker.track.drsEligible,
        probabilityPermille,
        success,
      });
      attacker.track = {
        ...attacker.track,
        attempted: true,
        passed: success,
        overtakesCompleted:
          attacker.track.overtakesCompleted + (success ? 1 : 0),
      };
      paired.add(attacker.entrantId);
      paired.add(defender.entrantId);
      if (success) {
        cars[i - 1] = attacker;
        cars[i] = defender;
      }
    }
    // Resolve this pair before downstream attempts. Delaying a caught car represents traffic cost.
    const ahead = cars[i - 1],
      behind = cars[i];
    if (i > 1)
      ahead.elapsedTimeMs = Math.max(
        ahead.elapsedTimeMs,
        cars[i - 2].elapsedTimeMs + c.minimumGapMs,
      );
    behind.elapsedTimeMs = Math.max(
      behind.elapsedTimeMs,
      ahead.elapsedTimeMs + c.minimumGapMs,
    );
  }
  const result = cars.map((e) => {
    const old = oldById.get(e.entrantId)!;
    const actual = e.elapsedTimeMs - old.elapsedTimeMs;
    const effective = Math.max(
      1,
      e.track.potentialLapTimeMs + e.track.dirtyAirMs - e.track.drsBenefitMs,
    );
    return {
      ...e,
      lastLapTimeMs: actual,
      bestLapTimeMs: Math.min(old.bestLapTimeMs ?? actual, actual),
      track: { ...e.track, trafficLossMs: Math.max(0, actual - effective) },
    };
  });
  return { entrants: orderedClassification(result, input), attempts };
}

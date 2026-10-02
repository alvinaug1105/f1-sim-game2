import type { RandomSource } from "../../core/random";
import type { RaceEntrantState, RaceSimulationInput } from "../types";
import type { RacecraftConfiguration } from "./racecraft";
import { TYRE_COMPOUNDS } from "../tyres/model";
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
/** Safe post-hoc explanation of a completed pass (public facts only: tyres, ERS mode in use, DRS, relative pace). */
export type OvertakeCause = "TYRE" | "ERS" | "DRS" | "PACE" | "OVERTAKE_MODE" | "BOOST";
export interface OvertakeAttempt {
  readonly lap: number;
  readonly attackerId: string;
  readonly defenderId: string;
  readonly gapMs: number;
  readonly drs: boolean;
  readonly probabilityPermille: number;
  readonly success: boolean;
  /** Racecraft Races only. */
  readonly cause?: OvertakeCause;
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
/** Tyre family advantage for the cause label: a fresher tyre of the same family, or a softer dry compound. */
function tyreAdvantage(attacker: RaceEntrantState, defender: RaceEntrantState, racecraft: RacecraftConfiguration) {
  const a = attacker.stint?.tyre, d = defender.stint?.tyre;
  if (!a || !d) return false;
  const dry = (c: string) => (TYRE_COMPOUNDS as readonly string[]).indexOf(c);
  if (dry(a.compound) >= 0 && dry(d.compound) >= 0 && dry(a.compound) < dry(d.compound)) return true;
  return a.compound === d.compound && d.ageLaps - a.ageLaps >= racecraft.aiTyreAgeEdgeLaps;
}
function overtakeCause(attacker: RaceEntrantState, defender: RaceEntrantState, drs: boolean, racecraft: RacecraftConfiguration): OvertakeCause {
  if (tyreAdvantage(attacker, defender, racecraft)) return "TYRE";
  if (attacker.commands && (attacker.commands.ersMode === "OVERTAKE" || attacker.commands.ersMode === "DEPLOY")) return "ERS";
  return drs ? "DRS" : "PACE";
}
/**
 * Attack edge from the full expected-pace edge: the attacker's net command advantage counts only up to
 * `commandEdgePermille` of itself and never more than `commandEdgeCapMs` (Races frozen without these fields count it in
 * full, as before). A defender's own commands and every non-command difference count in full. `excessMs` is the
 * command pace that was not counted; it is also kept out of pressure, so it cannot re-enter through the floor.
 */
export function attackEdge(fullEdgeMs: number, commandEdgeMs: number, racecraft: RacecraftConfiguration) {
  if (racecraft.commandEdgePermille === undefined || racecraft.commandEdgeCapMs === undefined || commandEdgeMs <= 0) return { edge: fullEdgeMs, excessMs: 0 };
  const counted = Math.min(racecraft.commandEdgeCapMs, Math.round(commandEdgeMs * racecraft.commandEdgePermille / 1000));
  return { edge: fullEdgeMs - (commandEdgeMs - counted), excessMs: commandEdgeMs - counted };
}
/**
 * Racecraft traffic (new Career Races): close-racing pressure instead of a frozen queue.
 * - Every lap is an opportunity; each car may attack once and be attacked once per lap, and a car that has just lost
 *   a place cannot counter-attack in the same lap (no impossible multi-car swaps), so long trains are not starved.
 * - Eligibility and probability read the LEGITIMATE pace edge: both cars' expected laps without this lap's random
 *   variation (car, driver, tyres, fuel, commands, water), so a lucky lap or the defender's own dirty air never
 *   creates an attack. Dirty air still makes following hard and the circuit profile still scales everything.
 * - A held car that does not attack suffers close-range turbulence. New Races also account for the pace it had to
 *   give back while following; the larger of these two costs opens a natural gap without counting both costs.
 * - Pressure: pace a held car could not use this lap, plus last lap's persisted traffic loss when it was already
 *   close (and did not pit), capped. It resets by itself when the gap opens, after a pass, a stop or SC/VSC.
 * - A failed attack costs the attacker time, scaled by how clearly it failed (the same single draw): no fixed
 *   following gap, no cosmetic randomness, no extra RNG.
 */
function resolveRacecraftTraffic(
  previous: readonly RaceEntrantState[],
  potential: readonly RaceEntrantState[],
  input: RaceSimulationInput,
  lap: number,
  random: RandomSource,
  racecraft: RacecraftConfiguration,
  expectedLapMs: ReadonlyMap<string, number> | undefined,
  commandLapMs: ReadonlyMap<string, number> | undefined,
) {
  // Legitimate pace: each car's lap without this lap's random variation (car, driver, tyres, fuel, commands, water).
  const pace = (e: RaceEntrantState) => expectedLapMs?.get(e.entrantId) ?? e.track!.potentialLapTimeMs;
  const command = (e: RaceEntrantState) => commandLapMs?.get(e.entrantId) ?? 0;
  const commandEdgeOf = (defender: RaceEntrantState, attacker: RaceEntrantState) => command(defender) - command(attacker);
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
    const effects = followingEffects(ahead && ahead.completedLaps === old.completedLaps ? old.elapsedTimeMs - ahead.elapsedTimeMs : null, lap, c);
    const effective = Math.max(1, e.lastLapTimeMs! + effects.dirtyAirMs - effects.drsBenefitMs);
    return {
      ...e,
      elapsedTimeMs: old.elapsedTimeMs + effective,
      track: { ...old.track!, ...effects, potentialLapTimeMs: e.lastLapTimeMs!, trafficLossMs: 0, attempted: false, passed: false },
    };
  });
  const attempts: OvertakeAttempt[] = [];
  const attacked = new Set<string>(), attacking = new Set<string>(), lost = new Set<string>();
  for (let i = 1; i < cars.length; i++) {
    const defender = cars[i - 1], attacker = cars[i];
    const oldA = oldById.get(attacker.entrantId)!, oldD = oldById.get(defender.entrantId)!;
    // The car ahead is final at this point; a car is never allowed closer than the physical minimum.
    if (i > 1) defender.elapsedTimeMs = Math.max(defender.elapsedTimeMs, cars[i - 2].elapsedTimeMs + c.minimumGapMs);
    const floor = defender.elapsedTimeMs + c.minimumGapMs;
    if (oldA.completedLaps === oldD.completedLaps && !attacked.has(defender.entrantId) && !attacking.has(attacker.entrantId) && !lost.has(attacker.entrantId)) {
      const a = source.get(attacker.entrantId)!, d = source.get(defender.entrantId)!;
      // Command-driven pace moves the car on track in full, but only a bounded share of the attacker's NET command
      // advantage counts towards the pass itself: pressing buttons creates an attack, it does not buy a pass. The
      // car's real performance edge (car, driver, tyres, fuel load, water) always counts in full.
      const { edge, excessMs } = attackEdge(pace(defender) - pace(attacker), commandEdgeOf(defender, attacker), racecraft);
      const projectedGap = attacker.elapsedTimeMs - defender.elapsedTimeMs;
      const oldGap = oldA.elapsedTimeMs - oldD.elapsedTimeMs;
      const pittedLastLap = oldA.pit?.stops.at(-1)?.lap === lap - 1;
      const carried = oldGap <= c.attackThresholdMs && !pittedLastLap ? oldA.track!.trafficLossMs : 0;
      const pressure = Math.min(racecraft.pressureCapMs, Math.max(0, Math.max(0, floor - attacker.elapsedTimeMs) + carried - excessMs));
      if (projectedGap <= c.attackThresholdMs && edge >= c.minimumPaceAdvantageMs) {
        const probabilityPermille = Math.min(950, passProbability(edge, a.interaction!, d.interaction!, a.car.performance - d.car.performance, attacker.track.drsEligible, c) + Math.floor((pressure * racecraft.pressurePermillePer10Ms) / 10));
        const draw = random.next();
        if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new RangeError("Invalid interaction RNG");
        const success = draw * 1000 < probabilityPermille;
        attempts.push({ lap, attackerId: attacker.entrantId, defenderId: defender.entrantId, gapMs: Math.max(0, projectedGap), drs: attacker.track.drsEligible, probabilityPermille, success, ...(success ? { cause: overtakeCause(attacker, defender, attacker.track.drsEligible, racecraft) } : {}) });
        attacker.track = { ...attacker.track, attempted: true, passed: success, overtakesCompleted: attacker.track.overtakesCompleted + (success ? 1 : 0) };
        attacking.add(attacker.entrantId);
        attacked.add(defender.entrantId);
        if (success) {
          lost.add(defender.entrantId);
          cars[i - 1] = attacker;
          cars[i] = defender;
          if (i > 1) attacker.elapsedTimeMs = Math.max(attacker.elapsedTimeMs, cars[i - 2].elapsedTimeMs + c.minimumGapMs);
        } else {
          const clearly = probabilityPermille >= 1000 ? 0 : Math.min(1, (draw * 1000 - probabilityPermille) / (1000 - probabilityPermille));
          attacker.elapsedTimeMs = Math.max(attacker.elapsedTimeMs, floor + Math.round(clearly * racecraft.failedAttackLossMaxMs));
        }
      }
    }
    const ahead = cars[i - 1], behind = cars[i];
    const held = ahead.elapsedTimeMs + c.minimumGapMs;
    if (behind.elapsedTimeMs < held && !behind.track.attempted) {
      const closeRange = followingEffects(c.minimumGapMs, lap, c).dirtyAirMs;
      const turbulenceMs = Math.max(0, Math.round((closeRange - behind.track.dirtyAirMs) / 2));
      // The car had to give back `held - elapsed` of its projected pace to preserve order. In a new Race, a share of
      // that real held pace is lost while following; old snapshots without both fields retain the exact old result.
      // A completed pass uses the established pass separation, not this caught-car rule.
      const heldPaceMs = !ahead.track.passed && racecraft.heldFollowingLossPermille !== undefined
        ? Math.min(racecraft.heldFollowingLossMaxMs!, Math.round((held - behind.elapsedTimeMs) * racecraft.heldFollowingLossPermille / 1000))
        : 0;
      behind.elapsedTimeMs = held + Math.max(turbulenceMs, heldPaceMs);
    }
    behind.elapsedTimeMs = Math.max(behind.elapsedTimeMs, held);
  }
  const result = cars.map((e) => {
    const old = oldById.get(e.entrantId)!;
    const actual = e.elapsedTimeMs - old.elapsedTimeMs;
    const effective = Math.max(1, e.track.potentialLapTimeMs + e.track.dirtyAirMs - e.track.drsBenefitMs);
    return { ...e, lastLapTimeMs: actual, bestLapTimeMs: Math.min(old.bestLapTimeMs ?? actual, actual), track: { ...e.track, trafficLossMs: Math.max(0, actual - effective) } };
  });
  return { entrants: orderedClassification(result, input), attempts };
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
  /** Racecraft only: each car's expected lap without this lap's random variation (legitimate pace). */
  expectedLapMs?: ReadonlyMap<string, number>,
  /** Racecraft only: the part of each car's lap that comes from its command modes (pace, fuel, ERS). */
  commandLapMs?: ReadonlyMap<string, number>,
) {
  if (input.commands?.racecraft) return resolveRacecraftTraffic(previous, potential, input, lap, random, input.commands.racecraft, expectedLapMs, commandLapMs);
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

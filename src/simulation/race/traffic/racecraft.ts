/**
 * Racecraft (Post-Beta Race Experience pass): close-racing pressure and selective AI aggression.
 *
 * Frozen into each NEW Career Race as `commands.racecraft` (the command profile is stored as JSON, so no schema
 * change). Races saved before it have no racecraft block and keep the previous traffic and AI command behaviour
 * exactly. All integer tuning; deterministic; no names, teams or player/AI identity anywhere.
 */
export interface RacecraftConfiguration {
  readonly version: 1;
  /** Held pace a car can carry as attacking pressure (ms): this lap's absorbed pace plus last lap's traffic loss. */
  readonly pressureCapMs: number;
  /** Pass probability (‰) added per 10 ms of pressure. */
  readonly pressurePermillePer10Ms: number;
  /** A failed attack costs the attacker up to this much (ms), scaled by how clearly it failed (the same draw). */
  readonly failedAttackLossMaxMs: number;
  /** AI: a car behind is an attacker only when it has a genuine basis — held back, or this much fresher tyre (laps). */
  readonly aiTyreAgeEdgeLaps: number;
  /** AI: being held back by at least this much last lap (ms) counts as a genuine pace edge. */
  readonly aiHeldEdgeMs: number;
  /** AI: gap to the car ahead / behind (ms) within which attacking / defending commands are considered. */
  readonly aiAttackGapMs: number;
  readonly aiDefendGapMs: number;
  /** AI: minimum ERS charge to spend on an OVERTAKE deployment (a short, strategic attack tool). */
  readonly aiOvertakeCharge: number;
  /** AI: laps after being passed before answering the passer on the "held" basis alone. */
  readonly aiCounterAttackCooldownLaps: number;
  /**
   * Command-driven attack edge (focused repair). Share (‰) of the attacker's NET command pace advantage (pace, fuel and
   * ERS modes over the defender's) that counts towards the pass, and its ceiling (ms). The lap-time effect on track is
   * unchanged. Absent in Races frozen before the repair, which count command pace in full.
   */
  readonly commandEdgePermille?: number;
  readonly commandEdgeCapMs?: number;
  /**
   * AI: a car directly behind whose current commands are worth at least this much lap time (ms) over neutral running is
   * a genuine closing threat, whoever drives it. Absent in Races frozen before the repair.
   */
  readonly aiThreatEdgeMs?: number;
  /**
   * Fuel starvation (closure repair): a car without usable fuel for the lap is stricken — it leaves the traffic
   * resolution (nobody queues behind it) and pulls off at the end of that lap as a FUEL_STARVATION retirement. Absent in
   * Races frozen before the repair, where a starved car keeps circulating with the exhaustion penalty.
   */
  readonly fuelStarvationRetirement?: boolean;
  /**
   * A non-attacking car held at the physical gap gives back this share (‰) of the pace it could not use, capped in ms.
   * This creates real following loss when a faster car catches an 80 ms gap; absent in older saved Races, the original
   * close-range dirty-air rule is used unchanged. The two following costs are alternatives, not cumulative.
   */
  readonly heldFollowingLossPermille?: number;
  readonly heldFollowingLossMaxMs?: number;
  /**
   * Race v8D late-Race window (GAME TUNING; present together, revision-4 snapshots only). Once the ATTACKER itself has
   * completed `lateRaceStartPermille` of the scheduled distance, an ordinary (non-lapping) attack may start from
   * `lateRaceAttackThresholdPermille` of the circuit's attack threshold, and needs at least
   * `lateRaceMinimumPaceAdvantagePermille` of the circuit's minimum pace edge. The pass probability formula is unchanged,
   * a genuine pace edge is still required, and no energy is created. Absent = the earlier gate exactly.
   */
  readonly lateRaceStartPermille?: number;
  readonly lateRaceAttackThresholdPermille?: number;
  readonly lateRaceMinimumPaceAdvantagePermille?: number;
  /**
   * Race v8D progression held-following loss (GAME TUNING; present together, revision-4 snapshots only). In the v8
   * progression engine a car whose movement is clamped to the physical minimum gap, in green running, that has not
   * already attempted (or completed) a pass on this lap, owes this share (‰) of the pace it could not use, capped per
   * checkpoint in ms, and gives it up as a real drop-back (see `progressionHeldRelease`) — so a held car falls off the
   * floor instead of riding it exactly. Distinct from `heldFollowingLoss*` (the v7
   * traffic model), so accepted revision-3 snapshots, which carry those, are never retuned. Absent = clamp only.
   */
  readonly progressionHeldFollowingLossPermille?: number;
  readonly progressionHeldFollowingLossMaxMs?: number;
  /**
   * Race v8E attack cadence (GAME TUNING; present together, revision-5 snapshots only). Replaces "one attempt per lap"
   * with a deterministic re-attempt rule: a further attempt needs `attackCooldownMs` of Race clock since the last one,
   * the battle to have RE-ARMED (the gap to the car ahead re-opened to at least `attackRearmGapMs` after the attempt,
   * then the follower re-closed into attack range) and fewer than `maxAttacksPerLap` attempts this lap. The first
   * attempt of a lap needs only the cooldown. Never per-slice dice: at most `maxAttacksPerLap` draws per car per lap.
   * Absent = one attempt per lap exactly as before.
   */
  readonly attackCooldownMs?: number;
  readonly attackRearmGapMs?: number;
  readonly maxAttacksPerLap?: number;
}
export function defaultRacecraftConfiguration(): RacecraftConfiguration {
  return {
    version: 1,
    pressureCapMs: 500,
    pressurePermillePer10Ms: 3,
    failedAttackLossMaxMs: 450,
    aiTyreAgeEdgeLaps: 8,
    aiHeldEdgeMs: 60,
    aiAttackGapMs: 1000,
    aiDefendGapMs: 600,
    aiOvertakeCharge: 400,
    aiCounterAttackCooldownLaps: 3,
    commandEdgePermille: 350,
    commandEdgeCapMs: 300,
    aiThreatEdgeMs: 400,
    fuelStarvationRetirement: true,
    heldFollowingLossPermille: 500,
    heldFollowingLossMaxMs: 250,
  };
}
/** Race v8D (revision 4) racecraft: the accepted configuration plus the late-Race attack window (GAME TUNING). */
export function v8dRacecraftConfiguration(): RacecraftConfiguration {
  return { ...defaultRacecraftConfiguration(), lateRaceStartPermille: 750, lateRaceAttackThresholdPermille: 1300, lateRaceMinimumPaceAdvantagePermille: 800,
    progressionHeldFollowingLossPermille: 500, progressionHeldFollowingLossMaxMs: 250 };
}
/**
 * The attack window for one ordinary (non-lapping) attempt. "Late" is judged by the attacker's OWN completed distance
 * (`completedLaps * 1000 >= totalLaps * lateRaceStartPermille`), never by the leader's lap. Callers apply it only to
 * ordinary racing — never to lapping / blue flags, cars in the pit lane, under SC/VSC, or retired cars.
 */
export function lateRaceAttackWindow(racecraft: RacecraftConfiguration | undefined, base: { readonly attackThresholdMs: number; readonly minimumPaceAdvantageMs: number }, completedLaps: number, totalLaps: number) {
  const start = racecraft?.lateRaceStartPermille;
  const late = start !== undefined && completedLaps * 1000 >= totalLaps * start;
  return late
    // A genuine pace edge is always required (at least 1 ms), even where the circuit's own minimum is tiny.
    ? { late, attackThresholdMs: Math.round(base.attackThresholdMs * racecraft!.lateRaceAttackThresholdPermille! / 1000), minimumPaceAdvantageMs: Math.max(1, Math.round(base.minimumPaceAdvantageMs * racecraft!.lateRaceMinimumPaceAdvantagePermille! / 1000)) }
    : { late, attackThresholdMs: base.attackThresholdMs, minimumPaceAdvantageMs: base.minimumPaceAdvantageMs };
}
/**
 * Race v8E (revision 5) racecraft — GAME TUNING. The accepted racecraft plus:
 * - the attack cadence (re-attempt after a cooldown once the battle has re-armed; at most two attempts a lap);
 * - the v8D held-following drop-back (same mechanism);
 * - NO late-Race attack window: v8D's widening was measured ineffective (more failed attempts, no more passes).
 */
export const V8E_ATTACK_COOLDOWN_MS = 8000;
export const V8E_ATTACK_REARM_GAP_MS = 300;
export const V8E_MAX_ATTACKS_PER_LAP = 2;
export function v8eRacecraftConfiguration(): RacecraftConfiguration {
  return { ...defaultRacecraftConfiguration(), progressionHeldFollowingLossPermille: 500, progressionHeldFollowingLossMaxMs: 250,
    attackCooldownMs: V8E_ATTACK_COOLDOWN_MS, attackRearmGapMs: V8E_ATTACK_REARM_GAP_MS, maxAttacksPerLap: V8E_MAX_ATTACKS_PER_LAP };
}
function integer(n: number, lo: number, hi: number) {
  if (!Number.isSafeInteger(n) || n < lo || n > hi) throw new RangeError("Invalid racecraft configuration");
}
export function validateRacecraftConfiguration(c: RacecraftConfiguration) {
  if (c.version !== 1) throw new RangeError("Unsupported racecraft configuration");
  integer(c.pressureCapMs, 0, 3000);
  integer(c.pressurePermillePer10Ms, 0, 100);
  integer(c.failedAttackLossMaxMs, 0, 3000);
  integer(c.aiTyreAgeEdgeLaps, 1, 100);
  integer(c.aiHeldEdgeMs, 0, 5000);
  integer(c.aiAttackGapMs, 0, 10000);
  integer(c.aiDefendGapMs, 0, 10000);
  integer(c.aiOvertakeCharge, 0, 1000);
  integer(c.aiCounterAttackCooldownLaps, 0, 20);
  if ((c.commandEdgePermille === undefined) !== (c.commandEdgeCapMs === undefined)) throw new RangeError("Invalid racecraft configuration");
  if (c.commandEdgePermille !== undefined) integer(c.commandEdgePermille, 0, 1000);
  if (c.commandEdgeCapMs !== undefined) integer(c.commandEdgeCapMs, 0, 5000);
  if (c.aiThreatEdgeMs !== undefined) integer(c.aiThreatEdgeMs, 0, 5000);
  if (c.fuelStarvationRetirement !== undefined && typeof c.fuelStarvationRetirement !== "boolean") throw new RangeError("Invalid racecraft configuration");
  if ((c.heldFollowingLossPermille === undefined) !== (c.heldFollowingLossMaxMs === undefined)) throw new RangeError("Invalid racecraft configuration");
  if (c.heldFollowingLossPermille !== undefined) integer(c.heldFollowingLossPermille, 0, 1000);
  if (c.heldFollowingLossMaxMs !== undefined) integer(c.heldFollowingLossMaxMs, 0, 1000);
  const late = [c.lateRaceStartPermille, c.lateRaceAttackThresholdPermille, c.lateRaceMinimumPaceAdvantagePermille];
  if (late.some(x => x === undefined) && late.some(x => x !== undefined)) throw new RangeError("Invalid racecraft configuration");
  if (c.lateRaceStartPermille !== undefined) integer(c.lateRaceStartPermille, 1, 1000);
  // A late window may only widen the attack range and relax (never remove) the pace-edge requirement.
  if (c.lateRaceAttackThresholdPermille !== undefined) integer(c.lateRaceAttackThresholdPermille, 1000, 3000);
  if (c.lateRaceMinimumPaceAdvantagePermille !== undefined) integer(c.lateRaceMinimumPaceAdvantagePermille, 1, 1000);
  if ((c.progressionHeldFollowingLossPermille === undefined) !== (c.progressionHeldFollowingLossMaxMs === undefined)) throw new RangeError("Invalid racecraft configuration");
  if (c.progressionHeldFollowingLossPermille !== undefined) integer(c.progressionHeldFollowingLossPermille, 0, 1000);
  if (c.progressionHeldFollowingLossMaxMs !== undefined) integer(c.progressionHeldFollowingLossMaxMs, 0, 1000);
  const cadence = [c.attackCooldownMs, c.attackRearmGapMs, c.maxAttacksPerLap];
  if (cadence.some(x => x === undefined) && cadence.some(x => x !== undefined)) throw new RangeError("Invalid racecraft configuration");
  if (c.attackCooldownMs !== undefined) integer(c.attackCooldownMs, 1000, 120000);
  if (c.attackRearmGapMs !== undefined) integer(c.attackRearmGapMs, 1, 5000);
  if (c.maxAttacksPerLap !== undefined) integer(c.maxAttacksPerLap, 1, 3);
}

/** Race v8D held-following ledger for one car within one checkpoint (local to the engine; never persisted). */
export interface HeldLossLedger {
  /** Loss owed but not yet given up, in thousandths of a microlap (exact integer accumulation). */
  readonly owedMilli: number;
  /** Loss already given up this checkpoint, in microlaps. */
  readonly spentUnits: number;
}
export const EMPTY_HELD_LEDGER: HeldLossLedger = { owedMilli: 0, spentUnits: 0 };
/**
 * Race v8D: the held-following loss for one slice. `heldUnits` is the movement the physical floor just absorbed; the
 * car owes `progressionHeldFollowingLossPermille` of it. Spreading that across 100 ms slices would be recovered in the
 * very next slice (the car is still faster), leaving it riding the floor exactly, so the owed loss is GIVEN UP as a
 * physical drop-back once it amounts to the circuit's minimum gap (`floorUnits`) — or to whatever remains of the
 * per-checkpoint cap (`capUnits`) — and never more than this slice's movement (`availableUnits`: never negative).
 * Pure integer arithmetic; no RNG, no timer. Without the revision-4 fields: always 0.
 */
export function progressionHeldRelease(racecraft: RacecraftConfiguration | undefined, ledger: HeldLossLedger, heldUnits: number, floorUnits: number, capUnits: number, availableUnits: number): { readonly extraUnits: number; readonly ledger: HeldLossLedger } {
  const permille = racecraft?.progressionHeldFollowingLossPermille;
  if (permille === undefined || racecraft?.progressionHeldFollowingLossMaxMs === undefined || heldUnits <= 0) return { extraUnits: 0, ledger };
  const owedMilli = ledger.owedMilli + heldUnits * permille, owed = Math.floor(owedMilli / 1000);
  const budget = Math.max(0, capUnits - ledger.spentUnits);
  if (!budget || owed < Math.min(floorUnits, budget)) return { extraUnits: 0, ledger: { ...ledger, owedMilli } };
  const extraUnits = Math.max(0, Math.min(owed, budget, availableUnits));
  return { extraUnits, ledger: { owedMilli: owedMilli - extraUnits * 1000, spentUnits: ledger.spentUnits + extraUnits } };
}

/**
 * Race v8E: may this car start an attack now? Without the cadence fields: once per lap (the accepted rule). With them:
 * the first attempt of a lap needs only the cooldown; a further attempt in the same lap also needs the battle to have
 * re-armed and the per-lap cap not to be reached.
 */
export function attackOpen(racecraft: RacecraftConfiguration | undefined, car: { readonly attemptedLap: number; readonly attacksThisLap?: number; readonly lastAttackAtMs?: number; readonly attackArmed?: boolean }, lap: number, clockMs: number): boolean {
  if (racecraft?.attackCooldownMs === undefined) return car.attemptedLap !== lap;
  if (car.lastAttackAtMs !== undefined && car.lastAttackAtMs >= 0 && clockMs - car.lastAttackAtMs < racecraft.attackCooldownMs) return false;
  if (car.attemptedLap !== lap) return true;
  return car.attackArmed === true && (car.attacksThisLap ?? 1) < racecraft.maxAttacksPerLap!;
}
/** Race v8E: a held / failed-attack car may give up held-following loss only outside its attack phase. */
export function heldLossAllowed(racecraft: RacecraftConfiguration | undefined, car: { readonly attemptedLap: number; readonly lastAttackAtMs?: number }, lap: number, clockMs: number): boolean {
  if (racecraft?.attackCooldownMs === undefined) return car.attemptedLap !== lap;
  return car.lastAttackAtMs === undefined || car.lastAttackAtMs < 0 || clockMs - car.lastAttackAtMs >= racecraft.attackCooldownMs;
}

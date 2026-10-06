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
  /**
   * Race v8E local fix (GAME TUNING; revision-5 snapshots only, requires the cadence fields). The cooldown and re-arm
   * gap scale with the circuit's own overtaking difficulty (the Race's interaction snapshot): × (neutral + difficulty) /
   * (2 × neutral) — 1.0 at this neutral difficulty, shorter where passing is easy, longer where it is hard. Without it a
   * fixed cadence gave hard circuits (many failed first attempts) proportionally more retries than easy ones, which
   * compressed circuit identity. Absent = the fixed cadence.
   */
  readonly attackCadenceNeutralDifficulty?: number;
  /**
   * Race v8E local fix 2 — circuit pass conversion (GAME TUNING; revision-5 snapshots only). The share of a genuine pace
   * edge that converts into pass likelihood depends on the circuit's own overtaking difficulty (the Race's interaction
   * snapshot): the edge counted by the pass probability is × 2 × neutral / (neutral + difficulty) — unchanged at this
   * neutral difficulty, more where passing is easy, less where it is hard. Without it the difficulty was only an additive
   * offset, so a large pace edge (tyre offset, pit cycle) passed almost as readily at a hard circuit as at an easy one,
   * which compressed circuit identity. Ordinary on-track attacks only (never lapping / blue flags); the attack gate, the
   * probability formula and its cap are unchanged; no edge is created. Absent = the edge counted in full.
   *
   * Local fix 3 — bounded response (present together, require the neutral difficulty). The factor is
   * 1 + response × (neutral − difficulty) / (neutral + difficulty), with `passEdgeEasyResponsePermille` as the response
   * on circuits easier than neutral and `passEdgeHardResponsePermille` on harder ones; it is therefore always within
   * [1 − hard response, 1 + easy response]. The pass probability already charges difficulty as an additive offset
   * (−3 ‰ per point), which sets how large an edge a hard circuit demands; a full-strength conversion on top of it
   * compounded the two and left ordinary hard-circuit passes almost impossible. The hard side is therefore a gentle
   * slope modifier only, while the easy side (where the offset says little) keeps most of its response. Absent = full
   * response on both sides (the local fix 2 curve, 2 × neutral / (neutral + difficulty), exactly).
   */
  readonly passEdgeNeutralDifficulty?: number;
  readonly passEdgeEasyResponsePermille?: number;
  readonly passEdgeHardResponsePermille?: number;
  /**
   * Race v8E local fix 2 — pit-cycle laps (revision-5 snapshots only). The AI chooses each lap's commands at the leader's
   * line crossing; a car committed to a stop, or already in the pit lane, then runs its in-lap / out-lap with whatever
   * that choice was made for: the worn tyre being discarded (LIGHT nursing) or the pit route treated as a Race
   * neutralisation (CONSERVE). With this flag an AI car's in-lap / out-lap is driven at PUSH — nursing a tyre that is
   * coming off, or a fresh one that is barely worn, saves nothing — and the pit route is no longer a neutralisation for
   * the lap choice (the lane itself is speed-limited physics, unchanged). Real costs (wear, energy, fuel) apply. Absent
   * = the accepted rule.
   */
  readonly aiPitCyclePace?: boolean;
  /**
   * Race v8E local fix 2 — Sprint tactical AI policy (GAME TUNING; revision-5 SPRINT snapshots only). Replaces the first
   * local fix's sustained ATTACK pace and lowered energy reserves (which spent tyres and energy without reliable gain):
   * - energy goes where it decides a battle: an AI car with a genuine basis to attack the car ahead stays BALANCED, which
   *   keeps its charge for Overtake Mode (deployed automatically in the window and counted in full at an attempt); BOOST
   *   is only used by a car defending against a genuine threat, above the accepted reserve. Mere proximity spends
   *   nothing, so two cars no longer drain each other for no net gain;
   * - ATTACK pace only in the final `aiFinalAttackLaps` laps, only with a genuine basis, and only while the tyre's
   *   projected wear at the flag under ATTACK stays below its cliff (a resource limit, never attack spam).
   * The accepted energy thresholds, pass probability and attack gate are unchanged. Absent = the GP policy.
   */
  readonly aiSprintTactics?: boolean;
  readonly aiFinalAttackLaps?: number;
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
 * - NO late-Race attack window: v8D's widening was measured ineffective (more failed attempts, no more passes);
 * - local fixes: the circuit-scaled cadence, the circuit pass conversion and the pit-cycle lap pace.
 */
export const V8E_ATTACK_COOLDOWN_MS = 8000;
export const V8E_ATTACK_REARM_GAP_MS = 300;
export const V8E_MAX_ATTACKS_PER_LAP = 2;
/** Neutral overtaking difficulty for the circuit-scaled cadence (the accepted neutral interaction default). */
export const V8E_CADENCE_NEUTRAL_DIFFICULTY = 35;
/** Neutral overtaking difficulty for the circuit pass conversion (the accepted neutral interaction default). */
export const V8E_PASS_EDGE_NEUTRAL_DIFFICULTY = 35;
/**
 * Local fix 3 conversion response (GAME TUNING): easier-than-neutral circuits keep 75 % of the full response (factor ≤
 * 1.75, a low-difficulty circuit at 15 ≈ 1.30); harder ones only 30 % (factor ≥ 0.70, a high-difficulty circuit at
 * 85 ≈ 0.875), the rest of their difficulty
 * being the probability's own additive offset, the circuit-scaled cadence and dirty air.
 */
export const V8E_PASS_EDGE_EASY_RESPONSE_PERMILLE = 750;
export const V8E_PASS_EDGE_HARD_RESPONSE_PERMILLE = 300;
export function v8eRacecraftConfiguration(): RacecraftConfiguration {
  return { ...defaultRacecraftConfiguration(), progressionHeldFollowingLossPermille: 500, progressionHeldFollowingLossMaxMs: 250,
    attackCooldownMs: V8E_ATTACK_COOLDOWN_MS, attackRearmGapMs: V8E_ATTACK_REARM_GAP_MS, maxAttacksPerLap: V8E_MAX_ATTACKS_PER_LAP,
    attackCadenceNeutralDifficulty: V8E_CADENCE_NEUTRAL_DIFFICULTY, passEdgeNeutralDifficulty: V8E_PASS_EDGE_NEUTRAL_DIFFICULTY,
    passEdgeEasyResponsePermille: V8E_PASS_EDGE_EASY_RESPONSE_PERMILLE, passEdgeHardResponsePermille: V8E_PASS_EDGE_HARD_RESPONSE_PERMILLE, aiPitCyclePace: true };
}
/** Sprint tactical AI policy (GAME TUNING): ATTACK pace is reserved for the final laps of a Sprint. */
export const V8E_SPRINT_FINAL_ATTACK_LAPS = 3;
/** Race v8E Sprint racecraft: the revision-5 racecraft plus the Sprint tactical AI policy. */
export function v8eSprintRacecraftConfiguration(): RacecraftConfiguration {
  return { ...v8eRacecraftConfiguration(), aiSprintTactics: true, aiFinalAttackLaps: V8E_SPRINT_FINAL_ATTACK_LAPS };
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
  if (c.attackCadenceNeutralDifficulty !== undefined) { if (c.attackCooldownMs === undefined) throw new RangeError("Invalid racecraft configuration"); integer(c.attackCadenceNeutralDifficulty, 1, 100); }
  if (c.passEdgeNeutralDifficulty !== undefined) integer(c.passEdgeNeutralDifficulty, 1, 100);
  if ((c.passEdgeEasyResponsePermille === undefined) !== (c.passEdgeHardResponsePermille === undefined)) throw new RangeError("Invalid racecraft configuration");
  if (c.passEdgeEasyResponsePermille !== undefined) {
    if (c.passEdgeNeutralDifficulty === undefined) throw new RangeError("Invalid racecraft configuration");
    // Bounded: the factor stays within [0, 2] — a conversion never inverts an edge or more than doubles it.
    integer(c.passEdgeEasyResponsePermille, 0, 1000); integer(c.passEdgeHardResponsePermille!, 0, 1000);
  }
  for (const flag of [c.aiPitCyclePace, c.aiSprintTactics]) if (flag !== undefined && typeof flag !== "boolean") throw new RangeError("Invalid racecraft configuration");
  if (c.aiFinalAttackLaps !== undefined) { if (c.aiSprintTactics !== true) throw new RangeError("Invalid racecraft configuration"); integer(c.aiFinalAttackLaps, 0, 20); }
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
/**
 * Race v8E: this circuit's effective cooldown and re-arm gap. Fixed values unless the snapshot scales them with the
 * circuit's overtaking difficulty (`attackCadenceNeutralDifficulty`); integer arithmetic only. Null = no cadence.
 */
export function attackCadence(racecraft: RacecraftConfiguration | undefined, overtakingDifficulty: number | undefined): { cooldownMs: number; rearmGapMs: number } | null {
  if (racecraft?.attackCooldownMs === undefined) return null;
  const neutral = racecraft.attackCadenceNeutralDifficulty;
  const scale = (n: number) => neutral === undefined || overtakingDifficulty === undefined ? n : Math.round(n * (neutral + overtakingDifficulty) / (2 * neutral));
  return { cooldownMs: scale(racecraft.attackCooldownMs), rearmGapMs: scale(racecraft.attackRearmGapMs!) };
}
/**
 * Race v8E local fixes 2–3: the pace edge counted by the pass probability at this circuit (see
 * `passEdgeNeutralDifficulty`): edge × (1 + response × (neutral − difficulty) / (neutral + difficulty)), the response
 * being the easy or hard one by side of neutral (full response when the snapshot has none). Integer arithmetic only;
 * without the field (or a difficulty) the edge is returned unchanged.
 */
export function circuitPassEdge(racecraft: RacecraftConfiguration | undefined, edgeMs: number, overtakingDifficulty: number | undefined): number {
  const neutral = racecraft?.passEdgeNeutralDifficulty;
  if (neutral === undefined || overtakingDifficulty === undefined) return edgeMs;
  const response = overtakingDifficulty <= neutral ? racecraft!.passEdgeEasyResponsePermille ?? 1000 : racecraft!.passEdgeHardResponsePermille ?? 1000;
  const span = 1000 * (neutral + overtakingDifficulty);
  return Math.round(edgeMs * (span + response * (neutral - overtakingDifficulty)) / span);
}
export function attackOpen(racecraft: RacecraftConfiguration | undefined, car: { readonly attemptedLap: number; readonly attacksThisLap?: number; readonly lastAttackAtMs?: number; readonly attackArmed?: boolean }, lap: number, clockMs: number, overtakingDifficulty?: number): boolean {
  const cadence = attackCadence(racecraft, overtakingDifficulty);
  if (!racecraft || !cadence) return car.attemptedLap !== lap;
  if (car.lastAttackAtMs !== undefined && car.lastAttackAtMs >= 0 && clockMs - car.lastAttackAtMs < cadence.cooldownMs) return false;
  if (car.attemptedLap !== lap) return true;
  return car.attackArmed === true && (car.attacksThisLap ?? 1) < racecraft.maxAttacksPerLap!;
}
/** Race v8E: a held / failed-attack car may give up held-following loss only outside its attack phase. */
export function heldLossAllowed(racecraft: RacecraftConfiguration | undefined, car: { readonly attemptedLap: number; readonly lastAttackAtMs?: number }, lap: number, clockMs: number, overtakingDifficulty?: number): boolean {
  const cadence = attackCadence(racecraft, overtakingDifficulty);
  if (!cadence) return car.attemptedLap !== lap;
  return car.lastAttackAtMs === undefined || car.lastAttackAtMs < 0 || clockMs - car.lastAttackAtMs >= cadence.cooldownMs;
}

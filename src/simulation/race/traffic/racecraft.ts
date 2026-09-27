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
  };
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
}

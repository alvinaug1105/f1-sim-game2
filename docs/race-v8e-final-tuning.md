# Race v8E: final tuning and polish (progression revision 5)

Race v8E is Race v8 **progression revision 5**. It is still `simulationVersion` 8; there is no Race v9, new engine or
rewrite. It changes only the evidence-backed tuning, semantics and UX items from the v8D forensic validation and the
24-round human Beta.

Every number below is **GAME TUNING**, not measured F1 data.

> **Validation status.** This document describes what was *implemented*. It makes no claim that any change achieved its
> target. The Builder ran no simulation campaign, statistical comparison, historical replay or test suite for this
> revision. All validation, including the before/after metrics, belongs to the independent Tester.

## Revision lineage

| Revision | Generation | Notes |
|---|---|---|
| 1 | v8A | Authoritative track progression, lapping, local zones. |
| 2 | v8B | Pit routing, Active Aero, Overtake Mode, energy policies. |
| 3 | v8C | FIA B6.3.6 dry-tyre regulation, DSQ classification, distance-based energy recovery. |
| 4 | v8D | v8D tuning bundle: wet AI character, tyre cliffs, late-Race window, circuit pit timing, inert legacy DRS, held-following drop-back. |
| **5** | **v8E** | **v8E tuning bundle (below) plus v8E event semantics.** |

- New production Race and Sprint sessions freeze revision 5 (`startProgressionCareerRace`, `simulateProgressionCareerRace`).
- The explicit historical helpers are `startRevision4CareerRace`, `startRevision3CareerRace` and `startRevision2CareerRace`.
- A saved Race keeps its own revision and is never upgraded.

## Architecture: configuration, not revision checks

All v8E tuning is frozen once into the Race's own snapshots by `v8eTuningBundle`
(`src/features/race/v8e-tuning.ts`):

- tyres;
- AI strategy;
- racecraft;
- interaction (DRS-inert);
- pit timing;
- incidents.

The engine reads those snapshots. A missing field means the accepted earlier behaviour.

There is one central capability, `hasV8eSemantics` (revision ≥ 5) in `progression/revision.ts`. It gates only event
and state semantics:
- pit-route pass credit;
- the frozen pass cause;
- attack-cadence car state;
- −0 normalisation.

## New frozen configuration fields

| Snapshot | Field | v8E value | Absent = |
|---|---|---|---|
| racecraft | `attackCooldownMs` | 8000 | one attempt per lap |
| racecraft | `attackRearmGapMs` | 300 | ″ |
| racecraft | `maxAttacksPerLap` | 2 | ″ |
| racecraft | `progressionHeldFollowingLossPermille` / `MaxMs` | 500 / 250 (as v8D) | clamp only |
| racecraft | late-Race window fields | **not present** | (v8D: 750 / 1300 / 800) |
| AI strategy | `weatherRiskSpreadPermille` | 500 (v8D 350) | `stopBias` weather character |
| AI strategy | `weatherGateSpreadMs` | 1000 (v8D 750) | accepted gate |
| AI strategy | `weatherHorizonSpreadLaps` | 4 (new) | one shared forecast horizon |
| AI strategy | `compoundToleranceMs` | 2500 (v8D 1500) | — |
| AI strategy | `preferenceSpreadPermille` | 180 (v8D 140) | — |
| incidents | `scTrainCatchupPermille` | 180 (new) | per-gap compression |
| incidents | `maxCompressionMs` | 8000 (v8D 5000) | — |
| incidents | `SAFETY_CAR.minLaps` | 3 (v8D 2; max stays 5) | — |
| tyres (dry) | `stablePenaltyMs` S / M / H | 300 / 250 / 200 (v8D 100) | — |
| tyres (dry) | `progressivePenaltyMs` S / M / H | 2000 / 1550 / 1200 (v8D 1700 / 1300 / 1000) | — |

Revision-5 car state (in the progression JSON):
- `attacksThisLap`;
- `lastAttackAtMs`;
- `attackArmed`;
- `passingCause`.

These fields exist exactly in revision 5 and are validated; an older Race can never acquire them. No Prisma migration
is needed: the new values live in the existing incident, strategy and racecraft JSON, the tyre-profile columns and the
progression JSON.

## Issues addressed

Per the brief, each issue below gives its old behaviour, root cause, implementation, tests and regression risk. The
**BEFORE** figures quote the brief's v8D forensic evidence. The **AFTER** figure is *not measured by the Builder* for
every issue. **STATUS** is "Implemented — awaiting independent validation" unless stated otherwise.

### 1. Exact +0.080 trains / repeated pinning

- **Old behaviour:** strict one attempt per lap. After a failed attack the follower re-closes to the 80 ms floor and
  stays there for the rest of the lap.
- **Root cause (forensic):**
  - near-equal pace (71% of held slices have an edge below the attack threshold);
  - the one-attempt-per-lap gate;
  - the post-attempt delay.
- **Implementation:**
  - A deterministic re-attempt state machine (`attackOpen`): a cooldown since the last attempt.
  - A second attempt in the same lap needs the battle to *re-arm*: after the attempt, the gap must re-open to
    `attackRearmGapMs` before the follower re-closes.
  - At most 2 attempts a lap; never per-slice dice.
  - The held-following drop-back is allowed outside the attack cooldown (`heldLossAllowed`), not merely "not this lap".
  - Physical floor, progression and lapping are unchanged.
- **Tests:** `tests/race-v8e.test.ts` (cadence table, configuration, per-lap cap and no neutralised attempts in a
  Race).
- **Risk:** more attempts change pass counts and the pass RNG stream, so circuit identity must be re-audited.

### 2. Late-Race attack window

- **Old behaviour:** the v8D late window (more failed attempts, no pass gain, per the forensic data).
- **Implementation:** revision 5 does not snapshot the late fields, so `lateRaceAttackWindow` never widens. Revision 4
  keeps the window.
- **Status:** implemented (disabled). No replacement mechanism was added.

### 3. Sprints processional

- **Implementation:** no Sprint-specific rule. Sprints share the revision-5 attack cadence and tyre shape.
- **Status:** awaiting validation. Sprint-specific tuning was deliberately not added.

### 4. Wet crossover synchronisation

- **Root cause:** shared incentives (same public forecast, same costs, a narrow character spread) overwhelm the
  character differences.
- **Implementation:**
  - the full weather-risk spread (±50% of the stop cost) and a wider gate spread;
  - each car plans a family change on the **public** forecast over its own horizon: 10 ± 4 laps from `weatherRisk`.
    Early committers anticipate; cautious cars react to the track.
- No future truth and no randomness are used. Clear conditions still converge, because the costs dominate.

### 5. Dry strategy homogeneity

- **Implementation:** the sensible-plan tolerance widens from 1.5 s to 2.5 s, so the stable compound preference chooses
  among genuinely close plans. A clearly better plan is still always taken.

### 6. Safety Car compression

- **Root cause (code):** under the accepted rule each car's catch-up depends only on its own gap to the car directly
  ahead. With similar gaps every car speeds up equally, so pair gaps barely change and only the front pair compresses
  (forensic ratio about 0.97).
- **Implementation (`scTrainCatchupPermille`):**
  - Each running car on track closes 18% per lap of its excess over its own slot in the Safety Car train (distance
    behind the leader minus 1 s per running car ahead).
  - Catch-up is capped at 8 s a lap and applies only while the physical gap ahead exceeds the 1 s queue interval.
  - Every pair therefore closes at once, through actual movement only: no reset, teleport, lap-deficit change or
    unlapping.
  - The minimum Safety Car period is 3 laps; the maximum stays 5.
- **Tests:** compression versus revision 4, forward progress only, no passes, VSC not compressing.

### 7. VSC

- Physics unchanged: gaps are held, by design.
- The Race header now explains this: "VSC: every car follows a delta time, so gaps are held". The Safety Car note says
  the field gathers into a train.
- **Status:** unchanged by design (presentation only).

### 8. Undercut / overcut leverage

- **Implementation:** the v8D cliff thresholds and post-cliff penalties are kept, because the cliff is strategically
  active. The gradual pre-cliff degradation is steeper (`stablePenaltyMs`, `progressivePenaltyMs`), so fresh versus
  worn tyres differ more before the cliff.
- The cold out-lap, the circuit pit loss and traffic still favour an overcut on a healthy tyre.
- No undercut bonus was added.

### 9. Circuit passing extremes

- **Not changed.** No circuit-specific threshold was retuned without measurement.
- **Status:** deferred to Tester audit. Re-audit all 24 circuits after the cadence change.

### 10. Pit-entry pass (R8D-BUG30-001)

- **Boundary (`passCreditable`):** revision 5 credits an OVERTAKE only TRACK vs TRACK. Routes are read *after*
  movement, so a defender that turned into pit entry in the same slice is excluded. The pass state is cleared without
  an event or cause; road order still changes naturally.
- **Tests:** the full route table, for revision 5 and earlier.

### 11. Active Aero

- The physics is unchanged (`straightDeltaMs` = 0). Its effect is part of the baseline pace, and a cleaner explicit
  re-accounting was judged a risk to the engine.
- The UI now explains the automatic system, its STRAIGHT / CORNER / RESTRICTED states, *why* it is restricted (pit
  lane, SC, VSC, wet, not running), and that it carries no extra lap-time effect in this model. It is never described
  as DRS.

### 12. Overtake Mode reasons

The server derives the reason for the player's own cars only:
- `ACTIVE`;
- `ELIGIBLE`;
- `ELIGIBLE_NO_ENERGY` ("eligible, but no useful deployment");
- `PIT_LANE`, `SAFETY_CAR`, `VSC`, `WET`, `NOT_RUNNING`;
- `NO_CAR_AHEAD`;
- `LAPPING`;
- `GAP` (with the current gap and the 1.0 s threshold);
- `AWAITING_DETECTION`.

All come from the car's own state and public facts.

### 13. Qualifying tyre selector

The Qualifying view carries the Race's authoritative current-condition assessment (`assessTyreFamilies`). The selector
shows graded SUITABLE / MARGINAL / POOR for every compound, falling back to the coarse band only when no assessment
exists. No future weather is read.

### 14 / 15. Pass-cause accuracy

- The cause is frozen at the attack from the **actual** contribution (`attackCause`), with this priority:
  1. Overtake Mode, when it is active and gives a net electrical edge over the defender;
  2. Boost, when the BOOST policy is actually deploying with a net edge;
  3. tyre;
  4. pace.
- Zero-energy Boost, or ordinary BALANCED deployment, is never labelled Boost.

### 16. Pit-leader display

The timing tower shows "Leader · In pit lane" instead of "Leader PIT". The timing position is unchanged.

### 17. Next Strategic Event

- New stops:
  - `TYRE_CLIFF_SOON`: within 3 laps of the cliff at the current pace, once per stint, *before* crossing;
  - `TYRE_POOR`: the car's tyre family becomes POOR.
- Simultaneous items are named (up to 3), not only counted.
- The skip-limit stop explains itself.
- Every stop has a reason. The reported "?" could not be traced to a code path, since missing keys fall back to the key
  name. The Tester should confirm whether it still appears.

### 18. Tyre-life estimate

The estimate states its pace assumption ("~N laps … at the current Attack pace") and the range over pace modes.

### 19. Event feed

- Three or more rival stops on the same lap onto the same compound become one expandable line ("8 cars pitted for
  Intermediates").
- Player events are never grouped, and nothing is dropped.
- New filters: All / My team / Overtakes / Strategy / Race Control.

### 20. Wet-grid warning

When a player car would start on a dry tyre and the current grid assessment rates dry tyres POOR, a warning appears.
Starting needs an explicit "Start on dry tyres anyway" tick; the choice is never forbidden.

### 21. Pit-cycle understanding

The Driver Panel shows "Est. rejoin P14–P18": the current gap to the leader plus the pit loss (minimum–maximum), placed
among current public gaps. It is an estimate, not a prediction. The global pit loss is unchanged.

### 23. Serialization −0

Revision-5 car state stores `variationMs` as +0, never −0. Historical state is not rewritten.

## Explicitly unchanged

- Track progression, the microlap model, lap deficits, the physical-neighbour architecture, lapping and blue flags.
- The pit route state machine, the classification, `officialLeaderId`, DSQ and the dry-tyre regulation.
- The weather information boundary, persistence architecture and RNG algorithm.
- DRS inertness, the Overtake Mode entitlement lifecycle, energy accounting and Boost zero-energy behaviour.
- Incident and reliability rates, and the pit-loss formula.
- v8D cliff thresholds, circuit identity data and the VSC physics.

## Revision-4 compatibility (by design — not verified by the Builder)

Revision 4 keeps:
- the v8D bundle;
- its incident configuration (accepted defaults plus the circuit pit section);
- no cadence fields, so `attackOpen` and `heldLossAllowed` fall back to `attemptedLap`;
- no `scTrainCatchupPermille`, so the original compression formula applies;
- `hasV8eSemantics` false, so pass credit, cause and `variationMs` take the accepted code paths;
- car state without v8E fields.

The Tester should compare revision-4 final-state hashes between the base build `55846a9` and this branch.

## Known limitations

- No v8E tuning value has been validated. All the brief's targets (pinning, Sprint passes, wet modal share, SC ratio,
  undercut) await the Tester.
- Circuit passing extremes (Issue 9) were not retuned.
- Overtake Mode `EXPIRED` cannot be shown: an expired entitlement is cleared and not distinguishable in state.
- The VSC still looks visually frozen on purpose: the physics holds gaps.
- The rejoin estimate ignores cars that will pit or be overtaken during the stop.
- The LCG adjacent-seed note is unchanged by design. A dependency / security review is still required before the
  public-beta gate.

## Local fix pass (post-independent-validation repair)

Still simulation version 8 and progression revision 5. No new revision was created: every change below is a revision-5
capability or a new optional field in the frozen v8E bundle. Revision 4 receives none of these fields, and none of
the new code paths runs for it.

No mechanism in this section has been validated by the Builder. Each one is a mechanism *intended* to address the
Tester finding named, and all of them await independent retest.

### Test-suite repairs

- **Revision validation (`tests/race-v8d.test.ts`).** The stale "revision 5 is invalid" assertion now asserts that
  revision 5 is accepted. It also asserts that unknown revisions (6 and 0) are still rejected, so nothing is silently
  accepted.
- **Safety Car compression (`tests/race-v8e.test.ts`).** The old fixture ran inside the queue interval, with a gap-sum
  ratio of about 1.0, so it measured nothing. The new `withGaps` fixture re-spaces an eight-car field to 3 s between
  cars (well above the 1 s queue interval) before neutralising. The assertions are stricter than before:
  - every pair must lose more than 100 ms but stay at or above the queue interval;
  - the gap-sum ratio must fall below 0.9;
  - revision 5 must compress more than revision 4;
  - the no-pass and position invariants are checked on every lap;
  - the VSC must hold gaps (ratio between 0.9 and 1.1).
- **i18n (`viewer.tyreLifeAtPace`).** The zh-TW string now uses the same `{count}` / `{pace}` placeholders as EN.

### Changed / added frozen configuration

| Field | Where | v8E value | Purpose |
|---|---|---|---|
| `attackCadenceNeutralDifficulty` | racecraft | 35 | Circuit-scaled attack cadence |
| `aiAttackPaceMode` | racecraft (Sprint only) | `true` | Sprint attacker pace policy |
| `aiBoostReservePermille` / `aiRechargeBelowPermille` | racecraft (Sprint only) | 250 / 120 | Sprint energy reserves |
| `trackPositionValueSpreadPermille` | AI strategy | 400 | Per-character track-position value |
| `wetRefreshNeutral` | AI strategy | `true` | Neutral same-family wet refresh |
| fresh-tyre blanket temperature | revision-5 capability (`tyres/fresh.ts`) | ideal-window minimum | Undercut warm-up |
| dry starting plan | revision-5 grid set-up (`aiDryStartingPlan`) | uses existing `compoundToleranceMs` | Dry strategy diversity |

The blanket temperature and the starting plan are capabilities rather than fields:
- the pit profile is stored in fixed database columns, so a new field there would not persist;
- the starting plan is computed once at Race creation, from data that is already frozen.

### Issue 2: Sprint processional

**Cause (reasoned).** The accepted AI assistance policy is symmetric. When cars fight, the attacker and the defender
both choose PUSH and BOOST. Neither gains a tactical edge, so pass attempts depend only on the static probability.
Sprints also have no pit-strategy offsets to create pace differences.

**Mechanism.** The Sprint bundle (`v8eSprintRacecraftConfiguration`) changes how the AI manages a fight. It does not
change pass probability, and there is no Sprint pass multiplier.
- An attacker uses ATTACK pace only when it has a real basis:
  - it is being held up by at least `aiHeldEdgeMs`; or
  - its tyres are at least `aiTyreAgeEdgeLaps` laps younger than the car ahead's.
- An attacker with no such basis, and every defender, keeps PUSH.
- Energy reserves are lower in a short race: Boost above 25 % of capacity, Recharge below 12 %.

**Trade-off.** ATTACK pace costs extra tyre wear and temperature, so a Sprint attacker pays for its aggression. The
Grand Prix policy is unchanged.

### Issue 3: circuit identity compressed

**Cause (reasoned).** The +0.080 cadence work gave every circuit the same retry rate. Extra retries mostly convert
where first attempts fail, which is at hard circuits, so the spread between circuits shrank. Removing the late-Race
window also took late passes away from easy circuits.

**Mechanism.** The attack cooldown and the re-arm gap now scale with each circuit's existing
`interaction.overtakingDifficulty`:

```
scale = (neutral + difficulty) / (2 × neutral)    with neutral = 35
```

- At difficulty 35 the accepted cadence is reproduced exactly.
- Easy circuits re-arm sooner. For example, at Spa (15) the scale is about 0.71.
- Hard circuits re-arm later. For example, at Monaco (85) the scale is about 1.71.

No circuit names are used. The +0.080 cadence mechanism is kept and scaled, not replaced.

### Issue 4: undercut leverage absent

**Limiting component (reasoned).** Every new tyre was fitted at 80 °C, below the ideal window of all dry compounds
(SOFT's starts at 90 °C). It then closed only 25 % of the gap to the window each lap. A fresh soft therefore spent
about 3 laps cold, costing around 0.3 s, which cancelled most of the fresh-tyre gain the undercut depends on.
Degradation was not increased again.

**Mechanism.** Revision-5 tyres come off blankets at the bottom of their compound's ideal window (`tyres/fresh.ts`),
and never above the top of it. The same function is used by:
- the engine, when a car leaves the pit lane;
- the AI planner (`ai-strategy.ts`);
- the regulation fallback (`ai-compliance.ts`);
- the dry starting plan.

This keeps the planners' estimates consistent with what the engine actually does.

**Hard constraint respected.** There is no `undercutBonusMs` or anything equivalent. No time is credited for stopping
first.

**Expected effect on stop counts.** Stopping becomes slightly cheaper, which could raise stop counts, so this must be
retested. Two things limit that rise:
- the stop decision still weighs pit loss and the extra-stop track-position cost;
- the convex long-run degradation offset was left unchanged.

### Issue 5: dry AI strategy homogeneity

Revision-5 grids pick a starting compound from a costed one-stop plan (`aiDryStartingPlan`):
- each plan pairs a starting compound with a different follow-up compound when the dry-tyre rule requires two;
- only stints within each compound's tyre life count.

Every plan within the existing `compoundToleranceMs` of the best counts as sensible. The car's frozen compound
preference then picks among them, from softest to hardest. A tolerance of 0 makes every character choose the same plan,
so variation only exists where the cost model says plans are close.

The cost of an extra stop now also depends on each car's existing `trafficSensitivity`, spread by ±40 %. A
traffic-averse character values track position more than a traffic-tolerant one.

If no plan is finite, the accepted `aiDryStartingCompound` is used. Revision 4 keeps the accepted start-compound logic.

### Issue 6: wet AI

No separate change was made. The wet-refresh correction for Issue 7 removes one source of late, unsynchronised wet
decisions. The v8E crossover horizon and the weather-risk character spread are otherwise unchanged.

### Issue 7: wet-tyre beyond-cliff rows (0.88 % → 2.37 %)

**Conclusion (reasoned, not measured).** The tyre-cliff system itself is unchanged. The likely cause is the v8E
weather-character spread (350 → 500‰), which was meant for crossover timing between tyre families. It was also being
applied to *same-family* refreshes, for example a worn INTER being replaced by a fresh INTER. A late-leaning character
therefore delayed a refresh that had nothing to do with the weather crossing over, and so ran worn wets past the cliff.

**Mechanism.** With `wetRefreshNeutral`, a same-family refresh uses the shared horizon with no character bias. The
character spread still applies to crossovers between families.

### Findings intentionally deferred

These were deferred as the brief instructed:
- residual re-arm;
- re-pass loops;
- modest SC compression beyond the test fixture;
- SC pit-route ranking;
- neighbour overlap.

### Risks for the retest

- Blankets make stopping cheaper and may raise stop counts above the accepted range of 1.72 to 1.75.
- The ATTACK pace policy could increase tyre-cliff exposure in Sprints.
- Circuit-scaled cadence can lower total pass counts at hard circuits compared with the previous v8E build.
- The starting plan uses the green pit-loss estimate, so it ignores SC probability.

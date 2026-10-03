# Race v8C: dry-tyre regulation and energy equilibrium

Race v8C is Race v8 **progression revision 3** (still `simulationVersion` 8). It adds four things:
- the FIA dry-tyre regulation, with AI compliance, player warnings and an authoritative classification sanction;
- a corrected energy model that closes the revision-2 equilibrium findings.

Revision 1 (v8A) and revision 2 (v8B) are frozen. They are never upgraded.

## FIA source

- **Source:** FIA 2026 Formula 1 Regulations — Section B [Sporting], **Issue 09**.
  - WMSC approval 30/09/2026; published **2026-10-01**.
  - Provided and verified by the Project Lead. The earlier Issue 05 contained a Monaco-specific clause that Issue 09 does
    not; it is **not** implemented.
- **B6.3.6 (paraphrased):**
  - Unless a driver used intermediate or wet-weather tyres during the Race, they must use at least two different
    dry-weather specifications.
  - At least one of them must be a mandatory dry-weather Race specification.
  - In a normally completed Race, failing this means **disqualification** from the Race results.
  - If the Race is suspended and cannot be restarted, the consequence is instead a 30-second penalty.
- **B6.3.2 (paraphrased):**
  - A tyre counts as used once the car has left its grid position with it fitted.
  - A tyre fitted in the pit counts once the car has left the pit lane with it fitted.
- **B6.1.2 (paraphrased):** up to two mandatory dry-weather Race specifications are announced before each Competition.
- **Sprint:** B6.3.6 applies to the Race only.

## How the game models it

| Rule | Game behaviour |
|---|---|
| At least 2 different dry specifications (SOFT / MEDIUM / HARD) | **Enforced** from actual tyre use (stint history) |
| Wet exemption | **Enforced**: only an intermediate or wet tyre actually used. A forecast, a wet track or a pending request never exempts. |
| Disqualification in a normally completed Race | **Enforced** by the engine at the flag (authoritative), consumed by the result and championship layers |
| Mandatory Race specification (B6.1.2) | **Not enforced.** The snapshot field `mandatoryDrySpecifications` exists and is honoured when set, but it is **empty**: there is no source-backed per-event dataset, and none is invented. |
| Suspended Race / 30 s penalty | **Unsupported.** The game has no Race suspension; no red-flag logic was added. |
| Sprint | Not subject to B6.3.6 (`dryTyres: null`). The revision-3 energy correction still applies. |
| Tyre allocation, returns, Q3 specification | Out of scope (generic SOFT / MEDIUM / HARD / INTERMEDIATE / WET only) |

### Snapshot

The snapshot is `ProgressionConfiguration.regulation`, built by `raceRegulationForSession`. It is frozen at session
creation from the session kind, never from the circuit:

```
{ version: 1, source: { document, issue: 9, published: '2026-10-01' }, session: 'RACE' | 'SPRINT',
  dryTyres: null | { article: 'B6.3.6', minimumDistinctDrySpecifications: 2, wetTyreExemption: true,
                     mandatoryDrySpecifications: [], consequence: 'DISQUALIFICATION', latestSafeStopMarginLaps: 3 } }
```

Validation (`validateRegulationConfiguration`) rejects:
- a Sprint carrying a dry rule, or a Race without one;
- a minimum below 2 or above the number of available dry specifications;
- an invalid, duplicate or unavailable mandatory specification;
- a wrong source issue;
- a margin outside 1–10.

A revision-3 configuration must carry a regulation snapshot, and revisions 1 and 2 can never acquire one.

### Compliance

`assessTyreRule` is pure, consumes no random draws and does not depend on ID or key order. It derives:
- the distinct dry specifications used;
- whether a wet-family tyre has been used;
- the status: `NOT_APPLICABLE` (Sprint / retired), `EXEMPT`, `SATISFIED`, `OUTSTANDING`, `URGENT` (from the last safe
  stop opportunity) or `VIOLATED` (finished).

The source is `pit.stints`, the authoritative persisted history:
- the starting tyre counts once the car has moved;
- a pit-fitted tyre counts once the car has left the modelled Pit Lane with it. The engine creates the new stint
  exactly when the car leaves the PIT_LANE segment (service → lap line) and moves onto its PIT_EXIT route (lap line →
  authored exit), so the tyre already counts on PIT_EXIT and remains counted after rejoining TRACK;
- pending requests, committed stops and stops not yet serviced (ENTRY / LANE / SERVICE) never count.

Retired cars carry no obligation: a retirement is never turned into a disqualification.

### AI compliance

`regulateAiStop` sits inside `committedStops` and applies only to `DEVELOPMENT_AI` cars, which includes player cars
handed to auto-management (Simulate Race / Sprint / Remainder):
- **Filtering.** The regulation filters which compound may be fitted now. The existing `dryCompound` planner chooses
  among the legal candidates. When current public conditions favour the wet family, the best wet compound is taken.
- **Deadline.** From `deadlineLap = totalLaps − 2 − latestSafeStopMarginLaps`, an outstanding car is called in. This is
  three checkpoints before the last lap on which a request is still accepted, so lapped cars and SC/VSC laps still
  serve the stop and leave the pit lane before the flag.
- **No forced stops** for satisfied or exempt cars.
- **Same machinery as the player:** request → pit route → service draw → stint, same pit loss, same consequence.
- **Information used:** current tyre history, current public weather and forecast, Race Control, and the stable
  per-car preference. Never the hidden weather timeline, future incidents or RNG outcomes. The regulation itself
  consumes no random draw.

A forced stop uses the ordinary pit-service draw, exactly like any other stop.

**Ownership:** the pit strategy layer (`pits/model.ts`) derives each AI car's stable `StrategyPreference` once per
decision and passes it to both the strategic choice and `regulateAiStop`. The regulation module decides only what is
legal and never derives a car's character itself.

PLAYER cars are never altered. The player can deliberately violate the rule and is disqualified at the flag.

### Classification sanction

`enforceFinalClassification` runs once, in the engine, when the Race finishes:
- violating finishers are **disqualified**;
- compliant cars are reclassified, so drivers behind are promoted with gaps and intervals recomputed;
- disqualified cars follow every other car with no gap;
- retirements stay retirements, and a disqualified car's incident status stays FINISHED: DSQ is not a mechanical
  retirement.

The record is `progression.classification` (`roadPosition`, official `position`, `status`, `reason`). It is persisted in
the progression JSON, and validation re-derives it from the tyre history, so a tampered record is rejected.

### Result and championship consumers

| Consumer | Change |
|---|---|
| `raceResult()` | `disqualified`, `roadPosition` |
| Persisted `CareerRaceEntrant.position` | Official order |
| Championship repository | Reads the record → `ChampionshipResultRow.disqualified` |
| `scoreSession` | DSQ scores 0 even inside the points positions |
| Standings | DSQ excluded from the Grand Prix countback. Round slot flags `disqualified` (a team keeps its other car's position). WDC and WCC both follow. |
| Results page / round breakdown | "DSQ" / "Disqualified" |
| Timing tower and driver panel after the flag | DSQ, reason, road position |
| Winner lookup | Never a disqualified car |
| Race viewer leader (`officialLeaderId`) | While RUNNING: the live P1. After the flag: only a CLASSIFIED car. When every finisher is disqualified there is **no** official leader or winner; the stored ordinal P1 is ordering only. Used by map label priority, driver panel, player switch and timing tower. |
| Sprint results | Unchanged: no B6.3.6 |

### Player information

Everything is in English and Traditional Chinese, and state is shown by text and icon, not colour alone:
- **Pre-Race:** a rule note, or "does not apply" for the Sprint.
- **Driver panel (Strategy), own cars only:**
  - status, dry compounds used, the last safe stop lap, and a pending-request note;
  - no false warnings: none in the Sprint, none for a retired car, nothing for rival cars.
- **Pit selector:** marks compounds that would meet the rule; **every compound stays selectable**.
- **Alert:** a one-time `TYRE_RULE_URGENT` alert when a player car first becomes URGENT.

## Versioning

| Revision | Engine | Energy recovery | Tyre regulation | Created by |
|---|---|---|---|---|
| 1 (v8A) | `legacy.ts` | Legacy ERS | none | historical only |
| 2 (v8B) | `engine.ts` | per **second** of non-deploying running | none | `startRevision2CareerRace` (fixtures / compatibility) |
| 3 (v8C) | `engine.ts` | per **distance** travelled while not deploying; never in BOOST | B6.3.6 snapshot | production: `startProgressionCareerRace` / `simulateProgressionCareerRace` (Race and Sprint) |

**Boundary:** `progression/revision.ts`:
- `hasAssistance` is true for revision ≥ 2 (v8B systems);
- `energyModelFor` returns `V8B` or `V8C`;
- `regulationFor`.

The former `version === 2` checks were classified and moved to `hasAssistance`. Each was v8B-system behaviour that
revision 3 inherits:
- creation (energy store / observations / neutral legacy ERS);
- state validation;
- event causes;
- public projection (route history, own assistance, pit anchors);
- energy-policy and ERS command routing;
- three UI copy switches.

The tie order (`version === 1` → historical) is unchanged. Revision 3 uses the domain tie order.

**Revision-2 protection:**
- `tests/race-v8b-golden.test.ts` pins three revision-2 continuations. They were recorded from main `9b9a88f8` before
  any v8C change and must never be re-pinned:
  - G1: quiet Suzuka;
  - G2: Monaco with incidents, changing weather, AI strategy, player energy and pit stops, and JSON reloads;
  - G3: dry, AI-managed Suzuka.
- The v8A digest `b9f931f9…` is unchanged.

## Energy equilibrium investigation

A deterministic budget runs the real accounting (`energyStep` + `recoverByDistance`) for one car at constant pace over
each circuit's frozen zones (`tests/helpers/energy-budget.ts`).

**Revision-2 findings:**
1. **BOOST had a non-zero equilibrium.** BOOST still recovered 500/s outside deployment. After the store emptied in
   about two laps, held BOOST kept a small permanent benefit (4–9 ms/lap) funded by its own recovery.
2. **Recovery was time-based.** Every second of non-deploying running recovered energy, so:
   - a Safety Car / VSC lap at 1.6× lap time recovered **720k** units with RECHARGE, against 450k on a green lap;
   - the pit lane, slow pace and traffic multiplied recovery in the same way — "hidden recovery multiplication because
     movement is neutralised".
3. **No other free-energy paths found:**
   - BALANCED drains on every circuit and then gives a bounded 13–28 ms, far below a full BOOST lap (250–330 ms);
   - benefit is strictly proportional to energy actually debited;
   - checkpoint and save/reload chunking is exact (persisted remainders);
   - Overtake + Boost is one envelope.
   RECHARGE↔BOOST alternation (~125–138 ms average) is a real trade funded only by recovered energy.

**Revision-3 correction:**
- Recovery is per **distance travelled while not deploying** (`recoveryPerMillilap`), applied after the slice's
  deployment and movement:
  - RECHARGE 450 / BALANCED 135 per 1/1000 lap: the v8B per-second rates over a representative 90 s green lap, so
    green-flag budgets are preserved;
  - **BOOST 0**: BOOST is a pure depletion mode.
- Neutralised and pit-lane running still recovers (intentional harvest), but by distance, so it is bounded and never
  multiplied by the lap time.
- Deployment, the Overtake envelope, the debit-before-recovery order, integer remainders and the zero-energy rule are
  unchanged.
- Exact values are v8D tuning.
- The AI policy thresholds (RECHARGE below 25 %, BOOST when fighting above 50 %, otherwise BALANCED) were checked under
  the new accounting and **needed no change**: the policy mix over a dry Race is essentially unchanged.

Budget (steady = average over laps 21–30, or 31–40 for BALANCED; RECHARGE recovery for a 1.6× neutralised lap):

| Circuit | Deploy share | BOOST steady (r2 → r3) | BALANCED steady | Full BOOST lap | RECHARGE SC lap ×1.6 (r2 → r3) |
|---|---:|---:|---:|---:|---:|
| albert-park | 78 % | 5.5 → 0.0 ms | 16.4 ms | 312.7 ms | 720k → 450k |
| suzuka | 67 % | 8.2 → 0.0 ms | 24.6 ms | 268.9 ms | 720k → 450k |
| shanghai | 63 % | 9.4 → 0.0 ms | 28.1 ms | 250.1 ms | 720k → 450k |
| bahrain | 77 % | 5.9 → 0.0 ms | 17.6 ms | 306.4 ms | 720k → 450k |
| monaco | 70 % | 7.4 → 0.0 ms | 22.3 ms | 281.4 ms | 720k → 450k |
| silverstone | 72 % | 7.0 → 0.0 ms | 21.1 ms | 287.7 ms | 720k → 450k |
| spa-francorchamps | 67 % | 8.2 → 0.0 ms | 24.6 ms | 268.9 ms | 720k → 450k |
| marina-bay | 70 % | 7.4 → 0.0 ms | 22.3 ms | 281.4 ms | 720k → 450k |
| jeddah | 75 % | 6.3 → 0.0 ms | 18.8 ms | 300.2 ms | 720k → 450k |
| miami | 72 % | 7.0 → 0.0 ms | 21.1 ms | 287.7 ms | 720k → 450k |
| montreal | 83 % | 4.3 → 0.0 ms | 12.9 ms | 331.4 ms | 720k → 450k |
| barcelona | 67 % | 8.2 → 0.0 ms | 24.6 ms | 268.9 ms | 720k → 450k |
| red-bull-ring | 83 % | 4.3 → 0.0 ms | 12.9 ms | 331.4 ms | 720k → 450k |
| hungaroring | 69 % | 7.8 → 0.0 ms | 23.4 ms | 275.1 ms | 720k → 450k |
| zandvoort | 72 % | 7.0 → 0.0 ms | 21.1 ms | 287.7 ms | 720k → 450k |
| monza | 83 % | 4.3 → 0.0 ms | 12.9 ms | 331.4 ms | 720k → 450k |
| madrid | 63 % | 9.4 → 0.0 ms | 28.1 ms | 250.1 ms | 720k → 450k |
| baku | 78 % | 5.5 → 0.0 ms | 16.4 ms | 312.7 ms | 720k → 450k |
| cota | 64 % | 9.0 → 0.0 ms | 27.0 ms | 256.4 ms | 720k → 450k |
| mexico-city | 72 % | 7.0 → 0.0 ms | 21.1 ms | 287.7 ms | 720k → 450k |
| interlagos | 78 % | 5.5 → 0.0 ms | 16.4 ms | 312.7 ms | 720k → 450k |
| las-vegas | 75 % | 6.3 → 0.0 ms | 18.8 ms | 300.2 ms | 720k → 450k |
| lusail | 70 % | 7.4 → 0.0 ms | 22.3 ms | 281.4 ms | 720k → 450k |
| yas-marina | 70 % | 7.4 → 0.0 ms | 22.3 ms | 281.4 ms | 720k → 450k |

## Persistence and boundary

- **Persistence:** the regulation snapshot (progression configuration), the final classification record (progression
  state) and energy state are all in the existing progression JSON. **No migration.** Reload round trips are covered
  by `tests/race-v8c.integration.test.ts`.
- **Public view:**
  - the Race's static rule;
  - own cars only: status, used dry compounds, exemption, deadline and satisfying compounds;
  - the official classification once finished.
- **Never exposed:** rival obligation, plan, pending request, energy, policy or remainders; seed, RNG and weather truth.

## Tests

| File | Covers |
|---|---|
| `race-v8c-regulation.test.ts` | Versioning / validation, every dry and wet case, Sprint, AI compliance (22-car dry Suzuka and Monza, lapped cars, auto-managed and Simulate Remainder from URGENT, weather exemption), DSQ promotion, points / WCC / countback, public boundary, ID / key-order determinism, chunking |
| `race-v8c-energy.test.ts` | 24-circuit budget, invariants, pit, SC / VSC, reload |
| `race-v8c-ui.test.tsx` | Warnings, selector, alert, Sprint / retired / rival, DSQ views, zh-TW |
| `race-v8c.integration.test.ts` | PostgreSQL round trips |
| `race-v8b-golden.test.ts` | Revision-2 goldens |

## Deferred (v8D / v8E)

- Per-event mandatory specifications, once a source-backed dataset exists.
- Strategic timing of the compliance stop: the AI currently complies late (deadline) when its dry plan needs no stop.
- Energy rate tuning, including the RECHARGE↔BOOST trade.
- Race suspension and the 30 s rule.
- Large campaigns.

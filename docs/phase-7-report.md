# Phase 7 — Traffic, dirty air, overtaking and DRS

## Outcome

Being trapped behind another car now costs actual race time. New browser races use version 3 with explicit physical order. Potential pace cannot change position without a successful adjacent overtake. Existing version-1 and version-2 races keep their original rules.

## Track model and classification

This is a lap-checkpoint crossing-time abstraction, not a simultaneous physics simulation or a sector model. Each advance computes the next crossing for every entrant. `position` is authoritative persistent track order. Potential lap times come from the existing car/driver/fuel/tyre engine; traffic turns them into actual crossing times. A blocked follower's crossing time is delayed to at least 80 ms behind the car ahead. Its actual last lap, best lap and elapsed time include that delay.

A successful overtake explicitly swaps adjacent entries. The resolver then constrains the new order's crossing times, including any time lost by the displaced defender. Classification follows this order, never a sort of unconstrained elapsed pace. Final order is the explicit order of final-lap crossing times, which have millisecond resolution and a positive minimum gap. A finished race cannot advance or retroactively reorder.

Each entrant persists completed crossings and `progressMicrolaps`: completed laps × 1,000,000 minus leader-relative crossing delay converted using circuit baseline time. This is an approximate track-relative distance equivalent, not measured physical distance. It may be negative on the grid or more than one lap behind the leader. BIGINT storage avoids overflow for extreme supported inputs. The representation keeps individual completed-lap counts and distance distinct; this version advances entrants in whole-lap batches and does not resolve partial-lap finishes, blue flags or lap-down encounters. Cross-lap targets are excluded from interaction eligibility. Detailed lapping remains deferred.

## Dirty air

At the start-of-lap checkpoint, same-lap followers within 1500 ms receive a linearly increasing dirty-air penalty. Default maximum loss is 300 ms at zero gap, scaled by a numeric circuit sensitivity multiplier. It falls to zero at the threshold. There is no tyre-temperature or wear coupling; Phase-6 updates remain unchanged.

## Overtaking

Default opportunities occur every second lap, resolved front-to-back. A follower must project into the 300 ms attacking range and have at least a 100 ms effective pace advantage. Each car can participate in only one adjacent contest per lap, avoiding multi-position jumps and contradictory simultaneous battles.

Pass probability in permille is clamped to 0–950:

`30 + 0.4 × effective pace advantage in ms + 3 × (overtaking − defending) + 3 × car-rating difference − 3 × circuit difficulty + DRS attack benefit`

Default development overtaking/defending ratings are both 65. Circuit difficulty defaults to 35 on a 0–100 scale. Profiles are centralized, numeric and snapshotted; names and locale do not enter the calculations. Tyre and fuel effects enter through pace, without compound-specific or fuel-specific passing bonuses.

An eligible contest creates a structured `OvertakeAttempt` diagnostic with IDs, lap, gap, DRS, probability and outcome. Successful contests swap order and increment the attacker's counter. Failed contests retain order and respect the physical gap. The resolver exposes attempt diagnostics; no permanent event-feed/history infrastructure was added. Current-lap attempted/passed flags and total overtakes are persisted.

## DRS

Development activation is lap 3. Detection uses the prior checkpoint's same-lap car ahead within 1000 ms, including equality. The leader or an isolated car receives none. Multiple followers can be eligible, allowing DRS trains.

Two default numeric zones give 80 ms each, scaled by circuit effectiveness and capped at 300 ms. Eligibility also adds 120 permille × circuit effectiveness to attack probability. DRS helps close and pass, but never guarantees a pass. No zone geometry or permanent regulation system is implied. UI eligibility describes the most recently completed lap: a car that just passed for the lead can therefore retain that lap's DRS indicator until the next lap.

## Determinism and ordering

1. Read saved physical order, fuel, tyres and start-checkpoint gaps.
2. Calculate all potential laps with the unchanged two consistency draws per entrant, in original grid order.
3. Apply deterministic dirty-air and DRS effects from the checkpoint.
4. Resolve opportunities front-to-back in explicit order. Consume one additional seeded draw for every eligible attempt, including a zero-probability attempt; consume none for ineligible pairs.
5. Apply explicit swaps and crossing-time constraints; update actual timing, overtake diagnostics and classification.
6. Persist the resulting RNG state and all current state atomically.

Tyre/fuel updates use the original Phase-6 once-per-lap rules. No new draws enter those calculations. The engine remains immutable and independent of React, Prisma, i18n, browser state and wall time. Reversing the input array preserves draw assignment/results.

## Versions and persistence

- v1: unchanged free-air rules; captured pre-tyre fixture still matches exactly.
- v2: unchanged tyres; a fixture captured before Phase-7 modifications matches exactly.
- v3: tyres plus explicit traffic/overtaking/DRS.

The new `startTrafficCareerRace` is the browser entry point. Existing `startCareerRace` and `startTyreCareerRace` remain compatibility entry points for v1 and v2. Old saves receive no invented interaction state.

The sixth, additive migration creates owned relational interaction profiles and nullable legacy-compatible entrant fields for driver interaction ratings, track progress, DRS, potential pace, dirty-air/DRS/blocking diagnostics, attempted/passed status and overtake counts. Frozen profiles are written only at start. Actual track order is reloaded from persisted positions, never reconstructed from elapsed time. New bounds CHECKs protect configuration/current state; existing composite Career ownership continues to apply.

A deferrable unique constraint on `(careerRaceSimulationId, position)` permits an atomic adjacent swap during a transaction and rejects duplicate positions at commit. Prisma expresses the logical uniqueness in the schema; the checked-in migration supplies its deferred timing. Preserve that deferrable constraint in future migrations. Existing locked Career transactions still commit or roll back all simulation and lifecycle state together.

The real PostgreSQL lap-15 test uses a new client to reload and finish, comparing the entire final state against continuous execution: classification, counters, progress, gaps, RNG, tyres, fuel and timing.

## UI

The development timing table retains tyre selection before start and adds last-lap DRS eligibility, successful overtake count and last-lap blocked time. English/Traditional Chinese translation keys also cover traffic, dirty air, attacking/defending and interaction notices. Entity names remain game data. No final racing graphics or event feed was built.

## Quantitative game-behaviour checks

These are provisional game-tuning measurements, not Formula 1 calibration.

| Controlled check | Observed result |
| --- | --- |
| Catching: 900 ms/lap free-air advantage, initial gap 2000 ms, passing disabled through defensive/difficulty tuning | Minimum 80 ms following gap reached on lap 3 |
| Same blocked scenario, five laps versus identical isolated follower, excluding initial grid offset | 2580 ms lost to dirty air/blocking |
| 200 seeds, six laps, 900 ms advantage, initial gap 1000 ms, difficulty 10, DRS off | 141/200 (70.5%) completed at least one pass |
| Same test, difficulty 90 | 49/200 (24.5%) |
| Difficulty 50, DRS off | 103/200 (51.5%) |
| Same test, DRS on from lap 1 | 156/200 (78.0%) |
| Difficulty 10, DRS off, only 20 ms advantage | 0/200 (0%) |

The statistical scenarios use identical car/driver/tyres except the controlled car pace difference, zero lap variation, numeric profiles and seeds 0–199. Their outcome metric is at least one pass during six laps, not probability per attempt. DRS-on uses lap-1 activation specifically for the controlled comparison. `tests/helpers/traffic.ts` contains the reproducible scenarios.

After a successful pass into free air, tests verify zero dirty-air/blocking loss and actual lap time equal to potential lap time. A worn Soft versus fresh Medium scenario confirms degradation can cause a pass naturally.

## Verification — 23 September 2026

- **258 offline tests passed** across 11 files, including all previous 224.
- **112 actual PostgreSQL integration tests passed** across 6 files, including all previous 88.
- PostgreSQL environment: existing local Homebrew PostgreSQL 18.6, disposable database `formula_traffic_verify_20260923`; suites create/remove unique schemas. No production or external database was used.
- All six checked-in migrations applied. The five previous migrations remain byte-identical to the Phase-6 source archive.
- The development seed executed twice successfully; existing idempotence/scoped relationship tests remain green.
- Prisma format/validate/generate, TypeScript, ESLint and production build passed.
- SQL verification includes new snapshots/state, actual saved position swap, duplicate-position rejection, lap-15 replay, full unsigned RNG persistence, final state, start/finish rollback, bounds, cross-Career ownership and v1/v2 compatibility suites.
- Offline checks include failed/successful passes, blocked time/release, DRS activation/threshold/train/leader rules, position/gap invariants over 20 cars, immutable state, input order independence, captured v2 output, unchanged tyres/fuel, locale isolation and multi-seed balance.
- Warmed 20-car × 75-lap simulation averaged **1.059 ms** across 100 local runs. Machine-dependent sanity test limit remains 2 seconds.
- The current Prisma/pg stack emits a `client.query` concurrency deprecation warning during some relation reads. Tests pass; no dependency migration was undertaken in this phase.

## Actual browser verification

Used the production build at port 3100 with a disposable Career prepared through existing creation/weekend services. Selected Soft for Alex Smith, Hard for Ren Sato and Medium for the other drivers. Started v3 with seed 3311422193.

By lap 5, Luca had explicitly overtaken Ren (P4 → P3; counter 1). Ren displayed DRS eligibility. At lap 15, refresh retained the identical timing table. Switching to Traditional Chinese translated the interaction columns; a full repository-state capture before/after refresh and language change was byte-identical, including RNG. The language preference survived another refresh; switching back restored the same English table.

Mika closed from 6.676 seconds behind Alex at lap 20 to 4.253 seconds at lap 25, then overtook for the lead by lap 30. Luca was still blocked behind Alex at an 80 ms interval and showed 1263 ms of blocking loss on lap 30. This verifies that faster theoretical pace does not automatically change position.

Finished lap 58. Final order: Ren, Mika, Luca, Alex, with successful pass totals 3, 1, 2, 0. Final classification and tyre/DRS/counter state survived refresh. The final browser repository state was also compared against uninterrupted simulation of its frozen input and matched exactly, including RNG. No special browser fixture or production tuning change was needed to produce these overtakes. Temporary server, tab and database were removed after verification.

## Deferred work

No pits/windows, strategy commands, ERS, fuel modes, weather/wet tyres, incidents/failures, Safety Car/VSC, blue flags, penalties, points, practice/qualifying engine, final driver ratings, 2D viewer or multiplayer were added. The approximation resolves one disjoint adjacent contest per car per opportunity lap and uses whole-lap crossing checkpoints; detailed sector geometry and lapped-car interactions remain future work.

# Phase 8 — Pit stops, stints and race strategy

## Outcome and pit model

Tyre strategy now trades fresh-tyre pace against lost race time and track position. New browser races use simulation version 4. Existing v1/v2/v3 races retain their original mechanics and remain resumable.

A request made at checkpoint lap 15 commits on the next advance: the car completes lap 16 on its old tyres, stops **after lap 16**, and begins lap 17 on its new tyres. The same boundary convention is used in commands, UI and histories. Change or cancel the active request before advancing. Stops complete atomically within one advancement step, so there is no partially persisted PITTING state. The saved state distinguishes an active pending request from being on track with no pending request.

Requests are rejected once finished or when the next lap would be the final lap. Stops at the penultimate boundary remain valid. Cancelling later does not undo an already completed stop.

## Pit loss, tyre changes and RNG

The snapshotted numeric circuit pit profile defaults to:

| Input | Default |
| --- | ---: |
| Pit-lane transit loss | 19,500 ms |
| Stationary base service | 2,500 ms |
| Bounded service variation | ±250 ms |
| New-tyre temperature | 80,000 milliC (80°C) |
| Temporary AI wear trigger | 750 permille consumed |
| Temporary AI minimum stint | 5 laps |

Total loss is transit plus stationary service. Stationary time is base plus `round((2 × seeded draw − 1) × variation)`. These are provisional game values, not measured Formula 1 calibration. Numeric bounds are enforced in both configuration validation and PostgreSQL.

A stop closes the old stint with the actual post-lap tyre state and fits the requested dry compound with age 0, wear 0 and the configured starting temperature. Subsequent laps use the existing thermal evolution and cold penalty; no extra warm-up bonus/penalty is added. Fuel is never refilled; it changes only by the existing normal per-lap burn.

All potential-lap draws occur first, in original grid order. On-track overtake draws follow in the existing front-to-back order, excluding committed pit cars. Finally, each stop consumes exactly one service draw in original grid order, even when configured variation is zero. Requests, cancellations, estimates and AI decisions consume no RNG. The global saved RNG state therefore reproduces service times and subsequent racing exactly.

## Track position and rejoin

Committed cars use the old-tyre potential lap plus pit loss on a separate modeled route. They do not receive normal DRS/dirty-air effects or participate in on-track attacks on that stop lap. The remaining cars use the existing explicit traffic resolver.

The engine then merges pit-route crossing times into the already constrained on-track order, breaking exact ties by original grid order and preserving the modeled minimum gap. This merge can move a pitting car behind others; it cannot let non-pitting cars bypass the overtake resolver. Pit-cycle changes never increment the on-track overtake count. New intervals and approximate progress are calculated after rejoin; following-lap traffic/DRS detection uses those gaps normally.

This retains the whole-lap crossing-time approximation. It does not model pit entry geometry, partial service phases, shared pit-box queues or unsafe releases. Teammates stopping together receive independent normal services in stable order, without double-stack penalties.

## Stints and pit history

Each entrant has a lightweight current stint plus persistent structured histories:

- `CareerRaceStint`: number, boundary start/end laps, compound, starting age/wear/temperature and optional ending age/wear/temperature.
- `CareerRacePitStop`: stop number, completed lap boundary, old/new compounds, transit loss, stationary time and total loss.

For example, start boundary 16 and end boundary 37 means racing laps 17–37. There is at most one open stint per entrant. Finishing closes the final stint with its actual tyre state. Stop count is persisted and checked against the loaded history; no formatted English sentences or lap-by-lap telemetry are stored.

## Temporary AI strategy

`simulation/race/pits/strategy-policy.ts` is separate from the mechanics. Non-player cars use the snapshotted wear trigger and minimum stint, then compare continued tyre contribution against each fresh dry compound over the remaining distance. They request the lowest estimated tyre-time option only if its saving exceeds the same nominal transit/service cost paid by the player. Ties use stable compound order.

The estimate uses the existing tyre model, excludes traffic prediction, and has no hidden pit-time discount. AI requests execute through the same stop function, RNG, tyre reset and rejoin logic. Player-team cars remain manually controlled; missing a stop can leave them on exhausted tyres. No full AI strategist, weather forecast or championship tactic was added.

## Persistence, commands and compatibility

The seventh additive migration is `20260923000300_race_pit_strategy`. It adds relational owned pit profiles, stint/stop history, strategy controller, pending compound, command revision and stop count. Existing six migrations are unchanged. Old rows keep NULL pit fields and acquire no invented histories.

The Career row lock serializes mutations. Pit commands also require expected lap and expected per-entrant command revision. Double Box clicks cannot create two requests/stops, and competing change/cancel commands with the same revision cannot both commit. The active request is replaced rather than appended. Commands target only the player's owned team through the application service.

Pit state, RNG, tyres, times, positions, histories and lifecycle updates share one transaction. Composite foreign keys protect Career/race/entrant ownership; unique keys reject duplicate stop numbers/laps. A partial unique index allows only one open stint. The existing deferred position uniqueness remains intact for atomic reorders.

The pure engine retains v1 free-air, v2 tyres, v3 traffic and v4 pits. All older start APIs remain compatibility entry points; `startPitCareerRace` is the new browser entry point. Captured v1/v2/v3 fixtures still match exactly. The v3 fixture was captured before modifying the engine.

## UI and estimates

The development Race UI adds stop count/current stint to the table and per-driver pit panels. Player controls select a new dry compound, request/update Box, or cancel before commitment. Pending requests show the exact completion boundary and survive refresh. Panels show actual tyre state, a non-authoritative estimate of laps to the current tyre cliff, a pit-loss range, and expandable structured histories. Finished panels retain the histories and remove commands.

All labels, notices and history formatting use centralized English/Traditional Chinese translations. Number, percentage, temperature and duration units use Intl formatting. IDs and game entity names remain data. Changing language never enters engine input or command processing.

The pit-window helper is presentation-only: remaining wear to the compound cliff divided by the current numeric wear increment. It does not guarantee an optimal stop and is not simulation state.

## Quantitative strategy comparisons

Controlled 58-lap, one-car runs use seed 42, baseline 90,000 ms, pace 90, car 60, 50 kg initial fuel, 1.6 kg/lap burn, zero lap variation, normal tyre stress/energy and default pit tuning. Only the starting compound and listed stops differ. Stop lap means **after** that lap. Results are mechanical game comparisons, not real-world calibration or final legal strategy.

| Strategy | Stop boundaries | Total race time | Stops | Total pit loss |
| --- | --- | ---: | ---: | ---: |
| Medium → Hard | 25 | 1:29:17.549 | 1 | 21,858 ms |
| Soft → Medium → Soft | 18, 40 | 1:29:19.082 | 2 | 44,201 ms |
| Hard only | none | 1:29:09.367 | 0 | 0 ms |

Hard-only is fastest in this particular mechanical comparison. No mandatory two-compound regulation was implemented; zero-stop is not asserted to be legal under any future regulation set.

Changing transit loss from 10,000 to 30,000 ms increases the single-stop result by exactly 20,000 ms and the two-stop result by exactly 40,000 ms under the isolated controlled test.

### Undercut

Two equal cars start 1,000 ms apart on Medium tyres at 750 permille wear, with normal 80°C new tyres. B pits after lap 2, A after lap 5; both fit Hard and pay 22,000 ms with service variation disabled. At the later rejoin B has 484,911 ms elapsed versus A's 485,872 ms: **B leads by 961 ms**. No on-track overtake counter changes. The gain emerges from replacing degraded tyres earlier.

### Overcut

Two equal cars start 1,000 ms apart on lightly worn Medium tyres (100 permille). A pits after lap 2, B stays out until lap 5; both fit Hard. This controlled fixture uses a snapshotted **20°C new-tyre temperature**, not the production 80°C default, to isolate warm-up effects. At lap 5 B has 482,530 ms versus A's 485,028 ms: **B leads by 2,498 ms**. No overcut bonus or forced position change exists.

### Failed undercut and rejoin traffic

With Medium wear 650 permille and stops B after lap 2/A after lap 8, B emerges **1,301 ms ahead** in clean air. Add a third car initially 15 seconds behind A with numeric car performance 30 versus 90 for A/B, leaving the same pit choices and costs unchanged. B rejoins behind that car and is delayed by the existing traffic model. At lap 8 A has 761,416 ms and B 763,873 ms: **B is now 2,457 ms behind A**, 80 ms behind the blocking car, with 1,395 ms blocked time on that lap.

These short controlled fixtures use difficult overtaking and sparse opportunities to isolate pit-cycle order; they do not modify production logic. `tests/helpers/pits.ts` contains all reproducible scenarios.

## Verification — 23 September 2026

- **293 offline tests passed** across 12 files, including all previous 258 tests unchanged.
- **131 actual PostgreSQL integration tests passed** across 7 files, including all previous 112 tests unchanged.
- Environment: existing local Homebrew PostgreSQL 18.6, disposable database `formula_pits_verify_20260923`; integration suites create and remove unique schemas. No production or external database was used.
- All seven checked-in migrations applied successfully. The six previous migration files were compared with the Phase-7 source archive and remain byte-identical.
- The development seed ran twice successfully; existing source uniqueness and seed-idempotence tests remain green.
- Prisma format, validate and generate; TypeScript; ESLint; offline tests; real PostgreSQL tests; and production build passed.
- New checks cover reset/closure/opening semantics, fuel regression, time loss, physical reorder without overtake inflation, DRS exclusion, cancel/change/duplicate requests, finished/final-lap rejection, same-command replay, reload before/after service, simultaneous stops, AI behavior, strategy scenarios, locale isolation and architecture boundaries.
- PostgreSQL checks cover pending persistence, new-client lap-15 replay through service and finish, profile/history ownership, command concurrency, duplicate histories, one-open-stint uniqueness, invalid compounds/bounds, atomic service and final-lifecycle rollback.
- Warmed **20 cars × 75 laps with AI pit decisions averaged 1.993 ms** over 100 local runs. This is machine-dependent; the test's conservative sanity limit is 2 seconds.
- The current Prisma/pg stack still emits the previously observed `client.query` deprecation warning on some relation reads. No dependency upgrade was included; checks passed.

## Actual browser verification

Used the production build at port 3100 and a real disposable Career prepared with the existing creation/progression services. Started v4 with seed 4147651788, Alex on Soft and the other three cars on Medium.

At lap 15 Alex led on age-15 Softs with 48% wear. Requested Medium, changed the request to Hard, cancelled it, and requested Medium again. Refresh preserved the active request and lap state. Advancing one lap completed the stop after lap 16: **P1 → P4**, age 0, wear 0%, 80°C Medium tyres, one stop and stint 2. History recorded 19,500 ms transit + 2,718 ms service = **22,218 ms**. Fuel fell only from 67.08 to 65.52 kg, the normal lap burn.

The two non-player cars stopped independently after lap 36 through the temporary policy, fitting Softs at the same modeled costs. Alex requested Soft at lap 36 and executed a second stop after lap 37: **21,952 ms**, with stint 3 beginning on lap 38. Rejoin gaps were visible (13.683 seconds behind the next car after the first stop, 6.498 seconds after the second); immediate close rejoin traffic did not occur in this browser run and is covered by the controlled scenario tests.

At lap 37, English → Traditional Chinese → refresh → English preserved the timing table. Full repository state captures before/after were byte-identical, including RNG, histories and request revisions. Chinese pit controls and history labels were inspected.

Finished lap 58 with Ren, Luca, Alex, Mika in that order. Alex's three stints cover laps 1–16, 17–37 and 38–58, and both pit records remain visible after refresh. The final repository state exactly matches uninterrupted replay from the saved lap-15 request plus the later Soft command, including all times, track order, fuel, tyres, RNG, overtakes, stints, stops and revisions.

Temporary browser/server/database were cleaned up after verification. The maintained source is exported without dependencies, generated client, build output, credentials or scratch files.

## Deferred work and limitations

No ERS, pace/fuel modes, manual attack/defend, weather/wet tyres, incidents/failures, safety interventions, pit-crew training, unsafe releases, penalties, shared pit-box queues, points, final driver ratings, 2D viewer or multiplayer were added. Mandatory dry-compound rules remain deferred. The policy is deterministic development logic, not an advanced strategist. Pit timing remains a whole-lap abstraction with no partial service saves.

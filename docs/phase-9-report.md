# Phase 9 — Driver pace commands, fuel modes and ERS

Completed 23 September 2026. This is provisional game tuning, not Formula 1 telemetry.

## Player and AI control

The player controls the two race drivers on `Career.playerTeamId`. Each has five pace modes, three fuel modes and four ERS modes. AI cars show their current commands and resources without manual controls. Application services check both the actual Career team and the frozen controller, plus the active Race/session. Forging a player controller cannot grant control over another team.

`setDriverPaceMode`, `setDriverFuelMode` and `setDriverErsMode` are intent-based operations. They use the existing Career transaction lock, expected completed lap and one shared command revision. Every accepted command increments the revision; stale or competing requests are rejected. Pit requests retain their separate revision. A command after lap 20 affects lap 21, never the completed lap. Player commands persist until explicitly changed; AI never overrides them.

## Pace tuning

| Mode | Direct lap delta | Wear multiplier | Energy/thermal multiplier |
| --- | ---: | ---: | ---: |
| Conserve | +650 ms | 650‰ | 650‰ |
| Light | +300 ms | 820‰ | 820‰ |
| Standard | 0 | 1000‰ | 1000‰ |
| Push | −300 ms | 1250‰ | 1250‰ |
| Attack | −550 ms | 1550‰ | 1550‰ |

Multipliers compose with the frozen tyre configuration, using integer rounding. Existing wear progression, degradation cliff and thermal response remain the source of later-stint consequences. The presentation-only tyre-cliff estimate now includes the selected pace multiplier. There is no crash-risk modifier.

## Fuel

| Mode | Direct lap delta | Baseline burn multiplier |
| --- | ---: | ---: |
| Conserve | +450 ms | 850‰ |
| Balanced | 0 | 1000‰ |
| Push | −250 ms | 1150‰ |

Burn is computed in integer grams and deducted from current fuel. Fuel mass at the start of the lap feeds the existing mass penalty exactly once; higher consumption indirectly reduces later mass. Projected finish fuel is current grams minus selected burn times remaining laps; the UI uses Intl for signed kilograms. No formatted strings are persisted.

New v5 development starts add a creation-only reserve of 5% of baseline race fuel, minimum 2 kg. The resulting initial fuel is snapshotted. This does not retrofit any saved race. The final browser start had 95.004 kg and a +4.524 kg Balanced projection.

If less than the requested lap burn remains, that lap receives a 120,000 ms penalty and fuel clamps to zero. Entrants continue to complete laps under this severe slowdown; no DNF, engine failure or incident system was added. The same consequence applies to AI. A controlled 20-lap/32 kg race recovered from five Push laps by switching to Conserve and finished with positive fuel.

## ERS

Capacity is 1000 integer units, initial charge 700, baseline recovery 60 units/lap. Circuit harvest and deployment-effectiveness factors are frozen in the command profile, default 1000‰; no circuit-name checks exist.

| Mode | Full-charge direct lap effect | Recovery at default circuit | Requested consumption |
| --- | ---: | ---: | ---: |
| Harvest | +400 ms | 120 | 0 |
| Neutral | 0 | 60 | 60 |
| Deploy | −450 ms | 60 | 180 |
| Overtake | −850 ms | 60 | 300 |

Consumption cannot exceed the charge available at the beginning of the lap. Negative lap effects scale to energy actually consumed, so depleted deployment loses most or all of its boost. Recovery becomes available for the next lap, and charge clamps to capacity. Harvesting deliberately trades time for a stronger future attack; continuous depleted deployment gives only a small sustained benefit, not unlimited full-power laps. These are coarse whole-lap resources, not regulatory joule or per-sector models.

On a committed pit lap, deployment consumption and the ERS lap-time effect are suppressed, while recovery continues. The selected mode survives, and neither fuel nor ERS resets at the stop. Existing tyre replacement and service costs remain unchanged.

## AI policy

The separate deterministic policy selects Light at wear ≥700‰, Push in battles within 1500 ms, otherwise Standard. It chooses Conserve when Balanced finish projection is negative, Push with >3 kg surplus in the last ten laps, otherwise Balanced. It harvests below 250 charge, uses Overtake near a car ahead, Deploy against a close follower, otherwise Neutral. All thresholds are snapshotted. It does not use permanent Attack or any hidden resource/performance bonus. Existing temporary pit policy remains separate and intentionally basic; its forecast does not optimize the entire command schedule.

## Exact v5 lap order

1. Validate version/configuration and read saved state and player commands.
2. Choose AI commands for AI entrants only; determine committed pit stops from the prior checkpoint.
3. In original grid order, compute baseline/car/driver/start-of-lap fuel/old-tyre pace with the existing two consistency draws.
4. Add deterministic pace, fuel-mode, energy-limited ERS and any exhaustion effects before traffic. Compute candidate post-lap fuel, ERS and tyre wear/temperature locally from the same prior state.
5. Resolve existing traffic, dirty air, DRS and probabilistic passing for non-pitting cars using the modified potential pace.
6. Execute stops in original grid order, retaining existing service draws after traffic draws. Close the old stint using its post-lap tyre state and fit fresh tyres; retain computed fuel, ERS and command modes.
7. Merge pit-route crossing times into constrained on-track order, classify, update histories and RNG.
8. Persist the entire checkpoint and Career lifecycle atomically.

Candidate resources are computed before interaction for implementation convenience, but interaction uses prior gaps and modified pace. No resource state is externally committed halfway through a lap. Commands and AI consume no RNG; unchanged draw rules do not mean identical later RNG states when commands change which passing opportunities occur.

## Battles and balance measurements

Five-lap controlled single-car runs: seed 42, zero consistency variation, Medium tyres starting at 80°C, 130 kg initial fuel, 1.6 kg baseline burn, 75-lap input. Only the named mode changes; otherwise Standard/Balanced/Neutral.

| Mode/combination | Five-lap total ms | Tyre wear | Fuel used | Final charge |
| --- | ---: | ---: | ---: | ---: |
| Conserve pace | 479183 | 7.0% | 8.0 kg | 700 |
| Standard baseline | 475935 | 11.0% | 8.0 kg | 700 |
| Attack pace | 473196 | 17.0% | 8.0 kg | 700 |
| Conserve fuel | 478257 | 11.0% | 6.8 kg | 700 |
| Push fuel | 474613 | 11.0% | 9.2 kg | 700 |
| Harvest ERS | 477935 | 11.0% | 8.0 kg | 1000 |
| Deploy ERS | 473685 | 11.0% | 8.0 kg | 100 |
| Overtake ERS | 473272 | 11.0% | 8.0 kg | 60 |
| Attack / Push / Overtake | 469211 | 17.0% | 9.2 kg | 60 |
| Conserve / Conserve / Harvest | 483505 | 7.0% | 6.8 kg | 1000 |

Attack ends at 97.161°C versus Standard 92.967°C and Conserve 90.297°C. Its five-lap gain over Standard is 2739 ms at six percentage points more wear. Aggressive versus saving is 14,294 ms faster but consumes 2.4 kg more fuel, ten additional wear percentage points and 940 more battery units.

For 200 deterministic seeds, equal cars start with the follower 800 ms behind, 70% battery, DRS active, difficulty 30 and one opportunity per lap. Neutral follower passed 0/200; Overtake passed 134/200. Overtake against a deploying leader passed 0/200 versus 134/200 against a harvesting leader. These are this controlled first-lap scenario's outcomes, not universal probabilities. No guaranteed-pass or arbitrary defence bonus was added; DRS and ERS operate together through effective pace and existing constraints.

## Versioning and persistence

v1 free air, v2 tyres, v3 traffic and v4 pits remain resumable with their historical behaviour. Browser starts now use v5. Existing start APIs keep their original versions, and command state is never invented during resume. A v4 fixture was captured using the preserved Phase 8 implementation; its complete simulation remains equal.

The eighth migration, `20260923000400_race_driver_commands_ers`, adds nullable command fields to the owned entrant row and an owned `CareerRaceCommandProfile` table containing the immutable structured configuration. Composite Career/race foreign keys protect profile ownership; existing entrant ownership keys continue to apply. SQL checks reject invalid modes, partial command state, negative revisions and energy outside 0–1000. Load-time validation additionally checks the frozen capacity and complete profile. Unsupported or incomplete v5 state is rejected rather than silently filled from global defaults.

The prior seven migrations and all 25 prior test/fixture/helper files are byte-identical to the Phase 8 source. The SQL replay test executes lap 10 commands, advances to 15, reloads, changes all modes, requests a pit and finishes; complete state equality covers order, resources, tyres, pit histories, overtakes and RNG.

## Verification

- **322 offline tests passed**, 13 files; all previous 293 retained.
- **146 actual PostgreSQL integration tests passed**, 8 files; all previous 131 retained.
- Prisma format, validate and generate, TypeScript, lint and production build passed.
- Real PostgreSQL **18.6 Homebrew**, localhost, disposable `formula_commands_verify_20260923`. All eight checked-in migrations actually applied. Suites create and clean unique schemas. The development seed also executed twice on the disposable database.
- SQL coverage includes v5 creation, persisted commands/revisions, AI and cross-Career rejection, stale/competing commands, mode/energy checks, profile ownership, exact continuation and whole-checkpoint rollback. Existing v1–v4 suites passed unchanged.
- Offline coverage includes player ownership (including forged controller), next-lap effects, resource trade-offs, exhaustion recovery, bounded ERS, AI recharge/selection/shared mechanics, battle/defence scenarios, language isolation, pit interactions and exact replay.
- 20 cars ×75 laps with AI: warmed 100-run mean **2.019 ms** in this environment; sanity test limit 2 seconds. Timing is observational, not a hardware guarantee.
- The existing Prisma/pg stack emits a `client.query` concurrency deprecation warning in some relation reads. No test failures or dependency changes resulted.

## Actual browser verification

Production Next.js build against the disposable PostgreSQL database. Seed **3883586307**, v5, 58 laps. Alex was set to Attack/Push/Overtake; Mika to Conserve/Conserve/Harvest. Only their team had manual controls. At lap five Alex showed 17% wear, 81.510 kg and 6% charge; Mika 7%, 83.850 kg and 100%. AI modes changed automatically, including Luca harvesting at low charge. These different development drivers are a UI demonstration, not the controlled balance comparison above.

Closed/reopened the browser tab, refreshed, switched English → Traditional Chinese, refreshed to confirm language persistence, then returned to English. The complete saved race state was byte-identical across the language/refresh checks.

Changed Alex to Conserve/Conserve/Harvest, requested Hard tyres and advanced to lap six. The stop moved him to fourth, fitted age-zero tyres, retained all commands, burned fuel normally to 80.184 kg and recovered charge from 6% to 18%. Finished and refreshed: Ren 1:26:01.366, Luca 1:26:06.677, Mika 1:27:19.806, Alex 1:27:28.234. Full persisted final state was deeply equal to pure-engine continuation from the saved lap-six checkpoint.

This first test race predates the final creation-only fuel reserve adjustment and correctly kept its original 90.480 kg input. After the final build, a separate browser start verified v5 defaults, the corrected development notice, 95.004 kg initial fuel and +4.524 kg projected reserve. Existing saves were not changed.

## Files and deferred work

New command mechanics/policy modules, command panel, offline/SQL tests, measurement helper and v4 fixture. Updated race engine/types, service/actions, repository adapter, additive Prisma schema/migration, pit compatibility gate, mode-aware tyre estimate, English/Traditional Chinese resources and documentation. Detailed command state lives in driver panels so the timing table gains no extra columns. All numbers use existing Intl formatting and internal identifiers remain untranslated.

Weather, wet tyres, incidents/crashes, mechanical failures, Safety Car/VSC/red flags, penalties, team orders/manual defend, blue flags, points, final ratings, practice/qualifying engines, final Race UI, 2D map and multiplayer remain absent. No authentication or account preference system was introduced.

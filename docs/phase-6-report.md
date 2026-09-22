# Phase 6 — Tyres, degradation, temperature and stint model

## Outcome

Dry tyres now produce deterministic pace evolution and compound trade-offs. New browser races use simulation version 2. Version-1 saves continue under the unchanged free-air rules. No pits, overtaking or weather systems were added.

## Tyre model and units

Central provisional profiles live in `src/simulation/race/tyres/profiles.ts`. These are game tuning values, not measured Formula 1 specifications.

| Compound | Fresh grip delta | Wear per lap at normal stress | Progressive loss begins | Cliff begins | Ideal window |
| --- | ---: | ---: | ---: | ---: | --- |
| Soft | −350 ms | 32 permille | 400 | 800 | 90–105°C |
| Medium | 0 ms | 22 permille | 450 | 850 | 85–105°C |
| Hard | +300 ms | 15 permille | 500 | 900 | 85–110°C |

Wear means consumed life: 0 is fresh, 1000 is maximum modeled wear. UI percentage is wear / 1000 formatted as a percentage (280 displays 28% consumed). Age is an independent integer lap count. Temperature is integer milliC (95000 = 95°C). Current state never derives wear from age after reload.

Early wear creates a small linear penalty up to 100 ms. The middle phase rises quadratically to 1600/1200/900 ms at the Soft/Medium/Hard cliff threshold. Beyond that threshold, a second quadratic curve adds up to 6000 ms. Wear caps at 1000; age continues increasing. There is no reset, puncture or stop at the cliff.

Tyres start preheated at 80°C. Each lap moves 25% of the remaining distance toward a fixed dry target of 98/97/100°C. Integer rounding may settle within a few milliC of that target. Cold/hot penalties are 20/30 ms per degree outside the window, capped at 1500 ms. Temperature is bounded to 0–160°C. Temperature affects pace but does not add a thermal wear feedback loop.

## Circuit effect and lap integration

The frozen tyre configuration contains numeric circuit wear and energy multipliers (250–3000 permille). Development defaults are centrally assigned at 1000; there are no named-track rules. Wear gain is rounded base wear × stress / 1000. Energy shifts the temperature target by 10°C per additional 1000 permille. Numeric low/high stress scenarios are covered by tests.

Lap time adds compound grip, wear penalty and temperature penalty to the existing base, car, driver, fuel and consistency terms. Diagnostics expose all three tyre contributions separately.

Exact ordering: read the current tyre/fuel state; calculate the lap using the existing two RNG draws per entrant in grid order; accumulate elapsed/last/best time; burn fuel with the original gram rounding/clamp; increment tyre age, wear and temperature; classify by completed laps and elapsed time. Tyres consume no RNG draws. Prior state and nested tyre objects remain unchanged.

## Versioning and persistence

The engine creates v2 when a complete tyre input is supplied, and retains v1 for legacy inputs. All new browser starts call `startTyreCareerRace`, which supplies v2 snapshots and Medium defaults. The old `startCareerRace` entry point remains a v1 compatibility API when no tyre choices are supplied. Existing v1 races do not acquire tyres halfway through. Unknown versions remain blocked.

The fifth migration adds nullable tyre columns for legacy compatibility, a dry compound enum, bounds CHECKs and a relational `CareerRaceTyreProfile` snapshot table. Each v2 race stores three profiles, numeric circuit factors, starting tyre state and actual current tyre state. One lightweight stint (number 1, starting lap 0) is stored on each entrant. There is no stint-history table.

Race-start profile rows are immutable through application operations. Lap updates write actual current age/wear/temperature alongside fuel, timing and RNG state. Career ownership remains enforced by composite foreign keys. Start and completion use the existing locked transaction and roll back tyre rows/state with lifecycle changes. The lap-20 PostgreSQL reload test creates a new client and compares the entire final state with uninterrupted execution.

## UI and languages

Pre-race development selectors support Soft, Medium and Hard per driver. Start freezes choices; selectors disappear afterward. The timing table displays compound, age in laps, consumed wear and temperature. Both English and Traditional Chinese use centralized translations and Intl formatting. Entity names and stable identifiers remain data. Legacy races show an explanatory v1 notice.

## Controlled balance measurements

One identical car/driver, seed 42, 30 laps, 90,000 ms base, 50 kg starting fuel, 1.6 kg/lap burn, 30 ms/kg, normal stress/energy, 80°C initial tyres. Separate runs use identical draws. Values below are milliseconds.

| Compound | First 5 average | Laps 11–20 average | Final 5 average | Total |
| --- | ---: | ---: | ---: | ---: |
| Soft | 91,514.6 | 91,056.2 | 92,759.4 | 2,745,682 |
| Medium | 91,811.0 | 91,271.5 | 90,837.0 | 2,738,738 |
| Hard | 92,104.0 | 91,544.1 | 90,968.8 | 2,746,282 |

Soft first becomes slower per lap than Medium at lap 20 and Hard at lap 22. Medium has the lowest 30-lap total in this scenario. Fuel burn can improve total lap time even while tyre wear increases. These are curve checks, not final strategy balance: without tyre changes, long races intentionally expose unsuitable compounds to severe degradation. A deterministic 100-seed test verifies fresh ordering and eventual crossover.

## Verification — 23 September 2026

- Offline: **224 passed** across 10 files, including all previous 185 tests.
- Real PostgreSQL: **88 passed** across 5 files, including all previous 73 tests.
- Local existing Homebrew PostgreSQL 18.6 at 127.0.0.1:5432; disposable database `formula_tyres_verify_20260923`. Each suite creates and removes its own unique schema. No external or production database was used.
- All five checked-in migrations actually applied. The four previous migration files were compared with the Phase-5 archive and remain byte-identical.
- Development seed executed twice successfully; existing SQL tests verify idempotence and scoped relationships.
- Prisma format, validate and generate, TypeScript, ESLint and production build passed.
- New tests cover compound profiles, stress, wear bounds/curve/cliff, cold/ideal/hot temperatures, gradual evolution, lap diagnostics, immutability, captured pre-change v1 output, exact v2 lap-20 resume, RNG/fuel regression, locale isolation, architecture boundaries, SQL enum/bounds, persisted actual state, ownership, frozen choices and start/finish rollback.
- Performance: warmed 20-car × 75-lap simulation averaged **0.617 ms** over 100 local runs; timing varies by machine. The offline sanity test requires less than 2 seconds.

## Actual browser verification

Used the production build on port 3100 and a disposable PostgreSQL Career prepared through the normal Career/progression services. Opened the Race page, selected Soft for Alex Smith and Hard for Ren Sato, left the other two entrants on Medium, and started v2.

After five laps: Soft age 5, wear 16%, 93.729°C; Medium age 5, wear 11%, 92.967°C; Hard age 5, wear 7.5%, 95.254°C. Live lap times and fuel appeared. Reload produced an identical timing table. Switching to Traditional Chinese translated headings/compounds and preserved all displayed race values; the selected language survived refresh. Switching back to English restored the identical table.

Simulated to lap 58 and verified finished classification and final tyres survived another refresh. Hard finished at 87% wear; Soft/Medium reached the 100% bound without a tyre reset. The SQL resume test separately verifies exact RNG and full state equality. Temporary browser/server/database were cleaned up after verification.

## Changed areas and deferred work

Added pure tyre model/profiles, optional versioned engine state, v2 start service, relational snapshot/current-state persistence, the fifth migration, selectors/table columns, English/Chinese keys, regression/integration tests and documentation. Existing domain entities and repository boundaries remain intact.

Deferred: pit stops/windows, stint-history UI, mandatory compound rules, tyre allocation, wet/intermediate compounds, weather, traffic/overtaking, DRS/ERS, driving commands, tyre-management attributes, punctures/failures/incidents, points and a 2D viewer.

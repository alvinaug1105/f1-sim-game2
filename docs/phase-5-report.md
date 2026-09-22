# Phase 5 completion report

## Simulation model

Implemented a pure lap-based free-air engine under `src/simulation/race`. It supports multiple drivers/cars, integer-millisecond lap times, incremental laps, full-race execution, classification and final results. A 20-entrant, 75-lap run completes comfortably within the performance sanity test.

Lap time is baseline + car penalty + driver penalty + fuel-mass penalty + bounded consistency variation. Each component is rounded to integer milliseconds. The 100-rated car/driver is the reference baseline; a ten-point car difference costs 300 ms/lap and a ten-point driver pace difference costs 150 ms/lap with version-1 defaults. These are provisional tuning choices, not calibrated claims of Formula realism.

Classification uses completed laps, elapsed time and stable entrant ID for exact ties. Starting-grid positions add 180 ms per slot behind pole. Gaps and intervals are numeric outputs; presentation formatting remains outside simulation. All entrants finish and no championship points are awarded.

## Performance inputs and fuel

Temporary profiles contain Driver pace/consistency (0–100), Car performance (0–100), circuit baseline milliseconds/fuel-effect coefficient, total laps, initial fuel and burn per lap. Versioned tuning parameters are centralized and included in the persisted snapshot.

Development profiles are centralized in `features/race/development-profiles.ts`. Owned Race-driver roster order supplies the temporary grid, without fabricated qualifying results. Team entry order and roster index supply provisional numeric profiles; names and special IDs never affect performance. The circuit baseline derives from length at a provisional 60 m/s reference speed, race distance uses its owned lap count, burn is 0.3 kg/km and fuel effect is 30 ms/kg. Profiles can later be replaced by real Career attributes without changing the engine interface.

Fuel is persisted as integer grams and exposed as kg. Each lap uses starting fuel mass, then burns the configured amount, clamped at zero. Lower mass reduces lap time. No fuel saving, refuelling or running-out behavior is implemented.

## Randomness and state

The existing 32-bit seeded LCG now exposes its state for resume. Two draws per entrant generate small triangular zero-centred variation. Draw order follows the fixed grid rather than mutable race positions. Higher consistency reduces amplitude from at most 350 ms to 30 ms. Simulation version 1 is saved and unsupported versions cannot advance.

RaceSimulationState contains frozen input, original seed, RNG state, current lap/status and entrants. Each entrant records completed laps, elapsed/last/best times, fuel, position and gaps. Pure transitions preserve previous states. Same inputs/seed produce identical results; names, locale and current system time do not enter the engine.

## Persistence and Career integration

Added CareerRaceSimulation, CareerRaceEntrant and RaceSimulationStatus, with migration `20260922000200_core_race_simulation`. All three previous migrations remain byte-for-byte unchanged from the Phase 4 export.

Race metadata/inputs and per-entrant snapshot/state are relational columns, not an opaque JSON blob. Finished entrant rows are the persistent classification, avoiding redundant result tables. One simulation is allowed per session. A constant RACE CHECK plus composite session foreign key rejects non-Race ownership. Composite Career foreign keys reject cross-world simulation/driver/team relationships.

Start snapshots inputs, seed and display names and changes the Race session to IN_PROGRESS in one transaction. Each advance locks the Career and checks expectedLap; duplicate/concurrent requests cannot accidentally progress twice. Finished results, session/weekend/event completion and deterministic Career end date commit atomically. Injected late failures verified rollback of both start and finish.

A persisted lap-10 state was reloaded with a fresh database client, advanced through lap 11 and completed. Its entire final simulation state exactly matched uninterrupted execution from the same input snapshot. Editing owned driver names and circuit data after start did not affect frozen inputs/results.

Production Race controls now use the real engine. Practice/Qualifying retain scaffolding. The browser-facing scaffolding action rejects Race, and the progression repository blocks development completion while a real Race is running. The low-level legacy lifecycle helper remains for prior regression coverage; already-completed Phase 4 development Races are not retroactively assigned invented results.

## Development UI and internationalisation

Added `/career/[careerId]/events/[eventId]/race` with Start Race, Advance 1 Lap, Advance 5 Laps and Simulate to Finish. The basic timing table shows names, positions, elapsed time, gap, interval, last/best lap and fuel. Seed/version are visible for verification. The UI explicitly labels temporary profiles and free-air limitations.

English and Traditional Chinese cover every new label/action/error. Intl-based helpers render lap/gap/long-duration values outside the engine. Entity names remain unchanged. Switching language never changes simulation inputs or saved state.

Browser verification on the production build with a real disposable PostgreSQL Career covered:

- Weekend entry and Practice/Qualifying scaffolding.
- Real Race start and two five-lap advances.
- Refresh at lap 10: visible state matched exactly.
- English → Traditional Chinese: seed, times, fuel and classification unchanged.
- Lap 11 resume and simulation to lap 58/58.
- Final classification persisted identically after refresh and displayed in both languages.
- Race/session/weekend completed; Career date moved to March 8 and Round 2 remained upcoming.

The fictional four-driver seeded database was used for browser verification; the engine tests separately cover 20 entrants and 75 laps.

## Balance sanity measurements

Controlled 100-seed, two-entrant, 30-lap experiments placed the stronger entrant second on the grid:

| Experiment | Observation |
| --- | --- |
| Car 95 vs 85, equal driver pace | Stronger car won 100/100; mean advantage 8,754.76 ms |
| Driver pace 95 vs 85, equal car | Stronger driver won 100/100; mean advantage 4,254.76 ms |
| 1,000 noise samples, consistency 20 | Standard deviation approximately 112.43 ms |
| Same draws, consistency 95 | Standard deviation approximately 18.08 ms |
| Warm-process engine-only 20 entrants × 75 laps | Approximately 0.37 ms in the local measurement |

Tests assert tolerant trends rather than requiring 100% wins. These measurements verify the intended mathematical influence and low execution cost, not real-world realism. No traffic/overtaking, tyre or pit effects are present to counter raw free-air advantages. Timing depends on hardware/runtime and excludes database/UI work.

## Verification and regression

| Check | Result |
| --- | --- |
| Prisma format | Passed |
| Prisma validate | Passed |
| Prisma generate | Passed |
| TypeScript | Passed |
| ESLint | Passed, zero warnings |
| Offline tests | **185 passed across 9 files** |
| Actual PostgreSQL integration tests | **73 passed across 4 files** |
| Production build | Passed |
| Browser verification | Passed as described above |

All previous **134 offline** and **55 PostgreSQL** tests remain passing. Added 51 offline tests (lap calculation, race progression, replay, classification, fuel, statistical sanity, formatting and architectural restrictions) and 18 SQL tests (ownership, uniqueness, seed/state persistence, resume, input freezing, concurrency, rollback and completion).

SQL tests actually ran on **PostgreSQL 18.6 (Homebrew), aarch64 macOS**, using dedicated disposable database `formula_race_verify_a574b765d4b4`. All four checked-in migrations applied. Every suite used its own temporary schema; zero test schemas remained afterward. The same disposable database hosted the migrated/seeded browser verification. The temporary server was stopped and the database removed; existing PostgreSQL service and unrelated databases were preserved. A sandbox network restriction was resolved through granted permission before execution; no missing-URL guard was counted as a pass.

## Deferred work

No tyre compounds/degradation/temperature, traffic/overtaking, dirty air, DRS/ERS, pits/strategy, weather, incidents/failures, Safety Car, commands, championship points, practice/qualifying engines, detailed ratings, car development, contracts, staff, finances, 2D viewer, real-time speed controls or multiplayer were implemented.

Phase 5 models free-air race pace and accumulated race time, not track-position interaction. Later systems can build on this versioned pure engine and persistent session boundary.

## Delivery

The refreshed full source ZIP contains source, four migrations, seed, translations, tests, lockfile and documentation. It excludes credentials, installed dependencies, generated client/build output and disposable verification data. Follow GITHUB_UPLOAD.md to install, configure DATABASE_URL, migrate and seed. No code was published to GitHub automatically.

# Weather AI over-delay — Builder handoff

Starting main: `9a0f8471f3b910669533d8ed098e847b613fb3bb`.
Starting candidate: `fa806bef495ce46e9dae152c54e775b396ca2478` (one commit ahead).
Branch: `codex/final-race-weather-overdelay`. Implementation only; independent re-test required.

## Root cause and repair

The only production change is in `assessAiStop`. The weather decision compared the current tyre and fresh alternatives over a ten-lap public forecast horizon, then required savings to exceed the biased stop cost. A late-biased car could keep returning `NO_WINDOW` even at maximum water with 45 racing laps left. The three-lap minimum stint could delay the first response, but did not explain the 13–14-lap tail.

Modern closure profiles now assess the current tyre family with the existing authoritative suitability model before the forecast strategy. Only a `POOR` family qualifies. Its current per-lap deficit multiplied by racing laps remaining **after** the next stop must exceed the effective pit-lane loss, stationary service, existing margin and deterministic crossover bias. The target is the fastest available compound of the best current family. No water thresholds, bonus, new RNG or identity rules were added.

This is a current-conditions payback estimate, not future weather knowledge. A qualifying recovery bypasses the strategy-only minimum stint; ordinary next-lap stop execution and the final-lap guard remain. SUITABLE/MARGINAL cars retain the existing forecast and preference logic. Recovery reuses reason `WEATHER`; no public payload or state shape changes.

## Controlled before/after evidence

`weather-overdelay.json` records 28 checkpoints per seed, before and after this repair, using `sampleWeather(seed, [[1,0],[5,1000]])` from the checked-in test helper. Identical quiet 20-AI-car fixtures, 58 laps, seeds 101/202/303; no random incidents obscure the tyre decision. This is a controlled reproduction, not the Tester's undisclosed exact fixture. Water uses the model's 0–1000 scale. `inferiorNoWindow` counts cars with >1500 ms current-family deficit returning NO_WINDOW; NO_WINDOW on correctly shod cars is normal.

At lap 16 in every sample: water 1000, best family WET; an Intermediate has a 2595 ms/lap deficit.

| Seed | Before Inter / Wet | After Inter / Wet | Last Wet switch before → after | Inferior NO_WINDOW before → after at lap 16 |
|---|---|---|---|---|
| 101 | 3 / 17 | 0 / 20 | 24 → 11 | 3 → 0 |
| 202 | 5 / 15 | 0 / 20 | 24 → 11 | 5 → 0 |
| 303 | 4 / 16 | 0 / 20 | 23 → 11 | 3 → 0 |

`weather-overdelay-sample.json` records seven additional seed-202 scenario summaries and individual stop histories: low-water forecast, gradual/rapid Dry→Inter, gradual/rapid Inter→Wet, sustained maximum water, and Wet→Inter→Dry. Gradual Dry→Inter first stops: 3/5/12 cars on laps 12/13/14. Gradual Inter→Wet: 3/3/2/5/7 on laps 8–12. Maximum water: all cars recover at the first legal stop (lap 1). Drying: all 20 on Inter by lap 16 and Dry by lap 27. No artificial spread is imposed during rapid rain.

## Permanent coverage

Ten new tests cover the direct NO_WINDOW blocker, one-lap payback rejection and final-lap guard, strategy minimum-stint bypass only for poor-family recovery, SC/VSC assessment, Dry→Inter with a one-lap forecast horizon, 0/5/10/12/15% water, three rapid-rain seeds with a two-lap response bound, sustained maximum water, future-timeline independence, no mutation, repeated runs and JSON reload/resume equality. Existing closure tests retain gradual/drying and early-Wet coverage.

Accepted saved Races lacking the optional weather gate fields skip recovery entirely; their original decision path is retained. No new persisted fields or version bump. Existing new-Race profile construction remains unchanged, including old Career → modern new Race. The focused DB suites exercise actual repository persistence/reload.

## Verification executed

- `npm ci`: dependencies installed; postinstall initially blocked by protected Prisma cache. `XDG_CACHE_HOME=/private/tmp/f1-weather-prisma-cache npx prisma generate` succeeded without modifying dependencies.
- `npx vitest run tests/race-closure.test.tsx tests/race-strategy.test.ts`: 42 tests.
- `npx vitest run tests/weather-overdelay.test.ts`: initial test assertion corrected; final coverage included in the full suite below.
- `npm test`: 813 tests / 42 files.
- `npm run typecheck`: succeeded after correcting the helper's return type annotation.
- `npm run lint`: succeeded.
- `TEST_DATABASE_URL=postgresql://alvinaug1105@localhost:5432/f1_weather_overdelay_20260927 XDG_CACHE_HOME=/private/tmp/f1-weather-prisma-cache npm run test:db -- tests/race.integration.test.ts tests/weather.integration.test.ts tests/pits.integration.test.ts tests/commands.integration.test.ts tests/race-dynamics.integration.test.ts`: 74 tests / 5 suites.
- `npm run build`: succeeded after the same helper type correction.
- `git diff --check`: clean.
- Deterministic samples executed with `tsx`, using the committed helper; measurements are the JSON files beside this report.

PostgreSQL 18.6 (Homebrew), existing local server, newly created disposable database. Each suite applied checked-in migrations to its own unique schema and cleaned up. Disposable database dropped after verification. pg emitted existing concurrent-query deprecation warnings; no failed DB tests.

## Preserved boundaries

Schema changed: no. Migration added: no. Historical migrations changed: no.

Fuel starvation, fuel alerts/labels, forecast copy, i18n, DRS, traffic pressure, command balance, circuit difficulty, Sprint Racecraft and public projections are unchanged from the candidate. No browser-visible data added; the recovery reads only current observable weather and existing server strategy inputs. No Math.random. No Content Expansion B or Phase 17 work.

## Independent QA priorities

Re-run the Tester's original rapid-rain seeds and sustained-max-water fixture. Verify current-condition recovery under SC/VSC, near race end, immediately after a stop and during rapidly reversing rain/drying; the payback calculation assumes current conditions for remaining distance. Confirm gradual spread and absence of systemic low-water switching, accepted-main legacy replay, old-Career/new-Race configuration, and database reload determinism. This report supplies Builder evidence only, not final acceptance.

# Codex Builder Report — Content Expansion Pass B

## Status

Content Expansion Pass B complete and ready for independent QA. Verification results below are Builder checks, not independent acceptance.

## Starting Main

`e1f0804014b3beb9b7f67a9b1d2cee684a5136c0` — Race Gameplay Milestone 2 — Final Race Closure Repair. Clean tree; no competing candidate. Fresh branch `codex/content-expansion-pass-b`.

## Calendar Reference

Original officially announced 2026 24-round calendar.
Later exceptional cancellations/replacements are intentionally not used.

Calendar authority: [F1's original announcement](https://www.formula1.com/en/latest/article/formula-1-reveals-calendar-for-2026-season.YctbMZWqBvrgyddrnauo8), with the Project Lead's exact dates/format lock. Bahrain and Jeddah are retained; no Sepang.

## Source Content Version

GameDatabase.version: **1.0.0 → 1.1.0** (new world content).
schemaVersion: **1 → 1**. `docs/architecture.md` defines this as an import-compatibility marker, not the SQL migration number. Climate is optional in the content contract and NULL-compatible; the existing import shape remains valid. Old Career provenance stays 1.0.0; new Careers record 1.1.0. Stable database and season IDs/keys/names stay unchanged.

## Branch

`codex/content-expansion-pass-b`

## Target Calendar

24 rounds; six Sprint weekends.

## Calendar Events

All source IDs below use prefix `00000000-0000-4000-8000-` and a 12-digit numeric suffix. Existing event IDs 700–707 are retained, not reassigned to round numbers.

| Round | Grand Prix | Circuit | Dates (2026) | Format | Event ID suffix |
|---|---|---|---|---|---|
| 1 | Australian Grand Prix | Albert Park Grand Prix Circuit | 03-06 → 03-08 | STANDARD | 700 |
| 2 | Chinese Grand Prix | Shanghai International Circuit | 03-13 → 03-15 | SPRINT | 702 |
| 3 | Japanese Grand Prix | Suzuka Circuit | 03-27 → 03-29 | STANDARD | 701 |
| 4 | Bahrain Grand Prix | Bahrain International Circuit | 04-10 → 04-12 | STANDARD | 703 |
| 5 | Saudi Arabian Grand Prix | Jeddah Corniche Circuit | 04-17 → 04-19 | STANDARD | 708 |
| 6 | Miami Grand Prix | Miami International Autodrome | 05-01 → 05-03 | SPRINT | 709 |
| 7 | Canadian Grand Prix | Circuit Gilles Villeneuve | 05-22 → 05-24 | SPRINT | 710 |
| 8 | Monaco Grand Prix | Circuit de Monaco | 06-05 → 06-07 | STANDARD | 704 |
| 9 | Barcelona-Catalunya Grand Prix | Circuit de Barcelona-Catalunya | 06-12 → 06-14 | STANDARD | 711 |
| 10 | Austrian Grand Prix | Red Bull Ring | 06-26 → 06-28 | STANDARD | 712 |
| 11 | British Grand Prix | Silverstone Circuit | 07-03 → 07-05 | SPRINT | 705 |
| 12 | Belgian Grand Prix | Circuit de Spa-Francorchamps | 07-17 → 07-19 | STANDARD | 706 |
| 13 | Hungarian Grand Prix | Hungaroring | 07-24 → 07-26 | STANDARD | 713 |
| 14 | Dutch Grand Prix | Circuit Zandvoort | 08-21 → 08-23 | SPRINT | 714 |
| 15 | Italian Grand Prix | Autodromo Nazionale Monza | 09-04 → 09-06 | STANDARD | 715 |
| 16 | Spanish Grand Prix | Madring | 09-11 → 09-13 | STANDARD | 716 |
| 17 | Azerbaijan Grand Prix | Baku City Circuit | 09-24 → 09-26 | STANDARD | 717 |
| 18 | Singapore Grand Prix | Marina Bay Street Circuit | 10-09 → 10-11 | SPRINT | 707 |
| 19 | United States Grand Prix | Circuit of the Americas | 10-23 → 10-25 | STANDARD | 718 |
| 20 | Mexico City Grand Prix | Autódromo Hermanos Rodríguez | 10-30 → 11-01 | STANDARD | 719 |
| 21 | São Paulo Grand Prix | Autódromo José Carlos Pace (Interlagos) | 11-06 → 11-08 | STANDARD | 720 |
| 22 | Las Vegas Grand Prix | Las Vegas Strip Circuit | 11-19 → 11-21 | STANDARD | 721 |
| 23 | Qatar Grand Prix | Lusail International Circuit | 11-27 → 11-29 | STANDARD | 722 |
| 24 | Abu Dhabi Grand Prix | Yas Marina Circuit | 12-04 → 12-06 | STANDARD | 723 |

## Circuit Content

Existing 300–307 retained; new 308–323 assigned after checking collisions. All interaction/climate profiles are initial game-content values, not official ratings or historical meteorological probabilities.

| ID suffix | Stable key | Name | Country | City/location | Metres | Laps | Metadata reference |
|---|---|---|---|---|---|---|---|
| 300 | circuit-silver-coast | Albert Park Grand Prix Circuit | AU | Melbourne | 5278 | 58 | [F1](https://www.formula1.com/en/racing/2026/australia/circuit) |
| 301 | circuit-mountain-park | Suzuka Circuit | JP | Suzuka | 5807 | 53 | [F1](https://www.formula1.com/en/racing/2026/japan/circuit) |
| 302 | circuit-shanghai | Shanghai International Circuit | CN | Shanghai | 5451 | 56 | [F1](https://www.formula1.com/en/racing/2026/china/circuit) |
| 303 | circuit-bahrain | Bahrain International Circuit | BH | Sakhir | 5412 | 57 | [F1](https://www.formula1.com/en/racing/2025/bahrain/circuit) |
| 304 | circuit-monaco | Circuit de Monaco | MC | Monaco | 3337 | 78 | [F1](https://www.formula1.com/en/racing/2026/monaco/circuit) |
| 305 | circuit-silverstone | Silverstone Circuit | GB | Silverstone | 5891 | 52 | [F1](https://www.formula1.com/en/racing/2026/great-britain/circuit) |
| 306 | circuit-spa-francorchamps | Circuit de Spa-Francorchamps | BE | Stavelot | 7004 | 44 | [F1](https://www.formula1.com/en/racing/2026/belgium/circuit) |
| 307 | circuit-marina-bay | Marina Bay Street Circuit | SG | Singapore | 4927 | 62 | [F1](https://www.formula1.com/en/racing/2026/singapore/circuit) |
| 308 | circuit-jeddah | Jeddah Corniche Circuit | SA | Jeddah | 6174 | 50 | [F1](https://www.formula1.com/en/racing/2025/saudi-arabia/circuit) |
| 309 | circuit-miami | Miami International Autodrome | US | Miami | 5412 | 57 | [F1](https://www.formula1.com/en/racing/2026/miami/circuit) |
| 310 | circuit-montreal | Circuit Gilles Villeneuve | CA | Montreal | 4361 | 70 | [F1](https://www.formula1.com/en/racing/2026/canada/circuit) |
| 311 | circuit-barcelona | Circuit de Barcelona-Catalunya | ES | Montmeló | 4657 | 66 | [F1](https://www.formula1.com/en/racing/2026/barcelona-catalunya/circuit) |
| 312 | circuit-red-bull-ring | Red Bull Ring | AT | Spielberg | 4326 | 71 | [F1](https://www.formula1.com/en/racing/2026/austria/circuit) |
| 313 | circuit-hungaroring | Hungaroring | HU | Mogyoród | 4381 | 70 | [F1](https://www.formula1.com/en/racing/2026/hungary/circuit) |
| 314 | circuit-zandvoort | Circuit Zandvoort | NL | Zandvoort | 4259 | 72 | [F1](https://www.formula1.com/en/racing/2026/netherlands/circuit) |
| 315 | circuit-monza | Autodromo Nazionale Monza | IT | Monza | 5793 | 53 | [F1](https://www.formula1.com/en/racing/2026/italy/circuit) |
| 316 | circuit-madrid | Madring | ES | Madrid | 5414 | 57 | [F1](https://www.formula1.com/en/racing/2026/spain/circuit) |
| 317 | circuit-baku | Baku City Circuit | AZ | Baku | 6003 | 51 | [F1](https://www.formula1.com/en/racing/2026/azerbaijan/circuit) |
| 318 | circuit-cota | Circuit of the Americas | US | Austin | 5513 | 56 | [F1](https://www.formula1.com/en/racing/2026/united-states/circuit) |
| 319 | circuit-mexico-city | Autódromo Hermanos Rodríguez | MX | Mexico City | 4304 | 71 | [F1](https://www.formula1.com/en/racing/2026/mexico/circuit) |
| 320 | circuit-interlagos | Autódromo José Carlos Pace (Interlagos) | BR | São Paulo | 4309 | 71 | [F1](https://www.formula1.com/en/racing/2026/brazil/circuit) |
| 321 | circuit-las-vegas | Las Vegas Strip Circuit | US | Las Vegas | 6201 | 50 | [F1](https://www.formula1.com/en/racing/2026/las-vegas/circuit) |
| 322 | circuit-lusail | Lusail International Circuit | QA | Lusail | 5419 | 57 | [F1](https://www.formula1.com/en/racing/2026/qatar/circuit) |
| 323 | circuit-yas-marina | Yas Marina Circuit | AE | Abu Dhabi | 5281 | 58 | [F1](https://www.formula1.com/en/racing/2026/united-arab-emirates/circuit) |

## Existing Metadata Corrections

- Albert Park length: **5200 → 5278 m**; 58 laps unchanged.
- Suzuka length: **4800 → 5807 m**; laps **64 → 53**.
- Singapore length: **4940 → 4927 m**; 62 laps unchanged.
- All eight gain the explicit climate column listed below. Their existing interaction ratings, stable IDs/keys, display names, countries and cities are unchanged.
- Source database description updated to describe the original 24-round world.
- No existing Career circuit metadata is rewritten.

References retrieved 2026-09-27. Current F1 Bahrain 2026 content describes the exceptional replacement venue; the 2025 Sakhir page is deliberately used instead. Jeddah likewise uses its 2025 venue page. Madrid uses the current F1 circuit length 5414 m / 57 laps; the pinned cartographic source's older descriptive `length: 5474` property is not used for Race distance. Geometry is a source polyline, not a certified measured racing line.

## Race Interaction Profiles and Climate Profiles

HUMID combines humid/tropical venues; no climate identity deviations from the suggested grouping. Names are never consulted by the simulation.

| Circuit | Overtaking difficulty | Dirty air ‰ | DRS ‰ | Climate |
|---|---|---|---|---|
| Albert Park Grand Prix Circuit | 40 | 1100 | 950 | TEMPERATE |
| Suzuka Circuit | 50 | 1150 | 850 | VARIABLE |
| Shanghai International Circuit | 25 | 950 | 1150 | TEMPERATE |
| Bahrain International Circuit | 18 | 900 | 1300 | ARID |
| Circuit de Monaco | 85 | 1500 | 350 | TEMPERATE |
| Silverstone Circuit | 26 | 950 | 1150 | VARIABLE |
| Circuit de Spa-Francorchamps | 15 | 900 | 1350 | VARIABLE |
| Marina Bay Street Circuit | 62 | 1300 | 650 | HUMID |
| Jeddah Corniche Circuit | 23 | 950 | 1200 | ARID |
| Miami International Autodrome | 35 | 1000 | 1100 | HUMID |
| Circuit Gilles Villeneuve | 28 | 950 | 1150 | VARIABLE |
| Circuit de Barcelona-Catalunya | 48 | 1200 | 850 | DRY |
| Red Bull Ring | 24 | 900 | 1250 | VARIABLE |
| Hungaroring | 65 | 1350 | 650 | TEMPERATE |
| Circuit Zandvoort | 62 | 1300 | 700 | VARIABLE |
| Autodromo Nazionale Monza | 18 | 850 | 1300 | TEMPERATE |
| Madring | 45 | 1100 | 1000 | DRY |
| Baku City Circuit | 20 | 900 | 1350 | DRY |
| Circuit of the Americas | 30 | 1050 | 1150 | TEMPERATE |
| Autódromo Hermanos Rodríguez | 35 | 1100 | 1100 | DRY |
| Autódromo José Carlos Pace (Interlagos) | 28 | 1000 | 1150 | HUMID |
| Las Vegas Strip Circuit | 18 | 850 | 1400 | ARID |
| Lusail International Circuit | 48 | 1200 | 850 | ARID |
| Yas Marina Circuit | 32 | 1000 | 1100 | ARID |

## Geometry

All raw geometry remains from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), MIT, pinned to **394d8fbe70ef2c0b0c8d23ff7bee61fa09606055**. Existing eight files/rotations remain unchanged. Every added file is an unmodified copy of its upstream GeoJSON. Licence retained at `src/data/seed/geometry/LICENSE.txt`.

| New venue | Upstream file at pinned revision | Licence | Direction | Rotation ° | Reverse ring | Points | Fallback |
|---|---|---|---|---|---|---|---|
| jeddah | [sa-2021.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/sa-2021.geojson) | MIT | COUNTER_CLOCKWISE | -84 | false | 151 | no |
| miami | [us-2022.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/us-2022.geojson) | MIT | COUNTER_CLOCKWISE | 4 | false | 102 | no |
| montreal | [ca-1978.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/ca-1978.geojson) | MIT | CLOCKWISE | -80 | false | 101 | no |
| barcelona | [es-1991.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/es-1991.geojson) | MIT | CLOCKWISE | 57 | false | 149 | no |
| red-bull-ring | [at-1969.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/at-1969.geojson) | MIT | CLOCKWISE | -21 | false | 80 | no |
| hungaroring | [hu-1986.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/hu-1986.geojson) | MIT | CLOCKWISE | 79 | false | 140 | no |
| zandvoort | [nl-1948.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/nl-1948.geojson) | MIT | CLOCKWISE | 7 | false | 118 | no |
| monza | [it-1922.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/it-1922.geojson) | MIT | CLOCKWISE | 66 | false | 124 | no |
| madrid | [es-2026.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/es-2026.geojson) | MIT | CLOCKWISE | -63 | false | 115 | no |
| baku | [az-2016.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/az-2016.geojson) | MIT | COUNTER_CLOCKWISE | 31 | false | 85 | no |
| cota | [us-2012.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/us-2012.geojson) | MIT | COUNTER_CLOCKWISE | 21 | false | 170 | no |
| mexico-city | [mx-1962.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/mx-1962.geojson) | MIT | CLOCKWISE | -25 | false | 100 | no |
| interlagos | [br-1940.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/br-1940.geojson) | MIT | COUNTER_CLOCKWISE | -89 | false | 170 | no |
| las-vegas | [us-2023.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/us-2023.geojson) | MIT | COUNTER_CLOCKWISE | 90 | false | 99 | no |
| lusail | [qa-2004.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/qa-2004.geojson) | MIT | CLOCKWISE | -61 | false | 106 | no |
| yas-marina | [ae-2009.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/ae-2009.geojson) | MIT | COUNTER_CLOCKWISE | -82 | false | 132 | no |

Active calendar fallback count: **0** (24/24 real layouts).

### Madrid Geometry

Madrid already exists at the approved revision as `circuits/es-2026.geojson`; no alternate licence, traced official artwork, schematic or invented coordinates were needed. The 115 unique vertices are projected and uniformly normalized through the existing pipeline, with upstream start/finish retained. Source rotation/direction are in the table above.

### Geometry Validation

Closed-path representation supplies the final segment (no repeated endpoint in normalized arrays). Tests cover finite/unit-square coordinates, at least 80 unique points, non-zero bounds, closed continuous samples, stable start/finish, racing direction via first corner and deterministic normalization. Red Bull Ring legitimately has exactly 80 points; the former strictly-greater-than-80 assertion was corrected. Jeddah is genuinely narrow: minimum short-axis extent changed from 0.2 to 0.1 without stretching the geometry. The first-corner sampling range was extended for Mexico's long pit straight. A 24-layout contact sheet was visually reviewed; no malformed duplicate ring or obvious reflected layout observed. This is game-map validation, not FIA surveying.

## Climate Architecture

One additive migration: `20261001000100_circuit_climate`.

Nullable enum `CircuitClimateProfile` (`ARID`, `DRY`, `TEMPERATE`, `VARIABLE`, `HUMID`) on Circuit and CareerCircuit. Creation copies source climate alongside the existing interaction profile. Repository session inputs read CareerCircuit only. Existing NULL/absent content selects the exact prior weights; no backfill. Already-started simulations retain persisted weather. Session identity seeds and RNG draws within stories remain unchanged.

`climateWeather` weights existing DRY/MOSTLY_DRY/LIGHT_INTERMITTENT/MIXED/LATE_SHOWER/WET stories. Practice, GP Qualifying, Sprint Qualifying, GP/Sprint generation and pre-Race projection all consume the snapshotted climate. Scenario content, forecast uncertainty, water physics, tyre performance and AI strategy are unchanged. Development-only explicit-seed Race fixtures retain their existing development weather override.

## Weather Frequency Sanity

Reproduce with `npx tsx scripts/pass-b-weather-sample.ts`. Evidence: [pass-b-weather.json](verification/pass-b-weather.json).

40 deterministic full-calendar seasons / 960 generated Grands Prix. Seed identity uses fixed season labels, stable event and circuit IDs; no observed real weather input. Fully dry means no actual rain. Forecast-rain uses the unchanged public `forecastItems` display rule. Inter/Wet affected means cumulative idealized current-family advantage repays one existing default green stop plus margin; these proxies overlap and are not an optimized strategy. Mixed means more than one best family plus materially useful wet tyres. Forecast-visible light rain need not have strategic significance.

| Scope | Races | Dry % | Forecast rain % | Inter affected % | Wet affected % | Mixed % |
|---|---|---|---|---|---|---|
| Overall | 960 | 64.27 | 35.73 | 13.13 | 10.1 | 17.5 |
| ARID | 200 | 93 | 7 | 1.5 | 1 | 1.5 |
| DRY | 160 | 77.5 | 22.5 | 7.5 | 6.25 | 10 |
| TEMPERATE | 240 | 64.58 | 35.42 | 11.25 | 7.08 | 13.75 |
| VARIABLE | 240 | 43.75 | 56.25 | 22.5 | 17.92 | 30.83 |
| HUMID | 120 | 39.17 | 60.83 | 25 | 20.83 | 35 |

Season level: mean rain-visible **8.575/24**, median **8**, range **2–14**; mean strategically wet **4.2/24**. Initial prior differentiation only; no formal balance verdict.

## Career Snapshot / Old Career Compatibility

Permanent real-PostgreSQL regression reconstructs the populated pre-climate column shape and applies the exact additive SQL. Source reseeded twice: old events/circuits are byte-equal; old Career remains **8 rounds**, NULL climates and 1.0.0 provenance. New Career has **24 rounds**, explicit climates, interaction profiles and 1.1.0 provenance. Later source climate/profile edits do not change its snapshots. No automatic Career expansion.

## Full-Season Progression / Sprint Validation / Championship

The existing full-season test now runs all 24 Grands Prix and six Sprints through real persisted Qualifying and Race services (Practice uses its existing development simulation action). It verifies event activation, dates, completed/upcoming counts, standard/sprint session sequences, no championship completion at R23 or before the R24 Race, and authoritative completion after Abu Dhabi. WDC 22 / WCC 11; 24 histories / 30 scored-session cutoffs; full-distance points conserved, final champions and reread standings available. Six Sprints exactly Shanghai, Miami, Montreal, Silverstone, Zandvoort and Singapore. Scoring is untouched.

## Seed Idempotency

Stable-ID upserts retain descending-round relocation. Both pre-Pass-A upgrade regression and populated eight-round → 24-round reseeding pass without duplicate events/circuits. Exactly 24 source events and circuits after repeated seeding.

## Determinism / i18n / Information Boundary

No Math.random or new gameplay state. NULL scenario selection tested against accepted legacy cumulative weights across 300 seeds; climate changes only existing story selection. Repeated same identity produces identical weather. EN/zh-TW resources unchanged: no new UI copy, proper names remain data. Hidden weather timelines remain server-side; the preparation projection exposes only the same public forecast/current conditions.

## Preserved Systems / Deferred

No changes to teams/drivers/colours/numbers/allocations/ratings, Racecraft, tyre model, weather strategy (including NO_WINDOW recovery), fuel, incidents, reliability, SC/VSC, scoring or simulation engines. Not started: Phase 17, research/regulations, PU/components, contracts/transfers, staff, facilities, finance, sponsorship, board/morale or multiplayer.

## QA Handoff

Prioritize fresh and populated-schema migrations, NULL legacy replay, new-vs-old Career snapshot isolation, all five session generation paths, R23/R24 completion, six Sprint structures, geometry start/direction (especially Madrid/Mexico/Jeddah), and the 24-round UI at narrow widths. Climate priors and interaction values require independent content/balance acceptance. Pinned source geometry may simplify corners; Madrid's descriptive upstream length differs from the current F1 measured metadata.


## Tests / Verification Run

- `npm test`: **852 tests passed, 43 files**.
- `npm run test:db -- tests/content.integration.test.ts tests/career.integration.test.ts tests/practice.integration.test.ts tests/qualifying.integration.test.ts tests/sprint.integration.test.ts tests/championship.integration.test.ts tests/climate-snapshot.integration.test.ts tests/race.integration.test.ts tests/weather.integration.test.ts`: **103 PostgreSQL tests passed, nine files**, final combined run after migration-order correction.
- `npm run typecheck`: completed successfully.
- `npm run lint`: completed successfully.
- `npm run build`: completed successfully.
- `npx prisma validate`: valid schema.
- `npx prisma generate`: client generated.
- `npx prisma migrate deploy`: all 17 checked-in migrations applied to a fresh disposable database.
- `npx prisma migrate status`: schema up to date.
- `npx tsx scripts/pass-b-weather-sample.ts`: 40 seasons / 960 GPs; evidence committed.
- `git diff --check`: tracked edits clean. Staged check identifies only inherited trailing whitespace in the 16 byte-preserved upstream geometry files; excluding vendored geometry is clean.

`TEST_DATABASE_URL` used local Homebrew PostgreSQL 18.6, disposable database `f1_passb_20260927`; integration suites used unique schemas and cleaned them up. No production database was involved. The temporary server was stopped and disposable database removed after verification. Upgrade tests execute the exact additive SQL against populated legacy columns and verify repeated seeding. Older Sprint/Championship migration harnesses now record only genuinely applied earlier migrations before deploying pending migrations; historical SQL files are untouched.

Browser sanity used a production build in Chrome: new Career home showed 0/24, correct next event and standings empty state; inspected at 768×900 with no horizontal overflow. Full-season round histories/cutoffs were checked through persisted services/projections. Exhaustive populated 24-round browser navigation and geometry motion remain independent QA work. No responsive code change was necessary for the inspected pages.

The PostgreSQL driver emitted its existing concurrent-query deprecation warning; tests completed successfully. No unrelated dependency changes were made.

## Database

schema changed: **yes**, nullable typed climate on Circuit and CareerCircuit.

migration added: **yes**, one additive migration.

migration name: **20261001000100_circuit_climate** (ordered after the accepted Championship migration).

historical migrations changed: **no**.

## Files Changed

- `src/data/seed/content-development.ts`: full calendar, 16 circuit records, reviewed metadata and explicit profiles; content version 1.1.0.
- `src/data/seed/circuit-layouts.ts`, `src/data/seed/geometry/*.json`: 16 pinned MIT geometries and stable-ID registrations.
- `prisma/schema.prisma`, `prisma/migrations/20261001000100_circuit_climate/migration.sql`: typed nullable climate storage.
- `src/game/domain/content.ts`, `content-dataset.ts`, `career-snapshot.ts` and session repository contracts: validation/snapshot plumbing.
- `src/data/repositories/prisma-{practice,qualifying,race}.ts`: snapshotted climate inputs.
- `src/features/race/weather-scenarios.ts` and Practice/Qualifying/Race services/projection: occurrence priors, consistent session coverage/public forecast.
- `tests/content-pass-b.test.ts`, `tests/climate-snapshot.integration.test.ts`, `tests/fixtures/content-before-pass-b.json`: permanent calendar/content/legacy regressions.
- Existing content, Career, geometry, Sprint and Championship tests: updated counts, full-season and forward-migration coverage.
- `scripts/pass-b-weather-sample.ts`, `docs/verification/pass-b-*.json`: reproducible Builder evidence.
- `README.md`, `docs/architecture.md`, `docs/circuit-geometry-provenance.md`, this report: current world/provenance/handoff documentation.

## Git

branch: `codex/content-expansion-pass-b`

Implementation commit and confirmed push status are supplied in the accompanying Builder handoff. No merge; no next-phase work.

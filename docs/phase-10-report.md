# Phase 10 — Weather, track conditions and wet tyres

Completed 23 September 2026. All numerical values below are provisional game tuning, not real Formula 1 telemetry.

## Result

New browser races use simulation **v6**. They snapshot a deterministic weather timeline, approximate forecast, circuit water properties and all five tyre profiles. Rain gradually changes persistent track water; numeric suitability curves, existing thermal response and wear determine pace. Player tyre requests remain explicit. AI uses current observations and the same approximate forecast shown to the player.

Existing v1–v5 saves keep their historical behaviour and do not receive weather. All previous tests, fixtures and eight migrations remain byte-identical to the Phase 9 export. A complete v5 fixture was captured before engine changes.

## Weather truth and determinism

The frozen timeline contains segment start laps, rainfall intensity (0–1000) and air temperature in milli-Celsius. The development generator uses a separate seeded RNG initialized with `(raceSeed ^ 0xa71e39bd) >>> 0`. It generates opening dry laps, light rain, heavy rain, easing rain and a dry finish, with small seeded onset/intensity changes. Segment timings scale to race length; very short races omit unreachable segments.

Weather generation never consumes the race interaction RNG. No wall clock, browser weather API or network weather source is used. After creation the engine reads the saved timeline; it does not regenerate it. Weather adds no per-lap RNG draws. Changed pace and AI stops can naturally change which existing overtake/service draws occur.

Current state persists rainfall, air temperature, track temperature, track water and `DRS_ENABLED` / `DRS_DISABLED_WET`. Weather and surface condition are distinct: the browser showed no rain with 69.7% water remaining.

## Track-water evolution

All outputs use integer/fixed-point units, with water clamped to 0–1000. Default frozen circuit values:

- Rain accumulation: `round(rainfall × 180 / 1000)` water units per lap.
- Drainage: 20 units per lap.
- Drying: `round(45 × (1000 − rainfall) / 1000 × clamp(trackTemperatureMilliC, 10000, 60000) / 30000)`.
- New water: clamp previous water + accumulation − drainage − drying.
- Wet-grip sensitivity: 1000‰, multiplying the numeric suitability penalty.

Track temperature moves one quarter of the way toward `airTemperature + 10°C × (1 − rainFraction)` each lap. Default air temperature is 24°C during dry segments and 19°C during rain. Air can change at a segment boundary, while track temperature and water respond gradually. There are no circuit-name checks, puddle geometry, racing-line drying or solar-physics model.

## Tyre suitability and crossover

Each compound has a frozen water-profile centre, base penalty and quadratic coefficient. The water penalty is:

`round((basePenaltyMs + curveMs × ((water − centre) / 1000)²) × wetGripSensitivityPermille / 1000)`.

| Tyre | Centre | Base penalty | Curve coefficient |
| --- | ---: | ---: | ---: |
| Soft / Medium / Hard | 0 | 0 ms | 28,000 ms |
| Intermediate | 400 | 1,000 ms | 10,000 ms |
| Wet | 850 | 1,600 ms | 18,000 ms |

Existing compound grip, age/wear and temperature penalties are added normally. No “correct tyre” flag or guaranteed advantage is assigned. The following controlled table uses fresh tyres within each compound's own ideal temperature window. Values are total compound-plus-water contributions relative to the common baseline; it deliberately isolates suitability from thermal/wear penalties.

| Water (0–1000) | Soft ms | Medium ms | Hard ms | Intermediate ms | Wet ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | −350 | 0 | 300 | 2600 | 14605 |
| 100 | −70 | 280 | 580 | 1900 | 11725 |
| 200 | 770 | 1120 | 1420 | 1400 | 9205 |
| 300 | 2170 | 2520 | 2820 | 1100 | 7045 |
| 400 | 4130 | 4480 | 4780 | 1000 | 5245 |
| 500 | 6650 | 7000 | 7300 | 1100 | 3805 |
| 600 | 9730 | 10080 | 10380 | 1400 | 2725 |
| 700 | 13370 | 13720 | 14020 | 1900 | 2005 |
| 800 | 17570 | 17920 | 18220 | 2600 | 1645 |
| 900 | 22330 | 22680 | 22980 | 3500 | 1645 |
| 1000 | 27650 | 28000 | 28300 | 4600 | 2005 |

Scanning integer water levels gives fastest-compound changes at **240 (Intermediate)** and **710 (Wet)**. These are measured intersections, not conditional selection rules. Worn or overheated tyres, traffic and pit loss change the actual strategic crossover. Dry tyres remain usable at low water and become severely slow in extreme water; there are no aquaplaning incidents.

## Temperature, wear and existing commands

Intermediate ideal temperatures are 65–90°C; Wet 55–80°C. The existing Phase 6 thermal-response equation remains active. Weather changes its target through a water-weighted target temperature plus one quarter of the track-temperature difference from 30°C. Default dry/wet target endpoints are 115/76°C for Intermediate, 125/66°C for Wet, and 98/80°C for dry tyres. The existing pace energy multiplier still modifies the target.

Dry-running wear rises continuously with the square of the dry fraction: maximum multipliers are 2500‰ for Intermediate and 4000‰ for Wet, versus 1000‰ for dry tyres. These compose with circuit stress and pace-command wear multipliers.

Eight controlled laps starting at 70°C, Standard pace:

| Tyre | Dry-track wear | Dry final temperature | Water 900 wear | Wet final temperature |
| --- | ---: | ---: | ---: | ---: |
| Intermediate | 48.0% | 111.396°C | 19.2% | 77.110°C |
| Wet | 64.0% | 120.394°C | 16.8% | 69.911°C |

The dry case uses 34°C track temperature; the wet case uses 22°C. This intentionally captures both water suitability and thermal environment. ATTACK still increases wear/heating versus CONSERVE in wet conditions. Fuel burn remains lap-based and mode-dependent: a longer wet lap does not itself consume extra fuel. ERS remains available with its existing resource limits and pit-lap rules.

## Forecast

Forecast windows contain approximate arrival bounds and intensity ranges, separate from truth segments. Default uncertainty is ±2 laps with a seeded centre deviation up to one lap, and ±150 rainfall units. Zero/heavy extremes clamp to valid bounds. Approximate duration follows from successive change windows; exact truth start laps are not rendered as the forecast.

`developmentWeather` accepts a simple forecast-accuracy configuration for future staff-related tuning. Changing forecast accuracy does not alter actual weather. The forecast is generated once and frozen because it informs AI decisions. Forecast UI gets detached window copies; mutating a returned forecast does not alter truth or the saved profile. No staff/weather department system was added.

The development UI shows current rain, water, air/track temperatures, DRS state and remaining approximate forecast windows. All labels, compound names and notices have English and Traditional Chinese resources; values use Intl. Internal identifiers remain untranslated.

## DRS wet rules

At water **≥300**, v6 disables DRS. It stays disabled until water **≤180**, when ordinary activation-lap, gap and zone rules apply again. This hysteresis is persisted and deterministic. A disabled eligible follower receives no DRS benefit. This is a simplified automatic wet rule, not a general Race Control system.

## AI weather strategy

A separate policy receives an input without the weather timeline and a public weather configuration without truth segments or initial truth. It sees current track water/temperatures, current tyre, pace mode, the same forecast windows, normal pit loss and laps remaining. It predicts at most ten post-stop laps using forecast midpoint estimates and the same water/thermal/wear/pace mechanics. It compares staying out with fresh tyres, and stops only when expected saving exceeds nominal pit loss plus a 1500 ms margin. Minimum stint length is three laps; no final-lap stops.

Forecast predictions are intentionally approximate. There is no traffic forecast or advanced strategist, and the policy may pit early or late. Both AI and player use identical tyre curves, wear, temperatures, resources and service costs. Player requests always retain their chosen compound through weather changes; no forced stops or automatic player compound substitutions exist.

Controlled seed-42 outcomes (58 laps):

| Scenario | Observed AI strategy |
| --- | --- |
| Brief two-lap shower at intensity 300 | No Intermediate/Wet stop; pit loss outweighs expected gain |
| Sustained intensity 450 | Medium → Intermediate after lap 5; eventually Wet after lap 21 as water continues accumulating |
| Sustained intensity 1000 | Medium → Wet after lap 4; later normal wear replacement |
| Initially water 1000, no rain | Wet → Intermediate after lap 4 → Soft after lap 10 |
| Mixed development scenario | Medium → Intermediate after 12 → Wet after 21 → Intermediate after 35 → Soft after 42 |

These laps are measured outcomes, not scripted policy triggers. Tests check strategy categories rather than requiring exact stop laps.

## Measured drying and rain onset

Seed 42 mixed scenario: rain begins lap 9; water is 36 after that first rainy lap, 74 at lap 10 and 275 at lap 15. DRS disables at lap 16 (water 316). Heavy rain begins lap 19; water reaches 1000 by lap 25. Rain eases at 28, stops at 32 with water still 892, then falls to 697 at 35 and 352 at 40. DRS returns at 43 (water 141), and the track reaches zero water at 45: fourteen no-rain laps including lap 32.

A separate fully wet, no-rain run takes fifteen laps to dry: water 930 after lap 1, 722 after lap 4, 653 after lap 5, 312 after lap 10, 176 after lap 12, 40 after lap 14 and zero after lap 15. Suitability passes from Wet through Intermediate to dry as those curves intersect. No instantaneous dry reset occurs.

## Processing order and persistence

1. Load saved player commands, weather truth/profile and resources; select ordinary AI commands.
2. Decide AI pit choices using the previous completed-lap observation and public forecast. Pending player requests keep priority.
3. Integrate this lap's rainfall, track temperature and water from the frozen truth timeline; update hysteretic DRS state.
4. Calculate each entrant's potential pace with prior tyre condition, newly integrated water suitability, existing command/fuel/ERS effects and unchanged consistency RNG draws. Compute post-lap wear/temperature using current water and pace.
5. Resolve existing traffic/overtaking with DRS zones temporarily unavailable when wet-disabled. The frozen interaction profile itself is not mutated.
6. Complete normal pit stops after the lap, using existing service RNG ordering and histories; tyre replacement does not refill fuel or ERS.
7. Classify and persist weather, entrants, histories, RNG and lifecycle in one transaction.

The ninth additive migration creates the owned `CareerRaceWeather` row with frozen structured profile and explicit bounded current-state columns. Composite Career/race foreign keys protect ownership. The shared tyre enum adds Intermediate and Wet, while version-aware SQL triggers prohibit them in legacy entrant, profile, stint and stop rows. The triggers resolve the owning schema explicitly, so isolated integration schemas work correctly.

Actual PostgreSQL tests initially caught the shared-enum legacy write gap; it was corrected in the new migration rather than weakening old tests or changing the previous eight migrations. Rollback tests verify that invalid weather cannot leave a partially advanced race. SQL checkpoint/reload comparisons cover timeline, forecasts, wet compounds, AI histories, DRS, fuel/ERS, RNG and final race result.

## Verification

- **357 offline tests passed**, 14 files, including all previous 322.
- **162 actual PostgreSQL integration tests passed**, 9 files, including all previous 146.
- Prisma format/validate/generate, typecheck, lint and production build passed.
- PostgreSQL **18.6 Homebrew**, local port 5432. Disposable databases: `formula_weather_verify_20260923` for unique-schema suites and `formula_weather_browser_20260923` for the production-browser flow. No production database was used.
- All nine checked-in migrations applied to the browser database; seed executed twice successfully. Integration suites separately applied the complete migration chain and cleaned their unique schemas.
- All 38 prior migration/test/fixture/helper files from the Phase 9 ZIP were compared byte-for-byte and unchanged.
- 20 AI cars ×75 laps: warmed 50-run mean **14.859 ms** in this environment; sanity test threshold 2 seconds. This is an observed timing, not a hardware guarantee.
- The inherited Prisma/pg relation-read deprecation warning remains; no dependency changes or test failures remain.

## Actual browser verification

Production Next.js, real temporary PostgreSQL, **seed 963039953**, 58 laps:

1. Started v6 on Mediums with zero rain/water; inspected approximate forecast and five available compounds.
2. At lap 10 rain was 45.2% but water only 7.1%; DRS remained enabled.
3. Requested Alex's Intermediate stop after lap 11 while Mika stayed on Medium. At lap 15 water was 26.5%; Alex's last lap was 1:30.608 versus Mika's 1:31.248. Both AI cars had independently fitted Intermediates. These are different development drivers, so this is UI evidence, not a controlled tuning comparison.
4. At lap 20 heavy rain and 70.5% water disabled DRS. Alex fitted Wet after lap 21; AI had done so after lap 20.
5. At lap 25 water was 100%. Alex's Wet last lap was 1:30.801 versus Mika's Medium 1:56.994. Luca was still constrained behind Mika by existing traffic, demonstrating that a suitable tyre does not bypass passing rules.
6. Refreshed, switched English → Traditional Chinese, refreshed to verify locale persistence, then returned to English. The entire saved state was byte-identical before/after, including weather, forecasts, resources, AI decisions, histories and RNG. Reopening the browser also retained the checkpoint.
7. Rain eased to 20% at lap 30 while water remained 96.6%. At lap 35 rain was zero but water 69.7%; requested Intermediate for Alex after lap 36. AI had already chosen Intermediate after 35.
8. At lap 40 water was 35.2%; requested Medium for Alex after 41. AI switched to Soft after 42. By lap 45 water was zero and DRS was re-enabled.
9. Finished, refreshed and verified final state. Ren: **1:27:55.566**; Alex: **1:28:51.697**; Luca: **1:29:40.932**; Mika (deliberately no stops): **1:35:00.322**. Alex and both AI cars had four stops/five stints. Final water was zero, DRS enabled, track temperature 33.996°C.
10. The complete persisted finish was deeply equal to pure-engine continuation from the saved lap-45 checkpoint.

## Changed areas and limitations

New weather mechanics/policy, weather panel, measurement helper, offline/SQL tests and captured v5 fixture. Updated engine/types, version-gated tyre profiles and pit handling, race service/actions, repository mapping, wet-aware tyre-cliff estimate, translations, additive Prisma migration/schema and documentation. Existing repository and simulation boundaries remain.

This remains a whole-lap development model with uniform track water and a small seeded scenario family. Forecasts are approximate, not probabilistic meteorology; AI lacks traffic/sector prediction. All five compounds use the same pit architecture. Dry-running wet tyres can be retained deliberately, with pace/temperature/wear costs.

No crashes, spins, lock-ups, driver errors, failures, punctures, Safety Car, VSC, red flags, suspension, penalties, blue flags, final Race Control, team orders, points, Practice/Qualifying engines, final UI, 2D viewer or multiplayer were implemented.

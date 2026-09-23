# Phase 11 — Incidents, reliability, VSC and Safety Car

Completed 24 September 2026. These are provisional game probabilities and lap-based approximations, not real Formula 1 rates or regulations.

## Result and compatibility

New browser races use **simulationVersion 7**. They add bounded driver incidents, race-level reliability, retirement, persistent structured events, VSC, Safety Car and a restart DRS delay. English and Traditional Chinese presentation uses centralized keys; the simulation never receives a locale.

The v7 lap path is separate from v1–v6. Existing saves do not acquire incidents or reliability inputs. A complete v6 fixture was captured before changing the engine. Earlier offline and SQL suites remain passing; the previous nine migrations and all previous test files are unchanged from the Phase 10 export.

## Incident model and reliability

A driver's per-lap risk combines a small baseline, control deficit, squared tyre wear, numeric water/compound unsuitability, and a mild close-battle contribution. Saved pace multiplies risk: Conserve 0.60, Light 0.80, Standard 1.00, Push 1.25, Attack 1.60. The default cap is 80,000 parts per million; ordinary healthy inputs produce much smaller values. Wet tyres reduce unsuitable-wet risk but never guarantee safety.

Driver Mistake, Lock-up, Spin and Contact have bounded numeric loss ranges. Moderate losses use 1.5 times the category range. Major outcomes can retire the initiating car; major contact can retire its nearby opponent too. Contact requires an eligible close opponent. Participants already affected during the same checkpoint cannot receive another incident that lap. Incident position losses do not increment overtake counters.

Each entrant snapshots reliability, power-unit condition, gearbox condition and driver control on a 0–100 scale. Mechanical risk uses the mean condition deficit plus race distance. A non-retiring mechanical problem adds a persistent 800 ms/lap penalty, accumulating to a 10,000 ms bound. A severe failure retires the car. Tyre stops do not repair mechanical penalties. These are temporary race inputs, with no season component inventory or wear system.

## Retirement and classification

Incidents resolve at the end of a completed lap. A newly retired entrant retains that lap's fuel, ERS, tyre and timing state, closes its open stint and clears a pending pit request. Subsequent advances exclude it from pace, traffic, pits, resources and AI decisions. Both server command validation and UI controls reject retired-player commands/pits.

Running cars and finishers rank ahead of retired cars. Retirements rank by completed laps descending, then retirement-event sequence ascending; same-lap events use original-grid evaluation order. Their gaps are unavailable. If every entrant retires, the race clock still advances to the scheduled final checkpoint while entrant state remains frozen; this preserves the existing weekend-completion contract. No unlapping or wave-by rules are modeled.

## VSC, Safety Car and restart

An incident can request GREEN, VSC or SAFETY_CAR. SC takes priority over VSC in the same checkpoint. Deployment occurs at the end of the incident lap, so neutralisation applies to subsequent laps. Default durations are VSC 1–3 laps and SC 2–5 laps. During an active neutralisation all further incident outcomes are suppressed, while the incident RNG still consumes its fixed schedule. There are no recursive deployments.

VSC uses a common 1.35 × circuit-reference lap and preserves physical gaps except pit crossings. SC uses 1.65 × reference pace. Each adjacent interval above 1,000 ms shrinks by 40% of the excess, capped at 5,000 ms per lap; order remains intact. A 10,000 ms interval becomes 6,400 ms, then 4,240 ms. Compression is bounded so a lap remains positive. Neither neutralisation invokes normal overtaking or DRS.

Normal racing returns when remaining duration reaches zero. SC sets a two-green-lap DRS delay: both following green laps prohibit DRS, with eligibility returning on the third if weather and ordinary traffic conditions permit. Wet DRS blocking remains independent and can last longer.

Player pace/fuel/ERS selections are preserved. The neutral pace ceiling overrides Attack gains and suppresses ERS deployment; recovery continues. Fuel and wear multipliers reduce consumption. Thermal targets move toward track temperature with lower energy input, using the existing tyre response. AI selects Conserve/Conserve/Harvest during neutralisation, sees the effective pit-route cost, uses the existing weather-aware pit policy, and resumes ordinary command policy after restart. A controlled 770-permille worn-tyre case stays out under green but pits under SC using the same service mechanics.

## Pit strategy and resource measurements

The relative route loss is:

`green pit-lane loss − green time through bypassed track section × (neutral pace multiplier − 1)`

The default bypassed section takes 12,000 ms under green. The pit-route traversal and stationary service remain unchanged; the field takes longer to traverse that same circuit section. A 1,000 ms floor bounds extreme custom profiles. There is no strategy bonus. Cars leaving the pit route merge by crossing time and may lose positions. The UI estimate uses the same effective loss.

Controlled one-lap comparison, 90-second circuit reference, identical player commands and starting state:

| Measurement | Green | VSC | SC |
|---|---:|---:|---:|
| Lap time | 95,350 ms | 121,500 ms | 148,500 ms |
| Fuel burned | 1.600 kg | 1.200 kg | 0.800 kg |
| Wear added | 22‰ | 13‰ | 8‰ |
| End temperature | 84.719°C | 73.544°C | 69.819°C |
| ERS charge, starting at 700 | 700 | 760 | 760 |
| Relative pit-route loss, excluding service | 19,500 ms | 15,300 ms | 11,700 ms |
| Total stop range, including unchanged service | 21,750–22,250 ms | 17,550–18,050 ms | 13,950–14,450 ms |

A separate five-lap SC thermal case cooled from 90°C to 50.735°C and recovered to 87.201°C after five green laps. Cold-tyre penalties affect restart pace. In a close dry two-car case, DRS stayed off during SC and the first two green laps, then actually returned on green lap three. A corresponding wet checkpoint kept DRS off.

## Controlled balance measurements

Each case runs **500 complete seeded races × 58 laps = 29,000 car-laps**, with one car and equal starting inputs except the named variable. Major retirements and neutralisations are disabled to retain equal exposure. Driver-risk cases disable mechanical failures; reliability cases disable driver errors. Player cars do not pit in these comparisons. Pace therefore affects accumulated tyre wear as well as its direct risk multiplier. Wet cases start at water 800 with sustained heavy rain, so water can rise further.

| Case | Incidents | Per 1,000 car-laps |
|---|---:|---:|
| High control, 100 | 29 | 1.000 |
| Baseline control, 85 / Standard | 37 | 1.276 |
| Low control, 20 | 81 | 2.793 |
| Conserve | 17 | 0.586 |
| Attack | 83 | 2.862 |
| Dry tyre in unsuitable wet conditions | 138 | 4.759 |
| Wet tyre in wet conditions | 49 | 1.690 |
| Healthy components, 100 | 9 mechanical issues | 0.310 |
| Degraded components, 30 | 62 mechanical issues | 2.138 |

Reproduce with `incidentMeasurements()` in `tests/helpers/incident-measurements.ts`; the many-seed regression test asserts the risk ordering.

## RNG and deterministic replay

The incident stream starts at `(raceSeed ^ 0x5a17c9e3) >>> 0`. **Exactly six draws per original grid slot per world lap**, including retired slots and SC/VSC laps, are consumed in this order:

1. Driver-error occurrence.
2. Category and bounded time-loss interpolation.
3. Severity, or mechanical-retirement choice.
4. Mechanical occurrence, used only when no driver error occurs.
5. Contact second-retirement and neutralisation threshold decision.
6. Duration selection within the selected control profile's inclusive range.

No additional incident draws occur. The existing stream continues to handle consistency, traffic and service. Changing incident tuning does not change that base stream before outcomes alter participation, traffic or pit decisions. Once an incident changes those interactions, later base-stream draw counts may legitimately diverge. Checkpoints store both streams, not just the seed.

## PostgreSQL and event storage

The additive tenth migration, `20260923000600_race_incidents_reliability_control`, adds a race-owned `CareerRaceIncidents` record. It stores frozen configuration and reliability maps, entrant incident status/penalty/retirement maps, ordered structured events, and scalar RNG/control/start/duration/DRS-delay values. JSON avoids a separate generalized event-sourcing system. Event values contain IDs, category/severity codes, lap and loss; no translated sentences are persisted.

Composite ownership links the extension to its Career and Race. SQL checks bound control values and validate entrant status/penalty, and a trigger rejects participants from another race. Runtime validation additionally checks reliability/configuration, exact entrant membership, event sequence and participant IDs, retirement metadata, and state consistency. The migration extends the existing wet-compound guard to permit v7 while continuing to reject wet compounds in v1–v5.

The existing Career transaction lock commits race state, extension, entrants, pits/stints and progression together. Invalid updates roll back; stale concurrent advances cannot consume the stream twice. Real PostgreSQL tests verify VSC and SC reload through restart and finish, event/penalty persistence, retirement, command rejection, pit history, ownership and rollback. Earlier suites continue to cover v1–v6.

## Verification results

- **388 offline tests passed, 16 files** — includes all 357 earlier tests plus 31 new checks/cases.
- **178 actual PostgreSQL integration tests passed, 10 files** — all 162 earlier SQL tests plus 16 v7 cases. No missing-URL guard was counted as success.
- PostgreSQL **18.6**, existing local Homebrew service on localhost:5432, disposable databases `formula_incidents_verify_20260923` and `formula_incidents_browser_20260923`. Test suites applied all ten checked-in migrations into unique temporary schemas and cleaned up those schemas. Existing idempotent seed verification remained passing.
- `npx prisma format`, `npx prisma validate`, `npx prisma generate`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, and `npm run build` passed.
- A warmed **20-car × 75-lap** deterministic engine run took **4.63 ms** on this local machine; this is a sanity measurement, not a cross-machine benchmark. The automated test runs it twice, checks exact equality and enforces a generous 3-second budget.
- The pg adapter emits the existing `client.query` concurrency deprecation warning; there were no failed SQL assertions.

## Browser verification against real PostgreSQL

Tested the production Next.js build in the in-app browser. A normal Career Start Race created v7 with untouched default tuning. A separate disposable test Career used exaggerated incident probabilities and a deterministic incident checkpoint stream; the saved weather timeline remained the normal mixed-weather development timeline. The test setup was outside the normal application, with no player-facing cause-incident control.

Observed:

- Green running and minor errors on lap 1; VSC deployed at lap 12 and ended at lap 15.
- Alex's requested VSC Hard stop completed at lap 13: **15,300 ms route + 2,501 ms service = 17,801 ms**.
- Luca retired on lap 16 and SC deployed for four laps. SC reduced consecutive gaps **17.802 → 12.802 seconds** and **17.976 → 12.976 seconds** without overtakes.
- At lap 17 Mika's tyres cooled **73.238 → 62.239°C**, fuel fell by **0.780 kg**, and Alex's ERS reached 94%.
- Alex's requested SC Medium stop completed at lap 18: **11,700 + 2,532 = 14,232 ms**, with ERS at 100%.
- Refreshed during SC at lap 18; switched English → Traditional Chinese; refreshed to verify locale persistence; switched back. A full repository-state comparison before/after was exactly equal, including input, events, both RNG streams, order, resources, tyres and pits.
- SC ended at lap 20. Restart delay showed two then one green laps; after expiry, heavy rain continued blocking DRS. Dry third-green-lap DRS return was verified separately offline.
- Advancing the refreshed checkpoint to lap 23 exactly matched uninterrupted simulation. Retired cars kept their lap/resource state.
- Mika retired at lap 30; her pit and pace command buttons were absent.
- Finished at lap 58, refreshed, and verified **31 persisted events**, two finishers followed by retirements at laps 30 and 16. Full final state equaled uninterrupted continuation from the lap-18 checkpoint.

## Changes and deferred scope

Changed the race types/dispatcher, pit and command restrictions, Career start service/actions, race repository and additive Prisma model/migration; added isolated incident/control mechanics, localized event/control UI and resource-aware pit estimates. Added offline/SQL tests, measurements, the captured v6 fixture, and documentation. No existing content identities, dataset model, repository boundary or simulation/i18n boundary was redesigned.

No injury/graphic crash depiction, red flags, suspension, restart grid, unlapping, blue flags, punctures, component inventory/allocation, steward/grid penalties, team orders, championship points, Practice/Qualifying engine, final race UI, 2D viewer or multiplayer was added. All active entrants still advance together at lap checkpoints. Driver incidents use prior-checkpoint battle context rather than continuous collision geometry. SC tyre warming and restart procedure are intentionally coarse.

**Phase 11 verification passed.** Both disposable verification databases and the temporary Next.js server were removed/stopped after verification; the existing PostgreSQL service was left intact. The full source archive includes all prior phases and this phase; dependencies, build outputs, generated client, credentials and temporary browser fixtures are excluded.

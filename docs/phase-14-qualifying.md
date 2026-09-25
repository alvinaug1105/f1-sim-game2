# Phase 14 — Qualifying (Builder notes)

Starting main: `f07520e` (Content Expansion Pass A merged). Race simulation stays at v7 and its equations are unchanged.

## Format (data-driven, `qualifyingFormat(n)`)
| Field | Q1 | Q2 | Q3 |
|---|---|---|---|
| 22 cars | 22 → 16 (6 out), 18 min | 16 → 10 (6 out), 15 min | 10, 13 min |
| 20 cars | 20 → 15 | 15 → 10 | 10 |
| ≤10 cars (legacy) | all | all | all; Q3 decides the order |

There is a 7-minute break after Q1 and after Q2. Q1, Q2 and Q3 are internal phases of the single Career QUALIFYING session.

## Engine (`src/simulation/qualifying/`)
- **Stepping:** one central deterministic step of 20 s. All randomness comes from the persisted seeded RNG (no `Math.random`). Distance is quantised to micro-laps, so a reloaded state replays exactly.
- **Clock:** a timed lap that *starts* before the flag may finish and counts. An out lap completing after the flag cannot start a timed lap, and no run may start after expiry. The phase freezes once no timed lap is running; cars still on out or in laps return to the garage.
- **Classification:** each phase is ordered by its own best lap, with a tie going to the lap set earlier.
  - Q1 no-time: latest completed Practice classification, then entry order.
  - Q2 or Q3 no-time: the previous phase's order.
  - Final grid: P1–P10 from Q3, P11–P16 from Q2 eliminations, P17–P22 from Q1 eliminations.
- **Lap model:** the Qualifying layer has its own weights. Car performance is worth 5000 ms and driver pace 2500 ms per 100 rating points. The model combines:
  - tyre compound, wear and temperature, plus track water (the shared tyre and weather model);
  - setup distance to the hidden target, at half its Practice cost;
  - acclimatisation (up to 300 ms), confidence (up to 150 ms) and tyre knowledge (up to 200 ms);
  - fuel: +60 ms per further planned push lap;
  - track evolution: up to −800 ms;
  - driver variation: amplitude from consistency and confidence;
  - occasional mistakes: 2–7% of laps, 0.6–1.5 s;
  - traffic.
- **Traffic:** judged when a timed lap starts, from where the other cars are at that moment.
  - A car on an out or in lap within 15% of a lap ahead will be caught: usually a small cost, sometimes 0.25–0.9 s.
  - A car just ahead on its own timed lap gives dirty air.
  - The total cost per lap is capped at 2.5 s.
- **Track evolution:** starts at 300. It rises with every lap with diminishing returns, and falls by 8% per weather tick while the track is wet.
- **Weather:** the existing scenario weather, frozen at session start. It advances on the continuous session clock, including breaks.

## Auto manager (AI and player auto-management)
The same policy runs AI teams and the player's cars under Simulate Qualifying / Simulate Remainder.
- **First run:** a banker lap at a staggered, per-car release time.
- **Q1/Q2:** a comfortably safe car stays in the garage.
- **Final run:** in a staggered window before the flag, briefly delayed if the track is busy.
- **Q3:** two attempts.
- **Tyres:** chosen from the current water band only.
- **Inputs:** it never reads the weather timeline, the setup target or the RNG, and plans with the public planning lap.
- **Release rate:** at most about 4–6 cars leave in any one 20 s step.

## Persistence
One additive migration, `20260927000100_qualifying`, adds `CareerQualifyingSimulation` and `CareerQualifyingEntrant`, with range CHECKs.
- Format, tyres, weather and preparation are stored as frozen JSON inputs.
- Every mutation runs under the Career row lock.
- Stale requests are rejected using `sessionElapsedMs` and the per-car command revision.
- Starting is idempotent.
- Completion transitions the weekend session once, in the same transaction.

## Race grid
The Race repository supplies the finished Qualifying classification. `developmentRaceInput` sets `gridPosition` from it; performance still comes from each driver's roster index, so legacy profiles are unchanged. Once a Race has started, its grid is frozen in the Race snapshot. Without a real result (legacy placeholder), the Race uses the legacy roster-order grid.

## Legacy
- **AVAILABLE with no simulation:** runs real Qualifying normally.
- **IN_PROGRESS with no simulation** (the old placeholder): opening it bootstraps a deterministic session from the start of Q1. This is idempotent and concurrency-safe, and never auto-completes.
- **COMPLETED with no simulation:** history is untouched and no results are shown; the Race uses the legacy grid.
- **4-car Careers:** every car runs all three phases.

## Deferred
Not implemented: 107% rule, grid penalties, technical DSQ, track limits, impeding, pit-lane starts, FIA tyre allocation, Sprint, and any Race rebalance.

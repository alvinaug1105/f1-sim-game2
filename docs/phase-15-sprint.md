# Phase 15 — Sprint Weekend (Builder notes)

Starting main: `5e05995` (includes Phase 14 `73533b9`, Race Dynamics `147dec3` and the stop-bias repair `f7d3397`). Race simulation stays at **v7**. Qualifying (Phase 14) and Race Dynamics behaviour are unchanged for the Grand Prix.

## Weekend format
- **Data:**
  - `WeekendFormat = STANDARD | SPRINT` is set on source `CalendarEvent.weekendFormat` (nullable).
  - It is snapshotted into `CareerCalendarEvent.weekendFormat` at Career creation.
  - Runtime reads only the Career copy, via `weekendFormatOf(event)`. It is never derived from a circuit or event name.
- **Current 8-round development calendar:**
  - SPRINT: China, Great Britain, Singapore.
  - STANDARD: Australia, Japan, Bahrain, Monaco, Belgium.
- **Legacy:** Careers created before Phase 15 have `NULL`, which means STANDARD. Existing rows are never rewritten. An already-active weekend keeps its sessions, because sessions are only created when an event is entered.

## Session lifecycle
- **STANDARD:** P1 → P2 → P3 → QUALIFYING → RACE. Unchanged.
- **SPRINT:** P1 → SPRINT_QUALIFYING → SPRINT → QUALIFYING → RACE. `CareerSessionType` gains `SPRINT_QUALIFYING` and `SPRINT`.
- **Unlocking:** each completion unlocks exactly one next session. Only Practice can ever be skipped (existing SQL check).
- **Practice:** a Sprint weekend has only P1. It uses the Phase-13 engine unchanged, and "Simulate all remaining Practice" completes P1 and stops.

## Sprint Qualifying — the shared Qualifying core, configured
- **Configuration:** `qualifyingFormat(n, "SPRINT_QUALIFYING")`.
  - Phase lengths are 12 / 10 / 8 min (SQ1 / SQ2 / SQ3) with the same 7-minute breaks.
  - Field sizes follow the same policy: 22 → 16 → 10, 20 → 15 → 10, ≤10 all cars.
  - The internal phases stay `Q1/Q2/Q3` and are only displayed as SQ1–SQ3.
- **Reused as-is:** the engine, clock-edge rules, evolution, traffic, weather, AI policy, classification, persistence and UI.
- **AI release timing:** release times tuned for the Grand Prix phase lengths are compressed proportionally for shorter phases. For Grand Prix lengths the ratio is exactly 1, so Grand Prix Qualifying is bit-identical.
- **Identity:** Sprint Qualifying has its own seed and weather identity (`sprint-qualifying` / `SPRINT_QUALIFYING`). Grand Prix Qualifying keeps its Phase-14 labels.
- **Persistence:** the same `CareerQualifyingSimulation` / `CareerQualifyingEntrant` tables, disambiguated by `sessionType`. The repository is constructed per kind and looks up the exact session of that type.

## Sprint grid and distance
- **Grid:** the Sprint grid is the finished Sprint Qualifying classification. It is read only while no Sprint simulation exists, then frozen into the Sprint snapshot. The Grand Prix grid is read from Grand Prix Qualifying only, so there is no cross-contamination either way.
- **Distance:** `sprintLapCount(lengthMeters) = floor(100 000 / length) + 1` laps, from the Career-snapshotted circuit length. It is persisted as the Sprint's `totalLaps`, and invalid lengths throw. Current values:

| Circuit | Length | Sprint laps | Distance |
|---|---|---|---|
| Albert Park | 5 200 m | 20 | 104.0 km |
| Suzuka | 4 800 m | 21 | 100.8 km |
| Shanghai | 5 451 m | 19 | 103.6 km |
| Bahrain | 5 412 m | 19 | 102.8 km |
| Monaco | 3 337 m | 30 | 100.1 km |
| Silverstone | 5 891 m | 17 | 100.1 km |
| Spa | 7 004 m | 15 | 105.1 km |
| Marina Bay | 4 940 m | 21 | 103.7 km |

## Sprint simulation — Race v7 reused
- **Engine and persistence:** the same `startCareerRace` / v7 engine, and the same Race tables disambiguated by `sessionType` (`RACE` | `SPRINT`). The repository is constructed per kind.
- **Inputs:** fuel is derived from the Sprint distance. Tyre physics, AI pit strategy (including the stop-bias repair), weather, incidents, SC/VSC, circuit profiles and the A1 fix are the same code.
- **Weather:** the Sprint has its own identity seed. The Grand Prix seed is unchanged.
- **Stops:** there is no forced or forbidden stop. In dry conditions most cars naturally stay out, while crossovers still bring cars in.
- **Manage Sprint:** the full Race controls, with a SPRINT badge in the header and clock.
- **Simulate Sprint:** a clean start with both player cars as `DEVELOPMENT_AI`, which means the same fair commands, pit strategy and starting-tyre rules as AI teams. It then runs to the flag.
- **Simulate Remainder:** from the exact persisted checkpoint, both player cars become auto-managed and pending pit requests are kept. The controller change is persisted and the session completes.
- **Retirement:** a Sprint retirement ends only that Sprint. Grand Prix Qualifying and the Race build entrants from the Career roster.
- **Result:** position, time/laps, status, pits/stints, incidents, weather and the frozen grid are persisted in the Race tables. The Sprint Result screen continues to Qualifying. No points or standings are calculated (Phase 16).

## Preparation / setup (deliberate simplification)
- P1 preparation (setup, confidence, acclimatisation, tyre knowledge) carries into Sprint Qualifying, the Sprint, Qualifying and the Race under the Phase-14 rules. There is no extra bonus.
- The final P1 setup is used all weekend. A parc-fermé or between-session setup system is deferred.

## Migration `20260929000100_sprint_weekend` (additive)
- **New type and columns:**
  - `WeekendFormat` enum;
  - nullable `weekendFormat` on `CalendarEvent` and `CareerCalendarEvent`;
  - `CareerSessionType` + `SPRINT_QUALIFYING`, `SPRINT`.
- **Widened checks:**
  - the Qualifying simulation check now allows `QUALIFYING` / `SPRINT_QUALIFYING`;
  - the Race session-type check now allows `RACE` / `SPRINT`.
  - They compare `::text`, because new enum values cannot be used as literals in the transaction that adds them.
- **Forward test:** a real pre-Phase-15 schema holding an old Career (active weekend, completed Qualifying, Race under way) keeps identical row hashes. The Career continues exactly, and its next weekend is STANDARD.

## Deferred
Championship points (Phase 16), 107%, grid penalties, parc-fermé detail, tyre allocation, persistent damage/repair, steward decisions and pit-lane starts.

# Phase 13 — Practice Sessions (Builder notes)

Starting main: `13889e9`. Race simulation stays at v7; Practice is a separate deterministic engine (`practiceVersion` 1).

## Architecture
- **Simulation** (`src/simulation/practice/`): pure engine. Each 30 s step runs, in this order: auto-garage decisions, then every car on track driving its window, then weather ticks (every 90 s, reusing the Race weather model) and track evolution. All randomness comes from the persisted seeded RNG. Nothing reads wall clock, locale or React.
- **Auto manager** (`policy.ts`): one policy for AI teams and for the player's cars under Simulate Session / Remainder / All. It sees only current conditions, its own driver feedback and the clock. It never reads the hidden ideal setup, the weather timeline or future RNG draws.
- **Setup model**: five dimensions (downforce, mechanical balance, ride height, brake bias, tyre pressures), each 0–100.
  - Each driver has a hidden weekend ideal, seeded from stable identity and stored server-side in `CareerWeekendPreparation`.
  - Wet track water shifts the effective ideal.
  - Feedback is qualitative (−2…+2). Its noise shrinks with timed laps and acclimatisation.
  - Setup confidence rises with running and drops when the setup changes. It never depends on the distance to the ideal.
- **Weekend learning**: setup, feedback, confidence, acclimatisation and tyre knowledge are kept per driver in `CareerWeekendPreparation`, so they carry from P1 to P2 to P3.
- **Persistence**: additive migration `20260925000100_practice_sessions` adds the Practice simulation, entrant, run and weekend-preparation tables, with CHECK range constraints. Every change runs under the Career row lock. Stale requests are rejected by `expectedElapsedMs` and the per-car command revision. Session completion goes through the weekend lifecycle exactly once, in the same transaction.
- **Information boundary**: `practiceView()` is the only payload that reaches the browser. It has:
  - no ideal, timeline, RNG, seed or input;
  - no rival preparation or run plans;
  - a forecast of approximate public windows only.

  Own-car detail (setup, feedback, knowledge, runs) is included only for the Career team's cars.
- **Playback**: the shared `PlaybackController` is now generic through `PlaybackAdapter`. The Race behaviour is unchanged.
  - The Practice adapter commits one step per checkpoint.
  - Next Relevant Event stops when a player car returns to the garage, the track-water band changes, or 5 minutes remain. Otherwise it stops after 40 steps.
  - Simulate Remainder is a command on the same queue.

## UI
- `/career/[careerId]/events/[eventId]/practice/[sessionId]`: session tabs, a sticky bar (clock, conditions, forecast, playback, Simulate Remainder with inline confirmation), the timing table, the real circuit map, the driver panel and the end-of-session summary with Continue.
- Map: `TrackMap` accepts a structural `MapRow`. Garage cars are hidden, unfocusable and never labelled.
- Driver panel for player cars: run plan (compound with current-condition suitability, target laps checked against the clock, pace), Call in, garage-only setup sliders (native range inputs), feedback chips (glyph plus text), and knowledge meters (percentage in text).
- Weekend page, per Practice session:
  - Available: Open, Simulate session, Skip.
  - In progress: Resume, Simulate remainder (confirm).
  - Completed: View summary.
  - For the whole weekend: Simulate all remaining Practice (confirm), and a "Qualifying is next" placeholder notice.
- Browser scaffolding can no longer fake-run Practice. Only `skipPractice` is accepted.

## Tests added
- `tests/practice.test.ts`: engine, service lifecycle, information boundary and playback.
- `tests/practice-ui.test.tsx`: render checks.
- `tests/practice.integration.test.ts`: database persistence, concurrency, completion and carry-over.

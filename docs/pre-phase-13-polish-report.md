# Pre-Phase-13 — Race UX & Gameplay Polish (Builder notes)

Builder notes only; formal verification belongs to independent QA.
- **Simulation:** Race simulation stays v7, with no engine changes.
- **Database:** no schema change and no migration.
- **Weather:** the only authoritative change is how Career Races generate their weather input when they start.
- **Map tags and team colours:** delivered in commit `3fdffc7` (live-timing tags, red `#E10600`, turquoise `#00D2BE`).

## Weather variety (`features/race/weather-scenarios.ts`)

- **Seed:** `raceWeatherSeed([careerId, eventId, circuitId])` hashes stable identity (FNV-1a). No `Math.random`, clock, locale or React state is involved.
- **Scenario:** `scenarioFor(seed)` picks a weather story. The weights make it clear that not every race rains:

  | Scenario | Weight |
  | --- | --- |
  | DRY | 32 |
  | MOSTLY_DRY | 18 |
  | LIGHT_INTERMITTENT | 14 |
  | MIXED | 14 |
  | LATE_SHOWER | 12 |
  | WET | 10 |

- **Configuration:** `scenarioWeather` builds a normal v1 `WeatherConfiguration`: timeline, approximate forecast, and initial state (a WET race starts wet). MIXED reuses the established development story.
- **Freezing:** Career Race start (`startCareerRace` with no explicit seed) freezes this configuration into the Race input. Races already started keep their persisted configuration.
- **Explicit seed:** tests and tooling that pass an explicit seed keep the legacy `developmentWeather(seed)`, so fixtures stay reproducible.
- **Pre-Race screen:** it computes the same configuration and shows only public parts: grid conditions and the approximate forecast windows.

## Starting tyres

- **Ownership:** on the v7 Career start path, a tyre choice for a rival driver is rejected (`INVALID_ACTION`). `RaceError` codes are no longer re-wrapped as `INVALID_INPUT`.
- **AI tyres:** AI teams pick from current grid conditions only (`aiStartingCompound`).
- **Screen layout:** the pre-Race screen lists your drivers (editable) separately from rivals (read-only), with race laps, current conditions and the forecast.

## Race viewer

- **Timing tower:**
  - The whole row selects the entrant. The driver button is the single keyboard control per row (no nested interactive elements), and the row shows a focus-within outline.
  - Rows are compact, and a Last Lap column (with a PB marker) appears at 1600 px and wider.
  - Player rows carry compact flags.
- **Two-driver awareness:** `driverFlags` produces BOX, PIT, CHECK (attention), WEAR/CLIFF, FUEL, BTL, OUT and FIN. It reuses tyre condition, battle context, the Phase 12C attention item and the fuel projection. The flags appear on both player tabs and on the player rows in the tower.
- **Command safety:** `commandInfo(intent)` takes the driver from the command itself. The controller stores it as `confirmation`, which the bar shows as e.g. "HAM — Pit requested: Soft · Playback stays paused — press Resume."
- **Timing feedback:**
  - Last and best lap appear in the driver panel, including the neighbours' last laps, and in the comparison table.
  - A tyre suitability hint uses the current track-water band only.
  - An ERS outlook for the current mode shows "about N laps", "holds steady" or "recharging".
- **Layout:** a sticky Race bar holds the lap, flag, conditions, playback and a fixed-height status line (alerts plus attention/confirmation, so nothing shifts the layout). From 1221 px, the tower and driver panel are sticky below the bar with internal scrolling, so the commands stay reachable. The playback bar is no longer fixed to the bottom of the screen.

## Phase 12C preservation

- **Scheduler and serialization:** the scheduler, command serialization and explicit Resume are unchanged. The only controller addition is the presentation-only `confirmation` field, which a new Resume clears.
- **Strategic attention:** its detection and deduplication are unchanged.

# Post-Phase-16 — Race Information Boundary Hardening (Builder notes)

Starting main: `f96604f` (Phase 16 Championship / Results, including `ee0724e` and `38d2a60`). Race simulation stays at **v7**. The engine, Sprint, tyres, fuel, ERS, overtaking, DRS, pit strategy, AI, weather, incidents, reliability and SC/VSC are unchanged: `src/simulation`, `src/data` and `prisma` have no diff.

## Previous exposure
The Race and Sprint pages, and every live-viewer server action (`viewerAction`, `sprintRemainderAction`), handed the full authoritative `CareerRaceData` to client components. The browser therefore received:

| Exposed data | Where it lived |
|---|---|
| Seed and RNG state | `input.seed`, `rngState`, `incidents.rngState` (the seed was even printed in the Development details panel) |
| Exact future weather | `input.weather.timeline`, plus the whole weather model: forecast accuracy, drying/drainage rates, water profiles, AI weather-strategy tuning |
| AI pit strategy | `input.pits.strategy` (window, stop point, preference spread, undercut, crossover…) and the legacy AI pit thresholds; the AI command thresholds in `input.commands.ai` |
| Reliability and incident model | Per-car `reliability`, the incident probabilities (`input.incidents`) and each car's `mechanicalPenaltyMs` |
| Future Safety Car / VSC | `incidents.remainingLaps`: the end lap of the current neutralisation |
| Hidden ratings | Driver and car ratings (`driver`, `car`, `interaction`) and the roster `balance` on the preparation screen |
| Hidden opponent decisions | AI pace/fuel/ERS modes, ERS charge and fuel load, pending AI pit stops, and rival tyre wear/temperature |
| Client-side generation | The preparation screen ran the weather-scenario generator (`careerRaceWeather`) in the browser, which shipped the generator and made the truth timeline recoverable |

## Safe view architecture
- **`src/features/race/public-view.ts`** holds types only. It defines `RaceViewData` and `RacePublicState`, both branded `visibility: "PUBLIC"`, as distinct types rather than a `Partial<RaceSimulationState>`. The authoritative state cannot be passed where the view is expected: typecheck rejects it. `PlaybackController`'s Race adapter (a player-team id) only accepts `RacePublicState`.
- **`src/features/race/projection.ts`** runs on the server. `projectRaceView(data)` and `projectRaceState(state, playerTeamId)` build the view by **whitelist**: every public field is copied explicitly, so anything added to the authoritative state later stays server-only. The projection reads state and never mutates it.
- **Pages:** the Race and Sprint pages pass `projectRaceView(...)` to `RaceView`. Every client component (tower, map, driver panel, header, weather, feed, playback, attention, Sprint panels) is typed on the public view.
- **Dead code removed:** the unused `pit-panel`, `command-panel` and `incident-panel`, which were typed on the authoritative state.

## What the view contains
| Area | Public view |
|---|---|
| All cars | Position, gaps/intervals, last/best lap, laps, elapsed time, public status (running/retired/finished, retired lap); map progress, DRS eligibility, overtakes; tyre **compound and age**; completed pit stops and stint compounds. |
| Player's two cars | Additionally tyre wear and temperature, fuel, the player's own commands (pace/fuel/ERS modes, charge, revisions) and pending pit request. `insight` holds server-derived figures (fuel at the flag, ERS outlook, pit-window estimate), computed with the same model code as before, so the hidden configuration never ships. |
| Rivals | Fuel, wear, temperature, commands, pending stops and command revisions are withheld (`null` or absent). |
| Race Control | Current mode, the DRS restart delay (a public rule), past events only, and `endingThisLap` ("Safety Car in this lap" / "VSC ending"), announced on the final neutralised lap as real Race Control does. The remaining-laps count is no longer sent, and neither is any future control event. |
| Weather | Current conditions plus `forecast`: the public approximate windows from the next lap on (`forecastAt(config, lap + 1)`). These are the same forecast the AI weather policy reads, so the player and AI see identical weather information. The truth timeline and weather model stay on the server. |
| Rendering constants | Total laps, circuit base lap time, ERS capacity, tyre warning thresholds, and feature flags (tyres / commands / pits / interaction). |
| Preparation | Grid conditions, the approximate forecast, a default starting compound, the compound list, and driver and team names. The weather is generated on the server; no ratings are sent. |

## Weather forecast boundary
- **Server:** keeps `input.weather` (timeline, model constants).
- **Browser:** gets the current state and forecast windows `{arrivalMinLap, arrivalMaxLap, rainfallMin, rainfallMax}`. Arrival windows carry a hidden per-event error plus the forecast uncertainty, so the exact transition lap is not recoverable.
- **No behaviour change:** the forecast windows are the same deterministic data the game already used for the player's forecast UI and the AI. No browser randomness is added.

## Server actions
- **Inputs:** actions accept command intent only: expected lap, entrant ID, command revision, mode or compound, and session kind.
- **Processing:** the server loads the persisted Race, the existing services validate ownership, revision and lap (stale protection unchanged), run the engine and persist.
- **Output:** the action returns `projectRaceView(...)`.
- **Never trusted:** no client-supplied Race object is read. `raceAction` (form start / simulate / legacy commands) returns only an error code.

## Sprint
- The Sprint uses the same page projection, action projection and components.
- Simulate Sprint and Simulate Remainder run entirely on the server; the client receives only the finished public view.

## Playback
- The same controller and cadence: Pause, 1×/2×/4×/8×, Next Strategic Event, one mutation in flight, no backward frames.
- Next Strategic Event still steps one committed checkpoint at a time through the server and assesses public checkpoints. It never needed, and never receives, future events.

## Determinism
- No simulation code changed.
- The same persisted inputs replayed on `origin/main` and on this branch gave **identical** sporting results. The sample covered:
  - 10 Career service Races/Sprints: dry, scenario-weather, mixed and wet, a VSC;
  - engine-level DRY / MIXED / WET / LATE_SHOWER Races;
  - an engine-level Safety-Car-heavy Race.

## Deferred / notes
- **Forecast intensity:** the forecast intensity range is centred on the scenario intensity by design. This is unchanged gameplay information shared with the AI; flagged for the Project Lead if a stronger forecast degradation is wanted.
- **Qualifying and Championship:** boundaries not changed. Both were re-checked clean in the live payload scan.

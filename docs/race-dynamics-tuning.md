# Post-Phase-14 — Race Dynamics / AI Strategy Tuning (Builder notes)

Starting main: `0777820` (merge of Phase 14 Qualifying, `73533b9`). Race simulation stays at **v7**. The lap, tyre, fuel, ERS, DRS, minimum-gap, incident and weather equations are unchanged.

## A1 — pit service + same-lap retirement
- **Root cause:** a stop after lap N closes stint k at N and opens stint k+1 at `startLap = N`. A retirement on the same lap then closed *every* open stint at N. That created a completed stint with `endLap == startLap`, which the `Stint_bounds` CHECK rejects. The transaction rolled back, and every retry recomputed the same lap. Result: permanent `PERSISTENCE_FAILED`.
- **Domain rule:** `closeRetiredStints` in `incidents/engine.ts`. A retirement closes only a stint that has at least one racing lap.
  - Tyres fitted by a stop on the retirement lap were never raced, so that final stint stays **terminal and unclosed**.
  - The stop itself is kept, because its time was spent.
  - Every completed stint keeps `endLap > startLap`, and the existing invariants hold: stints = stops + 1, and at most one open stint.
- **Recovery:** an already-stuck Race is saved at the checkpoint *before* the failing lap, so it simply advances now. No data repair is needed.
- **UI:** the stint history shows "not raced (retired)" / 「未使用（已退賽）」 for such a stint, instead of "in progress".

## AI pit strategy (`src/simulation/race/pits/ai-strategy.ts`)
The strategy is enabled by a configuration frozen into each new Career Race (`PitConfiguration.strategy`, stored in the new nullable `CareerRacePitProfile.strategy` JSONB column). Races saved without it keep the legacy weather policy exactly.

- **Pit window:**
  - *Gain* is the tyre saving over the public horizon (current tyre vs the best fresh tyre), as ‰ of the green stop cost.
  - The window opens at `windowOpenPermille`. A car stops when its gain reaches its own stop point:
    - `stopPointPermille`, plus its stop bias;
    - plus the release-traffic adjustment, or minus the clean-air bonus;
    - minus the undercut bonus, plus the extension bonus.
  - Stops are forced at `forceStopPermille` or at the compound's cliff wear.
- **Deterministic character:** FNV-1a of (Race seed, frozen grid slot), then seeded draws, gives each car:
  - stop bias ±1;
  - undercut appetite 0–1;
  - traffic sensitivity 0.5–1.5;
  - compound preference ±1.

  It uses no names, teams or storage IDs, and no RNG draw from the Race streams. It is never shown to the player.
- **Traffic:** counts running cars whose *current* crossing time lies within ±1.5 s of (own time + stop loss). A busy rejoin raises the stop point: sensitivity × circuit passing factor (0.5 + difficulty/70), capped. A clean rejoin lowers it a little.
- **Undercut:** within 1.5 s behind a car whose tyres are not much fresher (public tyre age), the stop point drops by the undercut appetite. It never looks at the rival's commands.
- **Extension / overcut:** clear air ahead (> 2.5 s), nobody within 1 s behind, and the tyre before mid-degradation raise the stop point by (1 − undercut appetite).
- **SC / VSC:**
  - The engine already hands the policy the reduced pit-lane loss.
  - A car takes the cheap stop only if it saves more than that reduced cost *and* its tyre is at least `neutralWindowPermille` ± its own bias into its life.
  - Fresh-tyre cars and long-stint characters stay out, so the field is not pitted automatically.
- **Weather:** a crossover (dry ↔ wet family, or intermediate ↔ wet) uses the established weather rule and compound choice. Each car's commitment point is spread by ±`crossoverSpreadPermille` × stop bias. It uses current conditions and the public forecast only; the timeline and initial state are stripped before the policy runs.
- **Dry compounds:**
  - Each fresh dry compound is costed as a whole-remaining-Race plan: run to the flag, or one further stop onto the best follow-up compound.
  - A further stop costs pit loss + margin + track position (`extraStopTrackPositionMs` × passing factor).
  - Compounds within `compoundToleranceMs` of the best plan are sensible choices, and the car's preference picks among them. A clearly worse compound is never chosen.
- **Dry start:** most AI cars start on the medium; a strong soft preference starts on the soft.
  - Never on the hard: without a two-compound rule, a hard start can run the whole Race without stopping, which the (untouched) degradation makes dominant.
  - Player starting tyres are unchanged.
- **Player cars:** never auto-pitted. Player commands stay authoritative.

## Circuit Race interaction profile
- **Fields:** `overtakingDifficulty`, `dirtyAirSensitivityPermille` and `drsEffectivenessPermille`. These already existed on the per-Race interaction profile, so the engine code and formulas did not change.
- **Source data:** `CIRCUIT_RACE_PROFILE` in `content-development.ts` (game-balance directions, not official ratings):

| Circuit | Difficulty | Dirty air ‰ | DRS ‰ |
|---|---|---|---|
| Monaco | 85 | 1500 | 350 |
| Marina Bay | 62 | 1300 | 650 |
| Suzuka | 50 | 1150 | 850 |
| Albert Park | 40 | 1100 | 950 |
| Silverstone | 26 | 950 | 1150 |
| Shanghai | 25 | 950 | 1150 |
| Bahrain | 18 | 900 | 1300 |
| Spa | 15 | 900 | 1350 |

- **Neutral legacy value:** 35 / 1000 / 1000.
- **Snapshot:** a new Career copies the profile into `CareerCircuit`, and each new v7 Race freezes it into `CareerRaceInteractionProfile`. Older Careers have NULL columns, so their Races use the neutral legacy interaction. Started Races never change.
- **Schema:** one additive migration, `20260928000100_race_dynamics`:
  - nullable columns on `Circuit` and `CareerCircuit`, with all-or-none range CHECKs;
  - nullable `CareerRacePitProfile.strategy`, which must be a JSON object.

## Builder sanity sample
- **Sample:** 48 all-AI 22-car v7 Races, 6 per circuit, on Career-style inputs (content balance, scenario weather). The grid is a noisy performance order, not a real Qualifying.
- **Method:** before = legacy inputs; after = strategy + circuit profile + dry-start character.
- **Status:** not a formal measurement.

| Metric | Before | After |
|---|---|---|
| Median largest same-lap pit wave | 21 | 4 |
| 18+ same-lap waves (dry + mixed) | 46 / 46 | 3 / 46 (sudden heavy-rain crossovers) |
| Median distinct first-stop laps | 2 | 13 |
| Median distinct compound sequences | 1 | 7 |
| Grid ↔ finish Spearman (median) | 0.94 | 0.69 |
| Car/driver pace ↔ finish Spearman (median) | 0.92 | 0.67 |
| Winner among the 3 fastest cars | 43 / 48 | 39 / 48 |
| Overtakes / 10 laps: Monaco · Marina Bay · Silverstone · Bahrain · Spa | 3.3 · 3.0 · 2.4 · 3.4 · 3.1 | 2.4 · 2.9 · 6.4 · 7.1 · 9.3 |
| Pass success: Monaco · Spa | 37% · 42% | 22% · 46% |

## Deferred (untouched)
Global DRS, the minimum-gap floor, tyre degradation, ERS / PUSH balance, the pit-lane queue model, Sprint and Championship.

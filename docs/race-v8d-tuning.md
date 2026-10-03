# Race v8D: balance tuning (progression revision 4)

Race v8D is Race v8 **progression revision 4** (still `simulationVersion` 8; there is no version 9). It tunes five
areas only: the wet crossover spread, intermediate vs full-wet diversity, the tyre cliff shape, late-Race attack
eligibility and per-circuit pit-loss economics.

Every number in this document is **GAME TUNING** — chosen for the game's feel, **not** official F1 / FIA / team
measurements. In particular there is no FIA-measured pit-loss data behind the pit timing below.

## 1. Scope

In scope (Part 14 of the brief):
- wet crossover decision spread;
- sensible intermediate vs full-wet diversity (including the wet grid start);
- tyre cliff shape (a new tyre constructor; the accepted profiles are untouched);
- the late-Race attack window (eligibility only; the pass probability is unchanged);
- circuit pit-loss derivation from authoritative pit anchors.

Not changed: incident frequency, reliability, the fuel model, energy rates, Active Aero, Overtake Mode qualification,
lapping / blue-flag mechanics, championship scoring, the sporting regulation, weather story frequency, weather physics,
and the car / driver performance ranges. No UI redesign, no new dependency, no new asset, no Prisma migration.

## 2. Revision-4 compatibility boundary

- `src/simulation/race/progression/revision.ts` is the capability boundary:
  - `LATEST_PROGRESSION_REVISION = 4`;
  - `hasAssistance` — revision ≥ 2 (v8 controls; never the legacy ERS path);
  - `energyModelFor` — revision ≥ 3 → the v8C distance-recovery model;
  - `hasRegulation` — revision ≥ 3 must carry the frozen session regulation; revisions 1/2 must not;
  - `hasV8dTuning` — revision 4 only.
- `progressionDFrom` / `progressionDForCircuit` (`src/data/seed/circuit-progression.ts`) take the accepted revision-3
  content and set `version: 4`. No geometry, pit anchor, zone, energy, regulation or presentation change.
- Revision 4 keeps everything revision 3 has: the B6.3.6 regulation and DSQ classification (a finished revision-4 Race
  must carry its classification record), v8C energy, the domain tie order and v8 assistance controls.
- Production creation (`startProgressionCareerRace`, `simulateProgressionCareerRace`, Race and Sprint) freezes
  revision 4. `startRevision3CareerRace` (accepted v8C) and `startRevision2CareerRace` (accepted v8B) remain for
  fixtures and compatibility tooling. A saved Race is never upgraded: its frozen snapshot decides its behaviour.
- The v8D values are frozen once, as one coherent bundle (`src/features/race/v8d-tuning.ts`, `v8dTuningBundle`),
  into the Race's own tyre / pit / strategy / racecraft / incident snapshots. The engine reads only those snapshots,
  so there are no scattered `if revision === 4` checks in the simulation.

## 3. Wet AI diversity

- `v8dAiStrategyConfiguration()` = the accepted strategy plus two fields (both or neither; GAME TUNING):
  - `weatherRiskSpreadPermille: 350` — ± spread of each car's commitment point to a change of tyre family
    (accepted Races used the dry `stopBias` with `crossoverSpreadPermille: 250`);
  - `wetCompoundToleranceMs: 1500` — the intermediate and full wet are both "sensible" when each is within this of
    the best wet-family option.
- The car's weather character drives three existing places when the snapshot carries the fields: the POOR-family
  recovery payback, the family-change weather gate allowance, and the crossover threshold.
- `sensibleWetChoice` — when both wet compounds are sensible the car's `wetCompound` trait chooses, weighted by how
  close they are (an equal pair splits the field by trait sign; a pair near the tolerance edge converges on the cheaper
  one). It is applied to the crossover (gate-passing horizon options) and to POOR-family recovery (current-condition
  cost; never back into the POOR family being left).
- Wet grid start (revision 4 only): `aiWetStartingCompound` lets the trait choose between the intermediate and full wet
  when the established current-conditions choice is wet and both are sensible on the grid; otherwise the established
  choice stands. Dry grids are unchanged; player starting tyres stay player choices.
- Obvious conditions still converge (e.g. very heavy water → everyone on the full wet). Anti-churn reuses the existing
  minimum stint, weather gate and stop economics: a car already on a sensible wet tyre is not called in just to swap
  inter ↔ wet because of its trait (the stop must still repay its loss). No extra hysteresis was needed.

## 4. Stable wet-weather character

- `StrategyPreference` gains `weatherRisk` (−1 early … +1 late family change) and `wetCompound` (−1 intermediate … +1
  full wet). They are **appended** draws of the same seeded stream (FNV-1a of Race seed + frozen grid slot), so every
  earlier field (`stopBias`, `undercut`, `trafficSensitivity`, `compound`) keeps exactly its previous value.
- Snapshots without the v8D fields never read the new traits (they keep `stopBias` as the weather character), so
  revisions 1–3 behave exactly as accepted.
- Never derived from names, teams or storage IDs; never exposed to the browser.

## 5. No future-weather knowledge

The policy reads only the public weather configuration (`publicWeather` strips the truth timeline and initial state),
the current weather state, the public forecast, the car's own tyre, Race Control and the pit loss. Wet compound choice
uses the shared current-condition suitability costs. No RNG draw is consumed; no future truth is read.

## 6. v8D tyre cliff profiles

`v8dTyreConfiguration()` / `v8dWeatherTyreConfiguration()` (GAME TUNING). `DEFAULT_TYRE_PROFILES` and
`weatherTyreConfiguration()` are unchanged and remain frozen for every earlier Race.

| Compound | degradationStartWear | cliffWear | progressivePenaltyMs | cliffPenaltyMs |
|---|---:|---:|---:|---:|
| SOFT | 400 | 780 (was 800) | 1700 (was 1600) | 8500 (was 6000) |
| MEDIUM | 450 | 830 (was 850) | 1300 (was 1200) | 7000 (was 6000) |
| HARD | 500 | 880 (was 900) | 1000 (was 900) | 5500 (was 6000) |
| INTERMEDIATE | 420 (was 450) | 820 (was 850) | 1300 (was 1200) | 7000 (was 6000) |
| WET | 450 | 850 | 1200 | 6500 (was 6000) |

- Base grip and base wear per lap are unchanged; intermediate / full-wet temperatures, grip and wear match the accepted
  weather profiles. The wet profiles are explicit, so they no longer silently inherit the medium curve.
- Invariants (tested): monotonic penalty; no discontinuity; materially steeper after the cliff; a fresh SOFT is still
  the fastest; the HARD still lasts longest; a tyre run deep past the cliff costs more than before.
- There is no "if wear > X then pit" rule: the existing AI cost model remains authoritative and simply sees the new
  costs.

## 7. Late-Race attack-window tuning

`v8dRacecraftConfiguration()` = the accepted racecraft plus three fields (all or none; GAME TUNING):
- `lateRaceStartPermille: 750` — late once the **attacker itself** has completed 75 % of the scheduled distance
  (`completedLaps * 1000 >= totalLaps * 750`), never judged by the leader;
- `lateRaceAttackThresholdPermille: 1300` — an ordinary attack may start from 1.3× the circuit's attack threshold;
- `lateRaceMinimumPaceAdvantagePermille: 800` — the minimum pace edge is 0.8× the circuit's (never below 1 ms).

`lateRaceAttackWindow` is a pure helper. It applies only to ordinary on-track racing between two TRACK cars: not to
lapping / blue flags (their own gate), not in the pit lane, not under SC/VSC (no attempts then), never to retired cars.
Because it scales the circuit's own values, hard-to-pass circuits stay hard (Monaco does not become Monza).

## 8. No probability "drama bonus"

The pass probability formula (`passProbability`) is unchanged; the window only widens who may *attempt* a pass. A
genuine pace edge is still required, no energy is created or changed, and the same single pass draw is used. There is
no final-lap lottery or scripted bonus.

## 9. Circuit pit-loss derivation

`circuitPitTiming(pit, baseLapTimeMs)` (`src/simulation/race/pits/circuit-timing.ts`) uses only the authoritative
progression pit anchors and the Race's base lap — never SVG / drawn map length:

```
bypassMicrolaps   = (LAP_UNITS - pit.entry) + pit.exit
pitTrackSectionMs = round(baseLapTimeMs * bypassMicrolaps / LAP_UNITS)
pitLaneLossMs     = clamp(round(pitTrackSectionMs * 1600 / 1000), 12000, 30000)
```

The 1.6 multiplier and the 12–30 s bounds are GAME TUNING. `pitLaneLossMs` excludes stationary time, which stays the
separate service draw (nothing is double counted). Custom / fallback circuits use the fallback anchors and work the
same way. Revision-4 values for the 24 catalogue circuits (GAME TUNING, derived — not measured):

| Circuit | Base lap (ms) | Entry | Exit | Bypass (µlap) | pitTrackSectionMs | pitLaneLossMs |
|---|---:|---:|---:|---:|---:|---:|
| Albert Park Grand Prix Circuit | 87967 | 885000 | 30000 | 145000 | 12755 | 20408 |
| Suzuka Circuit | 96783 | 915000 | 60000 | 145000 | 14034 | 22454 |
| Shanghai International Circuit | 90850 | 872000 | 18000 | 146000 | 13264 | 21222 |
| Bahrain International Circuit | 90200 | 918000 | 60000 | 142000 | 12808 | 20493 |
| Circuit de Monaco | 55617 | 906000 | 66000 | 160000 | 8899 | 14238 |
| Silverstone Circuit | 98183 | 919000 | 89000 | 170000 | 16691 | 26706 |
| Circuit de Spa-Francorchamps | 116733 | 944000 | 57000 | 113000 | 13191 | 21106 |
| Marina Bay Street Circuit | 82117 | 904000 | 72000 | 168000 | 13796 | 22074 |
| Jeddah Corniche Circuit | 102900 | 912000 | 50000 | 138000 | 14200 | 22720 |
| Miami International Autodrome | 90200 | 915000 | 68000 | 153000 | 13801 | 22082 |
| Circuit Gilles Villeneuve | 72683 | 938000 | 136000 | 198000 | 14391 | 23026 |
| Circuit de Barcelona-Catalunya | 77617 | 912000 | 75000 | 163000 | 12652 | 20243 |
| Red Bull Ring | 72100 | 880000 | 80000 | 200000 | 14420 | 23072 |
| Hungaroring | 73017 | 862000 | 45000 | 183000 | 13362 | 21379 |
| Circuit Zandvoort | 70983 | 990000 | 120000 | 130000 | 9228 | 14765 |
| Autodromo Nazionale Monza | 96550 | 905000 | 35000 | 130000 | 12552 | 20083 |
| Madring | 90233 | 965000 | 85000 | 120000 | 10828 | 17325 |
| Baku City Circuit | 100050 | 955000 | 22000 | 67000 | 6703 | 12000 (min clamp) |
| Circuit of the Americas | 91883 | 915000 | 55000 | 140000 | 12864 | 20582 |
| Autódromo Hermanos Rodríguez | 71733 | 928000 | 115000 | 187000 | 13414 | 21462 |
| Autódromo José Carlos Pace (Interlagos) | 71817 | 917000 | 200000 | 283000 | 20324 | 30000 (max clamp) |
| Las Vegas Strip Circuit | 103350 | 947000 | 30000 | 83000 | 8578 | 13725 |
| Lusail International Circuit | 90317 | 888000 | 57000 | 169000 | 15264 | 24422 |
| Yas Marina Circuit | 88017 | 935000 | 105000 | 170000 | 14963 | 23941 |

## 10. SC/VSC pit-loss relationship

`pitTrackSectionMs` feeds `IncidentConfiguration.pitTrackSectionMs`, so the existing reduced-stop rule uses the same
circuit section as the green loss:

```
effective = GREEN ? pitLaneLossMs : max(1000, pitLaneLossMs - round(pitTrackSectionMs * (lapMultiplierPermille - 1000) / 1000))
```

`effectivePitLaneLoss` and the strategy's green-loss reference are unchanged code; only the frozen inputs differ.

## 11. Historical revision-3 preservation

- Revision 3 (accepted v8C) freezes exactly what it did: `weatherTyreConfiguration()`, a 19.5 s lane loss, the 12 s
  incident pit section, `defaultAiStrategyConfiguration()` (no v8D fields) and `defaultRacecraftConfiguration()`
  (no late window).
- Revisions 1/2/3 never receive any v8D configuration. Existing saves are never upgraded.
- The v8B golden digests and the v8C regulation / strategy / weather suites are unchanged.

## 12. What remains for v8E

Still deferred to v8E:
- 5,000–10,000 Race campaign;
- full statistical distribution acceptance;
- final performance gate;
- professional black-box beta;
- complete balance sign-off.

Also required before the v8E / public-beta gate: a dependency / security review (npm audit findings, the ESLint
deprecation and the known `pg` concurrent-query deprecation warning). v8D adds no dependency.

Still outside Race v8: the general Phase 31 UI redesign, multi-season Phase 29, and Phase 18 systems.

# Race Gameplay Milestone 2 — Final Closure Repair (Builder notes)

Starting main: `9a0f847`. It contains the Post-Beta Race Experience repair, the command-exploit repair, authoritative tyre suitability, the NSE triggers, SQ3 late runs and the information boundary. Race simulation stays v7. There is no schema change or migration. The new behaviour is frozen into NEW Career Races as optional JSON fields: `commands.racecraft.fuelStarvationRetirement`, `pits.strategy.weatherGateMs` and `pits.strategy.weatherGateSpreadMs`. Races saved without these fields replay exactly as before.

## Fuel starvation
**Root cause.** A car without enough fuel for a lap took the 120 s exhaustion penalty and kept circulating. In traffic it was an ordinary defender, and each car may be attacked only once per lap. The cars behind therefore cleared it one per lap, queued at the 80 ms minimum and inherited its ~3:30 lap.

**Repair**
- **Detection.** `commandLapEffects` now reports `starved`.
- **Stricken lap.** A starved car is left out of the green-flag traffic resolution. It is merged back at its own crossing time, so nobody queues behind it or has to "attack" it.
- **Retirement.** The car pulls off at the end of that lap as a `RETIREMENT` with kind `FUEL_STARVATION`.
  - It is processed in grid order, with no RNG and no Race Control trigger.
  - The incident draws of that slot are still consumed, so the incident stream is unchanged.
  - It is classified behind every running car.
- **No pass events** are recorded for clearing a stricken car, so there is no misleading "Tyre advantage" cause. The retirement explains the change.
- **Same mechanics for every car.** A rival's fuel retirement is projected to the browser as `STOPPED` ("Stopped on track"); its fuel stays private.

**Warnings and NSE**
- **FUEL (existing):** projected short at the flag.
- **FUEL_CRITICAL (new):** projected short AND the car's own fuel lasts ≤ 3 laps in its current mode, and runs out before the flag.
  - Server-derived `insight.fuelLapsRemaining` exists for the player's own cars only.
  - It is announced once per transition. It subsumes a first-time FUEL at the same checkpoint, so there is one stop, not two.
  - The driver panel shows "Fuel critical: about N laps left in this mode" while the car is running.
- **FUEL_OUT (new):** "{driver} is out of fuel and has stopped", for the player's own fuel retirement. It stops playback, including Next Strategic Event skips.

**Labels (copy only).** Fuel modes are now Lean / Balanced / Rich (zh-TW 稀油省油 / 均衡 / 濃油), so they no longer share "Push" or "Conserve" with the pace modes. The mechanics are unchanged.

## AI weather strategy
**Root cause.** The weather crossover rule compared "stop now for the new family" with "stay out on the current tyre for the whole 10-lap horizon", under the public forecast. Once rain was forecast inside the horizon, every car pitted immediately, with only a ±25% threshold spread. That happened even at 0–12% water, while slicks were seconds faster. Current performance never entered the decision.

**Repair.** A tyre-family switch must also pass the shared current-condition assessment (`familyCostsMs`, the same model as the tyre-suitability badge and the NSE crossover). The target family may be at most a per-car allowance slower than the car's current family right now:
- the allowance is 250 ms ± 750 ms, taken from each car's existing stop-bias character;
- early gamblers accept up to 1 s slower now; late cars want the new family 0.5 s faster;
- the best option whose family passes the gate is chosen, so a car can step dry → inter while full wets remain far too slow;
- the forecast / horizon rule must still pay off as before;
- only current conditions and the public forecast are used — never the truth timeline, identity or RNG.

Weather samples: 20 AI cars, 4 seeds per scenario. Forecast windows bracket each segment by ±2 laps and ±150 intensity. Crossovers: dry → inter at 267 water, inter → wet at 719. Tyre changes take effect a lap after the call.

| Scenario | Before (gate absent) | After |
|---|---|---|
| A: rain forecast, water 0 → ~80 over 20 laps, then heavy rain | all 80 cars on inters at water 49–55 while slicks are clearly best | no car leaves slicks until the rain arrives; switches over laps 23–27 at water 358–914 |
| B: gradual dry → inter | all switched at water 187–220, before the crossover | laps 12–14, water 254–322, around the crossover |
| C: rapid dry → inter (+160 water per lap) | all 20 switched at water 0 | all at the first lap after the crossover (water 480); a spread is impossible at this rate |
| D: inter → wet | water 754–1000 | unchanged (gate not binding) |
| E: drying wet → inter → dry | wet → inter all at water 749–682; 2 cars moved to slicks at 336 | wet → inter over laps 12–14 (water 682–545); inter → dry at water 195–124 (after the 267 crossover) |

The regression test reproduces the Beta mass switch with the gate removed (at least 15 of 20 cars on inters at ≤ 12% water) and asserts that the repaired policy has zero cars on inters while slicks are clearly best.

## Race forecast copy
- `forecastItems(windows, currentRainfall)` is shared by the prep screen, the weather panel and the header strip.
- A dry grid never reads "Rain easing". Windows with no meaningful rain (max < 20%) are only mentioned while it is raining, where they mean the rain is easing.
- Meaningful rain reads "Rain expected" when even the low end of the window is rain, otherwise "Rain possible".
- With nothing meaningful forecast, a dry track shows "No rain expected".
- Only the public forecast windows are used.

## Verification
- **Old-save replay (identical on `origin/main` and this branch):** 40 Races with the new optional fields stripped — dry, scenario weather, incidents and racecraft.
- **Racecraft unchanged:** new dry racecraft Races, with the new defaults and no starvation, give identical results and events on `main`.
- **Browser, 1366:** on the live GP, playback stopped at lap 6 with "RUS fuel critical: the car will run dry within a few laps" and at lap 10 with "RUS is out of fuel and has stopped". The fuel buttons read Lean / Balanced / Rich. The dry-grid preparation forecast reads "No rain expected". No `racecraft`, `weatherGateMs` or timeline appears in any page or action payload. No page errors.

## Deferred (unchanged scope)
- **Sprint:** the front is fairly processional and the rear field runs in tight trains.
- **Starts:** static lap-1 starts.
- **Feed:** grouping of rival pit events (wet-race feed volume).
- **NSE:** the final-5-laps checkpoint and a stop when the player loses a place.
- **Other programmes:** Practice, Content Expansion Pass B, Phase 17.

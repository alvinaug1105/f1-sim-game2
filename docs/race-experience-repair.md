# Post-Beta — Race Experience Repair (Builder notes)

Starting main: `2b72586` (Race Information Boundary Hardening). The Race simulation stays at **v7**, and there is no schema change or migration. New Career Races freeze a `racecraft` block into the command profile. That profile is already stored as JSON (`CareerRaceCommandProfile.profile`). Races saved without the block keep the previous traffic and AI behaviour exactly.

## Traffic: the exact 80 ms floor
**Root cause.** A faster car that could not pass was clamped to `ahead + minimumGapMs` every lap. Its dirty air was then computed from that 80 ms gap and it was clamped again. That produced a frozen queue at exactly 80 ms, with an attempt only every second lap.

**Racecraft** (`src/simulation/race/traffic/racecraft.ts`, `resolveRacecraftTraffic` in `traffic/model.ts`) replaces this with soft following:
- **Legitimate edge.** Attack eligibility and odds read each car's *expected* lap: the lap without this lap's random variation, covering car, driver, tyres, fuel, commands and water. A lucky lap never creates an attack, and neither does the defender's own dirty air.
- **Pressure.** This is the pace a held car could not use this lap, plus last lap's traffic loss if it was already close and did not pit. It is capped at 500 ms and adds 3‰ to the pass probability per 10 ms. It resets by itself when:
  - the gap opens;
  - the car passes or stops;
  - SC/VSC is out (neutralised laps have no traffic).
- **Opportunities.** Every lap is an opportunity.
  - Each car may attack once and be attacked once per lap.
  - A car that just lost a place cannot counter-attack in the same lap.
  - As a result, trains are not starved and multi-car swaps are impossible.
- **Failed attacks and turbulence.**
  - A failed attack costs the attacker up to 450 ms, scaled by how clearly it failed. This uses the same single draw, so there is no extra RNG.
  - A held car that does not attack takes the close-range turbulence it drove into: half the extra dirty air of the minimum gap.
  - The gap therefore reflects arrival speed rather than a fixed number.
- **Unchanged:** the minimum gap is still enforced (order safety), dirty air, DRS, the circuit profile, and the probability formula.
- **Not retuned:** undercuts, pit loss, degradation, compound pace and ratings.

## DRS / dirty air, controlled
The scenarios use 100 seeds and 12 laps, with the chaser 0.6 s behind:

| Scenario | Racecraft | Legacy |
|---|---|---|
| A: equal pace + DRS | 0/100 passes | — |
| B: 0.25 s edge, no DRS | 13/100 | 0/100 |
| C: 0.25 s edge + DRS | 88/100 (408 of 496 attempts failed) | 56/100 |
| 0.25 s edge + DRS, difficulty 70 | 63/100 | — |
| 0.4 s edge, no DRS | 84/100 | — |
| Slower + DRS | 0/100 | — |

On the held-follower scenario (0.3 s edge, difficulty 70), the exact-80 ms share of close laps fell from 25% to 0%.

## Commands and AI
**Player commands.** There is no free-air change: a lone car's lap is identical with and without racecraft, for any command. In traffic, ATTACK/OVERTAKE raise the expected-pace edge.
- Equal pace + DRS with ATTACK+OVERTAKE: 100/100 eventually pass, but 43 of 143 attempts fail.
- Legacy: 93/100.
- ERS charge limits still apply.

**AI roles** (`commands/policy.ts`, racecraft Races only). An AI car attacks with PUSH and, with at least 400 charge, OVERTAKE, but only with a genuine basis within 1 s:
- it has the same compound at least 8 laps fresher; or
- it was held back at least 60 ms last lap while *not* already on attack commands.

Other rules:
- A car passed within 3 laps does not answer the passer on the "held" basis alone.
- A car threatened by such an attacker defends with PUSH + DEPLOY.
- Everyone else runs STANDARD. In a fight, a low battery holds NEUTRAL instead of HARVEST.
- The rules are the same for every car. No names, teams, player/AI identity, results or RNG are used.

**Sprint.** There is no Sprint branch anywhere.

## Overtake feed
- **Event.** Each successful pass is persisted as an `OVERTAKE` Race event (`entrantIds: [passer, passed]`) with a post-event `cause`:
  - `TYRE`: softer dry compound, or at least 8 laps fresher;
  - `ERS`: DEPLOY/OVERTAKE;
  - `DRS`;
  - `PACE`.
- **Feed.** The feed shows only passes that involve a player car ("Place gained / Place lost · cause · A passed B").
- **Never exposed:** probabilities, ratings and pace are never in the event or the view.
- **Legacy Races:** they record no OVERTAKE events.

## Next Strategic Event
All triggers use public checkpoints only:
- **Adjacent rival.** The rival directly ahead of or behind a player car at the previous checkpoint completes a stop. This gives `RIVAL_PIT_*`, or `RIVAL_TYRE_*` if its tyre family changed. A distant rival never pauses playback.
- **Field tyre wave.** At least 30% of running cars switch tyre family (DRY / INTER / WET) within 2 laps. It pauses once, with a 6-lap cooldown.
- **Suitability crossover.** The most suitable family for *current* track water changes, with ±25‰ hysteresis around the 100/350 bands, and a player car is on the other family.
- **Battle hysteresis:** unchanged.

## Qualifying forecast
Qualifying and Sprint Qualifying map the public forecast windows onto the session clock the player is looking at:
- "Rain likely during SQ2 (~9:00–3:00 remaining)";
- "…in the break before SQ3";
- a span across phases.

Other details:
- The schedule is built from the current phase: scheduled length, then a break, then later phases. Times are rounded to 30 s.
- Windows after the session end are dropped.
- Wording depends on current rain: "Light rain possible" on a dry track, and "Rain easing" only while heavier rain is falling.
- Practice is unchanged.

## Sprint SQ3 late runs
Sprint SQ3 (8 min) has room for one run. That run is now scheduled back from the flag: its last timed lap starts 20–120 s before the flag, using the same stagger draw and the same number of RNG draws. Grand Prix Q3 is untouched.

Engine sample (22 AI cars, 108 sessions per kind):

| Session | Pole set with … left (median) | Bests in the last 90 s | Cars without a time |
|---|---|---|---|
| SQ3 before | 178 s | 9% | 0 |
| SQ3 after | 33 s | 83% | 0 |
| GP Q3 (reference) | 85 s | 44% | — |

SQ1 and SQ2 are byte-identical to main.

## Multi-tab
The existing single-tab scheduler is unchanged. The page shows "Race advanced in another tab or device. Refresh to load the latest checkpoint." with a Refresh button in two cases:
- the server answers a command with `STALE`; or
- a returning tab (focus / visibilitychange) finds that the saved checkpoint lap differs from its own. This check uses `raceCheckpointAction`, which returns lap and status only.

## Builder sample (40 Career sims, not acceptance)
The sample covers 5 each of Bahrain, Spa, Shanghai, Monaco and Singapore GP, and of Shanghai, Silverstone and Singapore Sprint.

| Session | exact-80 before → after | ≥4-car floor laps | Episodes ending in a pass | Overtakes / 10 laps | Grid→finish r |
|---|---|---|---|---|---|
| Bahrain GP | 24.4% → 4.6% | 73% → 27% | 33% → 44% | 7.8 → 12.6 | 0.75 → 0.86 |
| Spa GP | 24.7% → 4.0% | 69% → 24% | 33% → 52% | 8.5 → 10.2 | 0.76 → 0.59 |
| Shanghai GP | 21.0% → 3.5% | 67% → 13% | 26% → 44% | 5.6 → 8.7 | 0.71 → 0.83 |
| Monaco GP | 9.2% → 1.4% | 23% → 6% | 16% → 24% | 1.6 → 2.6 | 0.75 → 0.88 |
| Singapore GP | 13.6% → 1.5% | 38% → 5% | 21% → 40% | 2.9 → 4.7 | 0.87 → 0.95 |
| Shanghai Sprint | 30.7% → 9.3% | 94% → 59% | 18% → 33% | 4.6 → 11.9 | 0.93 → 0.92 |
| Silverstone Sprint | 20.4% → 4.4% | 75% → 20% | 17% → 25% | 3.2 → 8.2 | 0.97 → 0.98 |
| Singapore Sprint | 15.2% → 4.4% | 51% → 14% | 11% → 17% | 1.0 → 3.8 | 0.92 → 0.92 |

The circuit hierarchy is preserved: Monaco and Singapore are hardest, Bahrain and Spa easiest. The longest ≥8-car train run (median laps) is largely unchanged (14–19 after vs 15–20 before). Long trains persist through the middle of races; this is flagged below.

## Determinism
- 36 engine Races without racecraft replay byte-identical on `origin/main` and on this branch: dry, scenario weather, and incidents with AI strategy.
- GP Qualifying (30 sessions) and Sprint Qualifying SQ1/SQ2 are identical.
- The same racecraft input replays identically.
- No `Math.random` is used.

## Deferred / notes
- **Train persistence.** The longest-train measure barely moved: cars now visibly race inside the train and passes happen, but a long, evenly paced train can persist. Breaking it further would need tyre/strategy spread, which is out of scope here.
- **Grid→finish correlation** rose at most circuits (more passes by genuinely faster cars). Spa fell in this small sample.
- **Engine LCG seeding.** The engine's LCG gives nearly identical first draws for consecutive small seeds. Real Careers use 32-bit random seeds, and the new test helper spreads its seeds. This is noted for any future small-seed tests.

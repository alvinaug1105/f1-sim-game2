# Race v8A — authoritative track progression

Builder implementation from main `84eb3b0a4f261492cc93b37bc80a1ee0df9fee7b`. This is a foundation implementation for independent review, not gameplay acceptance or balance calibration.

## Version dispatch and distance

New product Grand Prix and Sprint actions create version 8 through `startProgressionCareerRace` / `simulateProgressionCareerRace`. The existing explicit v7 service entry points and v1–v7 engine branches remain available. Stored version determines continuation; loading a v7 Race does not add or infer v8 state.

`track.progressMicrolaps` is the canonical nonnegative integer total race distance. One lap is exactly **1,000,000 units**. Completed laps are `floor(total / 1,000,000)` and local position is `total % 1,000,000`. On a 5 km circuit one unit is about 5 mm; this is ample precision for a management abstraction and avoids accumulated floating-point position state. The map reads this value directly.

All cars advance on the same integer millisecond clock. The v8 integrator uses slices of at most 100 ms and clamps slices/movement at lap and pit boundaries. Speed is an integer nanolap rate per millisecond; a persisted 0–999 remainder carries fractional microlaps. Exact boundary clamping discards a final rounding overshoot rather than moving a car backwards. Car launch offsets, current-lap variation, command snapshot, resource contract, delayed movement, pass permission and pit commitment survive reload.

A checkpoint is the next leader lap crossing. Other cars retain their own incomplete laps and may cross on different slices. Fuel, ERS and tyre age/wear are charged at each car's own crossing. Command modes take effect from that car's next lap; changing a mode during a lap cannot replace its already committed resource budget. Weather, AI policy and Race Control remain management checkpoints rather than continuous physics.

At the final leader crossing, remaining running cars finish at their next crossing. Lap-down finishers keep their shorter completed distance. Classification sorts finishers by completed distance and crossing time, then retirees by reached distance and retirement order. Running gaps use current distance; full-lap deficits are represented separately. Circular physical neighbours use local forward distance and exclude retired cars and cars on the pit route. Classification neighbours are not used as substitutes.

## Segments, zones and circuits

`src/data/seed/circuit-progression.ts` prepares all 24 existing production circuit geometries, including Suzuka under source circuit ID `00000000-0000-4000-8000-000000000301`. Racing-direction geometry is sampled uniformly by distance into 64 contiguous sections, whose integer lengths sum to exactly one lap. Bending determines STRAIGHT / FAST / MEDIUM / SLOW categories. Runtime simulation does not branch on circuit, driver or team names.

Sections carry DIRTY_AIR and BLUE_FLAG zones; straight/fast sections also have PASSING and ASSISTANCE metadata, while other sections have BRAKING metadata. `segmentAt` and `zonesAt` accept authoritative total distance. These are coarse content abstractions, not surveyed corners, official assistance zones or full 2026 assistance rules. A generic fallback supports future custom circuits. Each newly created Race freezes its configuration; later catalogue edits cannot change a saved Race. Authored database segments can replace the preparation layer without changing the integrator.

## Traffic and lapping

Following, dirty air, current legacy DRS, attack edge, probability, failed-attempt cost and seeded randomness reuse existing helpers. Eligibility uses the local forward gap and current zone. There is no equal-completed-lap gate in v8. The existing **80 ms minimum gap is unchanged** and is converted into local fixed-point distance for no-pass resistance. Successful passes permit actual movement past a target; a pass is recorded only after both cars' real movement crosses the gap. No rank swap or teleport creates progress.

Sustained pace differences naturally create one- and multi-lap deficits. When a leader approaches lap-down traffic in a BLUE_FLAG zone, configurable resistance is reduced (100 permille of ordinary resistance), with finite 120 ms pass / 160 ms failed-attempt costs. Private current interaction state records the target and permission. AI uses physical neighbours and does not spend position-defence commands against a lapping leader. Player and AI cars use the same movement and passing mechanics. A faster lap-down car may pass under green and regain distance through ordinary mechanics. Full stewarding and Safety Car unlapping are deferred.

## Pits and other existing systems

The frozen coarse pit route has entry at 0.92 lap, service at 0.97 lap, and exit/rejoin at 0.04 of the next lap. ENTRY, LANE, SERVICE and EXIT are distinct persisted phases. Service pauses movement using the existing lane-loss plus seeded stationary cost; existing tyre-fit and stint history are recorded on the crossing. A committed request cannot be changed after entry, and the player's public projection explains that status. Pit cars do not act as main-track traffic targets; they rejoin the local neighbour model after EXIT. Positions never move backwards or reset on rejoin. This is not surveyed pit-lane geometry or new pit-loss calibration.

SC/VSC keep existing fuel/wear/pace multipliers, DRS restrictions, duration and restart concepts. Local speed compression preserves every car's accumulated distance and lap deficit. Neutralisation does not enable overtaking/unlapping. Weather and current compound effects reuse existing helpers. Incident randomness retains six draws per original grid slot per checkpoint on its separate stream; contact/risk neighbours are local. Retirements freeze total distance and completed laps, close the stint and remove the car from future movement. v8 retired cars leave the live map and remain in classification.

## Persistence and information boundary

The additive migration `20261005000200_race_v8_progression` adds nullable JSONB `CareerRaceSimulation.progression`. It stores `{ configuration, state }` alongside existing entrant distance/resource rows, in the same repository transaction. Application validation checks integer bounds, owned car keys, exact segment coverage, lap/distance consistency and integration state. PostgreSQL checks/guards require v8 progression and consistent integer distance. Existing incident/wet-tyre guards accept v8 while preserving historical-version restrictions. Historical migrations are unchanged. v1–v7 rows keep NULL; no saved results, calendars or source content are rewritten.

`PublicRaceView` remains a server-side whitelist. Additions are only each car's current public local position, segment, pit route and lap deficit, plus the player's own committed-pit status. Seed, RNG, future weather/incidents, current-lap plans, AI decisions and the private progression snapshot are not serialized to the browser. The map interpolates only between published canonical checkpoints, with no v8 visual speed profile or extrapolation.

## Race map

Only the Race operations layout changes. Desktop timing uses a 280 px column and the map takes the remaining width; driver controls remain below. The map uses one uniform projection scale and an aspect-aware 1000-unit canvas, 16-unit padding, bounded height and responsive stacking. Practice and Qualifying keep their existing layout and markers.

Race badges are 30 × 16 SVG units with a small rounded rectangle, three-letter identity, contrasted text, player outline/notch and selected outline. Lapped cars have a dashed border and a small lap-count label with translated accessibility text. Five lateral positions bounded at ±36 units spread nearby trains; subtle tethers preserve the real track anchor. Staggering is track-local and never changes longitudinal progress or mixes unrelated crossing branches. Extremely dense/coincident fields can still overlap; timing and keyboard/hover identity remain available. A single RAF loop updates the field without per-frame React renders.

## Builder verification

New focused suites are `tests/race-v8.test.ts`, `tests/race-v8-map.test.tsx` and `tests/race-v8.integration.test.ts`. They cover fixed-point monotonicity, natural lap deficits, lapping/green unlapping, physical order, zone eligibility, all 24 circuits/Suzuka, pits, SC/VSC, wet crossover, retirement, command timing, deterministic chunks/JSON reload, safe public projection, compact 22-car markers and additive real-PostgreSQL persistence. Existing historical expectations remain intact. Old-schema hash fixtures omit the new nullable field and assert that migrated legacy Race rows keep NULL.

The Builder report accompanying the candidate records final command counts, production-browser evidence and representative runtime. Local full 58-lap, 22-car samples took roughly 2.7–3.0 seconds: a normal production crossover, an SC-start variant and a controlled wide-pace fixture. The controlled fixture produced 57-/56-lap finishers and 60 lapping passes; this is a capability check, not a claim about calibrated production balance.

## Deferred

Full 2026 Active Aero / Overtake Mode, Boost redesign, dry-tyre rule repair, ERS equilibrium repair, wet AI strategy repair, late-race/tyre-cliff calibration, full pit-loss calibration and Safety Car unlapping remain deferred. No Phase 18, Phase 29, Phase 31, dynamic calendar or 2027 rollover is implemented. The new circuit snapshot and runtime model are independent of season/calendar identities.

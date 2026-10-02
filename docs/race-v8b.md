# Race v8B: pit routing and assistance foundation

New production Race/Sprint sessions use `simulationVersion: 8` and frozen progression `configuration.version: 2`. Revision 1 is v8A. The engine dispatches revision 1 to `progression/legacy.ts`, copied exactly from starting main except its exported function name. No existing save is upgraded. Versions 1–7 keep their historical dispatch. The lower-level `startCareerRace(..., withProgression: true)` remains a compatibility/fixture hook; production helpers explicitly request revision 2.

## Frozen circuit content

`circuit-progression.ts` prepares separate revision-2 records for all 24 production circuits. Suzuka is `00000000-0000-4000-8000-000000000301`. Each record freezes segments, zones, assistance rules and a separate pit polyline. The original revision-1 catalogue is unchanged.

Pit polylines are approximate parallel routes prepared from each circuit's existing distance-normalised centreline. They are management content, not surveyed pit lanes. Entry and exit meet the same racing-line positions exactly. Ordered unwrapped microlap anchors cover entry 920000 through service 970000, start/finish 1000000 and exit 1040000. Curve-normal offsets taper to zero at both joins. Geometry preparation happens outside the simulation integration loop; no circuit-name branches exist in gameplay.

Active Aero/ordinary deployment use existing geometry-derived straight/fast zones. The longest contiguous run chooses the local Overtake Mode deployment window; its detection line is 5000 microlaps before the run, wrapping if necessary. Different circuit geometry yields different windows and straight/corner proportions. Existing circuit dirty-air and passing profiles remain authoritative. These are configurable management abstractions, not a complete implementation of official 2026 regulations.

## Pit authority and presentation

The authoritative route is TRACK → ENTRY → LANE → SERVICE → LANE → EXIT → TRACK. Progress remains integer race distance on the shared clock. Entry/lane/service/exit boundaries stop integration slices. Pit cars are excluded from track neighbours, no-pass resistance, dirty air, battles and electrical assistance. Existing effective pit-lane loss, including SC/VSC reductions, is distributed over transit; SERVICE holds only stationary service time. No circuit-specific loss calibration is added.

A checkpoint persists a small bounded history of already-observed positions and route changes, including the service arrival and departure at the same position. The server explicitly projects that public history. `RaceMotion` replays it against the saved checkpoint clock, never predicts beyond its last endpoint and freezes on pause. The renderer samples the frozen pit path while the observed route is off-track, including across start/finish. A reload starts directly at the current saved route and position. When a checkpoint arrives mid-replay, the remaining observed route is retained and playback starts at the last drawn frame. Static geometry and past on-track/pit positions are player-public information; commitments and future plans are not projected for rivals.

## Three distinct systems

Active Aero automatically selects CORNER/STRAIGHT without any following-gap gate. Pits, neutralised running and water above 350 permille restrict it to SAFE. Its default straight delta is zero: existing base pace already represents the car's baseline aerodynamics. A conservative configurable delta is supported without adding a second full baseline straight-line bonus.

Overtake Mode qualifies only when a running TRACK car crosses the configured detection line with a physical TRACK car ahead within the inclusive 1000ms threshold. The gap uses circular distance at the shared-clock crossing, not timing-table intervals. Detection is an integration boundary, including a start/finish detection line; a standing grid does not qualify. Lap-context policy excludes lapping and unlapping (race-distance difference at least half a lap), rather than granting eligibility through a lap-down car. This restriction is central and testable.

Qualification records its lap, valid-use lap and expiry. A deployment run before a wrapping detection point is used on the next own lap; otherwise the window is on the current lap. The entitlement expires at the own crossing after that valid lap. It activates only inside its local window, with actual energy expenditure. Missing/distant neighbours fail qualification. SC/VSC, pits, low grip and stopped/retired running clear eligibility; restart requires fresh detection. No DRS restart entitlement is reused.

Boost is an independent ordinary energy policy: RECHARGE, BALANCED or BOOST. A driver may spend ordinary energy without Overtake Mode eligibility. Overtake Mode is an automatically qualified electrical envelope, not a renamed legacy ERS command or a second button.

## Integer energy accounting

Capacity is 1000000 units; initial charge is 700000 for every car. Rates per second:

| Policy | Ordinary deployment | Recovery outside deployment |
| --- | ---: | ---: |
| RECHARGE | 0 | 5000 |
| BALANCED | 2000 | 1500 |
| BOOST | 8000 | 500 |

Qualified local Overtake Mode selects a single envelope of at least 10000 units/second and up to 600ms representative electrical benefit. Ordinary BOOST has a 400ms maximum; BALANCED scales to its lower rate. The combined result is one envelope, never two stacked full bonuses.

Each integer-millisecond slice carries deployment/recovery fractions in persisted integer remainders. Order is: compute requested debit, debit at most the starting store, scale benefit by actual debit, then recover and clamp to capacity. Recovery cannot fund deployment in the same slice. Zero energy grants zero electrical benefit. Sustained BOOST exhausts the store. The movement preview is conservative for shortened boundary slices; the actual debit and benefit state use their actual slice duration.

AI selects policy from its own charge, local attack/defence proximity and restrictions. It uses the same capacity, rates, eligibility and actual-use accounting as the player; it never refills directly. Fuel/pace retain their existing resource mechanics. Legacy ERS slots remain inert NEUTRAL/zero in revision 2 and are validated as such, including frozen lap commands. Legacy v7/v8A controls remain accepted; revision-2 ERS mutations and legacy energy-policy mutations are rejected by the server.

## Persistence and public boundary

Configuration revision, energy, policy, remainders, entitlement, observed effects and pit routing persist in the existing progression JSON. No schema or migration is needed. Builder verification completed with 1008 offline tests (55 files), 263 real PostgreSQL tests (19 files), typecheck, lint, Prisma validate/generate, production build and diff checks. Historical migrations are untouched. Validation rejects mixed revisions, missing state, impossible pit phase/distance combinations, invalid observations and invalid energy values.

The public view whitelists current own energy/capacity/policy/aero/Overtake status. Rival charge, policy, qualification, valid-use/expiry laps, RNG, weather truth, future plans and integrator internals remain private. Neutral legacy own-command fields are retained only for the existing compatibility shape/concurrency token; the new UI renders separate assistance fields. Safe post-hoc causes are OVERTAKE_MODE, BOOST, TYRE and PACE. Legacy event labels remain available for historical races.

## Race-only readability

Pure responsive helpers preserve effective identity-glyph floors of 9px field / 10px player / 11px selected. Badges and bounded lateral packing scale accordingly; selected, both player cars and nearby context retain drawing priority. A tether connects displaced badges to their real anchor. Dense-field overlap is allowed rather than claiming perfect 22-car packing. Practice/Qualifying use their existing marker presentation. The timing panel stops sticking in the wide Race layout because it otherwise covers commands below the map.

Observed at a 390×844 viewport on Suzuka: map 341×187.2px, field badge 24.54×13.09px, player badge 27.27×14.54px, selected badge 30×16px. Glyphs measure 9/10/11px respectively; no horizontal overflow. Player notch and selected outline remain visible. No general shell/theme/navigation redesign was performed.

## Builder verification and limits

Permanent tests cover revision rejection, all 24 geometries, joins/service/wrap, actual pit transitions, same-clock detection, entitlement lifetime, restricted modes, integer/partial/zero energy, repeated Boost depletion, combined envelopes, AI fairness, public projection, responsive helpers and PostgreSQL command/reload boundaries. `race-v8a-postgres-main-save.json` was captured using exact starting-main source and a real disposable PostgreSQL career. Its completion digest is pinned (re-pinned by the v8B-R tie-break repair, see `race-v8b-r-determinism.md`), and its IDs are mapped to the integration career for repository round-trip/continuation. PostgreSQL JSONB key ordering is compared structurally after ID normalisation.

Seven targeted full-race executions, all 22 cars: Suzuka dry (53 laps), Monaco dry (78), Monza dry (53), Spa changing wet (44), Suzuka VSC (53), Suzuka SC (53), and a Monaco performance recheck (78). The first dry samples were 6.4–10.0 seconds. Precomputed zone intervals and allocation-free local-neighbour lookup reduced subsequent samples to 2.8–4.4 seconds, without touching the historical engine. The wet fixture initially lacked its matching forecast windows; it was corrected before execution. No Monte Carlo or acceptance campaign was run.

Production-build browser sanity used disposable PostgreSQL careers at Suzuka, Monaco and Monza. All showed 22 identities, pit transit, stationary service, exit/rejoin and separate assistance controls without DRS/legacy ERS labels. Boost saved and reduced energy; keyboard and pointer activation were checked. Pause/resume and speed selection were checked. Suzuka advanced from dry conditions to 46% rainfall at lap 8 and 7% track water at lap 9; current Aero/energy remained observable. Traditional Chinese labels and language persistence after reload were checked. A 390px screenshot is kept outside the repository in the Builder evidence directory.

Independent QA should prioritise late/wrapping detection windows, partial-energy boundaries, control transitions during a pit visit, replay from a partially drawn checkpoint, approximate pit geometry on crossing/compact circuits, dense mobile identity selection and older editable-database saves. Pit geometry remains approximate, Active Aero baseline tuning is conservative, and browser observations are focused sanity checks rather than acceptance.

Deferred: v8C dry specification/regulatory expansion and deep energy campaigns; v8D wet AI diversity, late-stop/tyre-cliff strategy and circuit pit-loss calibration; v8E and Phases 18/29/31; dynamic 2027/multi-season regulation work. No migration, balance campaign or final acceptance is included.

## Visual correction (Race viewer only)
- **Markers.** Race map cars are circular team-colour bubbles with the three-letter abbreviation inside.
  - The rectangular `driver-badge` remains only in the Practice / Qualifying maps.
  - The bubble holds a stable on-screen diameter whatever the map width: 26 px on desktop maps, 23 px tablet-width, 22 px phone-width (`raceBubbleScale`).
- **State cues** (not colour alone):
  - player cars: a white outer ring;
  - selected car: a heavier glowing ring;
  - lapped car: a dashed border, with the deficit in the accessible name;
  - pitting car: the same bubble on the pit route plus a small PIT tag;
  - retired cars: still removed from the authoritative map.
- **Dense packs.** Bubbles use five bounded lateral lanes (within 1.5 diameters). Partial overlap is accepted rather than moving cars away from their track position, and crossing branches stay separate (track progress, not screen distance). The anchor line appears only for an outer-lane bubble.
- **Layout.** From 1221 px the Race page is a three-column dashboard: timing tower | track map | selected-driver management (240/1fr/310, and 290/1fr/360 from 1600 px). This replaces the v8A two-column grid that pushed the driver panel full-width under the map and stretched resource bars across the page. Resource bars and Active Aero / Overtake / Boost controls stay inside the management column, and mode buttons wrap within it. Tablet and phone widths keep the existing stacked layout.

## v8B-R
- **Persisted determinism:** an exact on-track distance tie now resolves by classification instead of entrant-ID text.
  The root cause, the compatibility impact and the PostgreSQL round-trip coverage are in `race-v8b-r-determinism.md`.
- **Circuit and pit-lane fidelity:** audited in `circuit-geometry-sources.md`. Pit lanes are still the generic
  placeholder: authoring them is blocked on reference access and a licence decision recorded there.

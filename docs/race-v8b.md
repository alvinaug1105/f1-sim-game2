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

Independent QA should prioritise late/wrapping detection windows, partial-energy boundaries, control transitions during a pit visit, replay from a partially drawn checkpoint, approximate pit geometry on crossing/compact circuits, dense mobile identity selection and older editable-database saves. Pit lanes are FIA-referenced but drawn wider than true scale, Active Aero baseline tuning is conservative, and browser observations are focused sanity checks rather than acceptance.

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
- **Dense packs.** Superseded by the final repair below: markers are no longer fanned out into lateral lanes and there is no anchor line.
- **Layout.** From 1221 px the Race page is a three-column dashboard: timing tower | track map | selected-driver management (240/1fr/310, and 290/1fr/360 from 1600 px). This replaces the v8A two-column grid that pushed the driver panel full-width under the map and stretched resource bars across the page. Resource bars and Active Aero / Overtake / Boost controls stay inside the management column, and mode buttons wrap within it. Tablet and phone widths keep the existing stacked layout.

## v8B-R and final fidelity repair
- **Determinism (versioned):** revision 1 keeps the frozen historical tie rule, so accepted v8A saves continue exactly
  as before and the original digest is restored. Revision 2 resolves exact ties by classification, never by ID text.
  Details: `race-v8b-r-determinism.md`.
- **Circuits:** all 24 production circuits were checked against the official FIA circuit map and pit-lane drawing; see
  `circuit-geometry-sources.md`. Revision-2 Races freeze authored per-circuit pit progress anchors (entry, lane start,
  service, exit). The drawn lane is separate presentation content (`circuit-pit-lanes.ts`) that the client
  re-parameterises by the Race's own anchors. Race content no longer carries x/y.
- **Frozen metadata:** segment kinds are explicit data (`circuit-race-metadata.ts`), so map corrections cannot retune
  the Race. Monaco and Silverstone had their lap line moved onto the FIA control-line straight by whole segments, with
  every zone kept on the same track.
- **Map:**
  - compact chequered start/finish line with no text label;
  - slim muted pit lane with a garage tick;
  - phone-width maps rotate strip-like circuits rigidly (data-driven, at most ±90°) and may grow to a portrait canvas.
    Monza at 390 px goes from 356×155 to about 356×436.

## Final repair: Codex findings and Race map polish
Display-only. No simulation, timing, zone, pit-anchor or balance change. The v8A digest `b9f931f9…` is unchanged.

### Codex findings
- **V8B-MED-001 (Miami pit-lane clearance):** presentation route only; see `circuit-geometry-sources.md`. Minimum
  full-lane clearance went from 0.0119 to 0.0259 of the map; the 0.5-lane-unit (0.013) threshold is unchanged.
- **V8B-MED-002 (pit-phase fixtures):** `tests/helpers/pit-phase.ts` derives ENTRY / LANE / SERVICE / EXIT distances
  from the Race's own frozen anchors (midpoint of the entry road, midpoint of lane-start → service, exactly service,
  midpoint of lap line → exit on the following lap). The PostgreSQL reload test uses it instead of fixed distances, and a
  pure test checks all four phases on every circuit against unchanged authoritative validation.
- **V8B-LOW-001 (hydration mismatch):**
  - **Root cause:** Node 22 (server) and Chromium (client) V8 builds can return different last-ulp results for
    `Math.sin` / `Math.cos` (measured: about 3 % of sampled inputs). `normalizeCircuitPoints` rotates layout points
    with them, so the server and the browser can compute coordinates that differ in their final digits. The SVG
    attributes were printed at full precision, so React saw different strings. Measured on the production layouts, only
    Madrid differed (20 of 624 strings).
  - **Fix:** a display-only boundary, `race-map-style.ts`. `svgNumber` / `svgPath` print every server-rendered map
    number rounded to 0.01 viewBox units (far below one screen pixel), so both sides print the same string. No
    `suppressHydrationWarning`; the simulation and stored geometry are untouched.

### Race map presentation
- **Markers sit on the track.** Each bubble is drawn exactly at its authoritative route sample: the main-track sample
  or, for a car in the pit, the pit-route sample.
  - Bubbles may overlap. No car is pushed off the track to avoid another.
  - There is no lateral fan-out, no tether line and no cluster counter.
  - The only lateral term is the lap-0 two-by-two grid, clamped to 0.6 of the drawn track half-width.
  - Crossing branches cannot repel each other, because nothing is repelled.
  - The Practice / Qualifying `MarkerPacks` are unchanged.
- **Priority by draw order** (`raceDrawOrder`), bottom to top:
  1. retired cars;
  2. the field, back of the classification first, so the car leading a pack is on top;
  3. the player's cars;
  4. the selected car.
- **Track** (sized from the bubble diameter D, `raceTrackStyle`):
  - dark casing 0.66 D;
  - light edge band 0.46 D, with a darker surface inside it (the edge turns amber under Safety Car / VSC as a
    supplementary cue, and `data-control` carries the state);
  - the background grid and dashed centre line are removed from the Race map.
  A centred bubble therefore reads as a car on a road at every map size.
- **Pit lane:** drawn first, so the racing line overlays its joins. Casing 0.30 D, surface 0.16 D, plus a garage
  circle: secondary, but visibly connected.
- **Start/finish:** a compact chequered strip across the track (1.25 × the casing long), with no text label.
- **Fitting:**
  - one uniform scale over the circuit plus the pit lane;
  - the canvas padding fits a selected bubble plus its ring (`raceMapPadding`), so no marker is clamped away from its
    route;
  - rigid compact rotation (Monza) is unchanged.
- **Motion:** the single RAF loop and authoritative interpolation are unchanged. The Race loop no longer runs a packing
  pass, so it stops as soon as interpolation settles.
- **References:** see `race-v8b-map-reference-study.md`. Only principles were taken; no code, assets or coordinates.

### Permanent tests (for independent QA)
- **`tests/circuit-geometry.test.ts`:** Miami clearance, with the anchors pinned; all 24 lanes keep the existing
  threshold.
- **`tests/race-v8b.test.ts`:** phase fixtures derived from the anchors, on every circuit.
- **`tests/race-v8b.integration.test.ts`:** the PostgreSQL reload per phase uses the derived fixtures.
- **`tests/race-map-presentation.test.tsx`:**
  - canonical numbers and ulp invariance;
  - identical SSR markup for a layout perturbed by one ulp;
  - at most two decimals in every geometry attribute;
  - in a lap-1 pack and a Safety Car train, every marker is exactly on its route sample (overlap present; no tether,
    badge or cluster);
  - the grid lateral is clamped inside the corridor;
  - Suzuka crossover branches do not repel;
  - TRACK vs PIT route separation;
  - the draw order.
- **`tests/race-v8b-visual.test.tsx` / `tests/race-v8-map.test.tsx`:** circular markers, rings, lapped and pit cues; the
  pit-car transform uses canonical numbers.
- **Aspect ratio and rigid rotation:** `tests/circuit-geometry.test.ts`.

## Responsive marker repair (V8A-MED-001)
- **Root cause.** Bubble size was derived from rendered width ÷ viewBox width. The map uses the default
  `preserveAspectRatio` (xMidYMid meet), so the browser applies one uniform scale: the smaller of the width and height
  ratios.
  - Just below 600 px, the phone layout gives a portrait viewBox (Monza 1000 × 1217) inside a box capped at 460 px high
    (565 × 460).
  - That box is height-limited: the real scale is 0.378, while the width ratio is 0.565.
  - Bubbles therefore rendered at 23 × 0.378 / 0.565 ≈ 15.4 px, with 6 px labels, against 22 px / 9 px at 601 px.
  - `getScreenCTM().a` confirmed 0.378 in Chromium.
- **Fix.**
  - The map measures `effectiveSvgScale(box, viewBox) = min(width ratio, height ratio)`. The size class (26 / 23 /
    22 px) follows the drawn map width, i.e. effective scale × 1000.
  - `nextScreenScale` ignores re-measurements under 0.5 %. A bubble-size change moves the canvas padding, and so the
    viewBox height, by a few units; this guard keeps that feedback from ever cycling.
  - Canvas padding now covers the selected ring's outer stroke edge: ⌈(r + 7) × scale⌉.
  - Screen scale stays client-only. The server still renders at scale 1 with canonical numbers, so hydration is
    unaffected.
- **Builder measurements (development inspection, not QA):** Monza at 599 px renders 21.99 px bubbles with 9 px labels
  (before: 15.42 / 6). Widths of 390, 601, 768 and 1440 px are unchanged at 22 / 22 / 23 / 26 px.
- **Tests:** `tests/race-marker-scale.test.ts`:
  - cases A–D;
  - no cliff across 600 px;
  - ring vs padding;
  - feedback convergence for all 24 circuits.

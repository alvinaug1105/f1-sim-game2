# Race v8B: circuit map reference study

This study was done for the Race v8B final repair. It looks at how open-source F1 replay and telemetry projects draw a
live circuit map, and what we learned from them.

**What we took:** only design principles, re-expressed in our own words and code.

**What we did not take:** any code, styles, assets, fonts, colours specific to a project, or circuit coordinate data.
- Our circuit geometry stays the pinned, provenance-recorded set (`circuit-geometry-provenance.md`).
- Our pit lanes stay our own FIA-referenced authoring (`circuit-geometry-sources.md`).

**Licences:**

| Repository | Licence | Consequence |
|---|---|---|
| matteocelani/f1-telemetry | MIT | ideas only |
| mricero/F1-Telemetry-Dashboard | MIT | ideas only |
| tdjsnelling/monaco | GPL-3.0 | nothing that could be a derived work |
| sydubaid/gp-replay | no licence file (all rights reserved) | ideas only |
| adn8naiagent/F1ReplayTiming | no licence file (all rights reserved) | ideas only |
| i-ares/open-f1 | no licence file (all rights reserved) | ideas only |
| Zimal-Fatemah/F1-RACEREPLAY | no licence file (all rights reserved) | ideas only |

The repositories were shallow-cloned into a scratch directory outside this repository and read only. Nothing from them
is in this repository.

| Repository (revision studied) | What was studied | Useful principle | What was NOT copied | Application in our implementation |
|---|---|---|---|---|
| matteocelani/f1-telemetry (`5b98989`, MIT) | SVG track map component: track stroke and halo, driver dots, selection, animation loop | Thin track with a dark halo reads as a road; drivers are not collision-avoided and simply sit on the line; the selected driver is emphasised; motion is written to DOM refs from a RAF loop, not through React renders; uniform fit (`preserveAspectRatio` meet); track-status colour tint | Component code, stroke values, colours, any data | Markers sit exactly on their route sample, overlap allowed (`anchorRaceMarker`). Two-tone track with casing (`raceTrackStyle`). Amber edge under SC / VSC as a secondary cue. The existing single RAF loop is kept. |
| sydubaid/gp-replay (`5b09a6a`, no licence) | Track and marker sizing, selection ring, transition timing | Track widths and marker radius are set relative to each other (and to the map span), so the proportions hold at any size; selected marker has a ring | Code, the specific ratios, styles | Every track, pit-lane and start-line width is derived from the rendered bubble diameter. The proportions are our own, chosen so a bubble reads as a car on the road (casing 0.66 D). |
| adn8naiagent/F1ReplayTiming (`0a93d68`, no licence) | Canvas map: device-pixel-ratio handling, per-circuit rotation, dot size vs track width, interpolation window | Dots drawn inside the track width; rotation per circuit for best fit; interpolation spans slightly longer than the data cadence for continuous motion | Canvas code, rotation tables, timing constants, any coordinates | Confirms the "inside the road" ratio. Our rigid compact rotation (data-driven, at most ±90°) is unchanged. Motion stays our authoritative-checkpoint interpolation (`RaceMotion`), with no extrapolation. |
| i-ares/open-f1 (`fc8dce7`, no licence) | Canvas live map, hover / nearest-car picking, pit state | A pit state is shown on the same marker, not a different object; picking is by the nearest car, not by layout | Code, assets | The same circular bubble is kept in the pit with a PIT tag, placed on the pit route. Picking stays per SVG element, with keyboard access (`role="button"`). |
| tdjsnelling/monaco (`cc51ac7`, GPL-3.0) | Map stroke sizing from extent, track-status colour, perpendicular start line, car ordering, pit handling | Draw cars in race order so the front of a group is visible; the start line is a short perpendicular mark; pit cars are de-emphasised; track status tints the track | Nothing (GPL-3.0): no code, no structure, no values | Our own `raceDrawOrder`: retired → field back-to-front → player → selected. A compact chequered strip across the track, with no text. Our pit lane is drawn as a secondary layer under the racing line. |
| mricero/F1-Telemetry-Dashboard (`72d05ee`, MIT) | Python SVG track rendering: rotation and fit, two-stroke track | Rigid rotation followed by one uniform scale on both axes; a two-stroke track (dark outer, lighter inner) | Code, stroke values, data | Uniform projection over the circuit plus the pit lane (unchanged, and tested for aspect ratio and rigid rotation). Our three-layer track: casing, edge band, surface. |
| Zimal-Fatemah/F1-RACEREPLAY (`e6a8f2d`, no licence) | 3D replay with a follow camera | Not applicable to a 2D overview map; nothing adopted | Everything | None. |

## Decisions that followed
1. **Overlap is allowed.** No studied project pushes markers away from the track to separate them. We removed the
   Race lateral fan-out and the tether line. Draw order carries priority, so the selected and player cars stay on top.
2. **Track proportions from the marker size.** Each project picks its track width relative to its marker. We derive ours
   from the bubble diameter. A bubble therefore covers the road (it does not float beside it), and a pack reads as cars
   on one road.
3. **Quiet background.** The grid pattern and the dashed centre line are dropped from the Race map. The circuit, pit
   lane and cars are the only content.
4. **Pit lane secondary but connected.** It is drawn under the racing line at about a third of the casing width, with
   a garage marker.
5. **Deterministic output.** Display numbers are canonical, so the server and the browser render the same markup (see
   `race-v8b.md`, V8B-LOW-001).

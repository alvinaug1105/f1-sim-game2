# UIX-B — TRACK VIEWER 2.0
## CODEX BUILDER IMPLEMENTATION HANDOFF

### Role

CODEX ACTED AS BUILDER. CODEX TESTER remains separate. This is an implementation handoff for Project Lead visual review, not independent acceptance.

### Starting Commit

`8f9a9afc0c2485d3350330ff25a9f0ae88c0d58e`

### Final Commit

The full final SHA is recorded in the delivery message and exported handoff. Check out the pushed commit containing this report; no history was rewritten.

### Branch

`claude/uix-b-race-experience`

### Initial Circuit Map Diagnosis

The source curves already preserved recognizable proportions and racing order. The principal problems were the short-laptop grid allocation, limited map height, marker weight and a lack of venue context or camera controls. A historical stress-fixture screenshot shows a shallow map competing with the timing and strategy columns. No verified circuit-coordinate defect was found or repaired. Historical before screenshots are labelled separately; they are not a fresh replay of the starting SHA.

### Track Viewer 2.0 Architecture

Layer A contains the existing route samples, refined track/pit strokes, start line and vehicle anchors. Layer B renders a separate optional geographic environment profile beneath them. Layer C supplies static, quiet ground shading and original footprint shadows. `TrackMap` owns the existing motion timeline plus a separate ephemeral camera. Pure camera, label-placement and geographic-frame helpers keep these concerns separate. `TrackContext` reuses public timing rows; `RaceOperations` integrates the viewer with existing strategy, driver selection and panes.

### Real Circuit Geometry Preservation

All 24 raw paths, normalized layouts, start offsets, point order, direction, progression metadata and pit routes remain unchanged. Environment features use the track's geographic frame and exact phone companion transform. Final screen fitting uses one scale on both axes. No source geometry was moved to accommodate scenery. Existing two-by-two grid presentation and motion separation are retained.

### Environmental Research

Suzuka, Monaco, Silverstone and Spa use official venue references for identity and selected OSM footprints for placement. Singapore was researched but remains fallback. See [the complete source, license and placement ledger](track-viewer-2-environment-provenance.md). All 29 incorporated features carry source URL/version, factual reference, data type, license, confidence, approximation and review date. Coordinates are community mapped, not certified survey geometry. Copyrighted venue maps were reference material only.

### Environment Profiles Implemented

- Suzuka: pit building, V1/V2 main grandstands, Circuit Wheel, two woodland polygons.
- Monaco: Port Hercule water boundary plus twelve unnamed urban footprints.
- Silverstone: Wing, Hamilton Straight A grandstand, International Paddock, trackside hotel.
- Spa: F1 pit building, F1 grandstand, Raidillon grandstand, three woodland polygons.

The 29 exact OSM identities and detail levels are listed in the provenance ledger. No additional landmarks are implied by generic roof styling.

### OpenArt Model Evaluation

GPT Image 2.5 Sunburst, Nano Banana 2.1 and Seedream 5 Pro were considered using the available catalog and generation controls. Sunburst was selected for three interface/camera studies; Nano Banana for one forest-context comparison. The inspected Sunburst outputs supplied the clearer marker/camera hierarchy, while the Nano Banana output supported restrained forest masses. Their geography and malformed labels were rejected as factual inputs. No generated bitmap is a production asset.

### OpenArt Generations

| Study | History ID | Model / settings | Images | Quoted credits |
| --- | --- | --- | ---: | ---: |
| Suzuka overview | `JwpJarRyGWcKjUVi1ywZ` | Sunburst, high, 2K, 16:9 | 1 | 170 |
| Monaco overview | `f2iZPiP6JUzJe9jYxpkh` | Sunburst, high, 2K, 16:9 | 1 | 170 |
| Spa overview | `zm6QBZFz3QY0UO7SdYdQ` | Nano Banana 2.1, default, 4K, 16:9 | 1 | 78 |
| Driver focus | `UyvItLGffk20TwGwuksk` | Sunburst, high, 2K, 4:3 | 1 | 150 |

Four images; total balance reduction **568 credits**, 2422 → 1854. Individual quoted costs sum to that reduction; status responses did not expose per-image billed fields. Full prompts/settings are in [OpenArt studies](track-viewer-2-openart-studies.json).

### OpenArt Viewability

All four actual generated images were inspected from the user's uploaded originals on 2026-10-08. That cleared the earlier CDN viewability blocker. Selection was based on actual pixels, not tool completion metadata. Generated circuit shapes, landmark placement, invented labels and telemetry were not adopted.

### Selected Visual Direction

Deep-ink terrain, quiet sourced silhouettes, layered asphalt, restrained edge depth and small team-colour field dots extend Paddock Hybrid. Amber identifies the selected driver through both colour and a ring/tick shape. The second managed car keeps a white ring and priority label. Scenery remains beneath race information and can be removed.

### Track Surface and Pit Lane

The track uses a dark shadow/casing, fine lighter edge and asphalt surface. Pit lanes retain their original routes with a distinct muted blue surface and the existing service anchor. The compact chequered start line stays at the existing offset. Stroke widths and marker glyphs compensate for camera zoom; route samples never change. SC/VSC edges provide a supplementary amber cue alongside existing textual race control.

### Overview Camera

Stable default overview; no automatic panning. Complete circuit and pit framing uses the existing aspect-aware canvas with sufficient padding for own/selected rings. Scenery toggling does not reframe the circuit.

### Driver Focus Camera

Focus targets the selected car's current visual route sample at 2.4×, with bounded, smoothed centre movement. It does not generate progress or extrapolate beyond checkpoints. Reduce Motion applies the camera target immediately. Unavailable/retired selections recover overview rather than inventing a location.

### Pan / Zoom / Reset

Native labelled buttons provide zoom, four pan directions, Overview and Reset. Zoom is bounded to 1–4×; centre bounds keep framing recoverable. Mouse background drag is available above 1×, excluding car targets. Touch retains native vertical page scroll and pinch behavior; no drag capture or wheel requirement. Buttons provide an alternative to dragging. Keyboard pan/reset and mouse drag were exercised.

### Vehicle Markers

AI cars use quiet route-anchored dots. Managed cars have white rings; selected cars add amber rings and corner ticks. Selected then own-car callouts receive collision-aware placement; competitors remain identifiable through accessible SVG names, timing and Car identities. Callouts may be omitted when they cannot fit. Actual anchors are never spread apart. Genuine overlap produces a disclosure cue. Existing public pit routes remain distinct, lapped cars have a dashed cue, retired v8 cars are omitted from the map and remain selectable through the list/context.

### Strategic Context

The compact footer shows public position, compound, status, route/pending own pit request, and classification-neighbour intervals from `battleContext`. Driver controls returns to the existing strategy panel. The identity list supports keyboard selection and Escape focus return. No prediction, hidden fuel model, private commands, incident coordinate or new server field was exposed.

### Environment Detail Levels

LOW retains a principal footprint or harbour boundary. MEDIUM adds selected grandstands/forest and simple roof depth. HIGH adds secondary buildings, woodland and grandstand edge detail. Thresholds use actual uniformly fitted drawable size: MEDIUM ≥520×280, HIGH ≥900×440 CSS pixels. Hidden/zero-size maps use LOW. Environment OFF removes sourced scenery while preserving route, markers and all race information.

### Short Laptop Layout

Short desktop viewports automatically use an enlarged two-column track/strategy layout with a **440px** canvas. Timing is available through Show timing / Close timing; Escape returns focus to its trigger. Restore workspace returns the timing column, and Enlarge track can reopen the larger view. Existing driver switching, command panel and pinned pit controls remain available. The workspace permits vertical scrolling rather than compressing the circuit into a 174–216px strip.

### Standard Desktop

Timing, map and strategy retain a connected three-column workspace. Measured canvases are 360–432px high, with quiet medium detail. Camera tools and compact context sit outside the drawable region.

### QHD / 4K

Measured canvases are 576/700px high. Foundation typography and bounded workspace sizing remain intact; sourced profiles reach HIGH detail when their drawable area qualifies. No viewport-based assumption replaces the actual size measurement.

### Ultrawide

Extra width separates the event feed into a fourth column, retaining timing and strategy around a wider, uniformly fitted track. Canvas measurements are 1138×432 and 1442×622. No coordinate stretching is introduced.

### Tablet

The existing pane switch supplies a dedicated Track pane, with 422–649px canvases and 44px camera/control targets. Own-driver cards scroll normally in Track mode instead of obscuring the circuit. Driver controls returns to Strategy.

### Mobile

The existing Track pane uses a portrait-oriented companion transform and 448–538px canvases, LOW environment detail, wrapping camera tools and a compact context footer. Car list/selection, Overview, Reset and strategy access remain available. Touch page scrolling is preserved. Native input scrolling and a 390px Traditional Chinese strategy return were exercised; physical touch-device QA remains independent work.

### Circuit Geometry Review

Actual rendered Suzuka, Albert Park, Monaco, Silverstone, Spa, Singapore/Marina Bay and Monza were reviewed. [Circuit screenshots and DOM measurements](screens/track-viewer-2/circuits.json) include uniform viewBox fit, actual canvas dimensions and unobstructed canvas/caption/context order. Suzuka retains its crossover; wheel and grandstands use mapped coordinates, not generated-image placement. Monaco harbour context remains secondary; woodland distinguishes Spa. Three unsourced representative venues demonstrate the clean fallback.

### 24-Circuit Compatibility

The new suite renders all **24** production circuits with **22** markers, verifies finite output and unchanged layout input, and permits absent profiles. Existing all-circuit uniform-projection tests also pass. Four profiles are present; twenty venues retain fallback scenery. This does not claim a manual geographic audit of all 24 tracks.

### Responsive Matrix

All measurements below are CSS pixels. Each overview was inspected in the browser; the canvas is above its caption/context, the full circuit fits uniformly, controls remain available and no document horizontal overflow was measured. Selected-ring sizes are approximately 20–24px at ordinary viewport widths, remaining independent of camera zoom. Dense dots may overlap truthfully; callout priority, camera zoom and identity list provide access. Screenshots may be scrolled to the track within the workspace. No remaining major clipping issue was observed in these samples; this is Builder evidence rather than screen-matrix acceptance.

| Viewport | Canvas | Detail | Fit / overflow | Camera / markers | Major issue |
| --- | --- | --- | --- | --- | --- |
| 1220×720 | 677×440 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 1280×720 | 722×440 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 1366×768 | 779×440 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 1440×900 | 587×360 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 1536×864 | 636×360 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 1600×900 | 669×360 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 1920×1080 | 824×432 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 2560×1440 | 1238×576 | HIGH | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 3840×2160 | 1592×700 | HIGH | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 2560×1080 | 1138×432 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 3440×1440 | 1442×622 | HIGH | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 1180×820 | 1057×451 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 1024×768 | 901×422 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 820×1180 | 773×649 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 768×1024 | 721×563 | MEDIUM | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 540×960 | 505×538 | LOW | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 430×932 | 395×522 | LOW | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 390×844 | 355×473 | LOW | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 375×812 | 340×455 | LOW | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |
| 360×800 | 325×448 | LOW | Uniform; no horizontal overflow | Tools available; own/selected rings | None observed; vertical workspace scroll permitted |

Full bounds, selected-ring dimensions and screenshots: [matrix.json](screens/track-viewer-2/matrix.json).

### EN / ZH-Hant

New interface text is centralized in the existing English and `zh-TW` catalogs. Existing Intl formatting supplies numbers/intervals. Traditional Chinese camera/context rendering passes automated checks; desktop and phone screenshots were reviewed. Changing locale and refreshing preserved the language preference. Entity names and internal IDs remain game data.

### Accessibility

The accepted UIXB-A11Y-001 announcement continuity and UIXB-A11Y-002 Practice keyboard-tab fixes are unchanged and their focused suite passes. Camera/identity controls have native button semantics, labels, pressed/expanded state and visible focus. Selection adds a shape cue. Scenery is noninteractive and aria-hidden. Escape restores disclosure/timing focus. Reduced Motion is respected. No formal assistive-technology matrix was performed.

### Performance Considerations

One existing RAF loop advances all markers and the camera; React does not render each animation frame. Environment coordinates are transformed once, static SVG rendering is memoized, labels/camera update imperatively, and ResizeObserver updates size/detail only on geometry/resize. Paused maps sleep when no motion/camera work remains. HIGH-profile scenery is at most 50 SVG descendants in sampled venues. One 22-car 8× replay sample reported about 0.22ms mean frame work; this is a local development observation, not a performance benchmark. No WebGL, external runtime map API or new package was added.

### Files Changed

- `src/features/race/viewer/track-map.tsx` — integrated camera, scene layers and callouts while retaining motion/anchors.
- `src/features/race/viewer/operations.tsx` — public context, environment companion transform and enlarged-layout controls.
- New viewer helpers/components: `track-camera.ts`, `track-camera-controls.tsx`, `track-labels.ts`, `track-context.tsx`, `environment-geometry.ts`, `track-environment.tsx`, `environment-data.json`.
- `src/styles/track-viewer.css`, `src/app/globals.css` — scoped viewer layout/styles and stylesheet import.
- English/Traditional Chinese message catalogs.
- `tests/track-viewer-2.test.tsx` plus provenance, OpenArt and screenshot evidence documents.

### Components Added / Refactored

TrackCameraControls, TrackContext, TrackEnvironmentLayer; pure camera/frame/label helpers; presentation integration in TrackMap and RaceOperations. Existing motion, progression, source layouts and command/controller modules were not modified.

### Tests Added

**35 new tests** cover camera bounds/recovery, reduced smoothing, label collision without anchor displacement, paused camera/environment/geometry changes, 8× monotonic continuity through focus/pause/resize/reset, source-frame equivalence, exact companion transforms, provenance/detail thresholds, all 24 circuit renderings, classic Practice/Qualifying separation and Traditional Chinese strings.

### Builder Visual Review

Evidence folder: [screens/track-viewer-2](screens/track-viewer-2/README.md). Before references: `before-historical-1280-en.jpg`, `before-historical-1920-en.jpg` (historical UIX-B fixtures, not identical state comparisons). After: twenty `race-WIDTHxHEIGHT-en.jpg` captures, seven `circuit-*.jpg` captures, `race-1920x1080-zh.jpg`, `race-390x844-zh.jpg`, focused/reduced/replay and timing-disclosure captures.

State coverage: start lap 0, early lap 1, mid lap 16, late lap 49, both managed cars, 22 active cars, dense pack, pending pit request, ENTRY/SERVICE/EXIT, SC, VSC, wet conditions, one retired car, one lapped car and Sprint. `states.json` records these **safe presentation fixtures**. Start/early/mid/late/wet/Sprint use the real existing engine to produce public server-side projections; SC/VSC/dense/retired/lapped/pit-phase variants adjust only the disposable fixture before projection and are not physics validation. No fixture is written to a save or shipped as a route.

The separate Builder replay passes twenty real engine checkpoints through the existing public projection, then replays those committed samples through TrackMap at 8×. Focus, pause, keyboard pan/zoom, mouse background drag, scenery removal, reduced motion and exact overview reset were inspected. Main RaceOperations preferences also exercised 8×, Auto Pause OFF and Reduced Motion ON. This is animation/presentation evidence, **not real save-backed server-command validation**. Independent Tester/Beta should verify live polling, actual pit transitions and commands in a normal career.

### Gameplay / Simulation Changes

**NONE.** Race v8 engine, gameplay contracts, timing, progress, pit mechanics, weather, rules, RNG, persistence and command APIs are unchanged. Language and camera settings affect presentation only.

### Backend / DB Changes

**NONE.** Schema changed: no. Migration added: no. Historical migrations changed: no. Safe public projection unchanged. No database was provisioned or written for this task.

### Builder Checks

**BUILDER-SIDE ONLY.** Commands actually run on the final implementation:

```text
npm run typecheck
npm run lint
npx vitest run tests/track-viewer-2.test.tsx tests/race-map-presentation.test.tsx tests/race-map-continuity.test.tsx tests/race-v8-map.test.tsx tests/viewer-markers.test.tsx tests/uix-b-accessibility.test.tsx tests/viewer-live-motion.test.ts tests/viewer-motion.test.ts
npm run build
git diff --check
```

Typecheck, lint and production build completed successfully. **8 focused files / 158 tests passed**, including 35 new tests. No full offline/DB campaign was run; no DB check is needed for the unchanged schema. Initial new-test failures were fixture assertions (reset settling time, provenance property, draw-order indexing) and were corrected. Stale generated dev types initially blocked typecheck/build after deleting the temporary route; archiving that generated cache resolved it. An earlier Turbopack dev HMR failure was recovered by restarting the temporary preview with the supported webpack flag. Production Turbopack build succeeds.

### Known Risks

Independent QA should prioritize live 8× checkpoint/pit transitions with camera focus, dense-field hit targets and label omission near map edges, resize/camera recovery, short-laptop timing overlay/strategy scroll, phone touch behavior, and factual landmark relationships. The OSM footprints and stylized roof/wheel sizes are approximate. Closed harbour-water geometry is approximate at the mouth. Static fixtures do not establish gameplay acceptance or long-running browser performance.

### Deferred Environment Profiles

Albert Park, Shanghai, Bahrain, Jeddah, Miami, Barcelona, Montreal, Spielberg, Hungaroring, Zandvoort, Monza, Baku, Marina Bay, Austin, Mexico City, Interlagos, Las Vegas, Lusail, Yas Marina and Madrid retain clean fallback scenery. Future profile additions require verified placement/provenance. No new roadmap phase began.

### Git Status

Candidate is committed and pushed on the assigned branch; working tree clean; no merge. Temporary preview routes, obsolete captures, generated agent files and cache probes are outside the repository. See delivery for exact full SHA and pushed-remote confirmation.

### Final Builder Status

UIX-B TRACK VIEWER 2.0 COMPLETE — READY FOR PROJECT LEAD VISUAL REVIEW

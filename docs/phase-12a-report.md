# Phase 12A — Real circuit geometry and smooth race movement

Implemented and locally verified on 2026-09-24. This delivery stops at Phase 12A. It preserves the existing Race operations page and deterministic v7 application flow.

## Geometry

Albert Park and Suzuka now use real coordinate centrelines from Tomislav Bacinger's MIT-licensed `f1-circuits` dataset, pinned to a specific revision. Both raw files and the licence are included. Albert Park retains 145 unique vertices; Suzuka retains 171 and its figure-eight crossing. See [the complete source, hashes and transformation record](circuit-geometry-provenance.md).

Longitude/latitude is projected locally with longitude latitude correction, rotated only for Albert Park, and uniformly normalized. The SVG uses another uniform fit, preserving proportions at every screen size. A cumulative arc-length table handles the closed path with binary-search sampling. There are no map image overlays or official branding assets.

Lookup continues through source circuit UUIDs ending `300` and `301`. Display names and historical content keys do not affect it. Unknown/custom source IDs retain the generic fallback.

## Movement

- `RaceMotion` holds unwrapped visual progress, e.g. `12.98 → 13.03`. Only the final path lookup wraps it.
- Each committed newer lap reconciles from the **last drawn** position. Same-lap command/selection/locale renders do not reset progress. Older checkpoints, reversed frame timestamps and regressive targets cannot send a marker backwards.
- One shared RAF updates all car and label transforms. Path lengths are precomputed. React does not update state or rerender the page per frame; stable initial transform props prevent checkpoint rerenders from snapping DOM markers to their targets.
- Pause freezes the renderer and request scheduler. A response already in flight can still persist, but its map target waits until resume. Resume does not include elapsed paused wall time. Refresh reconstructs the authoritative saved checkpoint and stays paused.
- Speed changes preserve current position and rescale remaining visual time. Motion includes bounded observed save latency, reducing checkpoint-boundary stops. Strategic advance uses an 8× presentation cadence and retains its existing event/20-checkpoint stopping rules.
- Overtakes are transitions between authoritative progress targets. Timing order updates immediately from the saved result while markers close, cross and separate along the path. The renderer never creates a pass or sorts simulation state from coordinates.
- Close packs use small, identity-stable lateral lanes, at most 10 SVG units from the centreline. Twenty separate abbreviation labels avoid overlap where practical and link to their cars. These offsets never change progress or classification.
- Pit cars remain on the main path with a `PIT` indication. Reliable pit-lane coordinates were not supplied by this dataset; no inaccurate substitute is presented as real.
- SC and VSC use slower presentation intervals (1.8× and 1.4× the normal checkpoint interval). Relative gaps and progressive SC compression come from the saved checkpoints, without new neutralisation rules.
- Retirement freezes the last drawn track position and its lateral offset. The timing tower uses the authoritative retirement/classification. Finished races disable advance/commands, settle their final available checkpoint once, and then stop the RAF loop.
- OS reduced-motion preference and the existing local checkbox use checkpoint updates. Neither affects engine inputs, results or persistence.

## Regression results

| Check | Result |
| --- | --- |
| `npx prisma format` | Passed; schema remained byte-identical |
| `npx prisma validate` | Passed |
| `npx prisma generate` | Passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero lint warnings |
| `npm test` | **443 passed, 19 files** |
| `npm run test:db` | **184 passed, 10 files; actual SQL execution** |
| `npm run build` | Passed; optimized Next.js production build |

The PostgreSQL run used existing local Homebrew PostgreSQL 18 on port 5432 and the disposable database `formula_phase12a_verify_20260924`. All ten checked-in migrations applied successfully. Integration suites created/cleaned unique schemas, seeded real data and exercised constraints/repositories. No production database was touched or provisioned. The disposable database was dropped and the local preview stopped after verification.

The retained full-state PostgreSQL regression executed the same frozen v7 race and command schedule through the actual application services at 1× and 8×, reopened the persisted result, and compared the **entire saved state exactly**. It passed. Delay assertions now also account for presentation-only SC/VSC cadence. Offline tests additionally cover start/finish wrapping, mid-transition replacement, speed changes, pause/in-flight response/resume, strategic and automatic pause, retirement, reduced motion, stale frames, latency, geometry validity, source-ID lookup and preference isolation.

## Browser verification

Browser: Codex in-app Chromium browser on local macOS. Real PostgreSQL careers contained **20 drivers**: the four bundled drivers plus sixteen clearly named test drivers on disposable test teams. They were not added to the development seed or shipped game content.

Both circuits were inspected at **1440×1000, 1024×900 and 768×1024**. Initial live checks used the development server; the final functional and responsive checks used the production build. Screenshots of the final production build are linked below.

| Scenario | Actual result |
| --- | --- |
| Albert Park shape | Revised real centreline, same proportions across all three sizes |
| Suzuka shape | Figure-eight, Esses and western loop retained; no reflected axes |
| 20 moving cars | All twenty progressed in successive live browser samples on both circuits |
| 1×, 4× and 8× | Exercised on both circuits; markers followed the path with forward unwrapped progress |
| Rapid speed/driver/language changes | No observed backward progress or reset; final-build ID-by-ID comparison confirmed continuity |
| Path adherence | Independently sampled the rendered polyline from live DOM data; all 20 markers within 10.000000000000126 SVG units, matching the permitted lateral offset |
| Pause | Every marker's progress/transform remained exactly equal across observations, including preference changes |
| Refresh | Loaded the saved lap paused; Traditional Chinese preference survived refresh |
| Persistence isolation | Entire PostgreSQL state JSON before/after paused preference/refresh checks was byte-identical |
| Pit | Actual Antonelli Hard stop at Albert Park lap 54; `PIT` label and pit auto-pause confirmed |
| SC | Controlled persisted SC period at Suzuka, 20 moving cars; authoritative last-car gap fell from 306.113 s at lap 41 to 144.890 s at lap 47 |
| VSC | Controlled persisted VSC period; slower motion/DRS suspension and saved gap presentation checked |
| Retirement | Controlled mechanical-retirement fixture that retired the whole field, so all twenty markers stayed at their previous drawn transforms, including through later laps. A single retirement freezes only the retired car; running cars continue (covered by the two-car regression test added in Phase 12B) |
| Normal finish | Final-build Suzuka reached lap 64; advance/commands disabled and all marker transforms remained stable after settlement |
| Strategic advance | Albert Park stopped at a weather-band event on lap 41 with optional auto-pause off |
| Reduced motion | Local checkbox and single-lap advancement exercised; preference changes while paused did not move markers. OS preference uses the same code path, but no OS setting was changed for this run. |

Screenshots:

- Albert Park: [1440](screens/phase12a-albert-1440.png), [1024](screens/phase12a-albert-1024.png), [768](screens/phase12a-albert-768.png).
- Suzuka: [1440](screens/phase12a-suzuka-1440.png), [1024](screens/phase12a-suzuka-1024.png), [768](screens/phase12a-suzuka-768.png).
- Controlled states: [SC](screens/phase12a-suzuka-sc.png), [VSC](screens/phase12a-suzuka-vsc.png), [retirement](screens/phase12a-suzuka-retirement.png).

## Performance and limitations

[Recorded measurements](phase-12a-measurements.json) contain actual shared-loop browser samples, not SSR-only timing. The development samples used 20 moving cars and typically measured about **0.27–0.31 ms of drawing work per callback**, with maxima of **1.5–1.7 ms**. These measurements cover marker transforms and label placement; they are not full-page paint/composite times. The development samples preceded the final latency/retired-offset/idle-frame refinements; the final production build was separately exercised with 20 cars.

Repeated live samples were coherent at 1×/4×/8×. Occasional longer scheduling gaps occurred: the largest recorded development RAF interval was about **233 ms**. Most sampled intervals were approximately 5.5 ms in this browser, which is **not a guaranteed display frame rate**. A stalled/background tab is capped to a 50 ms visual step before reconciling later checkpoints. Network stalls can still temporarily exhaust the available saved target; the renderer intentionally does not invent future race progress.

The first development-server attempt hit a local file-watcher limit; polling/Webpack restored the preview. A later development restart interrupted a request, so final control/finish checks were repeated against the production server, which reported no browser errors during the final motion run. The pre-existing `pg` concurrent-query deprecation warning was observed and left unchanged as requested.

Additional presentation limits: label slots can change discretely in dense packs; closely packed markers may still overlap partly. Suzuka is a flat centreline, without bridge elevation/occlusion. Timing/classification can lead the animated map by an interpolation interval. A paused map can intentionally lag an in-flight committed checkpoint until resumed. Retired positions freeze visually; refreshing reconstructs their saved authoritative position. This is lap-checkpoint presentation, not corner-by-corner simulation.

## Files and architecture

- **Simulation files: unchanged.** No v8 and no balance changes.
- **Prisma schema: unchanged.**
- **New migration: none.**
- **All ten historical migrations: unchanged.**
- **Repository/application service boundaries and bundled identity data: unchanged.**
- Main changes: circuit layout model/data and pure geometry helpers; visual timeline and SVG renderer; playback presentation timing; shell-to-map props; two translated map descriptions; targeted tests; provenance, measurements and screenshots.

A byte comparison against the preserved Phase 12 ZIP confirmed all 30 frozen simulation/schema/migration/identity files were identical.

The project export had no Git repository. A local repository was initialized with an accepted Phase 12 baseline commit (`8f8c835`) so this implementation can be reviewed as a focused subsequent commit. See [changed files](phase-12a-changed-files.txt). No remote push or later roadmap phase is included.

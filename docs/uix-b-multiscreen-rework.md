# UIX-B — PREMIUM MULTI-SCREEN RACE COMMAND CENTRE
# CODEX BUILDER HANDOFF

## Role

CODEX ACTED AS BUILDER.

CODEX TESTER IS A SEPARATE AGENT.

This is implementation and Builder evidence, not final independent acceptance.

## Starting Commit

`bfdda6dbfe919399a2d6a120183bc42dec67d0c0`

Latest main was fetched and verified at `f164876b825f45e4722890fca348b9586af5b985` before returning to the explicitly assigned candidate. Work used the existing repair clone; the user's original checkout was left untouched.

## Final Commit

The exact containing commit is reported in the final Builder handoff. This document is included in that commit.

## Branch

`claude/uix-b-race-experience`. Continue the existing candidate with new history; no rebase, force push or merge.

## Why Previous Candidate Failed

The previous candidate achieved fitting everything but gave almost every region equal weight. Primary controls became 26px strips with small labels. Nested outlines, long red warning rows, repetitive table labels and small tyre numbers made the interface tiring to scan. The circuit received widget-level emphasis. Weather and playback fragmented the top into monitoring metrics. Larger screens retained that compressed grammar instead of improving composition.

The rework establishes race state → both cars → urgency → decisions → detail. It uses readable primary controls, a tyre focal group, restrained warnings, controlled column widths and secondary disclosure/local scrolling. Eliminating every scroll is no longer the governing rule.

## Reference Study

These are design inferences from official material, not copies of proprietary layouts or assets:

- [F1 Manager](https://store.steampowered.com/app/2591280/F1_Manager_2024/): decisions adjacent to live race context and selected-driver identity.
- [Motorsport Manager](https://store.steampowered.com/app/415200/Motorsport_Manager/): an understandable observe/select/decide loop for two cars.
- [Football Manager](https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface): hierarchy and progressive disclosure for dense information.
- [Gran Turismo race display manual](https://www.gran-turismo.com/us/gt6/manual/howtorace/racedisplay.html): distinct visual roles for lap, position, track and resources.
- [Forza accessibility](https://forza.net/news/forza-motorsport-accessibility): readable text and explicit state alongside visual polish.
- Broadcast principles: strong position/driver numbers, quiet supporting data and current strategic pressure. The result retains Paddock Hybrid's own ink/amber/team-colour identity.

## OpenArt Models Considered

The current catalog included GPT Image 2.5 Sunburst/Flare, Nano Banana 2.1/2/Pro/Lite, Seedream 4.5/5 Pro/5 Lite, Wan 2.7, Grok 2, Kling 3 and SmartShot. The shortlist was Sunburst, Nano Banana 2.1/Pro and Seedream 5 Pro. Layout/text control and dense UI composition mattered more than lowest cost; Seedream's illustration emphasis was less directly suited to this task.

## OpenArt Model Selected

Sunburst high quality was the main composition model. Nano Banana 2.1 supplied a fresh crisis comparator. Selection was informed by actual generated pixels after the viewability gate was resolved. No new generation was needed after the manual upload.

## OpenArt Generations

| Concept | Screen class | History ID | Model | Quality / output | Credits |
| --- | --- | --- | --- | --- | ---: |
| A — Premium laptop | 1366×768 / 1536×864 | `rPRn9w7bVZMVfDSMyHkW` | GPT Image 2.5 Sunburst | High, 2K, 16:9; 2304×1296 | 170 |
| B — Full HD | 1920×1080 | `QDOp0Bi5dF2p0ibw60Vs` | GPT Image 2.5 Sunburst | High, 2K, 16:9; 2304×1296 | 170 |
| C — Both-car crisis | Laptop, 16:9 | `yG7ymWZHJvoJW7WEs99v` | Nano Banana 2.1 | 4K; 5504×3072 | 78 |
| D — Ultrawide | 2560×1080 / 3440×1440 | `OCC4Cc7BO7PAYTrwMFVT` | GPT Image 2.5 Sunburst | High, 2K, 21:9; 3136×1344 | 210 |

Total: **628 credits**, balance 3050 → 2422. One image per concept, prompt auto-enhancement off. This excludes the earlier separate 210-credit study. Exact prompts, settings, IDs and returned media URLs are in [the generation record](verification/uix-b-openart-exploration.json).

## OpenArt Viewability

Initially the connector returned resource links without inspectable image blocks; opening the supplied CDN URL returned `net::ERR_BLOCKED_BY_CLIENT`. Visual implementation paused at that point. The Project Lead manually uploaded all four outputs. Actual pixels of those four images were then inspected and compared before implementation. Metadata alone was not used to choose a direction, and the restriction was not bypassed.

## Concept Comparison

A supplied laptop tyre/mode grouping and two-car awareness. B had the strongest selected-driver, track and anchored pit hierarchy. C helped prioritize both-car urgency and since/acknowledge context, but duplicating entire control panels would consume too much space. D supplied the separate event/weather rail for ultrawide.

Generated exact tyre-life predictions, unsupported forecasts, scenery, sectors, invented navigation and unrelated telemetry were rejected. The implemented screen only presents existing public capabilities and data.

## Selected Visual Direction

Deep ink, a few connected dark surfaces, restrained separators, amber selected/actionable state and team-colour identity. Position/driver/tyre numbers lead; resources have distinct decision groups. Existing circuit geometry anchors the centre. No generated artwork is shipped in the product.

## Information Hierarchy

1. Race state: lap/flag, conditions and playback share one composed top area.
2. Two cars: stable-order summaries show position, compound, wear, leader-relative gap and independent issue severity.
3. Critical strategy: one priority issue per car remains visible; full reasons and first-seen lap disclose locally.
4. Player decisions: selected tyre state, all five Pace choices, all three Energy choices, all three Fuel choices and pit actions.
5. Secondary information: comparison, detailed assistance, neighbours/lap times, history, forecast, map notes, diagnostics and older events.

## Desktop Short-Laptop Design

1220/1280/1366 use three connected columns, 36px mode targets and approximately 14.95px mode text. Pace is a complete horizontal group; Energy and Fuel sit beside each other. Small explanatory/context fields disclose before primary choices shrink. Pit remains outside the scrolling strategy region. At 1220/1280×720 the map is only 174px high; this is a deliberate minimum-screen compromise and a QA risk.

## Standard Desktop Design

1440/1536/1600 increase spacing, identity and track area, using 38px mode targets and 15.6px text. Timing and events scroll locally. The selected-driver decision area remains near the circuit and both cars.

## Full-HD Design

1920×1080 uses 44px mode targets, 18px decision text, 100px minimum own-car summaries and 48px timing rows. The map is 727×311 CSS pixels in the normal fixture. Expanded event capacity and comparison/details use the additional room without adding unsupported data. Neighbours/lap-time context remains in secondary details at this size.

## QHD / 4K Design

QHD/4K use proportional type and a bounded, centred workspace (maximum 3100×1600). Public neighbour/lap-time context becomes persistent. QHD mode text/targets measure 19.2px/~58px; 4K measures ~24.4px/~73px. Timing and strategy widths remain controlled rather than stretching to screen edges.

## Ultrawide Design

2560×1080 and 3440×1440 use four columns: timing, track/two cars, strategy, and a dedicated event/weather rail. The rail exposes existing public weather/forecast context; the duplicate track forecast drawer hides at this class. Normal maps measure 962×532 and 1211×816. Feed filters open downward here, upward above the bottom feed on ordinary desktop.

## Tablet Design

Below 1220px, Strategy/Timing/Track/Feed become focused panes. Both-car switching stays visible and becomes sticky when scrolling. Tablets keep three decision columns. The pit shortcut selects Strategy and uses a native anchor to its pit section. Page scrolling is intentional; this is not a forced desktop grid or a promise that all decisions are above the fold. Optional 1180×820 was reviewed alongside the three required tablets.

## Mobile Design

At 600px and below, Pace spans two rows of three columns; Energy/Fuel have separate vertical choices beside each other. Primary mode and pit controls are 44px minimum. Pit follows the strategy content and can be reached directly from both-car summaries, including from Track. Timing has local horizontal scrolling; there is no horizontal document overflow. Narrow phones use focused panes and ordinary vertical page scrolling.

## Timing Tower

Position and driver abbreviation lead; team names, lap history and flags are quieter. Selected/player rows retain distinct indicators. All rows remain available through keyboard-focusable local scrolling. The table has a 350px desktop minimum and 440px phone minimum; narrower timing columns expose the remaining cells through local horizontal scrolling.

## Track

Existing centreline/markers/interpolation remain unchanged. The heading uses the public event's circuit name with a translation fallback. Map notes, forecast and public race details disclose from its footer. No circuit/sector data or hidden authoritative state was added.

## Driver Strategy

Identity → tyre compound/wear/age/temperature/suitability → Pace → Energy → Fuel → assistance. DOM order matches decision order for keyboard users. Fuel projection appears below its choices instead of crowding the resource heading. Every existing command intent, entrant ID, revision, busy/committed/read-only guard and automatic assistance behavior is preserved.

## Pit Strategy

The desktop pit dock remains outside the locally scrolling driver region. Compound, pending request, BOX/Update/Cancel, rules and committed/busy guards remain intact. Compact users can jump to the same section from any pane. Finished/retired/DSQ output preserves existing read-only behavior. Inactive pit remains proportionate.

## Two-Car Awareness

Both own cars show public wear and leader-relative gap alongside compound and position. Cards stay in entry order even if race position changes. Each carries its own highest issue severity; selection is explicit. Comparison retains all existing public fields. The shortcut itself sends no gameplay command.

## Strategic Warnings

Neutral compact rows replace broad red alarm cards. Icon, severity text, driver and a short reason remain visible, with Ack/More. The reason disclosure also includes first-seen lap on sizes that hide the redundant inline field. Ack does not remove an active issue. The accepted live-announcement deduplication logic is untouched. On narrow own-car cards, secondary flag chips can clip; full reasons/severity remain available via the rail and disclosures.

## Weather / Playback

Current rain/water/temperature are grouped with lap/flag/playback. Forecast is secondary except in the ultrawide rail. Only existing public approximate forecast information and its disclaimer are shown. Play/Pause, Advance, speeds, Next Strategic Event, Auto Pause and reduced motion retain their existing mechanics. The 8× screenshot verifies selected speed while paused, not live backend playback at 8×.

## Internal Scrolling

Timing rows/cells, event history, desktop driver context/assistance, bounded comparison/disclosures, warning history, Sprint result tables and ultrawide weather may scroll locally. Compact layouts also intentionally scroll the document vertically. Primary desktop pit actions remain outside the driver scroll region.

## Screen Matrix Review

Builder observations from actual rendered screenshots, compact pane/pit interactions and read-only DOM measurements. “Reachable” includes normal page scrolling on compact screens. Timing and Track refer to their own pane when compact. This is not an independent acceptance verdict or every-state/every-size cross product.

| Screen | Layout mode | Page vertical | Page horizontal | Primary controls | Timing | Track | Pit | Warnings | Density |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1220×720 | Short, 3 columns | No | No | All 11 visible | Readable, local scroll | 334×174, limited | Visible | Clear, details available | Dense but readable |
| 1280×720 | Short, 3 columns | No | No | All 11 visible | Readable, local scroll | 394×174, limited | Visible | Clear | Dense but readable |
| 1366×768 | Short, 3 columns | No | No | All 11 visible | Readable, local scroll | 480×216, useful | Visible | Clear | Compact decision focus |
| 1440×900 | Standard, 3 columns | No | No | All 11 visible | Readable, local scroll | 516×228, useful | Visible | Clear | Balanced |
| 1536×864 | Standard, 3 columns | No | No | All 11 visible | Readable, local scroll | 559×197, useful | Visible | Clear | Balanced, shorter map |
| 1600×900 | Standard, 3 columns | No | No | All 11 visible | Readable, local scroll | 588×228, useful | Visible | Clear | Balanced |
| 1920×1080 | Full HD, 3 columns | No | No | All 11 visible | Larger rows, local scroll | 727×311, useful | Visible | Clear | More breathing room |
| 2560×1440 | QHD, bounded 3 columns | No | No | All 11 visible | Scaled, local scroll | 1085×475, useful | Visible | Clear | Proportional + context |
| 3840×2160 | 4K, bounded 3 columns | No | No | All 11 visible | Scaled, local scroll | 1387×605, useful | Visible | Clear | Controlled centre |
| 2560×1080 | Ultrawide, 4 columns | No | No | All 11 visible | Controlled width | 962×532, useful | Visible | Clear | Dedicated context rail |
| 3440×1440 | Ultrawide, 4 columns | No | No | All 11 visible | Scaled, local scroll | 1211×816, useful | Visible | Clear | Dedicated context rail |
| 1180×820 (optional) | Compact panes | Yes | No | Reachable by scroll | Readable in pane | Useful in Track pane | Shortcut + scroll | Clear | Focused tablet |
| 1024×768 | Compact panes | Yes | No | Reachable by scroll | Readable in pane | 901×422, useful | Shortcut + scroll | Clear | Focused landscape |
| 820×1180 | Portrait panes | Yes | No | Reachable by scroll | Readable in pane | 773×600, useful | Shortcut + scroll | Clear | Three decision columns |
| 768×1024 | Portrait panes | Yes | No | Reachable by scroll | Readable in pane | 721×563, useful | Shortcut + scroll | Clear | Three decision columns |
| 540×960 | Phone panes | Yes | No | Reachable by scroll | Readable; local scroll | 505×528, useful | Shortcut + scroll | Clear | Two resource columns |
| 430×932 | Phone panes | Yes | No | Reachable by scroll | Readable; local X/Y | 395×513, useful | Shortcut + scroll | Clear | Focused touch layout |
| 390×844 | Phone panes | Yes | No | Reachable by scroll | Readable; local X/Y | 355×464, useful | Shortcut + scroll | Clear | Focused touch layout |
| 375×812 | Phone panes | Yes | No | Reachable by scroll | Readable; local X/Y | 340×447, useful | Shortcut + scroll | Clear | Minimum density |
| 360×800 | Small phone panes | Yes | No | Reachable by scroll | Readable; local X/Y | 325×440, useful | Shortcut + scroll | Clear | Minimum practical case |

Normal screenshots at all 20 sizes, Timing/Track/Pit at all nine compact sizes and 16 state/interactions are checked in under [screens/uix-b-multiscreen](screens/uix-b-multiscreen). Raw normal/pit measurements and 15 breakpoint boundary measurements are in [the matrix record](verification/uix-b-multiscreen-matrix.json). Boundary checks are DOM measurements only. Compact initial screenshots do not necessarily show mode controls or pit above the fold; the paired pit/pane screenshots establish their reachability.

## EN / ZH-Hant

Both locales were rendered in laptop, desktop, ultrawide and phone layouts, including crisis/pending pit and Sprint result views. English is the full normal matrix; Chinese sampling is not a complete cross product. Added central keys: `operations.mapNotes` and `operations.fuelLean` (Lean / 省油). Global Practice fuel wording is unchanged. Existing Intl number/time/unit formatting and local preference persistence are preserved. Actual localhost reload retained `zh-TW`; targeted locale tests verify persistence/fallback and race immutability. Entity names and IDs remain game data.

## Accessibility

UIXB-A11Y-001 announcement deduplication and UIXB-A11Y-002 Practice keyboard tabs are preserved. Their focused suites pass. Scroll regions have focus targets/labels and visible focus. RaceDetails and comparison preserve Escape/focus restoration; this was also exercised in the browser. Native buttons/selects, pressed state, text-plus-icon severity and existing reduced-motion behavior remain. Browser keyboard traversal from Pace to Energy was checked after reordering DOM content. Full assistive-technology/browser-matrix acceptance remains separate QA.

## Files Changed

- `src/styles/race-workspace.css`: replaces the compressed Race-only workspace overrides with explicit screen-class composition.
- `src/features/race/viewer/driver-panel.tsx`: decision order, quieter fuel context, focusable scroll region, pit anchor and local fuel wording.
- `src/features/race/viewer/player-switch.tsx`: public wear/gap summaries and pit shortcut.
- `src/features/race/viewer/operations.tsx`: pane shortcut, public circuit heading, track disclosures and ultrawide weather placement.
- `src/features/race/viewer/event-feed.tsx`: keyboard-dismissible filter disclosure.
- `src/features/race/viewer/issues-rail.tsx`: first-seen lap inside full reason disclosure.
- `src/features/race/viewer/timing-tower.tsx`: focusable labelled scroll region.
- `src/i18n/en/messages.json`, `src/i18n/zh-TW/messages.json`: two central presentation keys.
- `tests/race-workspace.test.tsx`: two focused public-summary/shortcut/filter tests; existing command/locale/issue/disclosure checks retained.
- This handoff, two verification JSON records and 63 intentional review JPEGs.

Temporary preview route, probes, generated Next type changes and generated AGENTS.md/CLAUDE.md were removed/excluded. No dependency changes.

## Gameplay Changes

NONE. RACE v8 SIMULATION AND GAMEPLAY CONTRACT UNCHANGED.

Simulation, classifications, Sprint, SC/VSC, pit physics, RNG, command mechanics, persistence and Career progression were not edited. Presentation-only selection, filters, panes and language do not mutate the public Race object in focused tests.

## Backend / DB Changes

NONE. Schema changed: no. Migration added: no. Historical migrations changed: no. API/repository/public projection changes: no. No DB integration test was run for this presentation-only task.

## Builder Visual Review

Actual screenshots were inspected and iterated, not only DOM boxes. Revisions included tyre/decision grouping, separate full-width severity, compact pit reachability, phone Timing overflow, scrolled feed containment and desktop/ultrawide filter direction. State evidence includes normal and wet crisis, both cars with issues, pending/inactive pit, paused 8× with car B selected, scrolled Timing, 49-event populated history, both languages, finished Race and running/finished Sprint.

Examples: [Full HD normal](screens/uix-b-multiscreen/1920x1080-normal-en.jpg), [ultrawide Chinese crisis](screens/uix-b-multiscreen/3440x1440-wet-crisis-zh.jpg), [small-phone Chinese pit](screens/uix-b-multiscreen/360x800-wet-crisis-pit-zh.jpg), [paused 8× / car B](screens/uix-b-multiscreen/1920x1080-wet-crisis-8x-car-b.jpg), [finished Race](screens/uix-b-multiscreen/1366x768-finished-race-en.jpg), [Chinese Sprint results](screens/uix-b-multiscreen/390x844-sprint-finished-result-zh.jpg).

The temporary server-only fixture produced an existing safe public projection before rendering. It used no DB writes, exported no hidden authoritative Race state, and was removed before build/commit. Interactions were local presentation controls; backend advance/save/continue actions were not invoked against fictional fixture IDs. Hydrated interactions were verified on localhost after 127.0.0.1 dev-origin resource blocking affected an early probe; no global Next configuration was changed.

## Builder Checks

BUILDER-SIDE ONLY.

- `npm run typecheck`: final run passed. The first post-cleanup run found a stale generated `.next/dev` reference to the deleted fixture; clearing that generated preview cache resolved it without changing application code.
- `npm run lint`: passed, zero warnings.
- `npm run build`: passed; route list contains no preview fixture.
- `npx vitest run tests/race-workspace.test.tsx tests/uix-b.test.tsx tests/uix-b-accessibility.test.tsx tests/race-v8c-ui.test.tsx tests/race-v8c-official-leader.test.tsx tests/race-v8e-ux.test.tsx tests/race-polish.test.tsx tests/race-closure.test.tsx tests/viewer.test.tsx tests/viewer-labels.test.tsx tests/race-v8d-repair.test.tsx tests/practice-ui.test.tsx tests/practice-rerender.test.tsx tests/qualifying-ui.test.tsx tests/race-experience.test.tsx tests/locale-provider.test.tsx tests/i18n.test.ts tests/playback.test.ts tests/sprint-ui.test.tsx`: **19 files, 257 tests passed**.
- CUA browser screenshots, read-only DOM geometry, pane/driver switching, language reload, pit anchors, filters, comparison and disclosure keyboard interactions.
- `git diff --check`, explicit changed-file/frozen-path review and final Git status before commit/push.

No formal regression/balance/DB campaign or independent product acceptance was performed.

## Known Risks

Independent Tester should prioritize actual persisted Careers with live 8×/NSE, save/reload, command busy/committed transitions, Sprint continuation and finished classification. The browser fixture cannot establish those backend behaviors. Existing targeted playback/command/classification tests passed, but this is not a substitute for that QA.

Also verify long translated/game entity text, changed OS/font scaling, keyboard use across overflow regions, sticky compact cards and pit jump after a pane switch, disclosures near viewport edges and the accepted announcement fixes with a screen reader. Narrow Timing tables intentionally scroll horizontally inside their own region. Shortest laptop maps are 174px high. Secondary own-car flag chips may clip at narrow widths; severity and full issue detail remain accessible. These are disclosed presentation compromises, not a self-issued acceptance verdict.

## Git Status

Implementation continues the exact assigned branch as a new commit. Exact commit, pushed result and clean status are reported after publication in the final Builder message. No merge or history rewrite.

## Final Builder Status

UIX-B PREMIUM MULTI-SCREEN VISUAL REWORK COMPLETE — READY FOR CODEX TESTER

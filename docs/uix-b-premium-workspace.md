# UIX-B — Premium one-screen Race Command Centre

## Builder role and candidate

CODEX ACTED AS BUILDER. CODEX TESTER IS A DIFFERENT AGENT / SESSION.

This is an implementation handoff, not independent acceptance. The authorized base is `17b3e3ad4027e248a67e6cfe55800054570acf91` on `claude/uix-b-race-experience`. The candidate continues that branch without resetting its accessibility fixes. The final commit is supplied in the accompanying Builder report and branch history.

## Initial UX audit

The old page combined unconstrained grid height with a long driver panel: identity, repeated issues, battle context, tyre explanations, resources, assistance explanations, pit controls and history all contributed to document height. The live bar also wrapped into several tall rows. A manager had to leave the timing/map area to reach commands.

At 1366×768, the reviewed 22-car lap-16 state had document scrollHeight 2258px against clientHeight 768px. The live bar was 246.8px, issues 69.4px and driver panel 1684px. Pace began around y=1619 and the pit section around y=1695. At 1280×720, the wet lap-38 state reached 2332px document height and BOX began around y=1928. These were structural failures of the application workspace, beyond spacing alone.

## Reference study

These are principles inferred from official product material, not instructions to reproduce another game's screen:

| Reference | Principle used |
| --- | --- |
| [F1 Manager](https://store.steampowered.com/app/2591280/F1_Manager_2024/) | Place car strategy next to the live race context; maintain a pit-wall atmosphere. |
| [Motorsport Manager](https://store.steampowered.com/app/415200/Motorsport_Manager/) | Keep observing, selecting a car and making a decision close together. |
| [Football Manager interface](https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface) | Use compact summaries and progressive disclosure for extensive secondary information. |
| [Gran Turismo race display](https://eu.gran-turismo.com/gb/gt6/manual/howtorace/racedisplay.html) | Give clock, position and resources separate, legible roles. |
| [Forza accessibility](https://forza.net/news/forza-motorsport-accessibility) | Retain readable text, explicit state and reduced-motion support. |
| [Formula 1 Strategy Insight](https://www.formula1.com/en/latest/article/f1-to-launch-new-strategy-insight-graphic-powered-by-aws-at-hungarian-grand-prix.3h211Yy2IaW04biHGRY4EM.3h211Yy2IaW04biHGRY4EM.3h211Yy2IaW04biHGRY4EM) | Explain current strategic pressure concisely alongside the live event. |

Sports broadcast references informed compact timing and contextual urgency. The management controls remain the priority. NO proprietary interface was copied. No commercial artwork, logos, icon set or background image was imported.

## OpenArt model evaluation and generations

The available catalog inspected contained Nano Banana 2.1, 2, Pro and Lite; GPT Image 2, 2.5 Flare and 2.5 Sunburst; Seedream 4.5, 5 Pro and 5 Lite; Wan 2.7; Grok Imagine 2; and SmartShot. Sunburst and Nano Banana Pro were shortlisted for coherent dense composition and text hierarchy. Sunburst was used for the more detailed quality study; Nano Banana Pro supplied a second warning-heavy composition. Cost was considered alongside composition quality.

| Study | Model / settings | History ID | Cost | Intended problem |
| --- | --- | --- | --- | --- |
| A — Short Laptop Pit Wall | GPT Image 2.5 Sunburst, high quality, 2K, 16:9, one image, auto-enhance off | `OQ84mfFEsKbpQ95UjIox` | 170 credits | Connected timing, track, events and immediately available strategy on a short laptop. |
| B — Warning-heavy Two-car Race | Nano Banana Pro, 2K, 16:9, one image, auto-enhance off | `WtTIBWxPlRDZrkMvuhVx` | 40 credits | Simultaneous car issues and compact acknowledgement without consuming the workspace. |

Total: **210 credits, two generations**. The initial tool environment could not display the generated outputs. Implementation waited for manual Project Lead uploads. Actual uploaded pixels were inspected before selection and implementation. The later Sunburst upload duplicated study A; it was not counted as a third generation. Two usable studies supplied the synthesis, so no extra credits were spent solely to reach the preferred study count.

## Concept comparison

**A:** Strong connected hierarchy, resource-adjacent modes, useful event placement and anchored pit controls. Its oversized selected-car fill and detailed mock labels would scale poorly to 720px height. It also invented a predicted pit-window event, sector controls, water units, tyre-life ranges and background imagery unsupported by the game. Kept the connected watch/understand/decide composition, compact command rows and permanent pit area. Rejected fabricated capabilities, fixed compound life advice and image assets.

**B:** Strong awareness of both cars, immediate urgency, acknowledgement and compact mode selection. Large warning bars consumed too much height; the fragmented cards, invented sector temperatures, scrambled names and absence of events weakened the workspace. Kept compact two-car awareness and issue expansion. Rejected the fabricated map information, fragmented control cards and loss of the event feed.

## Selected direction and generational improvements

Paddock Hybrid — Live Operations remains the identity: deep ink, subtle layers, amber current/actionable emphasis, team colour as identity and condensed display typography alongside readable data.

The result changes the interaction model. Timing, the live circuit and the selected car occupy a bounded desktop workspace. Both player cars remain visible. Resources sit directly above their mode choices. BOX/update/cancel remain in a permanent pit dock. Detailed explanations, history and forecasts expand near their trigger rather than adding another floor to the page. Taller displays regain larger text and spacing, with a public battle/lap context preview at 1920×1080.

## One-screen architecture

At widths of at least 1220px, Race scopes the application shell to `100dvh`. The shell reserves 44px for its existing top bar. The Race root uses event header, live bar and a `minmax(0, 1fr)` workspace. No document-overflow suppression is used to hide oversized content.

The workspace has three areas: timing left, track plus events centre, and player switching plus strategy right. All grid/flex shrink boundaries are explicit. The 22-car table and event list receive their own scroll regions. The command panel does not scroll. Its pit dock uses remaining space above it and stays within the viewport. Race-only CSS preserves Career, Practice and Qualifying geometry.

## Primary controls and two-driver management

Both car buttons show position, compound, persistent flags and worst issue severity above the command panel. Clicking either car changes the selected public projection. Compare remains available as a bounded overlay and closes with Escape, restoring toggle focus.

The panel exposes current tyres, wear, temperature, age, suitability/cliff state, fuel and projected finish fuel, fuel modes, energy and Recharge/Balanced/Boost, pace, Overtake Mode eligibility and automatic Active Aero state. OM and Aero remain status, not invented manual controls. Playback, speed, Next Strategic Event and Auto Pause remain in the live bar.

## Strategic issues

Two compact immediate cards prioritize the highest issue and, where possible, the other car. All additional active issues remain in the More disclosure. Per-car severity also remains on both car buttons. Issue descriptions can expand to reveal untruncated text. Severity uses icons and text; since-lap, review and acknowledgement are retained. Acknowledgement does not remove a still-active issue. The critical-condition announcement snapshot and clear/return handling are unchanged.

## Pit strategy

The pit dock retains actual request/committed state, stint/stops, compound selection, BOX or Update BOX and Cancel BOX. A pending compound initializes the local selector correctly on panel mount. Command payloads and editability/commit/last-lap guards are unchanged. The actual dry tyre rule has a compact textual status; full rule advice, stop loss, rejoin estimates and stint/stop history remain in strategy details. No fixed lifespan or new prediction is introduced.

## Timing, track, events and weather

The timing tower keeps its Gap/Interval modes, positions, selection, player markers, flags, lap times, tyres, stops and explanatory note. Its complete classification scrolls internally.

TrackMap retains the same geometry, public inputs, interpolation, markers, motion and selection behavior. Only its container becomes bounded. No geometry or marker engine was rewritten.

The event feed retains filters, grouping and earlier events inside a focusable internal scroll area. Current weather remains in the live bar. The full existing forecast and public diagnostics open from the centre area's detail toolbar. Finished Sprint classification uses a bounded results disclosure with its qualifying continuation pinned below the scrolling table.

## Internal scroll regions

- Timing classification: the full field exceeds the available height; all rows remain available.
- Recent/earlier events: history can grow without moving the command controls.
- Expanded driver details, assistance reasons, forecast, diagnostics and issue overflow/log: secondary context only.
- Expanded comparison: full two-car resource/context table.
- Finished Sprint classification: continuation stays outside its scrolling table.
- Compact status/flag strips and filter rows may overflow locally when text or flags require it.

The selected driver's primary commands and pit dock never require internal scrolling at the measured desktop targets.

## Desktop measurements

Actual DOM geometry was recorded in the in-app browser for **both `en` and `zh-TW` at every size below**, with screenshots inspected. The stress state used 22 cars, two own cars, very long names, wet conditions, critical fuel and tyre issues on both cars, a pending pit request, 8× selected and Auto Pause OFF. This was a disposable render fixture using the existing engine and safe public projection, not a persisted Career run.

Values below are pixels. Timing and events scroll internally; the strategy panel does not. No horizontal document overflow was measured.

| Viewport | Document scrollHeight / clientHeight | Document vertical scroll | Live bar | Issues | Workspace | Driver panel | Timing scroll | Strategy scroll | Event scroll | Pit visible | Pace visible | Energy visible | Playback visible |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1280×720 | 720 / 720 | No | 140.3 | 35 | 481.7 | 433.7 | Yes | No | Yes | Yes | Yes | Yes | Yes |
| 1366×768 | 768 / 768 | No | 140.3 | 35 | 529.7 | 481.7 | Yes | No | Yes | Yes | Yes | Yes | Yes |
| 1440×900 | 900 / 900 | No | 140.3 | 35 | 651.7 | 597.7 | Yes | No | Yes | Yes | Yes | Yes | Yes |
| 1600×900 | 900 / 900 | No | 140.3 | 35 | 651.7 | 597.7 | Yes | No | Yes | Yes | Yes | Yes | Yes |
| 1920×1080 | 1080 / 1080 | No | 140.3 | 35 | 831.7 | 777.7 | Yes | No | Yes | Yes | Yes | Yes | Yes |

Driver panel clientHeight/scrollHeight pairs were 432/432, 480/480, 596/596, 596/596 and 776/776 respectively. BOX/update bottoms were y=654, 702, 829.7, 829.7 and 1009.7. Fuel, tyre selection, both car selectors, speed and Auto Pause controls were also checked within the viewport.

At 1220×720 in Traditional Chinese, document dimensions remained 720/720 and 1220/1220, with all primary controls visible. Opening driver details at 1280 kept document height at 720px and bounded the detail body to about 390px. Running Sprint also fit 720/720; finished Sprint fit 720/720 with its continuation visible inside the opened results disclosure at y=391–433.

## 1024 and mobile preservation

At 1024×768, the existing Strategy/Timing/Track/Feed pane model takes over. All four pane selections were exercised in Traditional Chinese; only the selected pane and both-car switch remain displayed. Document vertical scrolling is allowed in this adaptive mode. No horizontal document overflow was measured (1009/1009 excluding the scrollbar).

At 390×844, all four existing panes were exercised, both player car controls remained available and no horizontal document overflow was measured (375/375 excluding the scrollbar). Details flow within the mobile pane instead of becoming desktop overlays. This is a focused mobile sanity check, not a full mobile acceptance campaign.

## English / ZH-Hant and accessibility

All new interface strings are centralized in both catalogs. Locale-aware number, percentage, unit and race-time formatting is retained. Long game names remain game data, with full names accessible through title/heading text. Language changes do not alter the Race or pending local tyre selection.

UIXB-A11Y-001 critical announcement deduplication is preserved and its regression tests passed. UIXB-A11Y-002 Practice arrow-key tab navigation is untouched and its regression tests passed. Native disclosure semantics support keyboard activation; Escape closes Race details and restores summary focus. Comparison also restores its toggle focus. Focus-visible styles and focusable event scrolling remain. Reduced-motion preference and TrackMap behavior are unchanged. Critical severity uses icon plus text; selected modes retain pressed state and a visible underline as well as colour.

## Files and components

Added: `src/features/race/viewer/race-details.tsx`, `src/styles/race-workspace.css`, `tests/race-workspace.test.tsx`, and this handoff.

Refactored: `driver-panel.tsx` (primary/detail/pit composition), `issues-rail.tsx` (two-car compact presentation), `event-feed.tsx` (internal scroll wrapper), `operations.tsx` (bounded composition and secondary tools), and `player-switch.tsx` (Escape dismissal). `src/app/globals.css` imports the Race-only stylesheet. Both locale catalogs add concise presentation strings.

No components removed. No authoritative public-view or server-action contracts changed. The temporary browser fixture, generated agent files and dev artifacts are excluded from the candidate.

## Gameplay / simulation and information boundary

NONE. RACE v8 SIMULATION AND GAMEPLAY CONTRACT UNCHANGED.

The implementation rearranges existing public values. It adds no browser-visible hidden authoritative Race state. Existing entrant IDs, command revisions, intent payloads and command guards are retained. No new RNG, name-based logic or language-dependent gameplay is introduced. Local disclosure/selection state is presentation only.

## Backend / database

NONE. No schema change, migration, historical migration edit, repository change or persistence change.

## Tests added

Four focused tests verify: primary commands remain outside disclosures and preserve intent/revision/entrant payloads; language changes preserve Race data and pending compound; compact issues include both cars while retaining acknowledgement/overflow; and Escape closes details with focus restoration.

## Builder-side checks only

All commands below completed successfully:

```sh
npx vitest run tests/race-workspace.test.tsx tests/uix-b.test.tsx tests/uix-b-accessibility.test.tsx tests/race-v8c-ui.test.tsx tests/race-v8c-official-leader.test.tsx tests/race-v8e-ux.test.tsx tests/race-polish.test.tsx tests/race-closure.test.tsx tests/viewer.test.tsx tests/viewer-labels.test.tsx tests/race-v8d-repair.test.tsx tests/practice-ui.test.tsx tests/practice-rerender.test.tsx tests/qualifying-ui.test.tsx
npm run lint
npm run build
npm run typecheck
git diff --check
```

Focused result: **14 test files, 194 tests passed**. The production build included only actual application routes; the temporary review route was removed first. No PostgreSQL suite or formal balance campaign was needed for this presentation-only change.

## Builder visual review and known risks

Actual rendered pixels were inspected at all five desktop targets in English and Traditional Chinese, plus 1220, 1024 and 390px. Reviewed states included the 22-car wet two-car crisis, pending pit selection, 8×/Auto Pause OFF selection, long names, issue expansion, driver details, second-car selection, comparison keyboard dismissal, running Sprint and completed Sprint results.

Browser review used a disposable fixture and did not issue gameplay commands against a saved Career. Unit tests verify command dispatch; independent QA should verify actual server-backed commands, committed transitions and reloads. The short-laptop presentation intentionally uses smaller text than the larger targets. Font zoom and additional browser/platform combinations remain for independent QA.

## Unrelated issues discovered

No unrelated product issue was changed. A stale generated Next dev type referred to a previous temporary route during checking; cleaning the disposable dev output and running the production build resolved the local verification artifact.

## QA handoff

Independent Tester should prioritize a real saved Career at 1280×720 and 1366×768: both cars critical, 8× with Auto Pause OFF, request/update/cancel and committed pit states, final safe tyre stop/DSQ, SC/VSC and weather changes, retirement/finished read-only states, and Sprint remainder confirmation/results/qualifying continuation. Verify that issue announcements stay deduplicated, full details remain reachable, keyboard focus is visible, reduced motion works, and Chinese long labels and mobile panes retain capability.

Do not infer acceptance from this Builder handoff. No merge or UIX-C work is included.

## Final Builder status

UIX-B PREMIUM ONE-SCREEN REFINEMENT COMPLETE — READY FOR CODEX TESTER

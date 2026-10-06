# UIX-A — Visual foundation, design system, shell, Command Centre, Race Weekend Hub

Status: **implemented, not yet validated.** This document records the decisions so later stages (UIX-B live race, standings, management screens) inherit them instead of redesigning them.

Baseline: accepted Race v8 build `b31104fe045e7b7aea6797dff9b71c37f95cc3ea` (simulation version 8, progression revision 5).
Branch: `claude/uix-a-career-foundation`.

Race v8 gameplay, the database schema, API and repository contracts, Career and weekend rules, persistence, RNG and simulation are **unchanged**. UIX-A is presentation only.

## 1. Audit summary (before UIX-A)

### Architecture
- Next.js 16 App Router with React 19. Server pages read through repository functions in `features/career/server.ts` and hand plain data to client views.
- A single client `AppShell` sat in the root layout, and one 1,100-line `globals.css` held everything.
  - Tailwind v4 was installed but effectively unused; the styling was hand-written CSS.
- i18n is a typed JSON catalog (`en`, `zh-TW`) with a `useI18n()` provider. Every key is enforced in both catalogs by `tests/i18n.test.ts`.

### Weaknesses
- **The shell knew only the URL.** It could not show team, season, round or the live weekend, so every page re-stated its context, or didn't.
- **Equal-weight cards everywhere.** The Career home was four identical panels plus a progress panel, with the next action buried inside one of them.
- **The weekend page was a flat list of sessions.** Completed, current and locked sessions looked the same, and the hints for each session were listed under the whole list.
- **Hard-coded colours, no tokens.** `.active` was a global class used by unrelated screens, and `--border` was referenced but never defined.
- **Colour was the only state signal** in several places, and there was no focus or hover system beyond a default outline.

### Strong patterns kept
- The server-page → client-view split.
- The `loadCareerData` error contract and `CareerUnavailable`.
- The session control components (Practice, Qualifying and Sprint Manage / Simulate forms with confirmation steps). They are reused unchanged.
- The championship read model and its `championshipSummary` projection.
- The i18n provider, `LocalizedPageTitle`, and the language selector with its persistence warning.

### Risky coupling found
- **Live session screens resize the old shell.** The Race, Practice and Qualifying CSS reshapes the shell (`body:has(.race-ops) .app-shell / .sidebar / main`).
  - UIX-A preserves that geometry on the new shell (`shell.css`, "Live session screens").
  - The old selectors remain, untouched, in the Race section of `globals.css`.
- **The Race bar is sticky at `top: 0`.** On those screens the new top bar is therefore static, as the old one was.
- **`progression-actions.ts` imports the server repository**, so any client module that renders `TransitionControl` pulls in `server-only`. This is unchanged, and the tests mock the action modules as before.

## 2. OpenArt usage and cost

| # | Purpose | Model (cheapest suitable) | Config | Credits | History ID |
|---|---|---|---|---|---|
| A | Shell + Command Centre — "Pit Wall Graphite" | Kling 3 Omni, text-to-image | 1k, 16:9, 1 image | 10 | `Rl4ueE8BMWc0hlGvMBxx` |
| B | Shell + Command Centre — "Sports Broadcast Paddock" | Kling 3 Omni | 1k, 16:9 | 10 | `4v0DJFACsL42vguThMMc` |
| C | Shell + Command Centre — "Race Engineering Telemetry" | Kling 3 Omni | 1k, 16:9 | 10 | `ML5f06b2QOF8q6Pib8rB` |
| D | Race Weekend Hub progression concept | Kling 3 Omni | 1k, 16:9 | 10 | `lmRuhbFBIxsArzFORwUK` |

- **Total: 4 generations, 40 credits** (balance before: 4,000).
- **No higher-cost model was used.** Kling 3 Omni at 1k was the cheapest image model listed (10 credits, against 15–42 for the others).

**Limitation.** This session's network policy blocks `cdn.openart.ai`, so the Builder could not download or view the generated images. The direction was therefore chosen from the four concept specifications against the brief's decision standard, not from visual inspection. The images are in the OpenArt account under the history IDs above for the Project Lead to review.

No generated imagery is committed. The interface is entirely code-drawn: CSS surfaces, and inline SVG icons in `components/ui/icon.tsx`.

## 3. Selected direction — "Pit Wall"

The base is concept **A** (graphite pit-wall command centre). From **C** it takes engineering precision for data: tabular numerals, hairline borders and uppercase micro-labels. From **D** it takes the weekend progression track. From **B** it takes only one restrained broadcast gesture: the angled cut corner on the single most important surface of a screen.

### Character
- A team operations room on a race weekend: calm, dark-graphite surfaces, warm off-white text and one signal colour.
- The signal colour is the existing lime `#d7ee69`, kept for continuity with the live Race UI. It means "act here / current"; it does not mean "motorsport red".
- The team colour is identity only: a stripe on the team block, the driver cards and the page identity. It never carries text or status.

### North Star interpretation
Motorsport Manager 2 was used as a benchmark for confidence, hierarchy, density and the feel of a race weekend.

### What was not copied
- No logos, artwork, icons, screen compositions or brand colours.
- The layout grammar is our own: a rail with a team block, a mission hero, a 12-column panel grid, and the session track.
- Every value shown is real game state from existing read models.

### "Where am I / what matters / what next"
- **Shell:** the location trail (Career › section) and the active rail item.
- **Command Centre:** the mission hero.
- **Weekend Hub:** the progression track plus the next-session card, which holds the existing Manage / Simulate controls.

## 4. Design system

### Tokens (`src/styles/tokens.css`)
- **Colour roles:**
  - background;
  - rail;
  - surfaces 1–3, selected and overlay;
  - borders subtle / default / strong;
  - text primary / secondary / muted / inverse;
  - signal (+ strong, soft, line);
  - positive / warning / critical / info (+ soft);
  - `--team-accent`.
- **Typography:**
  - a system sans stack with CJK fallbacks (Noto Sans TC / PingFang TC / Microsoft JhengHei) and a mono stack;
  - scale: hero 40 · page 28 · section 18 · card 15 · body 14 · meta 12 · label 11 · figure 48;
  - weights 400–800.
  - Display weight (800, italic for figures) is reserved for the hero title, championship position, car numbers and the brand mark.
  - Dense data uses `tabular-nums`.
- **Spacing:** a 4px scale (`--space-1` … `--space-12`); no one-off margins in UIX-A code.
- **Shape and elevation:**
  - radius 3 / 6 / 10;
  - the cut-corner size `--cut`;
  - two shadows (raised, overlay);
  - a focus ring.
- **Motion:**
  - `--ease-out` and fast 120ms / base 200ms / slow 320ms durations;
  - all durations become 0 under `prefers-reduced-motion`.
- **Legacy aliases:** `--bg --panel --line --border --muted --accent` now point at the tokens. Every existing screen therefore shares the palette with no layout change, and the long-missing `--border` now exists.

### Surface hierarchy
| Layer | Used for |
|---|---|
| Base page | the background |
| Section | `ui-surface`: panels |
| Raised | `ui-surface--raised`: the mission hero, the next-session card |
| Selected | the current session, the current round, the active nav item |
| Overlay | the language warning, the mobile drawer |

Only the one most important surface per screen gets the cut corner.

### Component states
Defined once in `primitives.css`:
- hover (surface step);
- focus (signal outline on every focusable element);
- selected / active (selected surface + signal edge);
- disabled (50% opacity, not-allowed cursor);
- warning / critical / success / info badges (icon + text).

### Shared primitives
| File | Contents |
|---|---|
| `components/ui/icon.tsx` | 21 stroked SVG icons, decorative by default |
| `components/ui/primitives.tsx` | `StatusBadge`, `ButtonLink` / `buttonClass`, `Stat`, `Alert`, `Skeleton`, `Meter` |
| `components/layout/status-pages.tsx` | error, not-found and loading skeleton content |

Status is always icon + text. Kept deliberately small: no abstract library, only what UIX-A uses and UIX-B will need.

## 5. Global application shell

### Routes
- The root layout now renders only the document and locale.
- The `(main)` route group renders the shell for home, the Career list and new Career. The URLs are unchanged.
- `career/[careerId]/layout.tsx` renders the shell with the Career context: team, Career name, season, rounds completed / total, current date and the active weekend.
  - The context is built by `features/career/shell-context.ts` from the same overview and progress reads the page uses.
  - React `cache` (`features/career/cached-reads.ts`) dedupes those reads within a request.
  - If the context cannot be read, the shell still renders from the URL and the page reports the error as before.
- Error and not-found boundaries exist at the root (with their own shell) and inside the Career layout (content only), so there is never a double shell. A Career-level `loading.tsx` keeps the shell while content loads.

### Rail
- A team identity block (team-colour stripe and short-name mark).
- **Team management:** Command Centre, Race Weekend (only while a weekend is live), Car development, Standings.
- **Game:** Careers.
- Only real, playable pages are linked. Team, Drivers, Calendar, Finance and similar are not shown.

### Top bar
- Location trail.
- Season name, rounds meter (with the value also as text) and current date.
- Language selector.

### Responsive behaviour
| Width | Behaviour |
|---|---|
| ≥ 960px | Persistent rail |
| ≤ 1240px | The meter hides |
| < 960px | The rail becomes an off-canvas drawer behind a labelled menu button (`aria-expanded`, `aria-controls`). It closes on navigation and on Escape, and is `visibility: hidden` while closed so it is out of the tab order. |
| ≤ 560px | Only the section name and language selector remain in the bar |

### Team colour
Applied only if it is a plain hex value (`safeTeamColor`); content data is never injected as raw CSS.

## 6. Career Command Centre (`features/career/command-centre*.ts(x)`)

**Before:** a page header, a progress panel and four equal cards (team, season, next event, championship).

### Hierarchy
1. **Identity:** the team name with its colour stripe, plus Career · season, with Car development as the secondary action.
2. **Mission hero** (raised, cut corner). Exactly one of:
   - a live weekend: format, round and dates, a session step row with the current step highlighted, and **Open Race Weekend**;
   - the next event: **Advance to Event**, the existing progression action;
   - season complete: open the final standings.

   Circuit facts (length, race laps, localised location via `Intl.DisplayNames`) appear only when the overview carries that circuit.
3. **Championship:** constructors' position as the headline figure, points, gap to the leader (or "Leading"), the drivers' leader, and a link to the standings.
4. **Your drivers:** car number, name and code, position and points.
5. **Season progress:** rounds figure, meter, season and date.
6. **Recent results:** the last 5 rounds with Sprint and Grand Prix finishes as chips (P# / DNF / DSQ as text), each linking to that weekend's results.
7. **Season calendar:** every round with completed / current / upcoming state as icon + text, Sprint marked.

### Real data
- The model (`commandCentreModel`) is a pure projection of the overview, progression and championship read models.
- Long names wrap (`overflow-wrap: anywhere`) and calendar names truncate with ellipsis.
- Missing circuit facts are omitted.
- A failed championship read shows an explanation and a link instead of empty panels.
- New Careers show "no results yet" states.

## 7. Race Weekend Hub (`WeekendView` in `features/career/progression-views.tsx`)

### Order on the page
1. **Briefing header:** weekend format, event name, circuit, round, dates, state badge, sessions done, current date, and circuit facts when known.
2. **Progression track:** sessions as connected nodes.
   - Completed: check + muted.
   - Current: signal fill, raised, `aria-current="step"`.
   - Locked: lock + dashed border.
   - Each node has a status badge as text and the player's result chips when a classification exists (Grand Prix Qualifying, Sprint, Grand Prix).
3. **Next session card:** session name, status, its own guidance hint, and the session's existing Manage / Simulate controls (the Manage / Open link is styled as the primary action). "Simulate all remaining Practice" sits below as a secondary action.
   - When everything is done: the completion state, Weekend Results and Championship links.
4. **Side panel:** your drivers (positions and points) and the weekend scoring rules (the existing notice).
5. **Schedule:** every session row with state, result chips and its controls. The current one points up to the card, so actions are never duplicated.

**Preserved:** every existing control, link, confirmation flow, hint text, the scoring notice, the result links and "not entered" handling. Practice is still never skippable.

## 8. i18n

- **New keys** (both catalogs, same placeholders in the same order):
  - `navigation.commandCentre | raceWeekend | home | game`;
  - `shell.*` (6);
  - `commandCentre.*` (28);
  - `weekendHub.*` (6).
- **Existing keys are reused** wherever the meaning already existed (progression, championship, career).
- **No hard-coded player-facing strings** in the new code. Separators (`·`, `/`, `—`) and fallbacks (`—`) are the only literals.
- **Long-text handling:** zh-TW labels use reduced tracking. Nothing depends on English string length (flex-wrap, `minmax(0, 1fr)` columns, ellipsis only on the calendar list).

## 9. Accessibility

- A skip link to main content.
- Landmarks: `aside` rail with its own label, `nav` labelled Primary, `header`, `main`.
- Every section is labelled by its heading.
- Current state: `aria-current="page"` (nav) and `aria-current="step"` (sessions).
- Visible focus on every focusable element.
- Status is always text + icon; icons are `aria-hidden`.
- The drawer is removed from tab order while closed.
- Contrast: tokens target ≥ 4.5:1 for text on every surface.
- Reduced motion: no entrance animation, no shimmer, no drawer slide.

## 10. Motion

- One short entrance rise (320ms) on the main sections of a screen.
- Fast colour transitions on hover.
- A 200ms drawer slide.
- No looping animation except the loading shimmer, which is disabled under reduced motion.

## 11. Frozen backend boundary and product dependencies

Nothing here changed a schema, repository, server action, API contract, Career rule, weekend rule, simulation or RNG. The genuine gaps below were left alone.

- **Weekend conditions:** the progression model has no weekend-level weather or conditions read, so the hub shows none rather than inventing it. Smallest future change: a read-only public forecast summary per event.
- **Session schedule times:** sessions carry only Career dates, not times, so the hub shows order and state, not a timetable.
- **Circuit facts for any event:** `getCareerOverview` returns the circuit of the current / next event only. Smallest future change: a read-only `getCareerCircuit(eventId)` (or including the circuit in `ProgressEvent`).
- **Practice and Sprint Qualifying results:** the championship read model contains Grand Prix Qualifying, Sprint and Grand Prix classifications only, so other sessions show their completed state without a result chip.

## 12. Future Race UI (UIX-B) considerations

- **Inherit:** the tokens, `StatusBadge`, `Meter`, `Icon`, the surface layers and the signal semantics (signal = actionable / current). Do not add new hard-coded colours.
- **Retire the old shell selectors.** The live screens still carry the old shell overrides (`body:has(.race-ops) .app-shell/.sidebar/main`) in the Race section of `globals.css`; UIX-B should remove them when it rebuilds those screens. The new-shell equivalents live in `shell.css`.
- **Timing tower:** the tabular-nums, hairline-row and uppercase micro-label language of the Command Centre is the intended basis. Player rows should use the team stripe pattern, as in `.cc-driver`.
- **Re-check the sticky top bar.** On live screens the shell top bar is static, so the race bar can stick; UIX-B may choose to fold race context into the top bar instead.

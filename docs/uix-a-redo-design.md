# UIX-A REDO — "Paddock Hybrid" design record

Visual foundation for the Career shell, the Career Command Centre and the Race Weekend Hub. It replaces the superseded
UIX-A pass (commit `3aa56a5`, never merged), which chose a direction without seeing its concepts. This pass was
implemented from the accepted Race v8 baseline `b31104f` after the Project Lead uploaded the shortlisted OpenArt
concepts and they were reviewed directly.

Motorsport Manager 2 was a quality benchmark only. No layout, asset, icon, branding or trade dress is copied; the brand
mark, the icons and the layouts here are original.

## 1. Concepts reviewed (uploaded by the Project Lead)

All six Gate A concepts used GPT Image 2.5 Sunburst (text-to-image, 2K, medium, 16:9) at 45 credits each, 270 credits
in total. The three shortlisted images were inspected visually:

| Image | OpenArt history ID | Concept | What it got right | What it got wrong |
|---|---|---|---|---|
| 1 | `l32jCntJ5iTOaphY9DAF` | C — Modern Team HQ (Command Centre) | Grouped navigation rail (Headquarters / Engineering / Championship / Game); calm constructors table with the player row highlighted; recent results with per-driver chips; calendar rows that pair an icon with text status; a single gold call to action; restraint. | Photographic garage hero and driver portraits (assets we don't have); marketing taglines; weak use of the championship position as a hero number. |
| 2 | `UKXtECFahQQ5e514NCST` | B — Premium Broadcast (Weekend Hub) | Huge condensed-italic event title with a Sprint Weekend badge; circuit outline beside its facts; weekend progression stepper (tick / current ring with status pill / lock) with status text under each step; a Next Session card with one big title, a description and a primary Manage plus outline Simulate pair; driver strips with big numbers; a Weekend Rules note. | Horizontal top tabs that won't scale past five sections; red used everywhere; too much italic; taglines; invented data (turn count, lap record, session times). |
| 3 | `f0KdUahsZRr7ze0T0E4p` | D — Hybrid (Command Centre) | The strongest composition: a "Next Up" hero (angled tag, round, giant event title, session chips, one amber CTA) beside a championship module with a big P-figure, points, gap and a short table with the player row; driver cards with huge italic numbers on team colour; recent-form table; a full-season strip with a legend. | Team colour floods whole surfaces; invented data (session times, ages, nationalities, contracts, weather forecast, coordinates, turns); taglines; photos; italic overuse. |

## 2. Selected direction: synthesis

- **Image 3 (Hybrid)** sets the Command Centre composition and the display moments: the Next Up hero with the
  championship module beside it, driver cards, recent form and the season strip.
- **Image 2 (Broadcast)** sets the Weekend Hub: event identity with the real circuit outline, the progression stepper
  and the Next Session card (primary Manage, outline Simulate).
- **Image 1 (Team HQ)** sets the shell and the calm parts: the grouped navigation rail, tables with dividers only and a
  highlighted player row, and status shown as icon plus text.

Rules taken from the review:

- Neutral deep-ink surfaces.
- One amber signal colour, used only for "your next action / current state".
- Team colour marks identity only: a stripe, the number block, the player-row marker and the "You" tag. Text on team
  colour uses ink computed for contrast.
- Condensed italic is reserved for identity moments: event names, driver names, big figures.

### Rejected elements

- Photographs, garage heroes and driver portraits. A real track outline (bacinger geometry, MIT, already in the repo)
  is the visual anchor instead.
- Taglines and decorative marketing copy. The old `shell.tagline` footer was removed from the shell as well.
- Any data the game does not have:
  - session times, driver age, nationality and contracts
  - weather forecasts
  - turn counts, lap records and coordinates
  - Practice and Sprint Qualifying result chips, which the Championship read model does not carry
- Horizontal top-tab navigation.
- Team colour as a surface fill.
- Red as a general accent: red means only DNF / DSQ / error.
- A settings gear (no settings exist), the superseded pass's lime accent and its "ops console" tone.

### OpenArt refinement usage

None. The three uploads were enough to decide every open question, so no refinement image was generated. OpenArt
spend for UIX-A REDO is the 270 Gate A credits only.

## 3. Design system (`src/styles/tokens.css`, `primitives.css`)

| Area | Values |
|---|---|
| **Surfaces** | `--surface-env` #0a0f16 → `--surface-rail` → `--surface-1` (modules) → `--surface-2` (cards inside modules) → `--surface-3` (interactive / done) → `--surface-overlay`; plus `--surface-inset` for wells. Separation is by `--line-subtle` / `--line` / `--line-strong`. |
| **Text** | `--text-1` / `--text-2` / `--text-3`, all ≥ 4.5:1 on every surface. |
| **Signal** | `--signal` #f5a524 (amber), with `--signal-strong`, `--signal-tint`, `--signal-line`; `--text-on-signal` for ink on amber. |
| **Status** | `--ok`, `--warn`, `--bad`, `--info`, each with a tint. Always paired with an icon and/or text. |
| **Identity** | `--team` / `--team-ink` / `--team-tint`, set per Career from the persisted team colour through `safeTeamColor` (hex only; anything else falls back to neutral) and `readableInk` (WCAG contrast: near-black on light liveries, white on dark ones). |
| **Type** | Inter Variable for the UI; Barlow Condensed 600/700/700-italic/800-italic for display. Both are self-hosted OFL-1.1 `@fontsource` packages pinned to exact versions, with CJK fallbacks (Noto Sans TC / PingFang TC / Microsoft JhengHei). Scale: `--fs-hero` (fluid), `--fs-figure`, title, section, card, body 14px, meta 12px, label 11px uppercase tracked. |
| **Spacing** | 4px base (`--sp-1` … `--sp-12`). |
| **Shape** | Radii 3 / 6 / 10. One broadcast slant (`--slant`) on the hero tag and number blocks. |
| **Focus** | A 2px amber outline on every interactive element (`:focus-visible`). |
| **Motion** | `--t-fast` / `--t-base` / `--t-slow`, all zeroed under `prefers-reduced-motion`; the skeleton shimmer stops too. |

Primitives:

- `ui-module` (with head / body / foot)
- `ui-btn` primary / outline
- `ui-link`
- `ui-status` with tones done / current / upcoming / locked / info / warn, always icon + text
- `ui-tag`, `ui-format` (Sprint highlighted)
- `ui-stats` / `ui-stat`
- `ui-table` (player row = team tint + inset marker + "You" text tag)
- `ui-alert`, `ui-note`, `ui-empty`, `ui-skeleton`
- `ui-display`, `ui-figure`, `ui-label`

React counterparts: `Module`, `StatusBadge`, `SessionStatusBadge`, `Stat`, `Alert`, `Skeleton` and an original
24 × 24 stroke `Icon` set.

**Legacy layer.** The head of `globals.css` keeps the shared classes still used by out-of-scope screens (`panel`,
`eyebrow`, `button-link`, `text-link`, `career-*`, `language-control`…). Their geometry is unchanged and they now use
the token palette. Everything from `.race-controls` down (Race / Practice / Qualifying / Sprint / Standings / Results)
is byte-identical to the baseline.

## 4. Global shell

**Routes.** The root layout keeps only the document, locale, fonts and i18n. The shell comes from `app/(main)/layout.tsx`
(home and Careers) and from `app/career/[careerId]/layout.tsx`. The Career layout reads overview and progress through
request-scoped `cache()` reads (`cached-reads.ts`), so the page under it doesn't read twice. It builds a pure
`careerShellContext`.

**Rail.** Brand mark, then team identity (short-name tag on team colour, team name, Career name), then navigation
grouped as:

- **Headquarters:** Command Centre, plus Race Weekend with a "Live" text marker, only while a weekend is active
- **Engineering:** Car development
- **Championship:** Standings
- **Game:** Careers

At the bottom, the season. Without a Career context (or with a context for a different Career) the links come from
the URL alone.

**Context bar.**

- Breadcrumb: Career, then section, then event, then session.
- Season.
- Round x / y with a segmented round strip.
- Career date.
- Language selector.
- Sticky, with a translucent ink background.

**Phone / small tablet (≤ 820px).** The rail becomes an off-canvas drawer:

- menu button with `aria-expanded` / `aria-controls`
- close button and scrim
- Escape closes it
- focus moves to Close on open and back to Menu on close
- `visibility: hidden` while closed, so it can't take focus
- it closes on navigation without an effect

**Boundaries.**

- Root `error.tsx` / `not-found.tsx` wrap their own shell.
- The Career-level `error.tsx` / `not-found.tsx` render content only.
- There is deliberately no Career-level `loading.tsx` (UIXA2-REG-001): a loading boundary is a Suspense boundary, so
  the response starts streaming with HTTP 200 before a page can call `notFound()`, and invalid Career / event URLs
  showed the not-found UI with status 200. Without it they return 404.

**Live-session compatibility.** The shell keeps the `app-shell` / `sidebar` / `brand` / `main` hooks the frozen Race
stylesheet sizes (170px / 140px rail, 22px content padding, no max width, rail hidden ≤ 820px). On `.race-ops` pages:

- The context bar is `position: static` so it never fights the sticky race bar.
- The rail is compacted.
- The phone menu button is hidden, because the Race stylesheet hides the rail there.

## 5. Career Command Centre

Data comes from `features/career/command-centre.ts`, a pure projection of overview + progress + Championship source.
Points stay in half-point units.

1. **Mission hero** (8/12). Angled tag ("Next up" / "Weekend in progress" / "Season finished"), format badge, "Round x of
   y", giant event title, circuit and dates, then the session chips. Each chip shows its state by icon shape (tick /
   ring / lock / calendar) and visually-hidden text. One primary action:
   - the existing `TransitionControl` "Advance to Event"
   - or "Open Race Weekend"
   - or "Open standings" when the calendar is complete

   The real circuit outline sits on the right, with location, lap length, Grand Prix laps, race distance and Sprint
   laps.
2. **Constructors' Championship** (4/12). A big P-figure, points and gap to the leader ("Leading" when level), the
   standings stage, then a top-five table plus the player row after a gap marker.
3. **Your drivers.** A car-number block on team colour with computed ink, the abbreviation, the name in condensed
   italic, then standing / points / wins / last Grand Prix (P#, DNF, DSQ). Standing reads "—" until a Sprint or Grand
   Prix is classified, so drivers never show as "tied P1".
4. **Recent form.** The last five classified rounds, newest first, linking to Weekend Results. One column per player
   driver. A race finish chip is tinted for win / podium / points / out. A Sprint chip carries an "SPR" label.
5. **Season calendar.** Every round shown as number + state icon (done tick, current ring, next arrow with dashed
   outline, upcoming plain) + "S" Sprint mark, with visually-hidden text per round and a legend.

**Degraded states.** If the Championship read fails, the three Championship modules show an info alert, and the
"Open standings" link stays. Before any result they show "No completed sessions yet".

## 6. Race Weekend Hub

`WeekendView({ progress, eventId, extras? })` keeps its signature. `extras` is optional, and the page supplies it only
when the reads succeed:

- team colour
- the circuit card (current/next event only)
- the player's drivers with this weekend's Grand Prix Qualifying position, Sprint finish and Race finish

The hub is laid out as follows:

1. Back link, then the event hero: label, format badge, round, giant name, circuit, dates, current date, and the
   circuit outline with its facts.
2. **Weekend progression**: a stepper of nodes and connectors. Completed is a green tick, current is an amber filled
   ring with `aria-current="step"`, locked is a lock. Each node has a status badge with text. On phones the stepper
   turns vertical.
3. **Next session**: the session name as a display title and the existing hint for that session type. Below them are
   the existing controls:
   - Practice / Qualifying / Sprint Qualifying / Sprint controls, and the Race link
   - Simulate all remaining Practice

   Manage / Open / Resume links are styled as the primary button and Simulate as outline. In the existing
   confirmation step, the Confirm button becomes primary. After the Grand Prix it shows "Weekend completed" plus
   Weekend Results / Championship links.
4. **Your drivers** and **Weekend rules** (`progression.notice`) in the side column.
5. **Sessions** schedule: every session with icon, name, status and its controls. The current session's controls live
   only in Next session, and its row says so.

## 7. English / ZH-Hant

- 67 new keys, all present in both catalogs with identical placeholders (`commandCentre.*`, `weekendHub.*`, `shell.*`,
  `navigation.commandCentre|raceWeekend|home`).
- Content data (event, circuit, driver and team names) is not translated.
- Dates and numbers use the existing `Intl` formatters; the region name uses `Intl.DisplayNames` in the active locale.
- In zh-TW, display text never gets a synthetic italic (`font-synthesis: none`): Latin content keeps Barlow's real
  italic and CJK stays upright. Tracking is lighter on labels, buttons and the brand.

## 8. Responsive

| Width | Layout |
|---|---|
| ≥ 1221px | Rail 252px. Command Centre: hero 8 + championship 4 / drivers 6 + form 6 / season 12. Hub: hero 2 columns, next session 1.55fr + side 1fr. |
| 821–1220px | Rail 220px; season and date leave the bar. Command Centre: hero full width, championship + drivers side by side, form and season full width. Hub: single main column, side modules in an auto grid. |
| ≤ 1024px | Hub hero stacks with the circuit below. |
| ≤ 820px | Drawer navigation; single column everywhere; vertical stepper; the bar shows the menu, the last crumb, the round and the language. |
| ≤ 540px | Full-width primary actions; circuit card stacked; the language label is visually hidden. |

Single-column grids use `minmax(0, 1fr)`, so nowrap text cannot widen the page. No screen in the review matrix scrolls
horizontally (checked at 390, 1024 and 1440).

## 9. Accessibility

- Skip link.
- Landmarks: rail `aside` with a label; primary `nav`; breadcrumb `nav` with `aria-current="page"`; `main#main`.
- One `h1` per page; modules are sections labelled by their headings.
- Every state is icon + text; colour never carries meaning alone.
- The current step is `aria-current="step"`.
- Tables have captions and column scopes.
- Decorative glyphs are `aria-hidden`; the circuit SVG has `role="img"` and a label that names the start/finish marker.
- Targets are 44–48px on primary actions and nav.
- Amber focus ring on every interactive element.
- Reduced-motion support.
- Errors use `role="alert"`.

## 10. Frozen boundary

Presentation only. No change to:

- the Race v8 simulation, overtaking, circuit model, Sprint logic, tyre and pit physics, Boost / Recharge, Overtake
  Mode, Active Aero, weather, SC / VSC, lapping / blue flags, regulation or RNG
- persistence, Career and weekend progression rules, championship rules or repositories

The new view models only read existing read models. `sprintLapCount` is called read-only to display the Sprint
distance the Sprint already uses.

## 11. Lessons carried from the superseded pass (technical only)

- The route-group shell with Career context, request-scoped cached reads, and boundaries placed inside or outside the
  shell.
- Hex-only team colours, the `--border` alias, and overriding the legacy `.active` rule on nav items.
- `minmax(0, 1fr)` single-column grids.
- A drawer without effect-driven state.
- Race-page shell geometry kept through the historical class hooks.

Discarded from it: its visual direction (lime accent, ops-console tone), its component code and its tests. Everything
here was re-derived.

# UIX-B — Live Race Weekend experience (Practice · Qualifying · Sprint · Race)

Base: UIX-A REDO `44580a5` (Paddock Hybrid). Branch: `claude/uix-b-race-experience`. Presentation layer only:
**Race v8 simulation and gameplay contract unchanged**, no backend, API, schema or persistence change.

## Preflight — UIXA2-REG-001 (commit `9fc668a`)

Invalid Career / Career-event URLs rendered the not-found UI with HTTP 200. Root cause: `src/app/career/[careerId]/loading.tsx`
is an implicit Suspense boundary, so Next.js 16 starts streaming (status 200 committed) before the page's `notFound()` runs.
Fix: remove that `loading.tsx` (and the now-unused `LoadingContent`/`.status-loading`). `tests/route-status.test.ts` guards that
no `loading.tsx` exists under `src/app`.

## OpenArt references

GPT Image 2.5 Sunburst at 2K (Nano Banana Pro was considered for a text-heavy refinement pass and not needed). Four generations,
430 credits: Race Command Centre (high, 16:9, `l7SYIhUyN7rpgZUbYty0`), Qualifying (high, 16:9, `Kbf2jbF7dBFcgV9edOSL`),
Practice (medium, 16:9, `DK2HZWHsxgC9PfvDUT4Z`), mobile Race (medium, 9:16, `6xzqzZgaWD99lboMmJ2b`). `cdn.openart.ai` is blocked
from this environment, so the Project Lead uploaded the four images and they were inspected visually before implementation.

Adopted (each backed by an existing system):

- **Race** — one live control bar (lap clock, flag, weather chips, play/step/speed/next-event, auto-pause) above a
  three-column tower · map · driver panel; a severity-ranked **issues strip** under the bar; two-car switch with status flags;
  driver panel stacked as Tyres → Fuel → Energy → Overtake/Aero → Pace → Pit, each with segmented mode controls.
- **Qualifying** — Q1/Q2/Q3 phase stepper in the header, a **cutoff strip** (cutoff time + each player car with
  safe/at-risk state and delta), cutoff rule line in the tower.
- **Practice** — Run plan / Setup / Knowledge / Runs tabs in the driver panel, track legend counts, run log.
- **Mobile Race** — compact sticky bar, issue card, Strategy · Timing · Track · Feed pane switch, two-car switch.

Not adopted (no backing data or system in Race v8 — would be fake gameplay): map Sectors/Tyres/Gap modes and S1–S3 labels,
wall-clock timestamps in feeds, "BOX NOW?" one-click card actions (the card selects the car and opens its Strategy pane instead,
where the real Box/Cancel form lives), qualifying push-lap counts and per-car location column, numeric 1–10 setup bars,
setup presets/Apply/Reset, practice run timeline, track length/turn count, per-compound tyre-knowledge bars, run notes, wind,
pit-stop stationary time, ±15 s/±30 s step sizes. Copy, names, team names and numbers in the mockups were not reused.

## Shared live-session architecture

`src/features/live/live-frame.tsx` (new): `LiveHeader` (kind label, title, circuit, back link, badge), `SessionNav` (weekend
sessions with done/current/locked icon + `aria-current`), `LiveClock`, `ConditionChips` (`data-key`, wet/dry state in text),
`PlaybackControls` (play/pause, step, 1–8× speed `aria-pressed`, next strategic event, auto-pause and reduce-motion switches
with ON/OFF text, `role="status"` phase), `PaneSwitch`. Practice, Qualifying, Sprint and Race all compose these.

`src/styles/live.css` (new) replaces the retired legacy live tail of `globals.css`. Layout is `grid-template-areas`; the root
`.live[data-pane]` drives mobile pane switching; the shell enters live mode via `body:has(.live)` (slim rail, static context bar).

## Strategic issues — UX-RACE-001

Problem: critical tyre-cliff warnings flashed past at 8× because the attention line is transition-based.

`src/features/race/viewer/issues.ts` is a **pure read model** over the committed public Race view (existing helpers:
`tyreCondition`, `fuelCritical`, `fuelShort`, `battleContext`, `controlMode`, `insight.pitEstimate`, `tyreFit`, `regulation`):
an issue is listed for **as long as its condition holds** at each checkpoint, keyed `kind:car`. Kinds and severities:
CRITICAL (fuel critical, past cliff, poor tyre for conditions, dry-tyre rule urgent), WARNING (cliff within the existing
`CLIFF_WARNING_LAPS`, fuel short, battle behind), OPPORTUNITY (battle ahead, Overtake Mode available), INFO (degrading,
stop requested, SC/VSC). Player cars only; empty unless the Race is RUNNING.

`issues-rail.tsx` renders the issues in the sticky live bar: severity word + icon + border (never colour alone), car button
(selects the car and opens Strategy), "since L…" first-seen lap, acknowledge toggle (demotes, never hides; re-arms when the
condition clears and returns), "N more" beyond four, a strategic log of attention events (last 40), and an assertive live region
for the newest unacknowledged critical issue. The same issues appear in the driver panel and set the severity shown on the two-car switch.

No change to auto-pause, NSE, attention triggers, tyre model, cliff thresholds or any Race rule.

## Responsive

Desktop ≥1221: tower · map · (switch / panel). 1600+: wider side columns. 821–1220: two columns. ≤820: one column, pane switch,
sticky compact bar; issue cards scroll sideways. ≤540: segmented controls wrap; session extras (simulate remainder) take a full
row. ≤379: play/pause becomes icon-only (accessible name kept). Verified with no horizontal overflow at 1440, 1280, 1024, 768,
390 and 360.

## Accessibility and i18n

All new strings in `en` and `zh-TW` with identical placeholders (`live.*`, `issues.*`). Tabs use `tablist/tab/tabpanel` with
panels kept mounted (`hidden`); switches are native checkboxes with `role="switch"`; pressed states use `aria-pressed`; flags
and severities always carry text or sr-only text; reduce-motion preserved.

## Deferred

Results/Standings redesign, Careers, Car Development (out of scope). Pre-existing: `/favicon.ico` 404; finished Qualifying shows
"In Q3" for a car that reached Q3 (baseline `qualifying.status.Q3` copy).

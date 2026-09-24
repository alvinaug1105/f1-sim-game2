# Phase 12 completion report

## Race UI and controls

The Race page now presents a dark operations interface: timing tower on the left, original schematic map and player shortcuts in the centre, selected driver on the right, live weather/Race Control above, and playback below. Laptop/tablet layouts move controls into compact columns below the map. Stints, forecast and diagnostics remain accessible in disclosure panels.

Timing shows authoritative position, driver abbreviation, team accent, gap/interval toggle, compound/age, pit count/status and DRS eligibility. Grid gains include pit cycles and are not called overtakes. The selected driver shows position/gaps, tyre wear/temperature, pace, remaining/projected fuel, ERS charge/mode and pit strategy. Only active player-team entrants receive commands. AI, retired and finished panels are read-only; server ownership/revision enforcement is unchanged.

## Circuit and movement

Two distinct normalized, original SVG polylines are keyed by the bundled source-circuit UUIDs. The real display names do not select or define the shape. Unknown circuits have a generic fallback. No official artwork, branding or layout was copied.

Map progress comes from saved `progressMicrolaps`, with a completed-laps/time-gap fallback for legacy saves. Pure helpers safely wrap negative and multi-lap progress, interpolate along segment lengths and retain authoritative classification. A shared animation frame moves all markers/labels toward each saved checkpoint; retirement freezes and pit stops show PIT. Callouts avoid destination marker/label collisions and are drawn above markers.

## Playback and determinism

Pause, single lap, 1×/2×/4×/8× and Next strategic event use the existing deterministic application services. A single in-flight request must commit before the next timer starts. Speed changes only the 2400/speed delay. Pause cancels future requests; an already committing request may finish. Commands suspend playback until explicitly resumed. Refresh starts paused from saved data.

Optional auto-pause covers player incidents/retirements/pit completion, control changes, weather/DRS transitions and finish. Strategic advance checks every committed lap and always stops on these triggers, with a 20-lap cap. Finish stops requests and removes driver command controls.

The PostgreSQL regression restores the same frozen Race checkpoint and IDs inside its disposable schema, runs both 1× and 8× with identical lap-scheduled pace/pit commands, reloads the results, and compares the **entire saved v7 Race state for exact equality**. Fake-clock tests additionally compare English/Chinese scheduling, pause at lap 20, rapid play/pause/speed changes, mutation serialization and no extra lap after auto-pause. No v8, schema change or migration was added.

## Weather, Race Control and events

Rain, track water, air/track temperature and DRS status are persistent header information. GREEN/VSC/Safety Car use text and distinct colours. Forecast access remains available. Existing structured event records are formatted with translation keys at render time; translated prose is never saved.

## Actual browser verification

Used the production Next.js build with a real disposable PostgreSQL database. Created a Mercedes Career in the UI, completed the existing development practice/qualifying placeholders, and started a v7 Race. Selected both player drivers, saved different pace/fuel/ERS modes, selected an AI entrant and verified zero command buttons, changed 1× → 4× → 8×, and paused at lap 2.

Captured the complete saved checkpoint, changed language, refreshed, and confirmed exact PostgreSQL state equality. The persisted language returned after hydration. Issued a Hard tyre pit request while paused; the stop committed at lap 3 and automatically paused playback. Next strategic event stopped at the rainfall transition at lap 10; normal DRS eligibility and subsequent suspension were visible.

Used explicit test-only Safety Car and VSC checkpoint fixtures in the disposable browser Career. Verified their headers, reduced pit-loss estimates, countdowns, DRS suspension, and real engine-generated restart/end events at laps 13 and 16 in both languages. These fixtures/scripts are excluded from the source export. Resumed at 8× with optional auto-pause off, reached lap 58, verified disabled playback and zero driver command buttons, refreshed and inspected persisted final classification. The Career then advanced to the Japanese weekend correctly.

## Responsive, accessibility and visual QA

Inspected actual 1440×1000, 1024×900 and 768×1024 browser viewports, including Chinese tablet labels and lower driver controls. Document widths were 1425, 1009 and 753 pixels respectively (scrollbar excluded), with no page-level horizontal overflow. Map/timing remained readable, all commands reachable, and player names wrapped correctly.

Corrected sidebar navigation overflow, excessive laptop control-panel empty space, tight mode-button sizing and marker/label layering in a crowded 20-car fixture. Selection uses text indicators/rings and pressed states. SVG markers support Enter/Space; timing/command buttons and disclosures are keyboard reachable. The local reduced-motion control was exercised during actual Safety Car advancement; system preference is handled through `prefers-reduced-motion`. No automated OS-preference emulation was available in this browser surface.

Screens are in `docs/screens/`. Twenty-car testing includes SSR of the complete tower/map, browser inspection of its static render, and DOM checks for 20 markers with zero overlapping label rectangles at the inspected checkpoint. This static fixture is a rendering check, not a live 20-car browser race or FPS benchmark.

## Verification and performance

- **423 offline tests, 18 files**, including legacy v1–v6 viewer rendering.
- **184 actual PostgreSQL integration tests, 10 files**, using temporary unique schemas and cleanup.
- `npx prisma format`, `npx prisma validate`, `npx prisma generate`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, and `npm run build` passed.
- PostgreSQL: local Homebrew 18.6, disposable `formula_viewer_verify_20260924`; all ten checked-in migrations applied; development seed executed twice.
- A local 20-car full viewer SSR sample took **23.67 ms** (32,315 HTML bytes); its 58-lap pure simulation took **8.72 ms**. Measurements are sanity samples, not a frame-rate guarantee; see `phase-12-measurements.json`.
- Existing pg adapter deprecation notices were emitted during SQL runs; they did not fail checks.

## Changes and scope

Added viewer components, a pure playback controller/model, typed application intents, original circuit-layout data/types, bilingual UI keys, responsive styles, tests and reports. Extended Race read DTOs with Career-owned abbreviations/colours and stable source-circuit ID. The separate identity update and stable roster ordering are detailed in `private-use-naming-report.md`. Removed the superseded development timing markup from the Race view while retaining its preparation form.

Every simulation source file, the Prisma schema, and all previous migrations remain unchanged. No new practice, qualifying or sprint simulation, points/championship, development, finance, contracts, facilities, staff, team orders, red flags, unlapping or multiplayer was added. The original practice/qualifying completion placeholders remain.

## Limits

The engine is still lap-checkpoint based. Map movement is visual interpolation, not corner-by-corner physics; close packs can share positions. Schematics are deliberately unrelated to official real-world circuit outlines. Viewer preferences reset on refresh except language. Historical save versions show only supported information. The deployment remains a local, private-use project; no external database or site was provisioned and nothing was published.

The disposable verification database and local preview server were removed/stopped after verification. Temporary browser fixture files are excluded from the export.

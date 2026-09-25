# Content Expansion Pass A — Builder notes

Starting main: `3175e17`. Race simulation stays at v7 and its equations are unchanged. Practice stays at version 1. No Qualifying, Sprint or other roadmap phase is started.

## Content (source database, new Careers only)
- **Grid:** 11 teams and 22 primary race drivers for 2026, exactly two per team, in `src/data/seed/content-development.ts`.
  - The existing Mercedes/Ferrari teams, their four drivers and the Albert Park/Suzuka circuits keep their IDs and keys (for example `team-aurora` and `driver-alex-smith`). No duplicates were created.
- **Circuits:** 8 real circuits.
  - Albert Park and Suzuka, plus Shanghai, Bahrain, Monaco, Silverstone, Spa-Francorchamps and Marina Bay.
  - All use the pinned bacinger/f1-circuits geometry; see `circuit-geometry-provenance.md`.
- **Development calendar:** 8 rounds in 2026-season order: AU, CN, JP, BH, MC, GB, BE, SG.
  - This is **not** the full 24-round calendar; that is Content Expansion Pass B.
  - The Japanese GP moves from round 2 to round 3, dated 27–29 March. The seed upserts events in descending round order, so an existing database upgrades in place without breaking the unique season/round key.
  - Albert Park and Suzuka keep their accepted development lengths and lap counts (5200 m / 58 laps and 4800 m / 64 laps). The new circuits use their real lengths and race lap counts.
- **No Sprint metadata:** the schema has no suitable field, and adding one isn't needed yet (Phase 15).

## Identity data vs game-balance data
- **Real-world identity:** names, abbreviations, 2026 race numbers (NOR #1, VER #3), nationalities, dates of birth and team colours. This lives on the Team and Driver rows. It is display data only and never drives logic.
- **Team colours** are real-life-inspired *directions*, not official specifications. There are no logos, liveries or F1 assets.
  - All 11 colours are distinct and have at least 3:1 contrast against the dark map (tested).
  - Colour is never the only cue: timing and map tags show the abbreviation, and the team picker shows the team name and both drivers.
- **Game-balance data:** driver pace and consistency, and car performance. These are **development values**, not official or real-world ratings.
  - They are stored on the 2026 **season entries** (`SeasonDriverEntry.pace/consistency`, `SeasonTeamEntry.carPerformance`), separate from identity.
  - They are snapshotted into each new Career (`CareerSeason*Entry`).
  - They are subjective starting points chosen for a plausible, deterministic field spread:
    - car performance runs 82–94;
    - driver pace runs 86–96 and consistency 84–94;
    - no two cars share a profile.
  - Final balancing is later work.

## Compatibility
- **Migration:** the additive migration `20260926000100_content_balance` adds nullable balance columns plus 0–100 range CHECKs; a driver's pace and consistency must be both set or both empty. No historical migration was edited.
- **Old Careers** have NULL balance. `entrantPerformance()` then uses the exact legacy roster-order profile, so their Practice and Race sessions behave exactly as before. Their snapshotted teams, drivers, colours, circuits and calendar are never touched, and nothing reads the mutable source content during play.

## Full-grid behaviour
- **Practice and Race:** both build their fields from the Career roster, so new Careers get 22 entrants: 2 player cars (the chosen team, any of the 11) and 20 AI.
- **Simulation and playback are unchanged:**
  - one central deterministic engine;
  - one playback timer;
  - one shared requestAnimationFrame map loop;
  - no per-car timers or requests.
- **Map:** all 22 markers are drawn (Practice hides cars in the garage). Labels follow the accepted priority rules, so ordinary AI cars show only a marker.
- **Timing tables:** these scroll inside their panel, with a sticky header and P1–P22.
- **Career creation:** a radio-card team picker (name, colour accent, both drivers) replaces the dropdown.

## Validation ownership (QA repair)
- **`validateContentDataset`** covers any season and never uses names. It enforces:
  - exactly two primary race drivers for every participating team;
  - unique race-driver abbreviations within a season;
  - the existing rules for IDs, references, car numbers and balance ranges.
- **The shipped-content tests** own the exact 2026 development counts (11 teams, 22 race drivers, two per team): `tests/grid.test.tsx`, `tests/content.test.ts` and `tests/content-naming.test.ts`. That lets the validator serve other seasons unchanged.

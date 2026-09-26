# Phase 16 — Championship / Results (Builder notes)

Starting main: `4593321` (the merge of Phase 15 `a8fcb30`). Race simulation stays at **v7** and is unchanged. Qualifying, Sprint and Race behaviour are unchanged.

## Architecture: derived standings
- **Source:** standings and weekend results are always **derived**. They come from the persisted classifications of completed sessions, passed through a pure scoring policy and projected into view models.
- **No stored standings:** there are no points totals, no standings cache and no ledger. Nothing is accumulated, so there is nothing to drift, backfill or repair.
- **Eligibility:** a session contributes only when its `CareerSession` is **COMPLETED** *and* its simulation is **FINISHED**.
- **Live:** pages derive at request time, so standings update as soon as a Sprint or Grand Prix completes. An unfinished session is never read, so there is no future leakage.
- **Layers:**

| Layer | File | Role |
|---|---|---|
| Pure policy | `src/game/domain/championship.ts` | No React, Prisma, locale or clock. Points tables, shortened-race bands, dead heats, WDC/WCC, countback, cutoffs, movement, history, season completion. |
| Read port | `src/game/domain/championship-repository.ts` | The read model's types. |
| Bounded read | `src/data/repositories/prisma-championship.ts` | 7 top-level reads in parallel: 19 SQL statements whatever the number of rounds or cars (asserted in a test). |
| View models | `src/features/championship/model.ts` | Pure. |
| UI | `src/features/championship/views.tsx` | Client components. |

- **No hidden state:** the read selects no seed, RNG state, weather timeline, reliability, preparation profile or AI strategy. It reads only the per-car RUNNING/FINISHED/RETIRED map from the incident profile. A test and the browser check assert that none of these appear in the pages.

## Scoring rules version
- **Storage:** `ScoringRulesVersion` enum (`F1_2026`), added as a nullable `scoringRulesVersion` column on the source `Season` and on `CareerSeason`.
- **Snapshot:** frozen at Career creation (`season.scoringRulesVersion ?? "F1_2026"`). Runtime reads only the Career copy.
- **Legacy:** `NULL` means `F1_2026`, via `scoringRulesOf`. An unknown version throws.
- **Isolation:** editing the source Season or team names never changes an existing Career (tested).

## 2026 points (exact integers, half-point units)
- **Grand Prix:** 25-18-15-12-10-8-6-4-2-1. There is **no fastest-lap point**, and no Qualifying or Sprint Qualifying points.
- **Shortened Grand Prix:** a pure policy keyed on the leader's completed laps against the scheduled laps. It uses exact integer comparisons, so an exact boundary belongs to the higher band:

| Leader distance | Points |
|---|---|
| < 2 laps | none |
| ≥ 2 laps and < 25 % | 6-4-3-2-1 |
| 25 % to < 50 % | 13-10-8-6-5-4-3-2-1 |
| 50 % to < 75 % | 19-14-12-10-8-6-4-3-2-1 |
| ≥ 75 % | full points |

  Race v7 always runs its full distance, so today every Grand Prix scores full points. The bands are exercised only by unit tests.
- **Sprint:** 8-7-6-5-4-3-2-1 from 50 % of its distance (exactly 50 % scores). Below 50 % it scores nothing.
- **Classification:** points follow the authoritative final classified position. A retired car scores from its classified position.
- **Dead heats:** equal positions pool the covered positions' points and share them equally, in half-point units, so a two-way dead heat is always exact. A share that half points cannot represent is refused rather than rounded. Race v7 persists unique positions (a database constraint), so dead heats are **unreachable** today.

## Drivers' Championship
- **Identity:** the Career driver ID, never a name.
- **Order:** points, then the Grand Prix countback vector [P1 count, P2 count, …], then the Grand Prix Qualifying countback vector.
- **Excluded from countback:** Sprint results and Sprint Qualifying. Sprint Qualifying is not even loaded (tested against a real Sprint weekend).
- **Perfect tie:** the rows share the position and are flagged **Tied**; the UI shows "=" with text. The ID is used only for render order.
- **Roster:** every race driver in the season entry list is listed, and anyone classified also enters through their results.

## Constructors' Championship
- **Points:** the sum of both cars' points.
- **Attribution:** each result counts for the `careerTeamId` the car was entered for **at that session**. It comes from the persisted entrant row, not the current roster, so it is transfer-safe (unit-tested with a swap).
- **Order:** the same countback, over the team's cars.

## Cutoffs
- **Shape:** `StandingsCutoff = { round, stage: BEFORE | SPRINT | RACE }`. It includes every earlier round, plus nothing, the Sprint, or the whole weekend of `round`.
- **Qualifying:** Grand Prix Qualifying enters the countback together with its Grand Prix.
- **Standings page:** offers every reached cutoff (after each completed Sprint and Grand Prix). The URL form is `?after=r3`, `?after=r3-sprint` or `?after=before-r3`. An unreached cutoff falls back to the latest standings.
- **Movement:** compared with the standings before the latest included round: ↑ gained, ↓ lost, — unchanged, each with screen-reader text. The first scored round has no movement.

## Weekend results — `/career/[careerId]/events/[eventId]/results`
- **Sections:** a Standard weekend shows the Grand Prix only. A Sprint weekend shows a Sprint section and a Grand Prix section. Each table lists position, driver, team, grid, laps, time or gap, status, stops and points (+N).
- **Championship after the event:** a table of drivers with Sprint, Race and Weekend points and their championship position and movement, then constructors.
- **Partial weekend:** tolerated. After only the Sprint, the Grand Prix shows "Not yet completed" and the championship columns are "after the Sprint". With no results yet, both sections say "Not yet completed".

## Standings — `/career/[careerId]/standings`
- **Tabs:** Drivers' Championship and Constructors' Championship, as WAI-ARIA tabs (roving tabindex; ←/→/Home/End). `?tab=constructors` opens the second tab.
- **Tables:** each has a caption. Rows show Pos (with "=" plus Tied text for a tie), movement, driver or team, Wins, Points, and a disclosure with points by round.
- **Scaling:** the by-round list is a wrapping list, not a fixed 24-column table, so it scales to 24 rounds.
- **Player:** the player's cars are marked with ◆ plus "Your team" screen-reader text, never by colour alone.
- **Season History:** a wrapping grid, one card per completed Grand Prix. Each card shows the Sprint winner, the Grand Prix winner, the leaders after the round and a link to the weekend results.
- **Empty:** before any completed session, an empty state is shown.

## Season complete
- **Condition:** every calendar event has a **completed Grand Prix session**. There is no early clinch.
- **Display:** the standings page shows **Season Complete** with the Drivers' Champion and Constructors' Champion (a perfect tie is shown as Tied) above the final tables. The dashboard switches its labels to Champion.
- **Scope:** no rollover or new season (not in scope). Historical cutoffs never show a champion.

## Dashboard and weekend page
- **Dashboard:** the Career dashboard's Championship panel, previously a "not implemented" placeholder, is now a compact live summary:
  - WDC leader;
  - the player's drivers with position and points;
  - WCC leader;
  - the player team's position;
  - a link to the standings.

  If the standings cannot be read, the dashboard still renders, with only the link.
- **Weekend page:** once the Grand Prix is complete it shows **View Weekend Results** and **View Championship**. After a completed Sprint only, it already offers the weekend results.

## Legacy Careers
- **Existing results:** Careers created before Phase 16 derive standings **immediately** from their existing results, with no backfill.
- **Unclassified sessions:** a session completed through development scaffolding, with no simulation, has no classification and scores nothing.
- **Legacy 4-car Careers (2 teams):** list 4 drivers and 2 constructors.
- **Legacy formats:** `NULL` weekend formats are Standard, and `NULL` scoring rules mean F1_2026.

## Migration `20260930000100_championship` (additive)
- **Change:** a `ScoringRulesVersion` enum and nullable `scoringRulesVersion` on `Season` and `CareerSeason`. Nothing else, and historical migrations are untouched.
- **Forward test:** a real pre-Phase-16 schema holds five Careers: no results, one Race, a Sprint and a Race, an active weekend with its Race under way, and a legacy 4-car Career.
  - Every row hash is unchanged after the migration, and every scoring version is `NULL`.
  - Each Career's derived standings are identical to those computed before the migration.
  - The active Race then finishes and scores.

## Builder sanity: full development season
- **Run:** one Career playing all 8 rounds on the real engines. That covers 8 Grands Prix, 3 Sprints, 11 Sprint and Grand Prix Qualifying sessions, and Practice simulated.
- **Invariants checked:**
  - 22 WDC and 11 WCC rows;
  - WDC total = WCC total = 8 × 101 + 3 × 36 = 916;
  - each driver's total equals the sum of their per-round points;
  - 8 wins in total;
  - Season Complete appears only after round 8;
  - 11 cutoffs;
  - a fresh read and every cutoff are reproducible.
- **Sample:** round leaders were RUS then NOR ×7. The Champion was NOR on 173 points, the Constructors' Champion McLaren on 275, and P22 had 0. This is not a formal measurement.

## Deferred
- Season rollover and new seasons.
- Penalties and stewarding (a Grand Prix classified short of distance, disqualifications).
- 90 % classification rules. The Race v7 classification is taken as authoritative.
- Points history charts.
- A broader information-boundary refactor.

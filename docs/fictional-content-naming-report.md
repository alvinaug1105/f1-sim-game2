# Fictional motorsport content naming pass

Completed 24 September 2026. This is a content-only follow-up to Phase 11, not a new simulation phase.

## Names

| Entity | Previous development name | New fictional name | Display abbreviation |
|---|---|---|---|
| Team (GB) | Aurora Racing | Westhaven Racing | WES |
| Team (JP) | Nova Motorsport | Kogane Motorsport | KOG |
| Driver (GB) | Alex Smith | Owen Whitcombe | WHI |
| Driver (TW) | Mika Lee | Wei-An Tsai | TSA |
| Driver (JP) | Ren Sato | Daichi Kurose | KUR |
| Driver (IT) | Luca Moretti | Matteo Bellandi | BEL |
| Circuit (AU, Silver Bay) | Silver Coast Circuit | Silver Bay Grand Prix Circuit | — |
| Circuit (JP, Aoba) | Mountain Park Raceway | Aoba Highlands Raceway | — |

Calendar display names also follow their venues: **Silver Coast Grand Prix → Silver Bay Grand Prix** and **Mountain Park Grand Prix → Aoba Highlands Grand Prix**. Round order, dates and circuit references are unchanged.

Westhaven retains the British/Taiwanese pairing; Kogane retains the Japanese/Italian pairing. Nationality and country codes, birth dates, car numbers, colours and founding years were not changed. There are still two teams, four drivers, two circuits and two calendar events. All team, driver and circuit display names are distinct within this dataset.

## Fictional content policy and separation

The bundled development database uses fictional motorsport-inspired identities. These names are original creative choices, not licensed championship/team identities or trivial edits of current Formula 1 names. No official branding, logos, photos or other assets were added.

Display identity is game data in `src/data/seed/content-development.ts`. It is not UI translation content and is never a simulation rule. Driver/team/circuit names remain unchanged when switching English and Traditional Chinese UI. Future database editing/import can provide different identities and numeric profiles through the existing dataset/repository boundaries without modifying the simulation engine; no editor or import feature was added here.

## Identity, numerical data and existing Careers

**Every stable ID and key was preserved**, including the GameDatabase identity, `team-aurora`, `team-nova`, existing driver/circuit keys, season entries and calendar references. Old-looking keys are intentional identity, not stale display content. The GameDatabase version and schema version remain unchanged. No migration was added; all ten existing migrations and the Prisma schema are byte-identical to the Phase 11 export.

A captured pre-pass dataset fixture is compared with the current content after excluding display-name/abbreviation fields. All remaining data is exactly equal, including length, race laps, relationships, nationality, dates and roster counts. Simulation sources, race input construction, tuning, UI components and both translation catalogues are byte-identical to the pre-pass export.

Existing Careers keep their previously snapshotted names. There is no automatic historical rewrite. To apply the new names to the source development database, run `npm run db:seed`; subsequently created Careers use the new names. The seed still upserts the same IDs rather than adding replacements.

A real PostgreSQL regression restored the old source names, created a historical Career, ran the updated seed twice, and compared all its owned team/driver/circuit/calendar rows with their pre-seed snapshots. They were exactly equal. A fresh Career then received the new names. Source team/driver/circuit ID/key sets remained exact, with no duplicates.

## Simulation isolation

The v7 SQL regression starts a race with frozen numeric inputs, queues a tyre stop and enables a controlled mechanical-issue fixture so that incidents and pits are actually exercised. It then replaces driver/team labels with the old names and changes circuit/event display names. The frozen race state remains exactly equal before advancement.

The renamed race is advanced through the real repository to the finish and compared with uninterrupted continuation of the original checkpoint. The **entire state and final race result are exactly equal**, covering timing, incident history, weather, tyres, pit stops/stints, both RNG streams, order, resources and final classification. This is a name-isolation test; no production tuning was changed to enable it.

## Verification

- **390 offline tests passed across 17 files**, including the existing 388 tests and two content-coherence/preservation checks.
- **180 actual PostgreSQL integration tests passed across 10 files**, including the existing 178 tests and two new snapshot/name-isolation cases.
- Used the existing local PostgreSQL **18.6** Homebrew service and disposable database `formula_naming_verify_20260924`. All ten checked-in migrations applied; integration suites used and removed uniquely named schemas. Both source seed idempotence and the rename-specific double-seed case passed.
- `npx prisma format`, `npx prisma validate`, `npx prisma generate`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, and `npm run build` all passed.
- Existing tests with literal seed-name expectations were updated to the new names; their behavioural assertions remain intact. Historical race fixtures were not changed.

## Browser verification

Inspected the production build against the disposable PostgreSQL database in both English and Traditional Chinese:

1. **Career creation:** selected the development database and 2026 season; the team selector showed Westhaven Racing and Kogane Motorsport in both locales.
2. **Career dashboard:** Westhaven Racing / WES and the active Silver Bay Grand Prix remained unchanged while headings and dates translated.
3. **Race weekends:** Silver Bay Grand Prix Circuit / round 1 and Aoba Highlands Raceway / round 2 appeared correctly with their renamed events in both locales.
4. **Race page:** all four renamed drivers and both teams appeared in the timing table in both locales. Refresh retained the new content.

A complete repository-state comparison before and after browser locale switching/refresh was exactly equal. The temporary server and disposable database were stopped/removed after verification; the existing PostgreSQL service was left running.

## Scope and files

The only production-content edit is `src/data/seed/content-development.ts`. Added a pre-pass content fixture and two offline checks, extended Career/v7 PostgreSQL regressions, updated literal seed-name expectations, and updated README/upload documentation.

No simulation mechanics, numeric circuit profiles, balance, schema, migrations, save architecture, entity counts, logos, UI redesign or translation catalogue changes were added. The 2D viewer has not begun.

**Fictional content naming verification passed.**

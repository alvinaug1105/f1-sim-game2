# Phase 3 completion report

## Career schema

Added Career, CareerTeam, CareerDriver, CareerCircuit, CareerSeason, CareerSeasonTeamEntry, CareerSeasonDriverEntry and CareerCalendarEvent, plus small Career/season/event status enums. Existing source models and simulation boundaries are preserved. The new migration is `20260921000200_career_world`.

The original core migration is unchanged (SHA-256 `4dd9cc90d6a3aa770bf53f21bd81580cd9befe4fe6c9d210f69d2e1c0caeed71`).

## Snapshot, identities and source isolation

Creation clones only the selected season, participating teams/drivers, their roster entries, calendar events and required circuits. All rows receive new UUIDs. Explicit source-ID-to-Career-ID maps reconnect every relationship. The selected source team maps to Career.playerTeamId, which references a CareerTeam in the same world.

Source IDs and version are scalar provenance, not foreign keys or live read dependencies. Source team/driver/circuit/calendar edits, roster changes and version changes do not update existing Careers. Source deletion cannot cascade into Career data. Listing and Continue read Career-owned tables only. Two Careers from the same source can diverge independently.

## Transactions and save model

Career is the persistent save; no duplicate save-slot abstraction or localStorage world state exists. All source reads and eight-table writes run inside one RepeatableRead Prisma transaction. A deliberately invalid late calendar insert was tested on PostgreSQL: all earlier Career writes rolled back.

Composite foreign keys enforce Career/season ownership. Required root team/season pointers use deferred constraints, validated at commit, to permit atomic root-first insertion. The initial date is the earliest event start minus 14 UTC days; an empty calendar starts January 1 of the selected year.

## UI and internationalisation

- `/careers`: saved worlds, current team/season/date/status/last updated, Continue and New Career; meaningful empty/storage-error states.
- `/careers/new`: database → season → participating team → required name; pending and translated validation/error states.
- `/career/[careerId]`: owned team, season, current date and next event. No fabricated finances or standings.
- `/`: preserved standalone fixture preview, explicitly says no Career is selected.

All new interface text supports English and Traditional Chinese using centralized catalogs. Dates use existing Intl formatters. Entity names/IDs stay game data. Language preference persists locally and does not modify Career state.

A production-browser check against the disposable database verified the empty list, successful creation, explicit Career URL, listing, Continue, English/Traditional Chinese display and refresh persistence. Team identity and date remained unchanged when switching language.

## Tests and verification

| Check | Result |
| --- | --- |
| Prisma format | Passed |
| Prisma validate | Passed |
| Prisma generate | Passed |
| TypeScript | Passed |
| ESLint | Passed, zero warnings |
| Offline tests | **109 passed across 7 files** |
| Actual PostgreSQL integration tests | **40 passed across 2 files** |
| Production build | Passed |

All previous 75 offline tests and 24 PostgreSQL tests remain passing. Added 34 offline tests and 16 Career SQL tests cover validation, relevant cloning, maps, edit isolation, independent worlds, atomic failure, persistence and source-deletion safety. Mocked repository tests are separate from actual SQL execution.

## PostgreSQL environment and earlier verification gate

An existing local Homebrew PostgreSQL **18.6** service was available during this implementation. Verification used a dedicated disposable database, `formula_career_verify_0c376f4854f5`, on localhost. TEST_DATABASE_URL pointed to that database. Both SQL suites actually executed in their own temporary schemas; no missing-variable guard was counted as a pass.

Both checked-in migrations applied successfully. The source suite executed the development seed twice without duplication and passed all 24 prior relationship, uniqueness, CHECK, date/length and ID-stability checks. Both migrations and the seed were also applied for production-browser verification. After verification, the temporary server was stopped and the dedicated database removed. The user's existing PostgreSQL service and other databases were left intact.

**Phase 2 PostgreSQL verification passed.** The earlier Phase 2 report's unavailable result is historical and superseded by this execution record.

## Changes and deviations

Added Career domain types/snapshot builder/repository port, application service/server action/composition root, Prisma repository, eight models and migration, three routes and translated views, tests and this documentation. Updated navigation, preview notice, translation catalogs, styles and architecture boundary checks. The source repository accepts the narrower delegate shape needed for transaction clients; source behavior is preserved.

Career.currentSeasonId replaces a redundant currentSeasonYear field; the year is read from the owned season. Provenance uses plain UUID metadata instead of nullable source foreign keys, allowing historical IDs to survive source deletion. Empty-calendar initialization follows the documented January 1 rule.

A local directory named `001` contained copied dependencies. It was preserved, excluded from TypeScript/ESLint and ignored by Git; Vitest discovery now explicitly targets maintained tests. No existing app tests or lint/TypeScript rules were removed. Installed dependencies and generated outputs are excluded from the source ZIP.

## Deferred work

No race simulation, sessions, time advancement, ratings, transfers, contracts, finances, staff, car development, results/scoring, future season generation, editor, authentication or multiplayer was started. Future systems can reference Career-owned IDs and add seasons transactionally. Automatic synchronization from source databases is forbidden; any future update feature requires an explicit migration design.

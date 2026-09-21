# Phase 2 — Core Game Database & Data Model

## Result and scope

Implemented PostgreSQL/Prisma source-content architecture while preserving the application shell, both languages, existing development dashboard repository and simulation boundary. Career Mode and gameplay systems were not started. The dashboard remains independently previewable without PostgreSQL; its unavailable-system label now says “Gameplay systems” in both languages so it no longer implies persistence is unimplemented.

## Schema

Eight models: `GameDatabase`, `Team`, `Driver`, `Circuit`, `Season`, `SeasonTeamEntry`, `SeasonDriverEntry`, `CalendarEvent`. One small enum: `DriverRole` (`RACE_DRIVER`, `RESERVE_DRIVER`).

GameDatabase owns reusable content, with stable machine key, content/schema versions, metadata and audit timestamps. Drivers have no permanent team reference. SeasonTeamEntry connects a participating Team to a Season; SeasonDriverEntry connects a Driver to that season's participating Team. CalendarEvent references its Season and Circuit. Structured date columns and ISO DTO values replace user-facing date sentences.

## Relationships and database isolation

- UUIDs are relational identity; keys are stable import/edit identifiers; names are editable display data.
- Team/Driver/Circuit/Season keys are unique within their dataset; GameDatabase keys are globally unique.
- Composite foreign keys carry gameDatabaseId through all relationships, rejecting cross-dataset seasons, teams, drivers and circuits.
- Driver entries reference an actual SeasonTeamEntry, so a team must compete in the same season.
- Season team/order, driver and non-null car numbers are unique in a season; calendar rounds are unique per season.
- One driver entry per season, including reserve entries. No mid-season transfers yet; different seasons can assign the same driver to different teams.
- Restrictive deletes/updates preserve dependent references.
- Documented SQL CHECK constraints enforce scalar validity and weekend date ordering. PostgreSQL execution of these constraints remains unverified in this environment.

## Seed data

Centralized fictional seed:

- 1 dataset: Fictional Formula Development, key `fictional-formula-development`, version 1.0.0, schemaVersion 1.
- 2 teams: Aurora Racing and Nova Motorsport.
- 4 race drivers: Alex Smith, Mika Lee, Ren Sato and Luca Moretti.
- 2 circuits: Silver Coast Circuit and Mountain Park Raceway.
- 1 season: 2026 Fictional Formula Championship.
- 2 team entries, 4 driver entries and 2 calendar weekends.

Stable UUIDs/keys, graph validation, one transaction and upserts make the seed rerunnable without deletion. Audit timestamps reflect actual writes. The seed was **not executed against PostgreSQL** here.

## Repository layer

The domain-owned `GameContentRepository` exposes:

1. `getGameDatabaseById`
2. `getSeasonById`
3. `listTeamsForSeason`
4. `listDriversForSeason`
5. `listCalendarEvents`

The Prisma adapter maps persistence types into plain domain values. Invalid IDs fail before queries; missing entities return null and missing lists return []; database errors retain their cause in ContentRepositoryError, with no fake fallback. A lazy server-only singleton survives hot reload. One explicit server composition root wires it to the contract. ESLint tests reject direct Prisma/pg/generated-client imports in UI and presentation/persistence imports in domain/simulation.

## Migration

Name: `20260921000100_core_game_database`.

Generated using Prisma migrate diff from an empty schema. Verified the checked-in SQL preserves the regenerated SQL unchanged, followed only by documented CHECK constraints that Prisma's DSL cannot express.

**Actually applied: No. Seed actually executed: No.** No PostgreSQL binaries or configured DATABASE_URL were available; Docker CLI exists but its daemon was unavailable. No remote database was provisioned or modified.

## Verification

| Check | Actual result |
| --- | --- |
| `npx prisma format` | Passed |
| `npx prisma validate` | Passed |
| `npx prisma generate` | Passed, client 7.10.0 |
| Migration generation and generated-prefix comparison | Passed; no database connection used |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm test` | **75 tests passed in 5 files** |
| Existing regression tests | **All 36 passed unchanged**: 23 foundation + 13 i18n |
| New offline tests | **39 passed**: 22 content graph/validation, 9 mocked repository mapping/errors, 8 ESLint boundary checks |
| `npm run build` | Passed, Next.js production build |
| `npm audit` | 0 known vulnerabilities |
| `npm run test:db` | Attempted; stopped at explicit missing TEST_DATABASE_URL guard; **0 SQL tests executed** |
| PostgreSQL integration coverage prepared | **24 tests written, not executed** |

Offline content-graph and mocked repository tests do not prove database enforcement. The integration suite applies the actual migration, runs the seed twice, and tests repository reads, scoped uniqueness, cross-dataset foreign keys, different-season assignment and CHECK constraints in an isolated schema. Provide TEST_DATABASE_URL and run `npm run test:db` to perform that verification; it fails clearly instead of silently skipping absent infrastructure.

## Main files

- `prisma/schema.prisma`, `prisma/migrations/20260921000100_core_game_database/migration.sql`, `prisma/migrations/migration_lock.toml`, `prisma/seed.ts`, `prisma.config.ts`, `.env.example`.
- `src/game/domain/content.ts`, `content-repository.ts`, `content-dataset.ts`.
- `src/data/prisma/client.ts`, `connection.ts`; `src/data/repositories/prisma-game-content.ts`.
- `src/data/seed/content-development.ts`, `seed-content.ts`.
- `src/features/content/get-content-repository.ts`.
- `tests/content.test.ts`, `content-repository.test.ts`, `content.integration.test.ts`, `architecture.test.ts`; both Vitest configs.
- Package scripts/lockfile, ESLint, gitignore, both UI catalogs, README and architecture documentation.

## Decisions and limitations

- Kept one focused content repository rather than separate boilerplate repositories for each table.
- Kept the dashboard's original adapter; no implicit database/Career selection or fallback was added.
- Used Prisma 7.10.0 for CLI, client and pg adapter together. npm's latest CLI tag resolved to a prerelease with different commands, so it was not retained. Prisma 7 setup follows the [official upgrade guidance](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).
- Scoped dependency overrides pin deepmerge-ts 8.0.2 and mysql2 3.24.4 for Prisma tooling advisories. Prisma commands and project checks passed afterward; review overrides with the next Prisma upgrade. No MySQL runtime system was introduced.
- No heavy validation library, extra UI, Docker setup or external service added.
- PostgreSQL execution remains the material outstanding verification limitation. Existing ESLint 9 compatibility/deprecation limitation remains documented in README.

## Deferred features

Career snapshots/cloning/version pinning are documented only. Existing Careers must eventually be isolated from edits to source datasets. No Career creation/saves, authentication, multiplayer, ratings, contracts, transfers, staff, car/performance systems, finances, sponsors, facilities, simulation, sessions, championship scoring, database editor or import/export UI were implemented. Optional localized game entity names remain separate future work; UI translations stay centralized.

# Formula Operations

A browser-based Formula racing team management game, currently in **Phase 12: 2D Race viewer and operations UI**. Persistent Careers support deterministic, resumable races with weather, dry/Intermediate/Wet tyres, traffic, DRS, pits, fuel, ERS and driver commands. New v7 races add occasional errors, mechanical problems, retirement, neutralisation and a localized event feed. Existing v1–v6 saves retain their historical behaviour.

## Stack and local development

Next.js App Router, React, strict TypeScript, Tailwind CSS, ESLint and Vitest. Use Node.js 24 LTS (verified); Prisma 7 requires a supported Node release, including 20.19+ or 22.12+. npm is the package manager; commit the lockfile.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The standalone dashboard needs no database, credentials or environment variables. PostgreSQL operations require the setup below.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

`npm start` serves the production build after `npm run build`. `npm run test:watch` runs interactive tests.

## Architecture

`src/app` composes a server-rendered dashboard. `components` holds the presentation shell. `features/dashboard` owns the application query and repository port. `game/domain` holds library-independent identity concepts. `simulation/core` contains a pure tick function and injectable seeded random source. `data` supplies centralized development fixtures and a replaceable repository adapter. The UI never calculates simulation outcomes.

Routes: `/` is the standalone fixture preview; `/careers` lists saves, `/careers/new` creates one, `/career/[careerId]` displays its owned world/progression, and `/career/[careerId]/events/[eventId]` displays a persisted weekend, and its `/race` page starts/resumes the real simulation. Planned navigation is visibly unavailable, without fake routes. Missing records have explicit empty states, missing routes have a 404, and unexpected feature failures reach an error boundary. Dashboard development fixtures are static and may be prerendered; revisit caching when introducing persistence.

See [architecture](docs/architecture.md) for boundaries, extension rules and deferred work. Tests run outside React and verify tick purity, invalid inputs, deterministic randomness, ID relationships and repository behavior.

## Tooling limitation

ESLint 9 is retained because the React/import/accessibility plugins supplied by the current Next.js lint configuration do not support ESLint 10. npm reports a deprecation warning for ESLint 9; upgrade when these plugin dependencies support 10. No lint rules are disabled to work around this incompatibility.

## Languages

Use the shell's **Language / 語言** selector to switch between **English** and **繁體中文** immediately. The browser saves the preference across refreshes and reopening; if storage is blocked, a translated warning explains that the setting lasts only for the visit. English is the server-rendered fallback until the saved preference is restored after hydration.

Interface translations live in `src/i18n/{en,zh-TW}/messages.json`. Namespaced keys are type-checked. To add a language, create its catalog and register it in `src/i18n/catalog.ts`; the selector uses that registry automatically. Team names, event/circuit names and IDs stay in the game data, separate from UI translations. Formatting helpers use standard Intl APIs. The simulation and domain do not import i18n.

## PostgreSQL source-content database

Prisma 7.10 and PostgreSQL are used for reusable datasets. Career-owned tables store independent snapshots of the selected starting season. The dashboard remains a standalone development preview, not a live Career or a database health check.

1. Provide an existing PostgreSQL database and user with migration privileges.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to that database. Never commit credentials. No external database is provisioned by this project.
3. Run:

```sh
npm ci
npm run db:format
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:seed
```

`npm ci` also generates the client; generation/format/validation need no connection. `db:migrate` applies all ten checked-in migrations through `race_incidents_reliability_control` with `prisma migrate deploy`. Use `npm run db:migrate:dev -- --name descriptive_change` only when developing a new migration with a disposable development/shadow database. Do not use db push as a substitute: the migration contains PostgreSQL CHECK constraints not expressible in the Prisma schema.

The deterministic private-use development seed includes two teams, four race drivers, two circuits, one season and two calendar weekends. It uses stable UUIDs/keys and transactional upserts. Re-running restores those development records; it does not erase unrelated content. The seed will fail on conflicting identities rather than invent replacements.

Read access is exposed through `GameContentRepository` and its Prisma adapter; the server-only composition root is `src/features/content/get-content-repository.ts`. Country/nationality values are codes, dates are structured, drivers do not own permanent team assignments, and composite foreign keys prevent cross-dataset relationships.

### Database tests

Set `TEST_DATABASE_URL` in `.env` to a disposable PostgreSQL test database with schema-creation rights, then run:

```sh
npm run test:db
```

The integration suite creates a unique schema, applies the actual migrations, runs the seed twice, verifies representative queries and tests database rejection of invalid relationships/duplicates. It drops only its own schema afterward. Without TEST_DATABASE_URL the command fails clearly; no SQL tests are silently skipped. The ordinary `npm test` suite stays database-independent.

See [architecture](docs/architecture.md) for dataset isolation, snapshot principles, known roster limitations and optional future localized game content. [Phase 12 report](docs/phase-12-report.md) records the current 423 passing offline tests and 184 passing real PostgreSQL integration tests. The [Phase 11 report](docs/phase-11-report.md) contains incident/control balance measurements; its test totals and older names are historical.

## Try the lifecycle

After migration/seed, create a Career at `/careers/new`. From its dashboard choose Advance to Event, then Open Race Weekend. Practice may be structurally simulated/skipped; Qualifying uses labelled development Start/Complete controls. Race links to the engine: start, advance 1/5 laps or simulate to finish. Refresh resumes the saved seed and exact state. Final classification is persisted; championship points are not awarded. Return to Career to advance the next round. The final calendar ends without creating another season or ending the Career.


## Fictional content policy

The bundled development championship uses the requested small real-life subset for private use, with unchanged provisional performance and original colours. Names are game data, separate from English/Traditional Chinese interface text. Behaviour depends on numeric profiles and stable relationships, never names. Future editable datasets can supply their own identities.

Run `npm run db:seed` to update the source identities. Stable IDs and keys, assignments and simulation numbers remain intact; existing Careers keep their snapshots. See the [current identity report](docs/private-use-naming-report.md). The earlier [fictional naming report](docs/fictional-content-naming-report.md) is historical.

## Current delivery: private-use identities and Phase 12

The source seed now uses Mercedes (George Russell / Kimi Antonelli), Ferrari (Charles Leclerc / Lewis Hamilton), Australian Grand Prix / Albert Park and Japanese Grand Prix / Suzuka. These are display identities over the unchanged development profiles and original team colours. Existing Careers retain their previous snapshots; new Careers receive the updated identities after reseeding. Old internal keys and database/season labels intentionally remain stable. No official assets are included.

The Race viewer adds original SVG schematics, timing, player commands, weather/control/events and sequential playback at 1×/2×/4×/8×. Speed never alters the v7 simulation. Viewer selection and playback settings are local; refresh starts paused. English and Traditional Chinese are supported throughout. Maps are approximate checkpoint interpolation and are not real-world circuit layouts.

Current verification: **423 offline tests and 184 actual PostgreSQL integration tests**. See [Phase 12 report](docs/phase-12-report.md), [private-use identity report](docs/private-use-naming-report.md), and [screenshots](docs/screens/). Previous phase reports are historical records.

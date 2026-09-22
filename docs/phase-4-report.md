# Phase 4 completion report

## Schema

Added CareerRaceWeekend and CareerSession, with CareerWeekendStatus (ACTIVE/COMPLETED), CareerSessionType (PRACTICE_1/2/3, QUALIFYING, RACE) and CareerSessionStatus (LOCKED/AVAILABLE/IN_PROGRESS/COMPLETED/SKIPPED).

The existing CalendarEvent CURRENT status means in progress; no duplicate status was introduced. Not-started weekends have no row yet, and currentSession is derived from persisted session status/order. The new migration is `20260922000100_race_weekend_progression`. Both previous migrations remain byte-for-byte unchanged from the Phase 3 source export.

## Event progression and Career time

Advance selects the first UPCOMING event by round, start date and ID within the current owned season. It rejects an active unfinished weekend and stale expected-event IDs. Entry creates one owned weekend and its ordered sessions atomically.

Career.currentDate is authoritative game state, stored as DATE and serialized YYYY-MM-DD. Entry uses max(currentDate, event.startDate); final completion uses max(currentDate, event.endDate). Normally these are the event boundaries; the maximum prevents backward time for overlapping calendars. Intermediate sessions leave the date unchanged. Audit timestamps use real time but never drive the timeline. Locale/timezone changes only affect UTC-based display formatting.

Final-session completion marks weekend and event COMPLETED. Returning to Career shows the next event without entering it. After the last event, the UI exposes Season calendar complete, retains the active Career and generates no new season.

## Session lifecycle and development controls

The domain sequence initializes Practice 1 AVAILABLE and all later sessions LOCKED. Start moves AVAILABLE → IN_PROGRESS. Temporary development completion moves IN_PROGRESS → COMPLETED. Practice may also simulate structurally from AVAILABLE → COMPLETED or skip from AVAILABLE → SKIPPED. Terminal practice/qualifying unlocks the next session. Race cannot skip Qualifying or be skipped itself.

The domain rejects locked, repeated, foreign and out-of-order actions. UI invokes intent-based server/application actions; it does not decide unlock rules or submit arbitrary statuses. Session lists render persisted data rather than assuming five UI rows forever.

Start, Simulate Practice and Complete Session are labelled Development. A prominent notice states that there is no performance simulation or sporting result. These controls are temporary scaffolding for later engines.

## Persistence, uniqueness and transactions

CareerProgressionRepository follows the existing domain/application/Prisma boundary. A per-Career row lock serializes mutations inside a ReadCommitted transaction; reads after acquiring the lock see the preceding commit. Duplicate requests cannot create duplicate weekends or silently advance an extra session.

Entry commits Career date, event, weekend and all sessions together. Final completion commits session, weekend, event and date together. SQL tests intentionally fail late writes and verify complete rollback, including timestamps.

Database constraints enforce one weekend per event, one active weekend per Career, one current event per Career, unique session types/order, one available/in-progress session per weekend, scoped Career/season relationships, practice-only skips and consistent dates. Domain/application rules enforce sequential cross-row transitions. All live data comes from owned Career tables; source snapshots were not redesigned.

## UI and internationalisation

- Updated `/career/[careerId]`: completed-event count, next-event advance, active weekend/current session, calendar-complete state.
- Added `/career/[careerId]/events/[eventId]`: owned event/circuit/round, Career date, ordered statuses and permitted actions.
- Dashboard navigation returns to the explicit Career root from nested weekend pages.
- English and Traditional Chinese translations cover new labels, actions, dates, errors and development notices.
- Corrected localized page titles resetting after server-action revalidation.

Browser verification used the production build and real disposable PostgreSQL data at desktop 1280×900 and tablet 820×1180. It covered creation, next event, entry, active dashboard, all sessions, practice simulation and skip, qualifying/race start/completion, return to management, next round and final calendar completion. Both languages rendered correctly; switching languages preserved date/status/progress. Refresh retained saved state. Browser viewport override was reset afterward.

## Tests and regression verification

| Check | Result |
| --- | --- |
| Prisma format | Passed |
| Prisma validate | Passed |
| Prisma generate | Passed |
| TypeScript | Passed |
| ESLint | Passed, zero warnings |
| Offline tests | **134 passed, 8 files** |
| Actual PostgreSQL integration tests | **55 passed, 3 files** |
| Production build | Passed |

All previous **109 offline** and **40 PostgreSQL** tests remain passing. Added 25 offline lifecycle/i18n tests and 15 SQL integration tests. Tests cover event ordering, initial sessions, invalid/repeated actions, required qualifying, practice skip/simulation, end-date behavior, final calendar state, immutability/isolation, relational ownership, concurrency and both transaction boundaries.

PostgreSQL tests actually executed on the existing local Homebrew PostgreSQL 18.6 service, using dedicated disposable database `formula_progression_verify_53e552acc86b`. Each suite applied all three checked-in migrations in a unique schema and cleaned up its schema. No missing-URL guard was treated as success. The original source suite also retained its seed-twice checks.

For browser verification, all three migrations and the fictional development seed were applied to that same disposable database. The temporary production server was stopped and the database removed afterward. No unrelated database or existing PostgreSQL service was deleted/stopped.

## Deferred work

No actual Practice, Qualifying or Race engine, lap time, ratings, tyre/fuel/ERS/weather model, incidents, results, points, contracts, transfers, staff, finances, car development, future season generation or multiplayer was implemented. Future simulation state will attach to CareerSession; engines calculate performance while this lifecycle coordinates starting, persisting and completing sessions. Sprint support remains a future domain sequence/enum extension.

## Source delivery

The full ZIP includes maintained source, three migrations, seed, tests, translations, lockfile and documentation. It excludes credentials, dependencies, generated Prisma client, builds and temporary verification data. Run npm ci, configure DATABASE_URL, then db:migrate and db:seed before using Career pages. See GITHUB_UPLOAD.md.

# Private-use identity pass

Completed before the Phase 12 presentation work in the same delivery. The identity pass adds no Race mechanics, tuning, schema fields, migration, official assets or UI redesign. The separately requested Phase 12 viewer is documented in `phase-12-report.md`.

## Requested mappings

| Previous | New |
|---|---|
| Westhaven Racing | Mercedes |
| Kogane Motorsport | Ferrari |
| Owen Whitcombe | George Russell |
| Wei-An Tsai | Kimi Antonelli |
| Daichi Kurose | Charles Leclerc |
| Matteo Bellandi | Lewis Hamilton |
| Silver Bay Grand Prix Circuit | Albert Park Grand Prix Circuit |
| Aoba Highlands Raceway | Suzuka Circuit |
| Silver Bay Grand Prix | Australian Grand Prix |
| Aoba Highlands Grand Prix | Japanese Grand Prix |

Mercedes retains the first two driver relationships; Ferrari retains the other two. Australian/Japanese events retain their original circuit foreign keys and round order.

## Existing identity fields

| Driver | Abbreviation | Nationality | Number | Birth date |
|---|---|---|---:|---|
| George Russell | RUS | GB | 63 | 1998-02-15 |
| Kimi Antonelli | ANT | IT | 12 | 2006-08-25 |
| Charles Leclerc | LEC | MC | 16 | 1997-10-16 |
| Lewis Hamilton | HAM | GB | 44 | 1985-01-07 |

Both preferred numbers and season-entry numbers are coherent. Team short names are MER/FER, country codes DE/IT, founded years 2010/1929. Mercedes's year represents its current works-team era and country its constructor identity, not its UK operating base. Circuits use Melbourne/AU and Suzuka/JP. The original lime and blue team colours remain as requested for the viewer. Database and season identities remain unchanged, including the intentionally historical word “Fictional”.

Identity references: [official driver profiles](https://www.formula1.com/en/drivers), [2026 teams](https://www.formula1.com/en/teams), [Mercedes works-team history](https://www.mercedesamgf1.com/team/location/brackley), and [Ferrari's Scuderia founding anniversary](https://www.ferrari.com/content/dam/ferrari-fcom/old/pdf/pr_90_years_eng_fin.pdf).

## Stable data and simulation isolation

All UUIDs/keys remain stable, including `team-aurora`, `team-nova`, `driver-alex-smith`, `driver-mika-lee`, `driver-ren-sato`, `driver-luca-moretti`, `circuit-silver-coast`, and `circuit-mountain-park`. Existing editable/save relationships continue to use IDs.

Circuit numeric models remain 5200 metres / 58 laps and 4800 metres / 64 laps. These names do not imply real-world calibration. All simulation source files and all ten checked-in migrations match the pre-task archive byte for byte. The Prisma schema is unchanged. Production application/simulation searches found no behaviour keyed on these real names.

One identity coupling needed correction: the pre-start repository used car-number sorting to determine the order passed to provisional profile assignment. It now uses stable source-driver identity within team entry order, with entry ID as fallback. This preserves the bundled original profile order when Russell becomes 63 and Antonelli becomes 12. Existing frozen Race input and results are unchanged.

## PostgreSQL and Careers

Used a disposable local Homebrew PostgreSQL 18.6 database. The checked-in migrations were applied, and the source seed was run twice. Integration tests additionally seed twice after creating Careers under both earlier identity sets, compare complete Career-owned team/driver/circuit/event rows, and verify that new Careers use current names without duplicating stable source identities. A full v7 simulation comparison covers renamed labels, car-number metadata, timing, weather, tyres, pits, fuel, ERS, incidents, both RNG streams and classification.

Combined delivery verification: **423 offline tests in 18 files; 184 actual PostgreSQL tests in 10 files**. Prisma format/validate/generate, typecheck, lint and production build passed.

## Browser verification

Created a fresh Mercedes Career through the UI, inspecting Mercedes/Ferrari choices in both languages. Checked its dashboard, Australian weekend, Race page and subsequent Japanese weekend in English and Traditional Chinese. The four driver identities remain data. Language refresh restored the chosen locale; comparison against a saved PostgreSQL checkpoint showed exact state equality. The private-use update adds no official logos, driver images or circuit artwork.

# Circuit geometry source ledger (Race v8B-R)

This ledger records what each production circuit's map and pit-lane geometry is based on, what was checked, and with
which source. It is an audit record: **no pit-lane geometry has been authored from it yet.** The R1 authoring step
stopped because the required references are not reachable from the build environment (see *Blocker*).

Retrieved and checked on 2026-10-02.

## Source access from the build environment

The build container's egress proxy rejected direct requests (HTTP CONNECT refused, "organization policy") to every
tier-1 and tier-2 reference, and to the primary public-mapping services:

| Source | Tier | Result |
|---|---|---|
| fia.com (FIA circuit / event documents) | 1 | **BLOCKED** (connect rejected) |
| formula1.com (official circuit pages) | 1 | **BLOCKED** |
| livetiming.formula1.com, api.openf1.org | 1 (data) | **BLOCKED** |
| Venue websites | 2 | not reachable (same policy) |
| openstreetmap.org, overpass-api.de, overpass.kumi.systems, nominatim, geofabrik | 3 | **BLOCKED** |
| en.wikipedia.org, commons.wikimedia.org | context | **BLOCKED** (also via the WebFetch tool: `EGRESS_BLOCKED`) |
| raw.githubusercontent.com, `git clone` from github.com | mirror | reachable |

Web search returns only third-party summaries, and the pages behind them cannot be opened. These summaries were **not** used as geometry
evidence.

## Sources actually used

1. **Main track (existing, unchanged):** [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) at revision
   `394d8fbe70ef2c0b0c8d23ff7bee61fa09606055`, MIT, copied unmodified in `src/data/seed/geometry/`.
   - It holds a racing line only: there are no pit lanes, no start/finish marker and no sectors.
   - Its README names a Google My Maps drawing as its "initial circuits data source". The upstream provenance of that
     drawing is not documented.
2. **Independent cross-check:** OpenStreetMap, read through a GitHub mirror.
   - The mirror is [mvoof/F1TrackDownloader](https://github.com/mvoof/F1TrackDownloader) at commit
     `c5c476e308b592abe4d886bc94b7ba15221ee625` (2026-01-12). The tool is MIT. Its committed `tracks_geojson/` holds
     each circuit's OSM relation / way geometry, with member roles and OSM way IDs.
   - **Data licence:** © OpenStreetMap contributors, ODbL 1.0.
   - The mirror keeps only member **roles** (e.g. `pit_lane`), not OSM tags. Tag-level checks such as `highway=raceway`
     or `oneway` are not possible offline.
   - It was used here only to *measure* the existing geometry. No OSM coordinates were copied into the game.

No proprietary circuit artwork was downloaded, viewed or embedded. [julesr0y/f1-circuits-svg](https://github.com/julesr0y/f1-circuits-svg)
(CC BY 4.0, hand-drawn layouts) was identified but not used: its README states that it does not track pit lanes.

## Method

Every bacinger and OSM line was projected to local metres around each circuit. The bacinger line was ordered in the
racing direction exactly as `circuit-layouts.ts` orders it (Marina Bay reversed), and densified to 10 m.

- **Main-track agreement:** the distance from each densified bacinger point to the nearest OSM member that is not a pit
  lane. Reported as p50 / p95 / max.
- **OSM pit lane:** every member with role `pit_lane` / `pitlane`, projected onto the bacinger line. The record covers:
  - the normalised lap progress of each end, in the racing direction, with 0 = the bacinger start point;
  - the median and maximum lateral offset;
  - the side of the racing line it lies on.

The current game pit lane is the same for every circuit (`progressionBForLayout`): a sine-shaped offset of 2.5% of the
map, between progress 0.920 (entry) and 0.040 (exit), with service at 0.970. Its own comment says "Approximate
parallel pit lanes, not surveyed maps".

## Audit (24 production circuits)

Main-track status:
- **GOOD:** p95 agreement with OSM ≤ 10 m.
- **UNRESOLVED:** ≥ 18 m disagreement that only a current-layout reference could settle.
- **SOURCE BLOCKED:** no usable independent geometry was reachable.

The current pit lane is **WRONG-PLACEHOLDER on all 24**, by definition, because it is the generic offset.

The "OSM pit lane" column gives entry → exit progress, side and length. It is **evidence for future authoring only**;
none of it has been authored.

| ID | Circuit | OSM element | Main track vs OSM (p50/p95/max m) | Main status | OSM pit lane (entry → exit, side, length) | Pit source status |
|---|---|---|---|---|---|---|
| …300 | Albert Park | relation 280443 v60 | 0 / 8 / 22 | GOOD | 0.885 → 0.024, right, 709 m (way 28119448) | OSM only, consistent |
| …301 | Suzuka | relation 284570 v12 | 1 / 3 / 5 | GOOD | 0.911 → 0.066, right, 886 m (way 120917578) | OSM only, consistent |
| …302 | Shanghai | relation 2094941 v5 | 2 / 4 / 6 | GOOD | 0.903 → 0.017, right, 627 m (way 156328689) plus 3 connector ways back to 0.729 / 0.875 | OSM only, needs a reference for the entry branch |
| …303 | Bahrain | relation 11987743 v4 | 1 / 5 / 63 | GOOD | none in extract | **SOURCE BLOCKED** |
| …304 | Monaco | relation 148194 v59 | 0 / 5 / 8 | GOOD | 0.624 → 0.738, right, 355 m (way 850261588) | **CONFLICT**: a pit lane on the start/finish straight would sit near 0.9 → 0.05; needs a reference |
| …305 | Silverstone | relation 51162 v24 | 1 / 4 / 5 | GOOD | none in extract | **SOURCE BLOCKED** |
| …306 | Spa-Francorchamps | relation 284560 v23 | 1 / 2 / 8 | GOOD | 0.946 → 0.057, right, 716 m (way 323851541) | OSM only, consistent |
| …307 | Marina Bay | relation 421263 v105 | 1 / 18 / 19 | UNRESOLVED (layout year: source file `sg-2008`) | 0.904 → 0.077, left, 822 m (way 100484287) | OSM only, consistent |
| …308 | Jeddah | way 1007989410 v19 | 42 / 1141 / 1259 | SOURCE BLOCKED (OSM element is not the racing line) | none | **SOURCE BLOCKED** |
| …309 | Miami | way 1017340360 v11 | 67 / 238 / 291 | SOURCE BLOCKED (same) | none | **SOURCE BLOCKED** |
| …310 | Montréal | relation 284595 v19 | 1 / 2 / 4 | GOOD | 0.938 → 0.136, left, 822 m (way 413000959) | OSM only, consistent |
| …311 | Barcelona-Catalunya | way 831804327 v12 | 0 / 1 / 43 | GOOD | none in extract | **SOURCE BLOCKED** |
| …312 | Red Bull Ring | way 822592396 v2 | 119 / 330 / 353 | SOURCE BLOCKED (same) | none | **SOURCE BLOCKED** |
| …313 | Hungaroring | way 231328650 v14 | 4 / 126 / 175 | SOURCE BLOCKED (same) | none | **SOURCE BLOCKED** |
| …314 | Zandvoort | way 24626850 v53 | 452 / 700 / 732 | SOURCE BLOCKED (same) | none | **SOURCE BLOCKED** |
| …315 | Monza | relation 284565 v33 | 1 / 2 / 4 | GOOD | 0.904 → 0.032, right, 737 m (way 38168747) | OSM only, consistent |
| …316 | Madring (Madrid) | relation 18813472 v5 | 5 / 21 / 29 | UNRESOLVED (new 2026 venue; which revision?) | none in extract | **SOURCE BLOCKED** |
| …317 | Baku | relation 11266687 v26 | 2 / 7 / 9 | GOOD | none in extract | **SOURCE BLOCKED** |
| …318 | Circuit of the Americas | relation 6537729 v11 | 1 / 2 / 3 | GOOD | none in extract | **SOURCE BLOCKED** |
| …319 | Mexico City | relation 16251935 v4 | 1 / 2 / 4 | GOOD | 0.930 → 0.069, right, 583 m (way 638504647), continued to 0.118 by way 772763791 (212 m) | OSM only, consistent |
| …320 | Interlagos | relation 6781071 v5 | 3 / 8 / 10 | GOOD | none in extract | **SOURCE BLOCKED** |
| …321 | Las Vegas | relation 16696508 v18 | 1 / 9 / 18 | GOOD | 0.947 → 0.030, left, 492 m (way 1223479152); a second `pit_lane` way at 0.304–0.323 is unexplained | OSM only, needs a reference for the second way |
| …322 | Lusail | — (no OSM element in the mirror) | — | SOURCE BLOCKED | none | **SOURCE BLOCKED** |
| …323 | Yas Marina | relation 6941673 v8 | 83 / 241 / 292 | SOURCE BLOCKED (members are `outer` area rings) | none | **SOURCE BLOCKED** |

Summary:
- **Main track:** 15 GOOD against OSM, 2 UNRESOLVED, 7 SOURCE BLOCKED.
- **Pit lanes:**
  - 9 circuits have an OSM pit-lane way that is consistent with a start/finish pit lane, but tier-1/2 confirmation is
    blocked;
  - Monaco's OSM pit-lane member conflicts with the expected start/finish pit lane;
  - 14 circuits have **no reachable pit-lane source at all**.

What the measurements show about the placeholder:
- The real lanes differ in entry (0.885–0.947), exit (0.017–0.136) and side (3 of 9 on the left).
- The generic lane (0.920 → 0.040, one side for every circuit) is therefore wrong in visible ways, for example:
  - Montréal: the exit is about 0.10 lap later than drawn;
  - Marina Bay, Montréal and Las Vegas: the lane is on the opposite side.

## Blocker (R1 stop condition)

Under the task's rules ("If reliable reference material for a circuit cannot be obtained: DO NOT INVENT IT"; stop if pit
references cannot be obtained), no pit lane was authored and no map geometry was changed. To continue, the Project Lead
needs to choose one of:

1. **Network:** allow egress to `openstreetmap.org` / `overpass-api.de`, plus `fia.com` / `formula1.com` /
   `wikipedia.org` for confirmation, then rerun this audit with tags (`highway=raceway`, `raceway=pit_lane` /
   `service=pit_lane`, `oneway`).
2. **Licence decision:** whether OSM-derived pit-lane coordinates (ODbL 1.0) may be stored in the game's seed data.
   - Shipping them likely makes the seed geometry a derivative database: OSM attribution plus share-alike for that data.
   - If not acceptable, pit lanes can only be authored from reference *descriptions* (entry/exit corners and side), not
     traced coordinates.
3. **Partial scope:** accept OSM-only pit lanes for the 9 consistent circuits now, and keep the other 15 explicitly
   flagged `SOURCE BLOCKED`, with the placeholder clearly marked as not real, until references are available.

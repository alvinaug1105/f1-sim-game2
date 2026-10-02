# Circuit geometry source ledger (Race v8B)

What every production circuit's map, lap line and pit lane is based on, and what was checked.
Reviewed 2026-10-02 against the circuit catalogue in `src/data/seed/`.

## Sources and how they were used

**Primary (tier 1): FIA Formula 1 event documents** titled "Competition Notes" (2026) or "Event Notes" (2025), "Circuit
Map, Pit Lane Drawing, Emergency Exits Map …".
- fia.com is not reachable from the build environment. The original PDFs were read from the public document archive
  [TracingInsights/DDocs](https://github.com/TracingInsights/DDocs) at commit
  `49a166b06b604e7208aba122c5c0d8a04f7c0a12`, retrieved through git.
- That archive scrapes the official FIA document pages unmodified (`documents/<year>/<event>/…pdf`), with page renders
  under `extracted/`.
- The latest event at each venue was used: 2026 where that event has already run, otherwise 2025.
- Every document title was checked for the venue it actually covers. The 2026 "Bahrain Grand Prix" document is the
  relocated event at **Sepang**, so Sakhir uses the 2025 Bahrain documents.
- For every venue where a 2025 document is used, the 2025 circuit map shows the same corner sequence as our
  current-layout geometry.

**Use of the references:**
- They were read only for factual topology:
  - the corner sequence and shape;
  - the position of the start line and the control line;
  - where the pit lane leaves the track, its side, the garage run, and where the exit road rejoins.
- Nothing was traced, embedded, redistributed or copied. No FIA or Formula 1 artwork, image or SVG is in the repository.
  The drawn pit lanes are our own knot descriptions (`circuit-pit-lanes.ts`), relative to our own racing line.

**Secondary cross-check (tier 3): OpenStreetMap**, read through the
[mvoof/F1TrackDownloader](https://github.com/mvoof/F1TrackDownloader) extracts at commit `c5c476e`.
- Used only where the extract contains a pit-lane member (9 circuits).
- Used only to confirm progress and side. **No OSM coordinates are shipped.**

**Main-track geometry (unchanged):** [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) at
`394d8fbe70ef2c0b0c8d23ff7bee61fa09606055` (MIT). It was compared corner by corner with each FIA circuit map.

## Method and approximations shared by every circuit

1. **Main track:**
   - Our racing line was rendered with progress ticks (north-up) and compared with the FIA circuit map: corner sequence,
     proportions, rotation.
   - **No main-track polyline was edited.** All 24 match the current FIA layouts, including the 7 that the earlier audit
     could not check (Jeddah, Miami, Red Bull Ring, Hungaroring, Zandvoort, Lusail, Yas Marina), and the two marked
     "unresolved" (Marina Bay is the post-2023 layout; Madring matches the 2026 map).
2. **Lap line (start/finish):**
   - Progress 0 is the source start point. On 22 circuits it lies on the start/finish straight, within about 0.01–0.08
     lap of the FIA control line (usually near the start-line grid). That is kept and documented, because the frozen
     Race zones are defined from it.
   - Two circuits had their start point on the wrong straight. They were re-anchored by whole 1/64-lap segments
     (`circuit-race-metadata.ts`), so every Race zone stays on the same piece of track:
     - **Monaco:** the start point was between Massenet and Casino; it moves +46/64, onto Boulevard Albert Ier.
     - **Silverstone:** the start point was on the pre-2011 straight; it moves +33/64, onto the Hamilton Straight.
3. **Pit progress anchors (authoritative, frozen into each new Race):**
   - Entry and exit were read from the FIA pit-lane drawing and circuit map against our corner progress.
   - Accuracy is about ±0.01 lap, cross-checked with OSM where available.
   - The engine requires the service point before the lap line. Where the real garages lie after the control line, the
     authoritative service point is placed just before the line.
4. **Drawn pit lane (presentation only):**
   - **Lateral separation is exaggerated:** 0.026 of the map per lane unit, much wider than true scale, so the lane reads
     beside the Race track casing (sized from the driver bubble; see `race-v8b.md`).
   - **Shape:** entry and exit roads that cut inside a corner are drawn as straight chords.
   - **Garage tick:** sits at the representative middle of the FIA garage run. The bubble pauses there during SERVICE.
   - **Clearance:** every full-lane section stays more than 0.5 lane units from the racing line (permanent test).
     **Miami (final repair, V8B-MED-001):** the followed lane formerly continued into T1, where the normal offset swung
     toward the line (minimum 0.0119 of the map). The followed section now ends before T1 turns in (1.030), and the exit
     road is a straight chord through the inside of T1, rejoining after T2 (1.068). Minimum clearance is now 0.0259.
     The authoritative anchors (entry 0.915, lane start 0.945, service 0.990, exit 0.068) are unchanged, so Race timing
     is unchanged.
   - **Pit timing:** loss is never derived from the drawn length.

Statuses:
- **VERIFIED:** the geometry matches the FIA document at map scale.
- **VERIFIED WITH APPROXIMATION:** the topology matches FIA, and the remaining approximations are the ones listed above.
- **BLOCKED:** no responsible reference. *No circuit is BLOCKED.*

## Per-circuit record

All IDs are `00000000-0000-4000-8000-000000000…`. Progress values are Race progress (microlaps ÷ 10⁶; > 1 means after
the lap line). "Ctrl" is the FIA control line in our progress.

| # | Circuit (ID) | Primary source | Secondary | Main track | Main-track change | Pit entry | Side | Lane shape / service region | Pit exit | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Albert Park (…300) | FIA 2026 Australian GP | OSM way 28119448 (0.885→0.024, right) | VERIFIED | none | 0.885, between T13 and T14, cutting inside T14 | right | main straight; garages around the control line (service 0.975) | 0.030, before T1 | VERIFIED WITH APPROXIMATION |
| 2 | Shanghai (…302) | FIA 2026 Chinese GP | OSM way 156328689 (0.903→0.017, right) | VERIFIED | none | 0.872, just before T16, round its outside | right | main straight; garages mid-straight (0.955) | 0.018, before T1 | VERIFIED WITH APPROXIMATION (progress 0 is about 0.076 lap past ctrl, near T1) |
| 3 | Suzuka (…301) | FIA 2026 Japanese GP | OSM way 120917578 (0.911→0.066, right) | VERIFIED | none | 0.915, after the T16–T18 chicane | right (outside) | main straight; garages after ctrl (≈0.963), drawn at 1.008, auth. 0.990 | 0.060, before T1 | VERIFIED WITH APPROXIMATION (progress 0 is at the start line, 0.037 after ctrl) |
| 4 | Bahrain / Sakhir (…303) | FIA 2025 Bahrain GP (2026 doc is Sepang) | — | VERIFIED | none | 0.918, after T15 | right (inside) | main straight; garages after ctrl (≈0.973), drawn 1.008, auth. 0.990 | 0.060, merge lane before the SC2 line | VERIFIED WITH APPROXIMATION |
| 5 | Jeddah (…308) | FIA 2025 Saudi Arabian GP | — | VERIFIED (was SOURCE BLOCKED) | none | 0.912, just after T27, inside | left | main straight; garages after ctrl, drawn 1.020, auth. 0.990 | 0.050, before the T1 chicane | VERIFIED WITH APPROXIMATION |
| 6 | Miami (…309) | FIA 2026 Miami GP | — | VERIFIED (was SOURCE BLOCKED) | none | 0.915, after T18, cutting inside T19 | right | main straight; garages after ctrl (0.990) | 0.068, exit road chorded through the inside of T1, rejoining after T2 | VERIFIED WITH APPROXIMATION |
| 7 | Montréal (…310) | FIA 2026 Canadian GP | OSM way 413000959 (0.938→0.136, left) | VERIFIED | none | 0.938, before the final T13/T14 chicane | left | main straight; garages (1.000 drawn, auth. 0.985) | 0.136, after the T2 hairpin | VERIFIED WITH APPROXIMATION |
| 8 | Monaco (…304) | FIA 2026 Monaco GP | OSM way 850261588 (Rascasse→Ste Dévote, right; the earlier "conflict" was caused by the wrong source start point) | VERIFIED | **lap line re-anchored** +46/64 to Boulevard Albert Ier | 0.906, at Rascasse, inside | right (harbour side) | along the S/F straight, between it and the Piscine section; narrower offset (0.9 lane units) | 0.066, at Sainte Dévote | VERIFIED WITH APPROXIMATION |
| 9 | Barcelona-Catalunya (…311) | FIA 2026 Barcelona-Catalunya GP | — | VERIFIED (current layout, no final chicane) | none | 0.912, in the final corner T14, inside | right | main straight; garages after ctrl, drawn 1.020, auth. 0.990 | 0.075, merge before T1 | VERIFIED WITH APPROXIMATION |
| 10 | Red Bull Ring (…312) | FIA 2026 Austrian GP | — | VERIFIED (was SOURCE BLOCKED) | none | 0.880, on the T9–T10 descent, inside T10 | right | main straight; garages after ctrl (0.987) | 0.080, inside after T1 | VERIFIED WITH APPROXIMATION (progress 0 is about 0.05 after ctrl) |
| 11 | Silverstone (…305) | FIA 2026 British GP | — | VERIFIED | **lap line re-anchored** +33/64 to the Hamilton Straight | 0.919, before Vale, running directly to the pits | right (inside) | Hamilton Straight; garages drawn 1.015, auth. 0.990 | 0.089, at Farm (T2) after Abbey | VERIFIED WITH APPROXIMATION |
| 12 | Spa-Francorchamps (…306) | FIA 2026 Belgian GP | OSM way 323851541 (0.946→0.057, right) | VERIFIED | none | 0.944, before the Bus Stop | right | straight; garages drawn 1.010, auth. 0.990; exit road inside La Source | 0.057, on the descent to Eau Rouge | VERIFIED WITH APPROXIMATION |
| 13 | Hungaroring (…313) | FIA 2026 Hungarian GP | — | VERIFIED (was SOURCE BLOCKED) | none | 0.862, inside the T14 hairpin | right | main straight; garages after ctrl (0.980) | 0.045, before T1 | VERIFIED WITH APPROXIMATION |
| 14 | Zandvoort (…314) | FIA 2026 Dutch GP | — | VERIFIED (was SOURCE BLOCKED) | none | 0.990, part-way down the main straight | right | garages after ctrl, drawn 1.048, auth. 0.997; exit road inside Tarzan | 0.120, on the exit of Tarzan (T1) | VERIFIED WITH APPROXIMATION |
| 15 | Monza (…315) | FIA 2026 Italian GP | OSM way 38168747 (0.904→0.032, right) | VERIFIED | none | 0.905, after Parabolica | right | main straight; garages (0.985) | 0.035, well before the Rettifilo | VERIFIED WITH APPROXIMATION (progress 0 is about 0.06 after ctrl) |
| 16 | Madring (…316) | FIA 2026 Spanish GP (Madrid) | — | VERIFIED (was UNRESOLVED) | none | 0.965, before T22, inside | right | two garage blocks, drawn 1.019, auth. 0.990 | 0.085, straight on past T1/T2, rejoining at T3 | VERIFIED WITH APPROXIMATION |
| 17 | Baku (…317) | FIA 2026 Azerbaijan GP | — | VERIFIED | none | 0.955, part-way down the main straight | left | garages between ctrl and T1 (0.990–0.992) | 0.022, inside after T1 | VERIFIED WITH APPROXIMATION |
| 18 | Marina Bay (…307) | FIA 2025 Singapore GP | OSM way 100484287 (0.904→0.077, left) | VERIFIED (post-2023 layout; was UNRESOLVED) | none | 0.904, between T17 and T18, inside T18/T19 | left | garages after the pole position, drawn 1.015, auth. 0.990 | 0.072, at T1 | VERIFIED WITH APPROXIMATION |
| 19 | Circuit of the Americas (…318) | FIA 2025 United States GP | — | VERIFIED | none | 0.915, before T20, inside | left | main straight; garages after ctrl (0.990–0.994) | 0.055, before the uphill T1 | VERIFIED WITH APPROXIMATION |
| 20 | Mexico City (…319) | FIA 2025 Mexico City GP | OSM ways 638504647 + 772763791 (0.930→0.118, right) | VERIFIED | none | 0.928, in the final stadium curve, inside | right | garages after ctrl (0.990) | 0.115, long merge lane down the straight | VERIFIED WITH APPROXIMATION |
| 21 | Interlagos (…320) | FIA 2025 São Paulo GP | — | VERIFIED | none | 0.917, between T14 and T15 (Junção) | left | main straight; garages drawn 1.010, auth. 0.993; exit road through the infield inside the Senna S | 0.200, on the Reta Oposta after T3 | VERIFIED WITH APPROXIMATION |
| 22 | Las Vegas (…321) | FIA 2025 Las Vegas GP | OSM way 1223479152 (0.947→0.030, left); a second OSM "pit_lane" way at 0.30 is not in FIA and is ignored | VERIFIED | none | 0.947, approaching T17, inside | left | diagonal main straight; garages (1.000 drawn, auth. 0.990) | 0.030, inside T1/T2 | VERIFIED WITH APPROXIMATION |
| 23 | Lusail (…322) | FIA 2025 Qatar GP | — (no OSM extract) | VERIFIED (was SOURCE BLOCKED) | none | 0.888, after T16 | right | main straight; garages mid-straight (0.970) | 0.057, before the speed trap ahead of T1 | VERIFIED WITH APPROXIMATION |
| 24 | Yas Marina (…323) | FIA 2025 Abu Dhabi GP | — | VERIFIED (was SOURCE BLOCKED) | none | 0.935, at T16, inside | right | main straight; garages after the collection point (0.990–0.992) | 0.105, round the outside of T1, rejoining between T2 and T3 | VERIFIED WITH APPROXIMATION |

**Production circuits using a generic placeholder pit route: 0.** The former generic sine route (0.920 → 0.040, the
same for every circuit) is gone from production content. The coarse 0.920/0.040 anchors now exist only as:
- historical revision-1 (v8A) content, unchanged;
- the development fallback for unknown or custom circuits.

## Sectors and corners
Not drawn. FIA sector lengths are available, but mapping them reliably onto our progress was out of scope for this
repair. The data model allows them to be added later as presentation metadata.

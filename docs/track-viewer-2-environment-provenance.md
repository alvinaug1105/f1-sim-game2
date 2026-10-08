# Track Viewer 2.0 — environment provenance

Reviewed 2026-10-08. This is a separate presentation database, with 29 selected OpenStreetMap features across four circuits. Coordinates and simplified feature geometry are available in `src/features/race/viewer/environment-data.json` under **ODbL-1.0**, with attribution to OpenStreetMap contributors. Original application styling and the existing circuit data retain their respective licenses. No satellite images, venue illustrations, commercial game artwork or generated mockups are shipped.

[OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)

## Placement method

Features are longitude/latitude coordinates from the official OSM API, with way identity and source version recorded. The frame uses the corresponding checked-in raw circuit coordinates: longitude origin, mean latitude, cosine correction, rotation, bounds and one uniform normalization scale. Rotations match the existing seed: Suzuka 0°, Monaco 45°, Silverstone 75°, Spa 105°. Features are never independently normalized to fit beside a convenient corner.

On phones, the **same** companion transform that rotates the track also transforms feature points and the existing pit route. One final uniform SVG projection fits the track and pit route with a limited nearby-building extent. Far forest/water shapes are clipped instead of shrinking the circuit. Camera translation/zoom applies to the whole scene. Toggling scenery keeps framing identical.

`VERIFIED_GEOGRAPHIC_FEATURE` means the feature was found in the referenced geographic dataset. Placement confidence is **COMMUNITY_MAPPED**, not a survey certification. Polygon footprints may be approximate. Roof offsets, shadows, grandstand edge treatment and the wheel silhouette are original stylistic interpretations. The wheel uses its mapped footprint centre; its symbol size is exaggerated for readability. The existing pit route also deliberately exaggerates lateral separation; this task does not alter that route or derive physics from visual distances.

Monaco's water polygon follows two contiguous mapped coastline ways, with an approximate straight closure at the harbour mouth. The dataset records the second way and this closure explicitly. Monaco building footprints are unnamed urban context; no architectural landmark identity is claimed. Forest polygons do not assert elevation or gradient.

## Official factual references

| Venue | Reference | Use |
| --- | --- | --- |
| Suzuka | [Venue map](https://www.suzukacircuit.jp/eng/map_s/), [Circuit Wheel](https://www.suzukacircuit.jp/eng/park/attraction/circuit-wheel/), [English venue guide](https://www.suzukacircuit.jp/map_s/pdf/suzuka_mp_guide_en.pdf) | Landmark identification and pit/grandstand relationships; protected map artwork is not reproduced. |
| Monaco | [ACM 2026 hospitality/site map](https://acm.mc/wp-content/uploads/2025/05/Hospitalites_ACM_F12026_F-3.pdf) | Harbour and urban course context; original simplified shapes only. |
| Silverstone | [Official driver pack](https://www.silverstone.co.uk/sites/default/files/pdf/Drive%20Silverstone%20-%20Your%20Driver%20Pack%202023_0.pdf), [Wing / trackside hotel relationship](https://www.silverstone.co.uk/news/silverstone-bridges-gap-connect-trackside-hotel-international-conference-and-exhibition-centre) | Wing, main straight and paddock identification. |
| Spa | [Official access/site maps](https://www.spa-francorchamps.be/assets/e70cff50-ae5d-4aaa-896b-54c8a953a357/all-plan-acces.pdf) | F1 pit/grandstand and Raidillon context. |
| Singapore | [Official circuit park map](https://singaporegp.sg/en/event-info/circuit-park-map/) | Research only. No profile shipped because placement was not established sufficiently. |

## Exact incorporated features

Every row inherits the license, review date and confidence above. Full per-feature URLs, source versions, factual reference, coordinates and approximation notes are stored in the JSON.

| Circuit | Feature | OSM source | Version | Minimum detail |
| --- | --- | --- | ---: | --- |
| suzuka | Pit building | [Way 184422099](https://www.openstreetmap.org/way/184422099) | 8 | LOW |
| suzuka | Main grandstand V1 | [Way 184107052](https://www.openstreetmap.org/way/184107052) | 3 | MEDIUM |
| suzuka | Main grandstand V2 | [Way 183394522](https://www.openstreetmap.org/way/183394522) | 3 | HIGH |
| suzuka | Circuit Wheel | [Way 184107083](https://www.openstreetmap.org/way/184107083) | 2 | MEDIUM |
| suzuka | Woodland | [Way 184103171](https://www.openstreetmap.org/way/184103171) | 7 | MEDIUM |
| suzuka | Woodland | [Way 184252619](https://www.openstreetmap.org/way/184252619) | 3 | HIGH |
| silverstone | Silverstone Wing | [Way 227332429](https://www.openstreetmap.org/way/227332429) | 8 | LOW |
| silverstone | Hamilton Straight A | [Way 1387956625](https://www.openstreetmap.org/way/1387956625) | 3 | MEDIUM |
| silverstone | International Paddock | [Way 227342495](https://www.openstreetmap.org/way/227342495) | 4 | HIGH |
| silverstone | Trackside hotel | [Way 227342443](https://www.openstreetmap.org/way/227342443) | 13 | HIGH |
| spa-francorchamps | F1 pit building | [Way 77352246](https://www.openstreetmap.org/way/77352246) | 9 | LOW |
| spa-francorchamps | F1 grandstand | [Way 174882363](https://www.openstreetmap.org/way/174882363) | 3 | HIGH |
| spa-francorchamps | Raidillon grandstand | [Way 1134053908](https://www.openstreetmap.org/way/1134053908) | 4 | MEDIUM |
| spa-francorchamps | Woodland | [Way 175175596](https://www.openstreetmap.org/way/175175596) | 5 | MEDIUM |
| spa-francorchamps | Woodland | [Way 175213375](https://www.openstreetmap.org/way/175213375) | 4 | MEDIUM |
| spa-francorchamps | Woodland | [Way 1366085166](https://www.openstreetmap.org/way/1366085166) | 2 | MEDIUM |
| monaco | Port Hercule | [Way 166624054](https://www.openstreetmap.org/way/166624054) | 11 | LOW |
| monaco | Urban footprint | [Way 157719654](https://www.openstreetmap.org/way/157719654) | 15 | MEDIUM |
| monaco | Urban footprint | [Way 94402020](https://www.openstreetmap.org/way/94402020) | 8 | MEDIUM |
| monaco | Urban footprint | [Way 94399568](https://www.openstreetmap.org/way/94399568) | 7 | MEDIUM |
| monaco | Urban footprint | [Way 94399922](https://www.openstreetmap.org/way/94399922) | 6 | MEDIUM |
| monaco | Urban footprint | [Way 94252402](https://www.openstreetmap.org/way/94252402) | 10 | HIGH |
| monaco | Urban footprint | [Way 585654707](https://www.openstreetmap.org/way/585654707) | 6 | HIGH |
| monaco | Urban footprint | [Way 176722820](https://www.openstreetmap.org/way/176722820) | 5 | HIGH |
| monaco | Urban footprint | [Way 94399519](https://www.openstreetmap.org/way/94399519) | 6 | HIGH |
| monaco | Urban footprint | [Way 160004394](https://www.openstreetmap.org/way/160004394) | 9 | HIGH |
| monaco | Urban footprint | [Way 94400040](https://www.openstreetmap.org/way/94400040) | 9 | HIGH |
| monaco | Urban footprint | [Way 94399491](https://www.openstreetmap.org/way/94399491) | 6 | HIGH |
| monaco | Urban footprint | [Way 1086898677](https://www.openstreetmap.org/way/1086898677) | 1 | HIGH |

## Rendering and future profiles

LOW retains the principal pit/harbour feature and soft ground treatment. MEDIUM adds selected grandstands, woodland and simple roof depth. HIGH adds secondary footprints, additional forest regions and grandstand edge detail. Thresholds use actual uniformly fitted drawable dimensions: MEDIUM at 520×280 CSS pixels, HIGH at 900×440. Hidden/zero-size canvases use LOW. The Environment control removes all sourced features; track, pits, cars, controls and context remain.

Additional profiles should supply coordinates in the corresponding raw track frame, per-feature provenance and detail thresholds. Verify relative placement against factual venue references before adding data. Missing profiles keep a clean deep-ink terrain fallback without invented buildings or geography. No backend, game database schema, migration or save-format change is needed.

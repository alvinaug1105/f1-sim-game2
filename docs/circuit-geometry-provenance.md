# Circuit geometry provenance — Phase 12A

The two historical internal circuit IDs/keys and all simulation values are unchanged. These are display centrelines, not surveyed racing lines or corner physics. This supersedes the original schematic-map restriction in Phase 12.

## Source and licence

Raw WGS84 GeoJSON `LineString` coordinate arrays are included unchanged in `src/data/seed/geometry/`. Source: [Tomislav Bacinger's f1-circuits](https://github.com/bacinger/f1-circuits), MIT licensed. The full copyright/permission notice is retained alongside the data in `LICENSE.txt`. The upstream project describes the dataset as unofficial and acknowledges an initial Google My Maps dataset; we do not claim official circuit certification.

Pinned revision: `394d8fbe70ef2c0b0c8d23ff7bee61fa09606055`, fetched and byte-compared with the pinned URLs on 2026-09-24.

| Layout | Source | Raw points | Rendered unique points | SHA-256 of included raw file |
| --- | --- | ---: | ---: | --- |
| Albert Park | [au-1953.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/au-1953.geojson) | 146 | 145 | `a686ec41ebbc1ca6f9c8e24c2c4bd0a2e1743d0cff730aaa26479059abd99ee5` |
| Suzuka | [jp-1962.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/jp-1962.geojson) | 172 | 171 | `14419e615c3805ac74547de107ddb46872be0697bf279e2254130d495f086eee` |
| Shanghai | [cn-2004.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/cn-2004.geojson) | 141 | 140 | `5cbf74478ccf3422dcc8085adde5582d9a393b572b5a038ecb5c9d80d0f8baa7` |
| Bahrain | [bh-2002.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/bh-2002.geojson) | 94 | 93 | `6bac0f8f1f870faedb0cda06f04f6de3e98445d5b27f32c351bdddae105c3864` |
| Monaco | [mc-1929.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/mc-1929.geojson) | 160 | 159 | `daf184fc7d0948cadd10ce9428ba87b5462d9df6e33daec7b6f9aad235dc879e` |
| Silverstone | [gb-1948.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/gb-1948.geojson) | 135 | 134 | `1e526462a785f15acb6bf9af2fefa7a1b4521e665bfbe663d58539516ba9ea68` |
| Spa-Francorchamps | [be-1925.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/be-1925.geojson) | 153 | 152 | `b867de9cc8364cc9b545a044377a56a697b8db77823c849c1a1c03760a943381` |
| Marina Bay | [sg-2008.geojson](https://github.com/bacinger/f1-circuits/blob/394d8fbe70ef2c0b0c8d23ff7bee61fa09606055/circuits/sg-2008.geojson) | 116 | 115 | `aa9584b50acffaabed7a06b5c0baa37fab38f0c70ad3c5ebba27706f3371bf9c` |

Albert Park uses the revised 14-turn configuration, including removal of the former turns 9–10 chicane. Compare the promoter's [track evolution reference](https://www.grandprix.com.au/community/track-evolution). Suzuka retains the Esses, hairpin, Spoon, back straight crossover and final chicane; compare the circuit operator's [course guide](https://www.suzukacircuit.jp/eng/course_s/). These references were used to check the shape, not as artwork overlays.

## Coordinate transformation

1. Longitude/latitude pairs retain their original sequence. The first coordinate is the upstream start/finish sample: Albert Park `[144.968644, -37.849757]`; Suzuka `[136.540283, 34.843344]`.
2. Use a local equirectangular projection: `x = (longitude - firstLongitude) * cos(meanLatitude)`; `y = meanLatitude - latitude`. Longitude is corrected for latitude. North maps upward in SVG; east maps right. Degrees are sufficient because the next operation uniformly normalizes the path.
3. Albert Park rotates 90 degrees clockwise in screen coordinates to use a wider view. Suzuka remains north-up. Rotation never reflects the shape or reverses the racing order. Suzuka's direction metadata is `FIGURE_EIGHT`; its coordinate order determines actual travel.
4. Translate the bounds and divide both axes by the same maximum extent, centring the shorter dimension in a unit square. Remove only the repeated closing endpoint. There is **no additional vertex simplification**, spline rounding, resampling, tracing, or corner reordering.
5. Fit the normalized bounds inside the 1000×650 SVG with 65-unit padding. Both axes use the **same** scale. The SVG's default aspect-ratio behaviour then preserves that shape at every responsive size. No `x*1000 / y*650` distortion remains.
6. The centreline is a closed polyline, including its final-to-first segment. A cumulative arc-length table and binary search provide positions/tangents; progress is wrapped only at sampling time.

The unit tests establish one non-adjacent centreline crossing for Suzuka and zero for Albert Park. Suzuka is a planar schematic: bridge elevation and over/under car occlusion are not simulated.

## Identity and boundaries

- `00000000-0000-4000-8000-000000000300` → Albert Park (`circuit-silver-coast` remains the content key).
- `00000000-0000-4000-8000-000000000301` → Suzuka (`circuit-mountain-park` remains the content key).
- Unknown/missing source IDs use the existing generic closed circuit. Display names never select geometry.
- Static geometry is outside React and outside `src/simulation`. Source/career circuit lengths remain the accepted 5200/4800 metres; the display-map upgrade does not change balance or frozen races.
- This source provides the main layout, not reliable pit entry/exit/stall coordinates. Pit cars use the same deterministic main-path interpolation with a `PIT` label. No invented pit path is called accurate. The separate layout model can be extended with a verified pit path later without adding persistent race fields.

## Content Expansion Pass A (six additional circuits)

Same source, same pinned revision, same pipeline (no new map system). The six files were fetched from the pinned URLs on 2026-09-26 and are committed unmodified (hashes above). Stable source IDs: `…000000000302` Shanghai, `…303` Bahrain, `…304` Monaco, `…305` Silverstone, `…306` Spa-Francorchamps, `…307` Marina Bay.

- **Rotation** (screen degrees, chosen to fill the landscape map; never reflects): Shanghai 120, Bahrain 90, Monaco 45, Silverstone 75, Spa-Francorchamps 105, Marina Bay 15. Albert Park and Suzuka keep their accepted rotations.
- **Racing direction.** Stored order is checked against each circuit's first corner (right-hand Turn 1 everywhere except Singapore). Seven files are already in racing order (clockwise). The Marina Bay `LineString` is ordered *against* the anti-clockwise racing direction, so the layout keeps the upstream first coordinate (start/finish sample) and reverses the rest of the ring at build time. The committed file is unchanged. `tests/circuits.test.ts` locks the first-corner direction for all eight layouts.
- Bahrain's upstream line has 93 unique points (the others have 115–171). It is still real geometry; the "detailed path" test bound is 80 points.
- The racing-direction and start-point checks use the upstream data only; they do not claim surveyed start-line positions.

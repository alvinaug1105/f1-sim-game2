# Race v8B-R: persisted determinism repair

## Symptom
- A v8 Race saved to PostgreSQL, reloaded and continued did not always finish the same way as the uninterrupted
  in-memory continuation of the same state.
- The pre-existing v8A round-trip integration test failed intermittently, and also timed out at 30 s.
- Reproduced on `98cf45f` and `4870544`.

## Root cause (proven)
`physicalAhead` (`src/simulation/race/progression/model.ts`) finds the car physically ahead on track. Revision 2
(`progression/engine.ts`) has the same search inline. Both broke an **exact distance tie** by entrant-ID text
(`entrantId.localeCompare`).

- Exact ties do happen: two cars side by side at the same integer microlap progress, e.g. a leader lapping a backmarker.
- Entrant IDs are random UUIDs, freshly generated for every Race start. A save mapped onto new IDs, or any other
  reloaded copy, can therefore choose a *different* "car ahead" at a tie.
- That changes traffic, which changes the lap time, which changes everything after it.

Evidence:
- **ID remap alone:** 12 / 12 variants diverged before the fix, 0 / 12 after.
- **Key order alone:** JSONB-style key order, reversed order and hashed order gave 0 / 6 divergences even before the
  fix. PostgreSQL JSONB key reordering was ruled out as a cause.
- **First divergence on the real main v8A save:**
  - lap 10, with the RNG in state 1468146723;
  - the grid-5 car had two cars ahead at an identical distance of 3012 microlaps, grid 3 (P3) and grid 2 (P2);
  - lexical ID order picked grid 3, a remapped ID set picked grid 2;
  - the first differing field is that car's `track.potentialLapTimeMs` (90851 vs 90878 ms);
  - further ties followed at laps 33, 34, 36, 37, 39 and 40.
- **Ruled out:** input mutation, wall-clock or `Math.random` use, and non-deterministic copies. All were checked.

## Repair
An exact tie now resolves by race-domain order: the car **higher in the classification** (`position`), never by ID text.

- `classifyProgress` was already ordering by progress / laps / time. It now also uses `position` as its final key.
- Both v8A (revision 1) and v8B (revision 2) use the new rule.
- v7 and earlier engines are not touched. The legacy v1/v2 `classify()` still uses `entrantId` for exact elapsed-time
  ties. It is unchanged as a historical engine and is not used by v8.

## Compatibility impact
- **Schema:** no change and no migration.
- **Running v8A / v8B saves:**
  - They keep working.
  - From the next lap, a continuation that meets an exact tie may differ from the continuation the old code would
    have produced. It is now the *same* for every ID set, reload and key order.
  - The real main v8A fixture shows this. The old recorded finished digest `b9f931f9…` was only reproducible under
    its original IDs. The repaired continuation digest is `198812df733f623a37f2554a361d8b920be57dff2ca85219e857ea8ac51cc8b5`,
    pinned in `tests/race-v8b.integration.test.ts`.
  - The finishing order of that save changes.
- **v7 Races:** byte-identical; the invariance test covers them.
- **Balance:** no tuning values changed. Only the choice between two exactly tied cars changed.

## Tests
- **`tests/race-determinism.test.ts`** (pure). Each case continues its start state under remapped IDs plus a JSONB /
  reversed / hashed / original key order. The state is re-serialised every lap, and every lap must be exactly equal to
  the base continuation. There is no tolerance. Cases:
  - the real v8A save;
  - a 22-car revision-2 Race with a pit request and a near-empty-battery Boost car;
  - a v7 Race;
  - a unit test where an exact tie is decided by classification even with the IDs' lexical order reversed.

  `DETERMINISM_VARIANTS` widens the sweep (default 3; 12 passes).
- **`tests/race-v8-roundtrip.integration.test.ts`** (PostgreSQL):
  - **v8A repetitions:** `V8A_ROUNDTRIP_REPS`, default 20. Each runs on a fresh career with freshly generated entrant
    IDs: the real save is persisted, reloaded and finished by the server, and the result must equal the uninterrupted
    in-memory continuation exactly, compared by grid slot.
  - **Five revision-2 cases:** normal; a double-stacked pit sequence; a qualified-but-unused Overtake entitlement with
    remainders; Boost on a near-empty battery; a Safety Car deployed mid-race. Each continues the exact pre-persist
    object in memory, and again under remapped IDs, and through PostgreSQL. All three must match exactly.

## Results
- **Pure sweep:** with 12 variants per case, all 4 tests pass (353 s).
- **PostgreSQL round trip after the repair:** 25 / 25 pass — 20 / 20 v8A repetitions and 5 / 5 revision-2 cases.
- **Control run:** the same file run against the unrepaired code (`4870544`) **fails 15 / 25**:
  - 13 / 20 v8A repetitions mismatch;
  - Boost on a near-empty battery and the Safety Car case fail on the remapped-ID path.
- **Targeted full races** (no Monte Carlo), 22 cars, real main-save input, unrepaired vs repaired:
  - **Identical:** wet Suzuka, lapping Monaco, Boost Silverstone, VSC Bahrain.
  - **Changed by a tie:**
    - dry Suzuka;
    - pit-heavy Monza: same order, different times;
    - Safety Car Spa;
    - the real v8A save.
  - No aggregate shift in pit stops, retirements or laps down.
  - The unrepaired results were themselves only one of several ID-dependent outcomes.

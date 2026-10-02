# Race v8B: versioned determinism compatibility

## Root cause (proven in v8B-R)
`physicalAhead`, the inline nearest-car-ahead search, and `classifyProgress` broke **exact ties** by entrant-ID text
(`entrantId.localeCompare`).

- Exact ties happen when two cars are side by side at the same integer microlap, for example a leader lapping a
  backmarker.
- Entrant IDs are random UUIDs generated at each Race start, so the outcome depended on generated ID text.
- On the real main v8A save the first tie is at lap 10, RNG state 1468146723: the grid-5 car had grid 3 and grid 2
  level at 3012 microlaps ahead. The first differing field was `potentialLapTimeMs` (90851 vs 90878 ms).
- PostgreSQL JSONB key order was ruled out: 0 of 6 key-order variants diverged.

## Versioned contract (this repair)
The v8B-R fix applied the new tie rule to every v8 revision. That silently changed how accepted v8A saves continue.
It is now contained per revision:

| Engine | Tie rule | Contract |
|---|---|---|
| v7 and earlier | unchanged (not touched) | preserved exactly |
| v8A, progression revision 1 | **frozen historical entrant-ID order** (`revision1TieOrder`) | same state + same IDs + same commands + same seed ⇒ same continuation, for any JSON / JSONB key order. The real main v8A save again finishes with its accepted digest `b9f931f9…` (`fixture.finishedSha256`). |
| v8B, progression revision 2 | **Race-domain order**: the car higher in the current classification (`domainTieOrder`; positions are unique) | Race behaviour is independent of generated entrant, driver and team ID text: a remapped state continues identically after identity canonicalisation. |

**Compatibility boundary:** `src/simulation/race/progression/tie-order.ts`.
- `tieOrderFor(config)` is the single place a revision chooses its rule.
- `physicalAhead(…, tie)` and `classifyProgress(…, tie)` take the rule as a required argument.
- Every caller passes the Race's frozen rule:
  - the revision-1 engine (`legacy.ts`);
  - the revision-2 engine (`engine.ts`, including its inline search);
  - the AI command policy;
  - the AI assistance policy.
- No other code branches on the revision for ordering.

**Other ID-order dependencies reviewed:**
- `physicalBehind` already used position.
- Grid order uses `gridPosition`.
- The map's draw order of bubbles is presentation only.
- The legacy v1/v2 `classify()` still uses `entrantId` for exact elapsed-time ties. It is a historical engine, not used
  by v8, and is unchanged.
- There is no other `localeCompare` or ID comparison in the simulation.

**Compatibility:** no migration. v8A saves continue as they were accepted. v8B has not been merged, so no accepted
revision-2 save exists.

## Tests written for independent QA (Codex)
- **`tests/race-determinism.test.ts`** (pure):
  - **v8A historical digest:** the real main save finishes with `b9f931f9…`.
  - **v8A key order:** same IDs under original / JSONB / reversed / hashed key order, re-serialised every lap, must be
    exactly identical.
  - **v8A tie unit:** keeps lexical ID order.
  - **v8B ID independence:** remapped entrant + driver + team IDs plus key orders, on a 22-car Race with a pit request
    and low-energy Boost. `DETERMINISM_VARIANTS` widens the sweep.
  - **v8B key order:** stability with its own IDs.
  - **v8B tie unit:** decided by classification even with the IDs' lexical order reversed.
  - **Version dispatch.**
  - **v7 key-order stability.**
- **`tests/race-v8-roundtrip.integration.test.ts`** (PostgreSQL):
  - **v8A repetitions:** `V8A_ROUNDTRIP_REPS`, default 20, each on a fresh career with fresh IDs. The save is
    persisted, reloaded and finished by the server, and must equal the same-ID in-memory continuation.
  - **v8B revision-2 cases**, each continuing the pre-persist object in memory, under remapped IDs, and through
    PostgreSQL, all exactly:
    - normal;
    - double-stacked pit sequence;
    - unused Overtake entitlement with remainders;
    - near-empty Boost;
    - Safety Car;
    - VSC.
- **`tests/race-v8b.integration.test.ts`:** the historical v8A digest check is restored (`fixture.finishedSha256`). The
  former cross-ID assertion is replaced by the same-ID revision-1 contract.

Builder-side evidence is limited to one targeted run of the historical-digest test, which passed. The full campaign is
independent QA.

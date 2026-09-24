# Phase 12B — Race Management UI Refinement (Builder notes)

Builder notes only. Formal verification belongs to independent QA. This phase changes presentation only: no simulation change, no v8, no schema change and no migration.

## Structure

The race page layout is unchanged: header and conditions at the top, then the timing tower, circuit map and selected-driver panel, with events and playback below. `operations.tsx` now composes small components:

| Module | Role |
| --- | --- |
| `viewer/race-view.ts` | Pure derived views: Race Control mode, DRS state, battle context, map-label tiers, tyre warnings, the two-driver comparison snapshot and the structured event feed |
| `viewer/labels.ts` | Pure, deterministic label priority and collision placement |
| `viewer/race-header.tsx` | Header, persistent conditions strip, contextual Race alerts |
| `viewer/timing-tower.tsx` | Compact authoritative tower |
| `viewer/player-switch.tsx` | Two-car quick switch and comparison |
| `viewer/event-feed.tsx` | Categorised feed |
| `viewer/driver-panel.tsx` | Selected-driver panel, reordered so the most important information comes first |

## Map labels

Markers and labels are separate. Every car keeps a clickable, keyboard-reachable marker. Labels follow these priority tiers:

`SELECTED > other PLAYER car > BATTLE (selected car's close neighbours) > LEADER > NEARBY (other player car's close neighbours) > FIELD (marker only)`

A "battle" is a presentation threshold (`BATTLE_GAP_MS` = 1000 ms) applied to the authoritative interval between cars that are adjacent in the classification. It is not shown under VSC or Safety Car, or after the finish.

`placeLabels` works as follows:
1. Labels are placed in tier order.
2. For each label, the slot it used last frame is tried first, so labels don't flicker.
3. It then tries 24 fixed slots around the car: 8 directions at 3 radii.
4. A slot is rejected if it leaves the map, overlaps another placed label, covers any car marker, or overlaps a reserved region (the START / FINISH text and line).
5. If no slot is free, a label below the player tiers is hidden. The selected and player labels take the least-colliding slot, weighted so the player label avoids the selected one.

The selected label is inverted (light background) and drawn on top. The other player label has a white border and an inner accent bar, and its marker has a white centre dot. None of these cues relies on colour alone.

The motion architecture from 12A is untouched: shared RAF loop, unwrapped progress, arc-length sampling, identity lanes and the retirement freeze. The RAF loop only places labels after positioning cars. A change of selection or priority wakes the loop for one frame, so labels also re-place while playback is paused.

## Deliberate scope notes

- **Event feed sources:** the feed uses only persisted structured records: Race Control / incident / retirement events plus pit-stop history. Weather and DRS transitions are not persisted as events, so they are not synthesised into the feed. Current weather and DRS state stay visible in the conditions strip, and a one-time "DRS ENABLED" banner appears at the checkpoint where re-enabling is observed.
- **Tyre-life estimate:** uses the existing `estimatePitWindow` helper and is labelled as an estimate. It never says "pit now".
- **Viewer preferences:** gap/interval mode, the comparison toggle and the selected car are ephemeral React state.

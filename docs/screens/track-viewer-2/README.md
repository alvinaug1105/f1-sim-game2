# Track Viewer 2.0 — Builder visual evidence

All after images are actual browser captures of production viewer components with safe disposable fixtures. They are presentation evidence, not a save-backed gameplay acceptance campaign. The temporary preview route/replay was removed before the production build and is not shipped.

- `matrix.json` indexes all twenty requested EN viewport captures, actual drawable bounds, selected ring size, scene detail, overflow and canvas/context order.
- `circuits.json` indexes Suzuka, Albert Park, Monaco, Silverstone, Spa, Marina Bay and Monza.
- `states.json` indexes fifteen start/early/mid/late/pit/safety/weather/retirement/lapping/Sprint states.
- `race-1920x1080-zh.jpg` and `race-390x844-zh.jpg` show Traditional Chinese desktop and phone views; locale persistence was checked through refresh.
- `replay-*.jpg` show a temporary presentation replay of real server-projected engine checkpoints, including 8×, pause/manual camera, reduced focus and reset with scenery off.
- `race-8x-reduced-focus.jpg` shows main RaceOperations preferences. It is paused; animated evidence is the separate replay.
- `laptop-timing-open.jpg` shows explicit timing access in the larger track layout. Escape focus return was checked.
- `mobile-strategy-return.jpg` shows returning from the translated Track pane to existing strategy.
- `before-historical-*.jpg` are historical UIX-B stress-fixture references, not fresh identical-state renders of the starting commit.

The 29 sourced environment features and ODbL notice are documented in [the provenance ledger](../../track-viewer-2-environment-provenance.md). Complete implementation/test boundaries and QA risks are in [the Builder handoff](../../track-viewer-2-builder-handoff.md).

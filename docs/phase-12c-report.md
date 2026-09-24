# Phase 12C — Playback & Strategic Race Experience (Builder notes)

Builder notes only. Formal verification belongs to independent QA. This phase changes presentation and playback orchestration only: simulation stays at v7, with no schema change and no migration.

## Playback scheduler (`viewer/playback.ts`)

The controller has one of four phases: `paused`, `running` (1× / 2× / 4× / 8×), `seeking` (Next Strategic Event) and `finished`. A separate `busy` flag says a mutation is in flight. Invariants:

- **One timer.** A single `schedule()` path always replaces the pending timer. It never schedules while paused, busy or finished.
- **One mutation.** Advances and player commands run through one queue (`exclusive`), so they never overlap. `busy` stays true until every accepted mutation has finished.
- **Checkpoint budget.** Each committed checkpoint gets a budget equal to its interval at the current speed. The budget is only consumed while cars are visibly moving (playing or settling), and Pause stops the budget clock.
  - Resume continues the interrupted interval; it never restarts it.
  - If the checkpoint's motion has already settled (a fresh page, or after a single step), Resume advances immediately.
- **Speed changes.** The remaining budget is rescaled to the new speed and the timer is replaced at once. The same fraction of the interval is left, matching `RaceMotion`'s own rescaling, so movement stays continuous.
- **Pause during a request.** An in-flight request is never cancelled. It commits, and playback then stays paused.
- **Commands.** A command pauses playback, waits for any in-flight advance to commit, runs alone against the committed state, and leaves playback paused with reason `COMMAND`. The player must press Resume explicitly.
- **Finish.** The finished phase is terminal. Play, seek, speed changes, step and commands never reach the server again.

Playback only schedules. Every mode, including Next Strategic Event, runs the same sequence of committed `advance` calls, so 1×, 8× and seeking reach identical authoritative states.

## Strategic attention (`viewer/attention.ts`)

This is a pure module. It reads only public state: timing, current weather and track water, Race Control, the player's own tyres and fuel, and persisted events. It never reads the hidden weather timeline, AI internals or future state.

`assessCheckpoint(memory, state)` compares a newly committed checkpoint with what has already been announced, then returns the items in priority order and the updated memory:

| Group | What is announced |
| --- | --- |
| Race Control | VSC and Safety Car deployed; restart when neutralisation ends. |
| Player events | Player incidents and retirements (new persisted events only); completed player pit stops. |
| Weather | Rain starts, stops, increases or eases (bands at 0 / below 650 / above that); track water gets wetter or dries (below 100 / below 350 / above that). |
| DRS | DRS disabled because of wet conditions. DRS re-enabled after a wet disable or a restart delay; suspension under VSC or Safety Car is already explained by Race Control. |
| Player tyres | Each wear escalation (high wear, past the cliff) once per stint; a new stint quietly resets the baseline. |
| Player fuel | The projected fuel at the finish first turning into a deficit. |
| Battles | A player car entering a battle: nearest authoritative gap at or below 1.0 s. It leaves the battle only once that gap opens past 1.5 s. Nothing is announced on lap 1, under VSC or Safety Car, or on the restart lap. |

An unchanged warning never fires again. Auto-pause and Next Strategic Event stop on any item. With auto-pause off, playback continues and the latest item is shown as information. Next Strategic Event is still limited to 20 committed laps.

## UI

- **Playback bar (`viewer/playback-bar.tsx`).**
  - The phase is shown with a glyph and text: paused, playing at the current speed, seeking, saving, finished.
  - A compact attention line explains why playback stopped, for example "Paused: Safety Car deployed · +1 more", "Command saved…" or "Race finished". When auto-pause is off, it shows the latest item without pausing.
  - Every control is disabled once the race has finished.
- **Player switch.** The player car named by the current stop gets a text and glyph marker (⚑, with screen-reader text). The selection is never changed automatically.
- **Labels (optional 12B polish).** The lookahead horizon grows with playback speed: 1× at 1× and 2×, 1.5× at 4×, and 2× at 8× or while seeking.

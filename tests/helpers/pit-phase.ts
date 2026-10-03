import { LAP_UNITS, type ProgressionConfiguration } from "../../src/simulation/race/progression/model";
import type { RaceSimulationState } from "../../src/simulation/race/types";
export type PitPhase = "ENTRY" | "LANE" | "SERVICE" | "EXIT";
/**
 * A valid absolute race distance for a car in `phase` of a pit visit that entered on lap `entryLap`, derived from the
 * Race's own frozen pit anchors (never from magic numbers):
 * ENTRY  — inside the entry road [entry, laneStart);
 * LANE   — in the lane before service [laneStart, service);
 * SERVICE— exactly at the service anchor;
 * EXIT   — after the lap line, before the exit anchor, on the following lap.
 */
export function pitPhaseDistance(pit: ProgressionConfiguration["pit"], entryLap: number, phase: PitPhase) {
    const laneStart = pit.segments[0].end, mid = (a: number, b: number) => a + Math.floor((b - a) / 2);
    const local = phase === "ENTRY" ? mid(pit.entry, laneStart) : phase === "LANE" ? mid(laneStart, pit.service) : phase === "SERVICE" ? pit.service : mid(0, pit.exit);
    const completedLaps = phase === "EXIT" ? entryLap + 1 : entryLap;
    return { total: completedLaps * LAP_UNITS + local, completedLaps, local };
}
/**
 * Places one car into `phase` of a pit visit consistent with the Race's frozen anchors and current lap (the car entered
 * the pit on the current lap, or — for EXIT — on the previous lap). Pit commitment, timing remainders and the observed
 * route are set coherently, so authoritative validation accepts the state.
 */
export function placeInPitPhase(s: RaceSimulationState, entrantId: string, phase: PitPhase): RaceSimulationState {
    const pit = s.input.progression!.pit, entryLap = phase === "EXIT" ? s.lap - 1 : s.lap;
    if (entryLap < 0) throw new RangeError("EXIT needs a completed lap before the current one");
    const { total, completedLaps } = pitPhaseDistance(pit, entryLap, phase);
    const p = s.progression!.cars[entrantId];
    p.route = phase; p.compound = "HARD"; p.pitEntryLap = entryLap; p.pitLossMs = 22500; p.stationaryMs = 2500;
    p.delayMs = phase === "SERVICE" ? 2500 : 0;
    p.observations = [{ atMs: s.progression!.elapsedTimeMs, total, route: phase }];
    return { ...s, entrants: s.entrants.map(e => e.entrantId === entrantId ? { ...e, completedLaps, track: { ...e.track!, progressMicrolaps: total } } : e) };
}

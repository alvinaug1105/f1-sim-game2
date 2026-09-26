import { describe, expect, it } from "vitest";
import { advanceRace, advanceRaceLap, raceResult } from "../src/simulation/race/engine";
import { requestPitStop } from "../src/simulation/race/pits/model";
import { validateIncidentState } from "../src/simulation/race/incidents/model";
import { closeRetiredStints } from "../src/simulation/race/incidents/engine";
import type { RaceSimulationState } from "../src/simulation/race/types";
import { pitAndRetireNextLap, quietIncidentRace, stintProblems } from "./helpers/race-dynamics";

const find = (s: RaceSimulationState, id: string) => s.entrants.find(e => e.entrantId === id)!;
function allValid(s: RaceSimulationState) {
  validateIncidentState(s);
  for (const e of s.entrants) expect(stintProblems(e.pit!.stints, e.pit!.stops), e.entrantId).toEqual([]);
}

describe("A1 — pit service and a same-lap retirement never create a zero-length stint", () => {
  it("A: a normal stop closes the old stint and opens a valid new one", () => {
    const s0 = quietIncidentRace(), id = s0.input.entrants[1].entrantId;
    const s = advanceRace(requestPitStop(advanceRace(s0, 5), id, "HARD"), 3);
    const e = find(s, id);
    expect(e.pit!.stops.map(x => x.lap)).toEqual([6]);
    expect(e.pit!.stints.map(x => [x.startLap, x.endLap])).toEqual([[0, 6], [6, null]]);
    allValid(s);
  });
  it("B: a retirement without a stop closes the final stint at the retirement lap", () => {
    const s0 = advanceRace(quietIncidentRace(), 7), id = s0.input.entrants[2].entrantId;
    // Retirement only (the request is withdrawn again before the lap).
    const s = advanceRaceLap(requestPitStop(pitAndRetireNextLap(s0, 2), id, null));
    const e = find(s, id);
    expect(e.incident!.status).toBe("RETIRED");
    expect(e.pit!.stops).toEqual([]);
    expect(e.pit!.stints.map(x => [x.startLap, x.endLap])).toEqual([[0, 8]]);
    allValid(s);
  });
  it.each([0, 11])("C/G/H: stop after lap N and retirement on lap N (N = %i + 1) keeps a valid history and classification", (before) => {
    const s0 = before ? advanceRace(quietIncidentRace(), before) : quietIncidentRace();
    const id = s0.input.entrants[1].entrantId, n = before + 1;
    const s = advanceRaceLap(pitAndRetireNextLap(s0, 1));
    const e = find(s, id);
    expect(e.incident).toMatchObject({ status: "RETIRED", retiredLap: n });
    // The stop happened (its time was spent) …
    expect(e.pit!.stops).toHaveLength(1);
    expect(e.pit!.stops[0]).toMatchObject({ lap: n, newCompound: "HARD" });
    // … but the fitted tyres never raced: the final stint stays terminal/unclosed, never a zero-length completed stint.
    const last = e.pit!.stints.at(-1)!;
    expect(last).toMatchObject({ number: 2, startLap: n, endLap: null, endingTyre: null });
    expect(e.pit!.stints[0]).toMatchObject({ startLap: 0, endLap: n });
    expect(e.pit!.stints.every(x => x.endLap === null || x.endLap > x.startLap)).toBe(true);
    expect(e.pit!.pendingCompound).toBeNull();
    allValid(s);
    // E/G: the Race still finishes; the retired car is classified behind every running car.
    const done = advanceRace(s, 1000);
    expect(done.status).toBe("FINISHED");
    allValid(done);
    const result = raceResult(done);
    expect(result.map(r => r.position)).toEqual(result.map((_, i) => i + 1));
    expect(result.at(-1)).toMatchObject({ entrantId: id, status: "RETIRED", completedLaps: n });
    expect(result.slice(0, -1).every(r => r.status === "FINISHED")).toBe(true);
    // The retired car's frozen history does not change after retirement.
    expect(find(done, id)).toEqual(e);
  });
  it("deterministic replay: the same checkpoint and command produce the identical Race", () => {
    const s0 = pitAndRetireNextLap(advanceRace(quietIncidentRace(), 4), 3);
    expect(advanceRace(s0, 1000)).toEqual(advanceRace(structuredClone(s0), 1000));
  });
  it("closeRetiredStints: closes a raced stint, never a stint with no laps", () => {
    const tyre = { compound: "SOFT" as const, ageLaps: 3, wearPermille: 90, temperatureMilliC: 90000 };
    const open = (startLap: number) => ({ number: 2, startLap, endLap: null, startingTyre: tyre, endingTyre: null });
    expect(closeRetiredStints([open(4)], 9, tyre)[0]).toMatchObject({ endLap: 9, endingTyre: tyre });
    expect(closeRetiredStints([open(9)], 9, tyre)[0]).toMatchObject({ endLap: null, endingTyre: null });
  });
});

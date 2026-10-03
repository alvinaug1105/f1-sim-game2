// @vitest-environment happy-dom
/**
 * V8C-02: ordinal result position ≠ official classified leader. When every finisher is disqualified there is NO
 * official leader or winner (the stored ordinal P1 is ordering only); with road P1 disqualified, the compliant car
 * behind becomes the official P1 / leader. Live (RUNNING) leader display is unchanged.
 */
import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../src/i18n/provider";
import { projectRaceView } from "../src/features/race/projection";
import { timingRows } from "../src/features/race/viewer/model";
import { labelTiers, officialLeaderId } from "../src/features/race/viewer/race-view";
import { LABEL_TIER } from "../src/features/race/viewer/labels";
import { DriverPanel } from "../src/features/race/viewer/driver-panel";
import { PlayerSwitch } from "../src/features/race/viewer/player-switch";
import { TimingTower } from "../src/features/race/viewer/timing-tower";
import { advanceRace, raceResult } from "../src/simulation/race/engine";
import { requestPitStop } from "../src/simulation/race/pits/model";
import { computeStandings, scoreSession } from "../src/game/domain/championship";
import { standingsPage } from "../src/features/championship/model";
import type { RaceSimulationState } from "../src/simulation/race/types";
import type { ChampionshipEvent } from "../src/game/domain/championship-repository";
import { viewerData } from "./helpers/viewer";
import { v8cRace } from "./helpers/v8c";
import { source } from "./helpers/championship";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
/** Four player-controlled finishers that never stop: one dry specification each → all four disqualified, no retiree. */
const allDsq = () => advanceRace(v8cRace({ count: 4, players: 4, laps: 8, quiet: true }), 8);
const ordinalFirst = (s: RaceSimulationState) => s.entrants.find(e => e.position === 1)!;
/** Public view; the player team is the team of `focusId` (so that car renders in the player switch). */
function view(s: RaceSimulationState, focusId = ordinalFirst(s).entrantId) {
    const d = viewerData(4), team = s.input.entrants.find(e => e.entrantId === focusId)!.teamId;
    return projectRaceView({ ...d, state: s, progress: { ...d.progress, career: { ...d.progress.career, playerTeamId: team } } });
}
const html = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider initialLocale="en">{node}</I18nProvider>);

describe("all finishers disqualified: no official leader or winner", () => {
    const done = allDsq(), first = ordinalFirst(done);
    it("the final classification has no CLASSIFIED car; road order is preserved; nobody scores", () => {
        const record = done.progression!.classification!;
        expect(record.entries.map(x => x.status)).toEqual(["DISQUALIFIED", "DISQUALIFIED", "DISQUALIFIED", "DISQUALIFIED"]);
        expect(record.entries.map(x => x.roadPosition).sort()).toEqual([1, 2, 3, 4]);
        expect(first.position).toBe(1); // the persisted ordinal remains (ordering / storage only)
        expect(raceResult(done).every(r => r.disqualified)).toBe(true);
        const entries = raceResult(done).map(r => ({ driverId: r.driverId, teamId: r.teamId, position: r.position, disqualified: true }));
        expect(scoreSession("F1_2026", "RACE", { scheduledLaps: 8, leaderLaps: 8, leaderGreenLaps: 8, entries }).every(e => e.units === 0)).toBe(true);
        const standings = computeStandings({ version: "F1_2026", rounds: [{ eventId: "e1", round: 1, sprint: null, race: { scheduledLaps: 8, leaderLaps: 8, leaderGreenLaps: 8, entries }, qualifying: null }],
            drivers: entries.map(e => ({ id: e.driverId, teamId: e.teamId })), teams: [...new Set(entries.map(e => e.teamId))] });
        for (const r of [...standings.drivers, ...standings.constructors]) { expect(r.units).toBe(0); expect(r.wins).toBe(0); }
    });
    it("officialLeaderId is null and no car gets the LEADER label tier from its ordinal P1", () => {
        const d = view(done), s = d.state!;
        expect(officialLeaderId(s)).toBeNull();
        // No player team in this view, the selected car is the ordinal last: only the leader rule could raise P1.
        const neutral = projectRaceView({ ...viewerData(4), state: done, progress: { ...d.progress, career: { ...d.progress.career, playerTeamId: "no-player-team" } } });
        const rows = timingRows(neutral), last = done.entrants.find(e => e.position === 4)!.entrantId;
        const tiers = labelTiers(rows, last, neutral.state!);
        expect(tiers.get(first.entrantId)).toBe(LABEL_TIER.FIELD);
        expect([...tiers.values()]).not.toContain(LABEL_TIER.LEADER);
    });
    it("driver panel: the DSQ ordinal P1 is never shown as Leader", () => {
        const d = view(done), rows = timingRows(d), row = rows.find(r => r.id === first.entrantId)!;
        const panel = html(<DriverPanel data={d} row={row} busy={false} send={() => {}} rows={rows}/>);
        expect(panel).not.toContain(">Leader<"); expect(panel).not.toMatch(/To leader: Leader/);
        expect(panel).toMatch(/To leader: Disqualified/);
        const tower = html(<TimingTower state={d.state!} rows={rows} selected={row.id} onSelect={() => {}} interval={false} onInterval={() => {}}/>);
        expect(tower).not.toContain("Leader");
    });
    it("player switch: the DSQ ordinal P1 shows DSQ, never P1 / Leader (including the comparison table)", () => {
        const d = view(done), rows = timingRows(d), host = document.createElement("div"); document.body.append(host);
        const root = createRoot(host);
        act(() => root.render(<I18nProvider initialLocale="en"><PlayerSwitch state={d.state!} rows={rows} selected={first.entrantId} onSelect={() => {}}/></I18nProvider>));
        act(() => { host.querySelector<HTMLButtonElement>(".compare-toggle")!.click(); });
        const text = host.textContent ?? "";
        expect(text).not.toContain("Leader");
        expect(text).not.toContain("P1");
        expect(text).toContain("DSQ"); expect(text).toContain("Disqualified");
        act(() => root.unmount()); host.remove();
    });
    it("championship helpers name no winner", () => {
        const race = { scheduledLaps: 8, leaderGreenLaps: 8, entrants: raceResult(done).map(r => ({ driverId: r.driverId, teamId: r.teamId, position: r.position, gridPosition: null, completedLaps: 8, elapsedTimeMs: 1, retired: false, disqualified: true, stops: 0 })) };
        const base = source([]);
        const event: ChampionshipEvent = { id: "e1", round: 1, name: "Event 1", circuitName: "C", format: "STANDARD", status: "COMPLETED", sessions: [{ type: "RACE", status: "COMPLETED" }], sprint: null, race, qualifying: null };
        const page = standingsPage({ ...base, events: [event], roster: race.entrants.map(e => ({ driverId: e.driverId, teamId: e.teamId, carNumber: null })), teams: [...new Set(race.entrants.map(e => e.teamId))] }, null);
        expect(page.history[0].raceWinner).toBeNull();
        expect(page.drivers.every(r => r.units === 0)).toBe(true);
    });
});

describe("mixed: road P1 disqualified, road P2 compliant → the compliant car is the official P1 / leader", () => {
    it("promotes and labels the compliant car only", () => {
        // Car 0 never stops (violates); car 1 fits a second dry specification; the rest are AI (comply).
        let s = advanceRace(v8cRace({ count: 4, players: 2, laps: 10, quiet: true }), 3);
        s = requestPitStop(s, s.input.entrants[1].entrantId, "HARD");
        const done = advanceRace(s, 10), violator = s.input.entrants[0].entrantId;
        const official = done.progression!.classification!.entries.find(x => x.position === 1)!;
        expect(official.status).toBe("CLASSIFIED"); expect(official.entrantId).not.toBe(violator);
        const d = view(done, violator), rows = timingRows(d);
        expect(officialLeaderId(d.state!)).toBe(official.entrantId);
        expect(labelTiers(rows, violator, d.state!).get(official.entrantId)).toBe(LABEL_TIER.LEADER);
        const leaderRow = rows.find(r => r.id === official.entrantId)!;
        expect(html(<DriverPanel data={d} row={leaderRow} busy={false} send={() => {}} rows={rows}/>)).toMatch(/To leader: Leader/);
    }, 60_000);
    it("live Race: ordinal P1 stays the live leader (no final classification yet)", () => {
        const live = advanceRace(v8cRace({ count: 4, players: 4, laps: 8, quiet: true }), 3), d = view(live);
        expect(officialLeaderId(d.state!)).toBe(ordinalFirst(live).entrantId);
    });
});

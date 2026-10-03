/**
 * Race v8C player-facing regulation information: the driver panel's tyre-rule status, the pit selector hint (any
 * compound stays selectable), the URGENT alert, the pre-Race note, and DSQ in the final Race views and results.
 * Rendered from the real public projection; structural checks only.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/provider";
import { projectRaceView } from "../src/features/race/projection";
import { timingRows } from "../src/features/race/viewer/model";
import { DriverPanel } from "../src/features/race/viewer/driver-panel";
import { TimingTower } from "../src/features/race/viewer/timing-tower";
import { assessCheckpoint, initialAttention } from "../src/features/race/viewer/attention";
import { WeekendResultsView } from "../src/features/championship/views";
import { weekendResultsPage } from "../src/features/championship/model";
import { advanceRace } from "../src/simulation/race/engine";
import { requestPitStop } from "../src/simulation/race/pits/model";
import { assessTyreRule } from "../src/simulation/race/regulations/tyres";
import type { RaceSimulationState } from "../src/simulation/race/types";
import type { RaceKind } from "../src/game/domain/race-repository";
import { viewerData } from "./helpers/viewer";
import { v8cRace, withTyres } from "./helpers/v8c";
import { event, session, source } from "./helpers/championship";

const data = (s: RaceSimulationState, kind: RaceKind = "RACE") => projectRaceView({ ...viewerData(8), kind, state: s });
function panel(s: RaceSimulationState, slot = 0, locale: "en" | "zh-TW" = "en", kind: RaceKind = "RACE") {
    const d = data(s, kind), rows = timingRows(d), row = rows.find(r => r.id === s.input.entrants[slot].entrantId)!;
    return renderToStaticMarkup(<I18nProvider initialLocale={locale}><DriverPanel data={d} row={row} busy={false} send={() => {}} rows={rows}/></I18nProvider>);
}
const race = (laps = 3) => advanceRace(v8cRace({ count: 8, players: 2, laps: 20, quiet: true }), laps);
const id = (s: RaceSimulationState, slot = 0) => s.input.entrants[slot].entrantId;

describe("driver panel: dry-tyre rule status (own cars, from actual tyre use)", () => {
    it("outstanding: warns, and marks the compounds that would meet the rule without disabling the same compound", () => {
        const html = panel(race());
        expect(html).toContain("Dry tyre rule");
        expect(html).toContain("Another dry compound is still required.");
        expect(html).toContain("Dry compounds used: Medium");
        expect(html).toMatch(/<option value="HARD"[^>]*>Hard — ✓ meets tyre rule<\/option>/);
        expect(html).toMatch(/<option value="MEDIUM">Medium<\/option>/); // still selectable: the player may violate deliberately
        expect(html).not.toMatch(/<option[^>]*disabled/);
    });
    it("a pending different-compound request does not clear the warning", () => {
        const s = requestPitStop(race(), id(race()), "HARD"), html = panel(s);
        expect(html).toContain("Another dry compound is still required.");
        expect(html).toContain("A requested tyre counts only once the car leaves the pit lane with it fitted.");
    });
    it("clears once satisfied or exempt", () => {
        const satisfied = panel(withTyres(race(), id(race()), ["MEDIUM", "HARD"]));
        expect(satisfied).toContain("Tyre requirement satisfied."); expect(satisfied).not.toContain("still required"); expect(satisfied).not.toContain("meets tyre rule");
        const exempt = panel(withTyres(race(), id(race()), ["MEDIUM", "INTERMEDIATE"]));
        expect(exempt).toContain("Dry-compound requirement waived after Intermediate/Wet use."); expect(exempt).not.toContain("still required");
    });
    it("urgent near the last safe stop opportunity (announced as an alert)", () => {
        const s = race(), late = advanceRace(s, assessTyreRule(s, id(s)).deadlineLap! - s.lap);
        expect(assessTyreRule(late, id(late)).status).toBe("URGENT");
        const html = panel(late);
        expect(html).toMatch(/role="alert"[^>]*>[\s\S]*Final safe pit opportunity/);
    });
    it("no false warnings: Sprint, retired car, rival car, finished Race", () => {
        const sprint = advanceRace(v8cRace({ count: 8, players: 2, laps: 12, quiet: true, session: "SPRINT" }), 3);
        const sprintHtml = panel(sprint, 0, "en", "SPRINT");
        expect(sprintHtml).toContain("No dry-compound requirement applies in the Sprint."); expect(sprintHtml).not.toContain("still required");
        const s = race(), retired = { ...s, entrants: s.entrants.map(e => e.entrantId === id(s) ? { ...e, incident: { ...e.incident!, status: "RETIRED" as const, retiredLap: 2, retirementOrder: 1 } } : e) };
        expect(panel(retired)).not.toContain("Dry tyre rule");
        expect(panel(s, 5)).not.toContain("Dry tyre rule"); // rival: no obligation shown
        const done = advanceRace(v8cRace({ count: 8, players: 2, laps: 10, quiet: true }), 10);
        expect(panel(done)).not.toContain("still required");
    });
    it("Traditional Chinese", () => {
        expect(panel(race(), 0, "zh-TW")).toContain("仍須使用另一種乾地胎配方。");
    });
});

describe("Race alert when compliance becomes urgent", () => {
    it("announces TYRE_RULE_URGENT once, for the player car, when it first reaches the last safe opportunity", () => {
        const s = race(), team = s.input.entrants[0].teamId, deadline = assessTyreRule(s, id(s)).deadlineLap!;
        const before = advanceRace(s, deadline - 1 - s.lap), at = advanceRace(before, 1), after = advanceRace(at, 1);
        const memory = initialAttention(data(before).state!, team);
        const first = assessCheckpoint(memory, data(at).state!, team);
        expect(first.items.filter(i => i.kind === "TYRE_RULE_URGENT").map(i => i.entrantId).sort()).toEqual([id(s, 0), id(s, 1)].sort());
        expect(assessCheckpoint(first.memory, data(after).state!, team).items.some(i => i.kind === "TYRE_RULE_URGENT")).toBe(false);
    });
});

describe("final classification views: DSQ is not a retirement", () => {
    it("timing tower and driver panel show the disqualification, its reason and the road position", () => {
        const done = advanceRace(v8cRace({ count: 8, players: 2, laps: 10, quiet: true }), 10);
        const d = data(done), rows = timingRows(d);
        expect(rows.filter(r => r.disqualified).map(r => r.id).sort()).toEqual([id(done, 0), id(done, 1)].sort());
        const tower = renderToStaticMarkup(<I18nProvider initialLocale="en"><TimingTower state={d.state!} rows={rows} selected={rows[0].id} onSelect={() => {}} interval={false} onInterval={() => {}}/></I18nProvider>);
        expect(tower.match(/>DSQ</g)).toHaveLength(2);
        expect(tower).toContain("Disqualified");
        const html = panel(done);
        expect(html).toContain("Disqualified"); expect(html).toContain("Did not use two different dry compounds (FIA B6.3.6).");
        expect(html).toMatch(/Crossed the line P\d+/); expect(html).not.toContain("Retired");
    });
    it("results page lists DSQ with no points and never as Retired", () => {
        const html = renderToStaticMarkup(<I18nProvider initialLocale="en"><WeekendResultsView page={weekendResultsPage(source([event(1, { race: session(["d1", "d2", "d3", "d4", "d5", "d6"], { disqualified: ["d6"] }) })]), "e1")!}/></I18nProvider>);
        expect(html).toMatch(/<abbr title="Disqualified">DSQ<\/abbr>/);
        expect(html).toContain(">Disqualified<");
    });
});

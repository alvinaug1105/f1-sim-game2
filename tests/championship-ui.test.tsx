// @vitest-environment happy-dom
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/provider";
import { championshipSummary, parseCutoff, standingsPage, weekendResultsPage } from "../src/features/championship/model";
import { ChampionshipSummaryPanel, StandingsView, WeekendResultsView } from "../src/features/championship/views";
import { WeekendView } from "../src/features/career/progression-views";
import { enterNextEvent, isPractice, progressSummary, transitionSession } from "../src/game/domain/progression";
import { careerGrid } from "./helpers/grid";
import { sequentialIds } from "./helpers/qualifying";
import { event, session, source } from "./helpers/championship";
vi.mock("../src/features/career/progression-actions", () => ({ progressionAction: vi.fn() }));
vi.mock("../src/features/practice/actions", () => ({ practiceWeekendAction: vi.fn() }));
vi.mock("../src/features/qualifying/actions", () => ({ qualifyingWeekendAction: vi.fn() }));
vi.mock("../src/features/race/actions", () => ({ raceAction: vi.fn() }));
vi.mock("../src/features/race/viewer/actions", () => ({ viewerAction: vi.fn(), sprintRemainderAction: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const html = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
const r1 = () => event(1, { race: session(["d3", "d1", "d5", "d2", "d4", "d6"]), qualifying: [{ driverId: "d1", teamId: "t1", position: 1 }] });
const r2Sprint = () => event(2, { format: "SPRINT", sprint: session(["d1", "d3", "d2", "d4", "d5", "d6"], { scheduled: 19 }) });
const r2Full = () => event(2, { format: "SPRINT", sprint: session(["d1", "d3", "d2", "d4", "d5", "d6"], { scheduled: 19 }), race: session(["d1", "d2", "d3", "d4", "d5", "d6"], { retired: ["d6"] }) });
let root: Root | null = null, host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });
describe("Championship view models", () => {
  it("parses cutoffs strictly", () => {
    expect(parseCutoff("r3")).toEqual({ round: 3, stage: "RACE" });
    expect(parseCutoff("r3-sprint")).toEqual({ round: 3, stage: "SPRINT" });
    expect(parseCutoff("before-r2")).toEqual({ round: 2, stage: "BEFORE" });
    for (const bad of [undefined, "", "r0", "3", "before-r2-sprint", "r3;drop", "rx"]) expect(parseCutoff(bad)).toBeNull();
  });
  it("no completed session → empty standings; the roster is listed once a session scores", () => {
    const empty = standingsPage(source([event(1), event(2, { format: "SPRINT" })]), null);
    expect(empty.through).toBeNull();
    expect(empty.cutoffs).toEqual([]);
    expect(empty.champions).toBeNull();
    const page = standingsPage(source([r1(), event(2, { format: "SPRINT" })]), null);
    expect(page.through).toEqual({ round: 1, stage: "RACE", eventName: "Event 1" });
    expect(page.drivers.map((r) => [r.driver.abbreviation, r.units / 2, r.movement])).toEqual([["DR3", 25, null], ["DR1", 18, null], ["DR5", 15, null], ["DR2", 12, null], ["DR4", 10, null], ["DR6", 8, null]]);
    expect(page.drivers.filter((r) => r.driver.player).map((r) => r.driver.id)).toEqual(["d1", "d2"]);
    expect(page.constructors.map((r) => [r.team.name, r.units / 2])).toEqual([["Player Racing", 30], ["Rival Motorsport", 35], ["Third Works", 23]].sort((a, b) => (b[1] as number) - (a[1] as number)));
  });
  it("a partial Sprint weekend: the Sprint counts, the unfinished Grand Prix does not; cutoffs select earlier states", () => {
    const s = source([r1(), r2Sprint(), event(3)]);
    const live = standingsPage(s, null);
    expect(live.through).toMatchObject({ round: 2, stage: "SPRINT" });
    expect(live.drivers.find((r) => r.driver.id === "d1")!.units / 2).toBe(18 + 8);
    expect(live.cutoffs.map((c) => c.value)).toEqual(["r1", "r2-sprint"]);
    const before = standingsPage(s, parseCutoff("r1"));
    expect(before.selected).toBe("r1");
    expect(before.drivers.find((r) => r.driver.id === "d1")!.units / 2).toBe(18);
    // A cutoff the season has not reached is ignored rather than inventing results.
    expect(standingsPage(s, parseCutoff("r3")).selected).toBeNull();
    expect(standingsPage(s, parseCutoff("before-r2")).through).toMatchObject({ round: 1, stage: "RACE" });
  });
  it("season complete only when every event has a completed Grand Prix — then the champions", () => {
    expect(standingsPage(source([r1(), r2Full(), event(3)]), null).champions).toBeNull();
    const done = standingsPage(source([r1(), r2Full()]), null);
    expect(done.seasonComplete).toBe(true);
    expect(done.champions!.drivers.map((d) => d.id)).toEqual(["d1"]);
    expect(done.champions!.constructors.map((t) => t.id)).toEqual(["t1"]);
    // A historical cutoff never shows a champion.
    expect(standingsPage(source([r1(), r2Full()]), parseCutoff("r1")).champions).toBeNull();
    expect(done.history.map((h) => [h.round, h.raceWinner?.id, h.sprintWinner?.id ?? null])).toEqual([[1, "d3", null], [2, "d1", "d1"]]);
  });
  it("weekend results: Sprint + Grand Prix with points and championship positions after the event; tolerant of a partial weekend", () => {
    const partial = weekendResultsPage(source([r1(), r2Sprint()]), "e2")!;
    expect(partial.sprint!.rows.map((r) => r.units / 2)).toEqual([8, 7, 6, 5, 4, 3]);
    expect(partial.race).toBeNull();
    expect(partial.through).toBe("SPRINT");
    const full = weekendResultsPage(source([r1(), r2Full()]), "e2")!;
    expect(full.through).toBe("RACE");
    expect(full.race!.rows.find((r) => r.driver.id === "d6")!.retired).toBe(true);
    expect(full.race!.rows.find((r) => r.driver.id === "d6")!.units / 2).toBe(8); // classified P6, retired or not
    const d1 = full.weekend.find((r) => r.driver.id === "d1")!;
    expect([d1.sprint! / 2, d1.race! / 2, d1.total / 2]).toEqual([8, 25, 33]);
    expect(d1.championship).toMatchObject({ position: 1, movement: "UP" });
    expect(full.constructors[0]).toMatchObject({ team: { id: "t1" }, total: (8 + 6 + 25 + 18) * 2 });
    expect(weekendResultsPage(source([r1()]), "e9")).toBeNull();
    expect(weekendResultsPage(source([r1(), event(2)]), "e2")).toMatchObject({ sprint: null, race: null, through: null, weekend: [] });
  });
  it("dashboard summary: leaders, the player's drivers and team", () => {
    const s = championshipSummary(source([r1(), r2Sprint()]));
    expect(s.driverLeaders.map((l) => [l.driver.id, l.units / 2])).toEqual([["d3", 32]]);
    expect(s.playerDrivers.map((d) => [d.driver.id, d.position, d.units / 2])).toEqual([["d1", 2, 26], ["d2", 4, 18]]);
    expect(s.playerTeam).toMatchObject({ position: 2 });
    expect(s.seasonComplete).toBe(false);
  });
});
describe("Championship UI", () => {
  it("standings: keyboard tabs, captions, the player marked without colour, movement and tie as text", () => {
    const s = source([r1(), event(2, { race: session(["d2", "d1", "d4", "d3", "d6", "d5"]) }), event(3)]);
    const text = html(<StandingsView page={standingsPage(s, null)} />);
    expect(text).toContain('role="tablist"');
    expect(text.match(/role="tab"/g)).toHaveLength(2);
    expect(text).toContain('aria-selected="true"');
    expect(text).toContain("Drivers&#x27; Championship — After Round 2 · Event 2");
    expect(text).toContain("Constructors&#x27; Championship — After Round 2 · Event 2");
    expect(text).toContain("◆");
    expect(text).toContain("Your team");
    expect(text).toContain("Position gained");
    expect(text).toContain("Position lost");
    expect(text).toMatch(/aria-hidden="true">↑</);
    expect(text).toContain("Season History");
    expect(text).toContain("Standings after");
    expect(text).not.toMatch(/seed|rngState|timeline|strategy/i);
    const tied = html(<StandingsView page={standingsPage(source([event(1, { race: session(["d1", "d3"]) }), event(2, { race: session(["d3", "d1"]) })]), null)} />);
    expect(tied).toContain("(Tied)");
    expect(tied).toMatch(/aria-hidden="true">=</);
    expect(html(<StandingsView page={standingsPage(source([event(1)]), null)} />)).toContain("No completed sessions yet");
  });
  it("the Drivers / Constructors tabs follow the arrow keys", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<I18nProvider><StandingsView page={standingsPage(source([r1()]), null)} /></I18nProvider>));
    const tabs = () => [...host!.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
    const panels = () => [...host!.querySelectorAll('[role="tabpanel"]')] as HTMLElement[];
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1]);
    expect(panels().map((p) => p.hidden)).toEqual([false, true]);
    act(() => { tabs()[0].focus(); tabs()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(document.activeElement).toBe(tabs()[1]);
    expect(panels().map((p) => p.hidden)).toEqual([true, false]);
    expect(panels()[1].textContent).toContain("Player Racing");
    act(() => { tabs()[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); });
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
  });
  it("weekend results: a Sprint weekend shows both sections, a Standard weekend only the Grand Prix", () => {
    const partial = html(<WeekendResultsView page={weekendResultsPage(source([r1(), r2Sprint()]), "e2")!} />);
    expect(partial).toContain(">Sprint</h2>");
    expect(partial).toContain(">Grand Prix</h2>");
    expect(partial).toContain("Not yet completed.");
    expect(partial).toContain("Championship after the Sprint");
    expect(partial).toContain("+8");
    const full = html(<WeekendResultsView page={weekendResultsPage(source([r1(), r2Full()]), "e2")!} />);
    expect(full).toContain("Championship after this event");
    expect(full).toContain("Sprint Points");
    expect(full).toContain("Retired");
    expect(full).toContain("+25");
    const standard = html(<WeekendResultsView page={weekendResultsPage(source([r1()]), "e1")!} />);
    expect(standard).not.toContain(">Sprint</h2>");
    expect(standard).not.toContain("Sprint Points");
    expect(standard).toContain('href="/career/00000000-0000-4000-8000-00000000c001/standings"');
  });
  it("the dashboard panel summarises the live championship and links to the standings", () => {
    const text = html(<ChampionshipSummaryPanel summary={championshipSummary(source([r1(), r2Full()]))} />);
    for (const s of ["Season Complete", "Drivers&#x27; Champion", "Constructors&#x27; Champion", "Your drivers", "Your team", "Open standings"]) expect(text).toContain(s);
    const early = html(<ChampionshipSummaryPanel summary={championshipSummary(source([event(1)]))} />);
    expect(early).toContain("No completed sessions yet");
    expect(early).toContain("/standings");
  });
  it("the weekend page offers Weekend Results and the Championship once the Grand Prix is complete", async () => {
    const g = await careerGrid("team-mclaren");
    let p = enterNextEvent(g.progress, progressSummary(g.progress).next!.id, sequentialIds());
    const ev = progressSummary(p).active!;
    const sessions = [...ev.weekend!.sessions].sort((a, b) => a.order - b.order);
    for (const s of sessions.slice(0, -1)) p = isPractice(s.type) ? transitionSession(p, ev.id, s.id, "simulatePractice") : transitionSession(transitionSession(p, ev.id, s.id, "start"), ev.id, s.id, "completeDevelopment");
    let text = html(<WeekendView progress={p} eventId={ev.id} />);
    expect(text).not.toContain("View Weekend Results");
    const race = sessions.at(-1)!;
    p = transitionSession(transitionSession(p, ev.id, race.id, "start"), ev.id, race.id, "completeDevelopment");
    text = html(<WeekendView progress={p} eventId={ev.id} />);
    expect(text).toContain(`href="/career/${g.career.id}/events/${ev.id}/results"`);
    expect(text).toContain("View Weekend Results");
    expect(text).toContain(`href="/career/${g.career.id}/standings"`);
    expect(text).toContain("View Championship");
  });
});

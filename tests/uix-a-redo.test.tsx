import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/provider";
import { translate, type Locale } from "../src/i18n/catalog";
import { AppShell } from "../src/components/layout/app-shell";
import { readableInk, safeTeamColor, teamStyle } from "../src/components/ui/team-color";
import { careerShellContext } from "../src/features/career/shell-context";
import { commandCentreModel, FORM_ROUNDS } from "../src/features/career/command-centre";
import { CommandCentreView } from "../src/features/career/command-centre-view";
import { circuitCard } from "../src/features/career/circuit-card";
import { weekendDrivers } from "../src/features/career/weekend-hub";
import { WeekendView } from "../src/features/career/progression-views";
import { enterNextEvent, isPractice, progressSummary, transitionSession, weekendFormatOf, type CareerProgress } from "../src/game/domain/progression";
import type { CareerOverview } from "../src/game/domain/career";
import { careerGrid } from "./helpers/grid";
import { sequentialIds } from "./helpers/qualifying";
import { event, session, source } from "./helpers/championship";
import en from "../src/i18n/en/messages.json";
import zh from "../src/i18n/zh-TW/messages.json";
/**
 * UIX-A REDO presentation contracts: shell context and navigation, Command Centre projection and states, Weekend Hub
 * structure and optional extras, team-colour safety, i18n coverage and the live-session stylesheet boundary.
 * Presentation only — no simulation, progression or persistence behaviour is exercised or changed here.
 */
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("../src/features/career/progression-actions", () => ({ progressionAction: vi.fn() }));
vi.mock("../src/features/practice/actions", () => ({ practiceWeekendAction: vi.fn() }));
vi.mock("../src/features/qualifying/actions", () => ({ qualifyingWeekendAction: vi.fn() }));
vi.mock("../src/features/race/actions", () => ({ raceAction: vi.fn() }));
vi.mock("../src/features/race/viewer/actions", () => ({ viewerAction: vi.fn(), sprintRemainderAction: vi.fn() }));
const html = (node: React.ReactNode, locale: Locale = "en") => renderToStaticMarkup(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);
async function fixture() {
  const g = await careerGrid("team-mclaren");
  const team = g.world.teams.find((t) => t.id === g.playerTeamId)!;
  const overview = (p: CareerProgress): CareerOverview => {
    const s = progressSummary(p), ev = s.active ?? s.next;
    const raw = ev ? g.world.events.find((e) => e.id === ev.id)! : null;
    return { career: p.career, playerTeam: team, season: g.world.season, nextEvent: raw ? { event: { ...raw, status: ev!.status }, circuit: g.world.circuits.find((c) => c.id === raw.careerCircuitId)! } : null };
  };
  const active = enterNextEvent(g.progress, progressSummary(g.progress).next!.id, sequentialIds());
  return { g, team, overview, fresh: g.progress, active };
}
const card = (o: CareerOverview) => (o.nextEvent ? circuitCard(o.nextEvent.circuit, weekendFormatOf(o.nextEvent.event)) : null);

describe("team colour safety", () => {
  it("only injects plain hex colours and picks the readable ink", () => {
    expect(safeTeamColor("#FF8000")).toBe("#ff8000");
    for (const bad of ["red", "#ff800", "#ff8000;background:url(x)", "", null, undefined]) expect(safeTeamColor(bad)).not.toBe(bad);
    expect(readableInk("#ffffff")).toBe("#0b1118");
    expect(readableInk("#ff8000")).toBe("#0b1118");
    expect(readableInk("#ffd700")).toBe("#0b1118");
    expect(readableInk("#00205b")).toBe("#ffffff");
    expect(readableInk("#e10600")).toBe("#ffffff");
    expect(teamStyle("javascript:alert(1)")["--team"]).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("global shell", () => {
  it("groups navigation, shows team identity and the live Race Weekend only during a weekend", async () => {
    const { overview, fresh, active } = await fixture();
    const ctx = careerShellContext(overview(active), active);
    expect(ctx.round).toBe(1);
    expect(ctx.rounds[0]).toBe("current");
    expect(ctx.activeEvent?.id).toBe(progressSummary(active).active!.id);
    pathname = `/career/${active.career.id}`;
    const text = html(<AppShell career={ctx}><p>content</p></AppShell>);
    for (const key of ["shell.group.headquarters", "shell.group.engineering", "shell.group.championship", "shell.group.game"] as const)
      expect(text).toContain(translate("en", key));
    expect(text).toContain(`class="nav-item active" aria-current="page" href="/career/${active.career.id}"`);
    expect(text).toContain(`href="/career/${active.career.id}/events/${ctx.activeEvent!.id}"`);
    expect(text).toContain("McLaren");
    expect(text).toContain('aria-controls="shell-rail"');
    expect(text).toContain('aria-expanded="false"');
    expect(text).toMatch(/--team:#[0-9a-f]{6}/);
    const idle = html(<AppShell career={careerShellContext(overview(fresh), fresh)}><p>content</p></AppShell>);
    expect(idle).not.toContain(translate("en", "navigation.raceWeekend"));
  });
  it("keeps working from the URL alone and ignores a context for another Career", async () => {
    const { overview, active } = await fixture();
    pathname = "/career/another-world/standings";
    const text = html(<AppShell career={careerShellContext(overview(active), active)}><p>content</p></AppShell>);
    expect(text).toContain('class="nav-item active" aria-current="page" href="/career/another-world/standings"');
    expect(text).not.toContain("McLaren");
  });
});

describe("Career Command Centre", () => {
  it("projects the mission, championship table with the player row, drivers and form from persisted data only", async () => {
    const { overview, fresh, active } = await fixture();
    const rounds = Array.from({ length: 7 }, (_, i) => event(i + 1, { race: session(i % 2 ? ["d3", "d4", "d5", "d6", "d1", "d2"] : ["d3", "d5", "d1", "d4", "d6", "d2"], { retired: i === 0 ? ["d2"] : [] }) }));
    const src = source(rounds);
    const next = commandCentreModel(overview(fresh), fresh, src, card(overview(fresh)));
    expect(next.mission.kind).toBe("NEXT");
    expect(next.focus?.circuit?.outline?.path).toMatch(/^M[\d. L]+Z$/);
    expect(next.championship?.started).toBe(true);
    expect(next.championship?.rows.length).toBeLessThanOrEqual(6);
    expect(next.championship?.rows.some((r) => r.player)).toBe(true);
    expect(next.form).toHaveLength(FORM_ROUNDS);
    expect(next.form![0].round).toBe(7);
    expect(next.drivers?.map((d) => d.abbreviation)).toEqual(["DR1", "DR2"]);
    expect(commandCentreModel(overview(active), active, src, null).mission.kind).toBe("ACTIVE");
    const none = commandCentreModel(overview(fresh), fresh, null, null);
    expect([none.championship, none.drivers, none.form]).toEqual([null, null, null]);
    const early = commandCentreModel(overview(fresh), fresh, source([event(1)]), null);
    expect(early.championship?.started).toBe(false);
    expect(early.drivers?.every((d) => d.position === null)).toBe(true);
  });
  it.each(["en", "zh-TW"] as const)("renders every mission state with existing controls (%s)", async (locale) => {
    const { overview, fresh, active } = await fixture();
    const src = source([event(1, { race: session(["d1", "d3", "d2", "d4", "d5", "d6"]) })]);
    const next = html(<CommandCentreView model={commandCentreModel(overview(fresh), fresh, src, card(overview(fresh)))} />, locale);
    expect(next).toContain('value="advance"');
    expect(next).toContain(translate(locale, "progression.advance"));
    expect(next).toContain('class="circuit-outline"');
    expect(next).toContain(translate(locale, "commandCentre.you"));
    const live = html(<CommandCentreView model={commandCentreModel(overview(active), active, src, card(overview(active)))} />, locale);
    expect(live).toContain(translate(locale, "progression.open"));
    expect(live).toContain(`href="/career/${active.career.id}/events/${progressSummary(active).active!.id}"`);
    const degraded = html(<CommandCentreView model={commandCentreModel(overview(fresh), fresh, null, null)} />, locale);
    expect(degraded).toContain(translate(locale, "commandCentre.unavailable"));
    expect(degraded).toContain(`href="/career/${fresh.career.id}/standings"`);
    for (const text of [next, live, degraded]) expect(text).not.toMatch(/commandCentre\.|weekendHub\.|shell\./);
  });
});

describe("Race Weekend Hub", () => {
  it("keeps the WeekendView signature, shows progression, the next session and optional extras", async () => {
    const { g, overview, active } = await fixture();
    const ev = progressSummary(active).active!;
    const bare = html(<WeekendView progress={active} eventId={ev.id} />);
    expect(bare).toContain('aria-current="step"');
    expect(bare).toContain(translate("en", "weekendHub.nextSession"));
    expect(bare).toContain(translate("en", "weekendHub.actionsAbove"));
    expect(bare).not.toContain('class="circuit-outline"');
    let p = active;
    for (const s of [...ev.weekend!.sessions].sort((a, b) => a.order - b.order))
      p = isPractice(s.type) ? transitionSession(p, ev.id, s.id, "simulatePractice") : transitionSession(transitionSession(p, ev.id, s.id, "start"), ev.id, s.id, "completeDevelopment");
    const src = source([event(1, { race: session(["d1", "d3", "d2", "d4", "d5", "d6"]) })]);
    const done = html(<WeekendView progress={p} eventId={ev.id} extras={{ teamColor: "#ff8000", circuit: card(overview(active)), drivers: weekendDrivers(src, "e1") }} />);
    expect(done).toContain(translate("en", "progression.done"));
    expect(done).toContain('class="circuit-outline"');
    expect(done).toContain("Last1");
    expect(done).toContain(`href="/career/${g.career.id}/events/${ev.id}/results"`);
  });
});

describe("circuit card", () => {
  it("uses real geometry only and real Career circuit facts", async () => {
    const { g } = await fixture();
    const circuit = g.world.circuits[0];
    const c = circuitCard(circuit, "STANDARD");
    expect(c.distanceMeters).toBe(circuit.lengthMeters * circuit.defaultLapCount);
    expect(c.sprintLaps).toBeNull();
    expect(circuitCard(circuit, "SPRINT").sprintLaps).toBeGreaterThan(0);
    expect(circuitCard({ ...circuit, sourceCircuitId: "no-such-circuit" }, "STANDARD").outline).toBeNull();
  });
});

describe("catalogs and stylesheet boundary", () => {
  it("adds every UIX-A REDO key to both catalogs with identical placeholders", () => {
    const keys = Object.keys(en).filter((k) => /^(commandCentre|weekendHub|shell)\.|^navigation\.(commandCentre|raceWeekend|home)$/.test(k));
    expect(keys.length).toBeGreaterThan(60);
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const k of keys) expect(holes((zh as Record<string, string>)[k] ?? "MISSING")).toEqual(holes((en as Record<string, string>)[k]));
  });
  it("layers the design system (including the UIX-B live stylesheet) and keeps the live-mode shell rules", () => {
    const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const imports = [...css.matchAll(/@import "([^"]+)";/g)].map((m) => m[1]);
    expect(imports).toEqual(["tailwindcss", "../styles/tokens.css", "../styles/primitives.css", "../styles/shell.css", "../styles/command-centre.css", "../styles/weekend-hub.css", "../styles/live.css"]);
    expect(css).not.toContain(".race-ops");
    expect(css).toContain(".standings-table");
    const live = readFileSync(new URL("../src/styles/live.css", import.meta.url), "utf8");
    expect(live).toMatch(/body:has\(\.live\) \.shell-bar \{\s*position: static;/);
    const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
    expect(tokens).toMatch(/prefers-reduced-motion: reduce/);
  });
});

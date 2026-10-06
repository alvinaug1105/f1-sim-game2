/**
 * UIX-A (visual foundation, shell, Career Command Centre, Race Weekend Hub). Presentation tests only: real Career
 * progression fixtures, both locales, no simulation or persistence changes. Existing weekend-control contracts stay
 * covered by the Practice / Qualifying / Sprint / Championship UI suites.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/provider";
import { translate, type Locale } from "../src/i18n/catalog";
import en from "../src/i18n/en/messages.json";
import { AppShell } from "../src/components/layout/app-shell";
import { CommandCentreView } from "../src/features/career/command-centre-view";
import { commandCentreModel, playerFinishes } from "../src/features/career/command-centre";
import { WeekendView } from "../src/features/career/progression-views";
import { weekendHubExtras } from "../src/features/career/weekend-hub";
import { careerShellContext, safeTeamColor } from "../src/features/career/shell-context";
import { enterNextEvent, isPractice, progressSummary, transitionSession, type CareerProgress } from "../src/game/domain/progression";
import type { CareerOverview } from "../src/game/domain/career";
import { careerGrid } from "./helpers/grid";
import { sequentialIds } from "./helpers/qualifying";
import { event, session, source } from "./helpers/championship";
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("../src/features/career/progression-actions", () => ({ progressionAction: vi.fn() }));
vi.mock("../src/features/practice/actions", () => ({ practiceWeekendAction: vi.fn() }));
vi.mock("../src/features/qualifying/actions", () => ({ qualifyingWeekendAction: vi.fn() }));
vi.mock("../src/features/race/actions", () => ({ raceAction: vi.fn() }));
const render = (node: React.ReactNode, locale: Locale = "en") => renderToStaticMarkup(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);
/** No untranslated key may reach the player (a missing key renders as the key itself). */
const rawKey = /\b(?:commandCentre|weekendHub|shell|navigation|progression|championship)\.[A-Za-z_.]+\b/;
function finishAll(p: CareerProgress, id: string) {
  const ev = p.events.find((e) => e.id === id)!;
  for (const s of [...ev.weekend!.sessions].sort((a, b) => a.order - b.order))
    p = isPractice(s.type) ? transitionSession(p, id, s.id, "simulatePractice") : transitionSession(transitionSession(p, id, s.id, "start"), id, s.id, "completeDevelopment");
  return p;
}
async function world() {
  const g = await careerGrid("team-red-bull-racing");
  const team = g.world.teams.find((t) => t.id === g.playerTeamId)!;
  const overview = (p: CareerProgress): CareerOverview => {
    const s = progressSummary(p), ev = s.active ?? s.next;
    const raw = ev ? g.world.events.find((e) => e.id === ev.id)! : null;
    return { career: p.career, playerTeam: team, season: g.world.season, nextEvent: raw ? { event: { ...raw, status: ev!.status }, circuit: g.world.circuits.find((c) => c.id === raw.careerCircuitId)! } : null };
  };
  return { g, overview };
}

describe("global application shell", () => {
  it.each(["en", "zh-TW"] as const)("shows Career context, the live weekend link and only real destinations (%s)", async (locale) => {
    const { g, overview } = await world();
    const p = enterNextEvent(g.progress, progressSummary(g.progress).next!.id, sequentialIds());
    const ctx = careerShellContext(overview(p), p), base = `/career/${p.career.id}`;
    pathname = base;
    const html = render(<AppShell career={ctx}><p>content</p></AppShell>, locale);
    expect(html).toContain(ctx.team.name);
    expect(html).toContain(ctx.careerName);
    expect(html).toContain(ctx.seasonName);
    expect(html).toContain(`href="${base}/events/${ctx.activeEvent!.id}"`);
    expect(html).toContain(translate(locale, "navigation.raceWeekend"));
    expect(html).toContain(`class="nav-item active" aria-current="page" href="${base}"`);
    expect(html).toContain('aria-controls="shell-rail"');
    expect(html).toContain('href="#main"');
    expect(html).not.toMatch(/aria-disabled|Planned|規劃中/);
    for (const missing of ["/team", "/drivers", "/calendar", "/finance", "/facilities"]) expect(html).not.toContain(`href="${base}${missing}"`);
    expect(html).not.toMatch(rawKey);
  });
  it("without an active weekend there is no Race Weekend link; without context the URL still drives navigation", async () => {
    const { g, overview } = await world();
    const base = `/career/${g.progress.career.id}`;
    pathname = `${base}/standings`;
    const html = render(<AppShell career={careerShellContext(overview(g.progress), g.progress)}><p>x</p></AppShell>);
    expect(html).not.toContain(`${base}/events/`);
    expect(html).toContain(`class="nav-item active" aria-current="page" href="${base}/standings"`);
    const bare = render(<AppShell><p>x</p></AppShell>);
    expect(bare).toContain(`href="${base}/car"`);
  });
  it("team colours become CSS only when they are plain hex values", () => {
    expect(safeTeamColor("#3671C6")).toBe("#3671C6");
    expect(safeTeamColor("#fff")).toBe("#fff");
    for (const bad of ["red", "#12345", "#3671C6;background:url(x)", "", null, undefined]) expect(safeTeamColor(bad)).toBeNull();
  });
});

describe("Career Command Centre", () => {
  it.each(["en", "zh-TW"] as const)("next event: the advance control is the mission, with circuit facts and the calendar (%s)", async (locale) => {
    const { g, overview } = await world();
    const model = commandCentreModel(overview(g.progress), g.progress, source([event(1)]));
    expect(model.mission.kind).toBe("NEXT");
    const html = render(<CommandCentreView model={model} />, locale);
    expect(html).toContain('name="intent" value="advance"');
    expect(html).toContain(translate(locale, "progression.advance"));
    expect(html).toContain(translate(locale, "commandCentre.length"));
    expect(html).toContain(translate(locale, "commandCentre.calendar"));
    expect(html).toContain(`href="/career/${g.progress.career.id}/car"`);
    expect(html).toContain(`href="/career/${g.progress.career.id}/standings"`);
    expect(html).not.toMatch(rawKey);
  });
  it("live weekend: the mission opens the weekend and names the next session; no advance control", async () => {
    const { g, overview } = await world();
    const p = enterNextEvent(g.progress, progressSummary(g.progress).next!.id, sequentialIds());
    const model = commandCentreModel(overview(p), p, null);
    expect(model.mission.kind).toBe("ACTIVE");
    const html = render(<CommandCentreView model={model} />);
    const active = progressSummary(p).active!;
    expect(html).toContain(`href="/career/${p.career.id}/events/${active.id}"`);
    expect(html).toContain("Open Race Weekend");
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain('value="advance"');
    // The Championship read failed: every dependent panel says so instead of inventing data.
    expect(html).toContain(translate("en", "commandCentre.championshipUnavailable"));
  });
  it("season complete: the mission points to the final standings", async () => {
    const { g, overview } = await world();
    let p = g.progress;
    for (let n = 0; n < 40 && progressSummary(p).next; n++) {
      const id = progressSummary(p).next!.id;
      p = finishAll(enterNextEvent(p, id, sequentialIds(1000 + n * 10)), id);
    }
    const model = commandCentreModel(overview(p), p, null);
    expect(model.mission.kind).toBe("COMPLETE");
    const html = render(<CommandCentreView model={model} />);
    expect(html).toContain(translate("en", "progression.calendarComplete"));
    expect(html).not.toContain('value="advance"');
  }, 60_000);
  it("recent results: latest first, at most five rounds, the player's cars only, DNF / DSQ as text", () => {
    const rounds = [1, 2, 3, 4, 5, 6].map((r) => event(r, { race: session(["d3", "d1", "d4", "d2", "d5", "d6"], r === 6 ? { retired: ["d2"], disqualified: ["d1"] } : {}) }));
    const src = source(rounds);
    const p: CareerProgress = { career: { id: src.careerId } as CareerProgress["career"], events: [] };
    const model = commandCentreModel({ playerTeam: { name: "Player Racing", shortName: "PLR", color: "#ff8000" }, season: { name: "S" }, nextEvent: null } as unknown as CareerOverview, { ...p, career: { ...p.career, name: "C", currentDate: "2026-03-01" } }, src);
    expect(model.recent.map((r) => r.round)).toEqual([6, 5, 4, 3, 2]);
    expect(model.recent[0].race!.map((f) => f.driverId)).toEqual(["d1", "d2"]);
    expect(playerFinishes(null, src)).toBeNull();
    const html = render(<CommandCentreView model={model} />);
    expect(html).toContain("DSQ");
    expect(html).toContain("DNF");
    expect(html).toContain(`/events/e6/results`);
  });
});

describe("Race Weekend Hub", () => {
  it.each(["en", "zh-TW"] as const)("one weekend as one journey: track, next mission with the existing controls, schedule (%s)", async (locale) => {
    const { g, overview } = await world();
    let p = enterNextEvent(g.progress, progressSummary(g.progress).next!.id, sequentialIds());
    const ev = progressSummary(p).active!, [p1] = [...ev.weekend!.sessions].sort((a, b) => a.order - b.order);
    p = transitionSession(p, ev.id, p1.id, "simulatePractice");
    const extras = weekendHubExtras(ev.id, overview(p), null);
    expect(extras.circuit).not.toBeNull();
    const html = render(<WeekendView progress={p} eventId={ev.id} extras={extras} />, locale);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain(translate(locale, "commandCentre.nextSession"));
    expect(html).toContain(translate(locale, "weekendHub.schedule"));
    expect(html).toContain(translate(locale, "weekendHub.currentAbove"));
    expect(html).toContain(translate(locale, "progression.notice"));
    expect(html).toContain(translate(locale, "commandCentre.length"));
    expect(html).toContain(`href="/career/${p.career.id}"`);
    expect(html).not.toMatch(/value="skipPractice"/);
    expect(html).not.toMatch(rawKey);
  });
  it("player results of completed sessions appear as chips; circuit facts only for the overview's own event", () => {
    const src = source([event(1, { race: session(["d1", "d3", "d2", "d4", "d5", "d6"]), qualifying: [{ driverId: "d2", teamId: "t1", position: 1 }, { driverId: "d1", teamId: "t1", position: 4 }, { driverId: "d3", teamId: "t2", position: 2 }] })]);
    const extras = weekendHubExtras("e1", null, src);
    expect(extras.circuit).toBeNull();
    expect(extras.results.RACE!.map((f) => [f.driverId, f.position])).toEqual([["d1", 1], ["d2", 3]]);
    expect(extras.results.QUALIFYING!.map((f) => [f.driverId, f.position])).toEqual([["d2", 1], ["d1", 4]]);
    expect(extras.results.SPRINT).toBeUndefined();
    expect(extras.drivers.map((d) => d.id)).toEqual(["d1", "d2"]);
  });
  it("renders without extras (progression alone), and a not-entered event explains itself", async () => {
    const { g } = await world();
    const next = progressSummary(g.progress).next!;
    const html = render(<WeekendView progress={g.progress} eventId={next.id} />);
    expect(html).toContain(translate("en", "progression.notEntered"));
    expect(html).toContain(translate("en", "weekendHub.notEnteredBadge"));
  });
});

describe("design system foundation", () => {
  const globals = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  it("the global stylesheet layers tokens → primitives → shell → screens, and keeps the legacy palette aliases", () => {
    const order = ["tokens", "primitives", "shell", "command-centre", "weekend-hub"].map((f) => globals.indexOf(`../styles/${f}.css`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
    for (const alias of ["--bg:", "--panel:", "--line:", "--muted:", "--accent:", "--border:"]) expect(tokens).toContain(alias);
    expect(tokens).toContain("prefers-reduced-motion");
  });
  it("live session screens keep their pre-UIX-A geometry: compact rail, full-width content, non-sticky shell bar", () => {
    const shell = readFileSync(new URL("../src/styles/shell.css", import.meta.url), "utf8");
    expect(shell).toMatch(/body:has\(\.race-ops\) \.shell \{\s*--rail-width: 170px;/);
    expect(shell).toMatch(/body:has\(\.race-ops\) \.shell-content \{[^}]*max-width: none;/);
    expect(shell).toMatch(/body:has\(\.race-ops\) \.shell-topbar \{[^}]*position: static;/);
    expect(shell).toMatch(/body:has\(\.race-track-view\) \.shell \{\s*--rail-width: 140px;/);
  });
  it("every UIX-A string exists in both catalogs", () => {
    for (const key of Object.keys(en).filter((k) => /^(commandCentre|weekendHub|shell)\./.test(k)) as (keyof typeof en)[])
      expect(translate("zh-TW", key)).not.toBe(key);
  });
});

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/provider";
import { AppShell } from "../src/components/layout/app-shell";
import { DashboardView } from "../src/features/dashboard/dashboard-view";
import { TeamSelection } from "../src/features/career/team-selection";
import { developmentContent } from "../src/data/seed/content-development";
import { sourceCarStats, deriveOverallCarPerformance } from "../src/game/domain/car-development";
import { translate, type Locale } from "../src/i18n/catalog";
import en from "../src/i18n/en/messages.json";
import zh from "../src/i18n/zh-TW/messages.json";
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const render = (locale: Locale, view: React.ReactNode) => renderToStaticMarkup(<I18nProvider initialLocale={locale}>{view}</I18nProvider>);
const teams = developmentContent.teamEntries.map(entry => {
  const team = developmentContent.teams.find(team => team.id === entry.teamId)!;
  const stats = sourceCarStats(entry);
  return { id: team.id, name: team.name, shortName: team.shortName, color: team.color ?? undefined,
    stats, overallPerformance: deriveOverallCarPerformance(stats),
    drivers: developmentContent.driverEntries.filter(driver => driver.teamId === entry.teamId && driver.role === "RACE_DRIVER")
      .map(entry => { const driver = developmentContent.drivers.find(driver => driver.id === entry.driverId)!;
        return { name: `${driver.firstName} ${driver.lastName}`, abbreviation: driver.abbreviation, carNumber: entry.carNumber }; }),
  };
});

describe.each(["en", "zh-TW"] as const)("readiness presentation %s", locale => {
  it("offers real Career actions without fake teams or foundation placeholders", () => {
    pathname = "/";
    const html = render(locale, <AppShell><DashboardView /></AppShell>);
    expect(html).toContain('href="/careers"');
    expect(html).toContain('href="/careers/new"');
    expect(html).toContain(translate(locale, "career.selectSaved"));
    expect(html).not.toMatch(/team-dev-001|Development Racing|Foundation|Phase 01|BUILD 01|尚未實作|開發預覽|基礎版本/);
  });
  it("links playable Car Development and Standings with the right active section", () => {
    pathname = "/career/saved-world/car";
    const html = render(locale, <AppShell><p>content</p></AppShell>);
    expect(html).toContain('class="nav-item active" aria-current="page" href="/career/saved-world/car"');
    expect(html).toContain('href="/career/saved-world/standings"');
    expect(html).not.toMatch(/Planned|規劃中|aria-disabled/);
    expect(html).not.toContain('href="/career/saved-world/team"');
    expect(html).not.toContain('href="/career/saved-world/drivers"');
    expect(html).not.toContain('href="/career/saved-world/calendar"');
  });
  it("states GP and Sprint scoring truth and the non-scoring sessions", () => {
    const note = translate(locale, "progression.notice");
    expect(note).toContain(locale === "en" ? "Grand Prix and Sprint races award championship points" : "大獎賽與衝刺賽會頒發錦標賽積分");
    expect(note).toContain(locale === "en" ? "Practice and Qualifying do not" : "練習賽與排位賽不會");
    expect(translate(locale, "sprint.resultNote")).toContain(locale === "en" ? "Sprint championship points are awarded" : "衝刺賽會頒發錦標賽積分");
  });
  it("shows overall, all five areas and source drivers without hidden AI policy", () => {
    const html = render(locale, <TeamSelection teams={teams} selectedId={teams[2].id} onSelect={() => {}} disabled={false} />);
    for (const key of ["car.overall", "car.lowSpeed", "car.mediumSpeed", "car.highSpeed", "car.dragReduction", "car.drsEfficiency"] as const)
      expect(html).toContain(translate(locale, key));
    for (const [name, ratings] of [["McLaren", [94,95,95,96,92,92]], ["Williams", [88,86,87,90,90,87]], ["Cadillac", [82,81,82,81,83,83]]] as const) {
      const card = html.split(`>${name}</span>`)[1].split('</label>')[0];
      expect([...card.matchAll(/<dd>(\d+)<\/dd>/g)].map(match => Number(match[1]))).toEqual(ratings);
    }
    for (const name of ["Lando Norris", "Oscar Piastri", "Alexander Albon", "Carlos Sainz", "Sergio Perez", "Valtteri Bottas"]) expect(html).toContain(name);
    expect(html).toContain('aria-labelledby="team-name-');
    expect(html).toContain('aria-describedby="team-ratings-');
    expect(html.match(/type="radio"/g)).toHaveLength(11);
    expect(html).not.toMatch(/developmentStyle|FIX_WEAKNESS|BUILD_STRENGTH|BALANCED|Easy|Midfield|Backmarker/);
    expect(html).not.toMatch(/car\.lowSpeed|car\.overall/);
  });
});
it("keeps obsolete capability and prototype claims out of both player catalogs", () => {
  for (const catalog of [en, zh]) {
    expect(Object.values(catalog).join("\n")).not.toMatch(/No championship points are awarded|Championship points are not awarded yet|Championship and racing systems are not implemented|Foundation build|Foundation phase|Phase 01|Build 01|Development (?:environment|build|workspace|free-air|race model|weather model)|No tyres, traffic|no tyre changes are available|No pits,|remain deferred|錦標賽與賽事系統尚未實作|目前尚未計算錦標積分|基礎建置階段|開發環境|開發版賽事|仍待開發/);
  }
  expect(en["incident.notice"]).toBe("Red flags and unlapping are not currently simulated.");
  expect(zh["incident.notice"]).toBe("目前不模擬紅旗與解除套圈。");
  // Real car-design terminology and non-scoring distance limitations remain truthful.
  expect(en["car.developmentProgramme"]).toBe("Development programme");
  expect(en["championship.noScore"]).toContain("scoring distance");
});

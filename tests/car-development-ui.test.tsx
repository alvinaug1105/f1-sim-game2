import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/provider";
import { translate } from "../src/i18n/catalog";
import { CarDevelopmentView } from "../src/features/career/car-development-view";
import { CAR_PART_TYPES, uniformCarStats } from "../src/game/domain/car-development";
import type { CareerPlayerCar } from "../src/game/domain/career";
import type { CarDevelopmentOverview } from "../src/game/domain/car-design-repository";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("../src/features/career/car-design-actions", () => ({ carDesignAction: async () => ({ error: null, preview: null, startedId: null }) }));

const car: CareerPlayerCar = {
  careerId: "11111111-1111-4111-8111-111111111111",
  teamId: "22222222-2222-4222-8222-222222222222",
  teamName: "Player Racing",
  overallPerformance: 87,
  stats: uniformCarStats(87),
  parts: CAR_PART_TYPES.map(partType => ({ partType, version: 1, stats: uniformCarStats(87) })),
};

const overview: CarDevelopmentOverview = { car, careerDate: "2026-03-01", careerStatus: "ACTIVE", projects: [], availableDesigns: [] };
const render = (value: CarDevelopmentOverview) => renderToStaticMarkup(<I18nProvider><CarDevelopmentView overview={value} /></I18nProvider>);

describe("player car development presentation", () => {
  it("renders current v1, empty projects, and player-only design form", () => {
    const html = render(overview);
    expect(html).toContain("Overall performance");
    expect(html).toContain("DRS efficiency");
    for (const name of ["Front Wing", "Rear Wing", "Underfloor", "Sidepods", "Chassis", "Suspension"])
      expect(html).toContain(`${name} v1`);
    expect(html).toContain("Player Racing");
    expect(html).not.toContain("Rival Racing");
    expect(html).not.toMatch(/car\.(heading|part|overall)/);
    expect(html).toContain("Start new design");
    expect(html).toContain("No active projects");
    expect(html).toContain("Project capacity: 0 / 2");
    expect(html).toContain('name="focus"');
    expect(html).toContain('name="programme"');
  });

  it("shows Career-time progress and completed v2 separately from current v1", () => {
    const project = { id: "33333333-3333-4333-8333-333333333333", partType: "FRONT_WING" as const,
      newVersion: 2, focus: "LOW_SPEED" as const, programme: "STANDARD" as const, status: "ACTIVE" as const,
      startedAtCareerDate: "2026-03-01", completesAtCareerDate: "2026-03-15", completedAtCareerDate: null,
      planned: { partType: "FRONT_WING" as const, version: 2, stats: uniformCarStats(90) } };
    const activeHtml = render({ ...overview, careerDate: "2026-03-08", projects: [project] });
    expect(activeHtml).toContain("7 days remaining");
    expect(activeHtml).toContain("Project capacity: 1 / 2");
    const twoHtml = render({ ...overview, projects: [project, { ...project, id: "44444444-4444-4444-8444-444444444444", partType: "REAR_WING" }] });
    expect(twoHtml).toContain("Project capacity: 2 / 2");
    const completedHtml = render({ ...overview, projects: [{ ...project, status: "COMPLETED", completedAtCareerDate: "2026-03-15" }], availableDesigns: [project.planned] });
    expect(completedHtml).toContain("Front Wing v1");
    expect(completedHtml).toContain("Front Wing v2");
    expect(completedHtml).toContain("Not fitted");
  });

  it("keeps older Careers readable and disables design action", () => {
    const html = render({ ...overview, car: { ...car, stats: null, parts: [] } });
    expect(html).toContain("Design projects are unavailable");
    expect(html).toContain("Detailed car data unavailable");
  });

  it("has Traditional Chinese labels for every new car field and part", () => {
    for (const key of ["car.heading", "car.current", "car.overall", "car.lowSpeed", "car.mediumSpeed",
      "car.highSpeed", "car.dragReduction", "car.drsEfficiency", "car.parts", "car.part.frontWing",
      "car.part.rearWing", "car.part.underfloor", "car.part.sidepods", "car.part.chassis",
      "car.part.suspension", "car.legacy", "navigation.car", "car.startDesign", "car.activeProjects",
      "car.availableDesigns", "car.designComplete", "car.notFitted", "car.projectCapacity",
      "car.focus.BALANCED", "car.focus.LOW_SPEED", "car.focus.MEDIUM_SPEED", "car.focus.HIGH_SPEED",
      "car.focus.DRAG_REDUCTION", "car.focus.DRS_EFFICIENCY", "car.programme.STANDARD", "car.programme.EXTENSIVE",
      "car.error.CAPACITY"] as const) {
      expect(translate("en", key)).not.toBe(key);
      expect(translate("zh-TW", key)).not.toBe(key);
    }
    expect(translate("zh-TW", "car.part.frontWing")).toBe("前翼");
  });
});

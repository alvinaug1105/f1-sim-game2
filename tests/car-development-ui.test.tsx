import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/provider";
import { translate } from "../src/i18n/catalog";
import { CarDevelopmentView } from "../src/features/career/car-development-view";
import { CAR_PART_TYPES, uniformCarStats } from "../src/game/domain/car-development";
import type { CareerPlayerCar } from "../src/game/domain/career";

const car: CareerPlayerCar = {
  careerId: "11111111-1111-4111-8111-111111111111",
  teamId: "22222222-2222-4222-8222-222222222222",
  teamName: "Player Racing",
  overallPerformance: 87,
  stats: uniformCarStats(87),
  parts: CAR_PART_TYPES.map(partType => ({ partType, version: 1, stats: uniformCarStats(87) })),
};

describe("read-only player car presentation", () => {
  it("renders five areas, six versioned parts, and navigation without exposing rivals", () => {
    const html = renderToStaticMarkup(<I18nProvider><CarDevelopmentView car={car} /></I18nProvider>);
    expect(html).toContain("Overall performance");
    expect(html).toContain("DRS efficiency");
    for (const name of ["Front Wing", "Rear Wing", "Underfloor", "Sidepods", "Chassis", "Suspension"])
      expect(html).toContain(`${name} v1`);
    expect(html).toContain("Player Racing");
    expect(html).not.toContain("Rival Racing");
    expect(html).not.toMatch(/car\.(heading|part|overall)/);
    expect(html).not.toContain("<button");
  });

  it("has Traditional Chinese labels for every new car field and part", () => {
    for (const key of ["car.heading", "car.current", "car.overall", "car.lowSpeed", "car.mediumSpeed",
      "car.highSpeed", "car.dragReduction", "car.drsEfficiency", "car.parts", "car.part.frontWing",
      "car.part.rearWing", "car.part.underfloor", "car.part.sidepods", "car.part.chassis",
      "car.part.suspension", "car.legacy", "navigation.car"] as const) {
      expect(translate("en", key)).not.toBe(key);
      expect(translate("zh-TW", key)).not.toBe(key);
    }
    expect(translate("zh-TW", "car.part.frontWing")).toBe("前翼");
  });
});

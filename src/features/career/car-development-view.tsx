"use client";
import Link from "next/link";
import type { CareerPlayerCar } from "../../game/domain/career";
import { CAR_PART_TYPES, type CarPartType } from "../../game/domain/car-development";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import type { TranslationKey } from "../../i18n/catalog";
import { Panel, EmptyState } from "../../components/ui/panel";

const names: Record<CarPartType, TranslationKey> = {
  FRONT_WING: "car.part.frontWing", REAR_WING: "car.part.rearWing", UNDERFLOOR: "car.part.underfloor",
  SIDEPODS: "car.part.sidepods", CHASSIS: "car.part.chassis", SUSPENSION: "car.part.suspension",
};
export function CarDevelopmentView({ car }: { car: CareerPlayerCar }) {
  const { t, format } = useI18n();
  const stats = car.stats;
  return <>
    <LocalizedPageTitle titleKey="metadata.car" />
    <div className="page-header">
      <div><p className="eyebrow accent">{t("car.heading")}</p><h1>{car.teamName}</h1><p>{t("car.readOnly")}</p></div>
      <Link className="text-link" href={`/career/${car.careerId}`}>{t("car.back")}</Link>
    </div>
    <div className="dashboard-grid">
      <Panel title={t("car.current")}>
        <div className="career-content">
          <dl className="career-facts"><div><dt>{t("car.overall")}</dt><dd>{format.number(car.overallPerformance)}</dd></div></dl>
        </div>
      </Panel>
      <Panel title={t("car.areas")}>
        {stats ? <div className="career-content"><dl className="career-facts">
          <div><dt>{t("car.lowSpeed")}</dt><dd>{format.number(stats.lowSpeed)}</dd></div>
          <div><dt>{t("car.mediumSpeed")}</dt><dd>{format.number(stats.mediumSpeed)}</dd></div>
          <div><dt>{t("car.highSpeed")}</dt><dd>{format.number(stats.highSpeed)}</dd></div>
          <div><dt>{t("car.dragReduction")}</dt><dd>{format.number(stats.dragReduction)}</dd></div>
          <div><dt>{t("car.drsEfficiency")}</dt><dd>{format.number(stats.drsEfficiency)}</dd></div>
        </dl></div> : <EmptyState title={t("car.legacy")}>{t("car.legacyBody")}</EmptyState>}
      </Panel>
    </div>
    <Panel title={t("car.parts")}>
      {car.parts.length ? <div className="career-list">
        {CAR_PART_TYPES.map(type => {
          const part = car.parts.find(p => p.partType === type);
          if (!part) return null;
          return <div className="career-content" key={type}>
            <h3>{t(names[type])} {t("car.version", { version: format.number(part.version) })}</h3>
            <p>{t("car.partSummary", {
              low: format.number(part.stats.lowSpeed), mid: format.number(part.stats.mediumSpeed),
              high: format.number(part.stats.highSpeed), drag: format.number(part.stats.dragReduction), drs: format.number(part.stats.drsEfficiency),
            })}</p>
          </div>;
        })}
      </div> : <EmptyState title={t("car.legacy")}>{t("car.legacyBody")}</EmptyState>}
    </Panel>
  </>;
}

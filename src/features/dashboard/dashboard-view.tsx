"use client";
import Link from "next/link";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import { Icon } from "../../components/ui/icon";
/** Home (no Career selected): continue a saved Career or start a new one. */
export function DashboardView() {
  const { t } = useI18n();
  return (
    <>
      <LocalizedPageTitle titleKey="metadata.title" />
      <header className="ui-page-head home-head">
        <div>
          <p className="ui-label">{t("dashboard.section")}</p>
          <h1 className="ui-display home-title">{t("dashboard.heading")}</h1>
          <p>{t("dashboard.subtitle")}</p>
        </div>
      </header>
      <div className="home-grid">
        <section className="ui-module home-card" aria-labelledby="home-browse">
          <Icon name="saves" size={28} className="home-card-icon" />
          <h2 id="home-browse">{t("career.browse")}</h2>
          <p>{t("career.selectSaved")}</p>
          <Link className="ui-btn ui-btn-outline" href="/careers">{t("career.browse")} <Icon name="arrow" /></Link>
        </section>
        <section className="ui-module home-card" data-primary="true" aria-labelledby="home-new">
          <Icon name="flag" size={28} className="home-card-icon" />
          <h2 id="home-new">{t("career.new")}</h2>
          <p>{t("dashboard.newCareerBody")}</p>
          <Link className="ui-btn ui-btn-primary" href="/careers/new">{t("career.new")} <Icon name="arrow" /></Link>
        </section>
      </div>
    </>
  );
}

"use client";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import { ButtonLink } from "../../components/ui/primitives";
import { Icon } from "../../components/ui/icon";
/** Home (outside any Career): the two real ways in — continue a saved Career or start a new one. */
export function DashboardView() {
  const { t } = useI18n();
  return (
    <div className="home">
      <LocalizedPageTitle titleKey="metadata.title" />
      <header className="home-hero ui-surface ui-surface--raised ui-surface--cut ui-enter">
        <p className="ui-label">{t("dashboard.section")}</p>
        <h1>{t("dashboard.heading")}</h1>
        <p className="home-lead">{t("dashboard.subtitle")}</p>
      </header>
      <div className="home-grid">
        <section className="home-card ui-surface" aria-labelledby="home-continue">
          <span className="home-card-icon" aria-hidden="true"><Icon name="list" /></span>
          <h2 id="home-continue">{t("career.browse")}</h2>
          <p>{t("career.selectSaved")}</p>
          <ButtonLink href="/careers" icon="arrowRight">{t("career.browse")}</ButtonLink>
        </section>
        <section className="home-card ui-surface" aria-labelledby="home-new">
          <span className="home-card-icon" aria-hidden="true"><Icon name="flag" /></span>
          <h2 id="home-new">{t("career.new")}</h2>
          <p>{t("dashboard.newCareerBody")}</p>
          <ButtonLink href="/careers/new" variant="secondary" icon="arrowRight">{t("career.new")}</ButtonLink>
        </section>
      </div>
    </div>
  );
}

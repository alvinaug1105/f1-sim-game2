"use client";
import Link from "next/link";
import { Panel } from "../../components/ui/panel";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
export function DashboardView() {
  const { t } = useI18n();
  return (
    <>
      <LocalizedPageTitle titleKey="metadata.title" />
      <div className="page-header">
        <div>
          <p className="eyebrow accent">{t("dashboard.section")}</p>
          <h1>{t("dashboard.heading")}</h1>
          <p>{t("dashboard.subtitle")}</p>
        </div>
      </div>
      <div className="dashboard-grid">
        <Panel title={t("career.browse")}>
          <div className="career-content">
            <p>{t("career.selectSaved")}</p>
            <Link className="button-link" href="/careers">{t("career.browse")}</Link>
          </div>
        </Panel>
        <Panel title={t("career.new")}>
          <div className="career-content">
            <p>{t("dashboard.newCareerBody")}</p>
            <Link className="button-link" href="/careers/new">{t("career.new")}</Link>
          </div>
        </Panel>
      </div>
    </>
  );
}

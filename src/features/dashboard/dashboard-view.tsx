"use client";
import Link from "next/link";
import { Panel, EmptyState } from "@/components/ui/panel";
import { useI18n, LocalizedPageTitle } from "@/i18n/provider";
import type { getDashboard } from "./get-dashboard";
export function DashboardView({
  team,
  event,
}: Awaited<ReturnType<typeof getDashboard>>) {
  const { t, format } = useI18n();
  return (
    <>
      <LocalizedPageTitle titleKey="metadata.title" />
      <div className="notice">
        <div>
          <strong>{t("career.noSelected")}</strong>
          <p>{t("career.selectSaved")}</p>
        </div>
        <Link className="text-link" href="/careers">
          {t("career.browse")}
        </Link>
      </div>
      <div className="page-header">
        <div>
          <p className="eyebrow accent">{t("dashboard.section")}</p>
          <h1>{t("dashboard.heading")}</h1>
          <p>{t("dashboard.subtitle")}</p>
        </div>
        <span className="phase-badge">{t("common.phase")}</span>
      </div>
      <div className="notice">
        <span className="notice-symbol" aria-hidden="true">
          i
        </span>
        <div>
          <strong>{t("dashboard.developmentWorkspace")}</strong>
          <p>{t("dashboard.notice")}</p>
        </div>
        <span className="eyebrow notice-tag">{t("dashboard.build")}</span>
      </div>
      <div className="dashboard-grid">
        <Panel
          title={t("dashboard.currentTeam")}
          label={t("dashboard.developmentData")}
        >
          {team ? (
            <div className="team-content">
              <div className="team-monogram">{team.shortName}</div>
              <div>
                <span className="eyebrow">{t("dashboard.teamIdentity")}</span>
                <h3>{team.name}</h3>
                <p>{t("dashboard.temporaryTeam")}</p>
              </div>
              <div className="team-bottom">
                <span className="eyebrow">{t("dashboard.teamId")}</span>
                <code>{team.id}</code>
              </div>
            </div>
          ) : (
            <EmptyState title={t("dashboard.noTeam")}>
              {t("dashboard.noTeamBody")}
            </EmptyState>
          )}
        </Panel>
        <Panel
          title={t("dashboard.nextEvent")}
          label={t("dashboard.exampleOnly")}
        >
          {event ? (
            <div className="event-content">
              <span className="event-tag">{t("dashboard.preseason")}</span>
              <h3>{event.name}</h3>
              <p>{event.venue}</p>
              <div className="event-bottom">
                <span>
                  {event.scheduledAt
                    ? format.date(new Date(event.scheduledAt))
                    : t("dashboard.unscheduled")}
                </span>
                <span className="eyebrow">{t("dashboard.notPlayable")}</span>
              </div>
            </div>
          ) : (
            <EmptyState title={t("dashboard.noEvent")}>
              {t("dashboard.noEventBody")}
            </EmptyState>
          )}
        </Panel>
        <Panel
          title={t("dashboard.championship")}
          label={t("common.notImplemented")}
        >
          <EmptyState title={t("dashboard.newSeason")}>
            {t("dashboard.standingsBody")}
          </EmptyState>
          <div className="panel-footnote">
            {t("dashboard.noSeason")} <span>—</span>
          </div>
        </Panel>
        <Panel title={t("dashboard.status")} label={t("dashboard.phaseNumber")}>
          <div className="development-content">
            <h3>{t("dashboard.groundwork")}</h3>
            <p>{t("dashboard.groundworkBody")}</p>
            <ul className="status-list">
              <li>
                <span>{t("dashboard.appShell")}</span>
                <span className="ready">{t("common.available")}</span>
              </li>
              <li>
                <span>{t("dashboard.domainSimulation")}</span>
                <span className="ready">{t("common.available")}</span>
              </li>
              <li>
                <span>{t("dashboard.persistenceSystems")}</span>
                <span>{t("common.notImplemented")}</span>
              </li>
            </ul>
          </div>
        </Panel>
      </div>
      <div className="workspace-note">
        <span className="eyebrow">{t("dashboard.evolve")}</span>
        <p>{t("dashboard.evolveBody")}</p>
      </div>
    </>
  );
}

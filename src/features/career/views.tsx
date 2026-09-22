"use client";
import Link from "next/link";
import {
  progressSummary,
  type CareerProgress,
} from "../../game/domain/progression";
import { ProgressPanel } from "./progression-views";
import { useActionState, useState } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import type { TranslationKey } from "../../i18n/catalog";
import { Panel, EmptyState } from "../../components/ui/panel";
import type {
  CareerCreationOptions,
  CareerErrorCode,
  CareerOverview,
  CareerSummary,
  CareerStatus,
} from "../../game/domain/career";
import { CAREER_NAME_LIMIT } from "../../game/domain/career-snapshot";
import { createCareerAction } from "./actions";
import type { CareerActionState } from "./form-state";
const statuses: Record<CareerStatus, TranslationKey> = {
  ACTIVE: "career.active",
  COMPLETED: "career.completed",
  ABANDONED: "career.abandoned",
};
const errors: Record<CareerErrorCode, TranslationKey> = {
  INVALID_NAME: "career.error.INVALID_NAME",
  INVALID_ID: "career.error.INVALID_ID",
  DATABASE_NOT_FOUND: "career.error.DATABASE_NOT_FOUND",
  SEASON_NOT_FOUND: "career.error.SEASON_NOT_FOUND",
  TEAM_NOT_PARTICIPATING: "career.error.TEAM_NOT_PARTICIPATING",
  INVALID_SOURCE: "career.error.INVALID_SOURCE",
  PERSISTENCE_FAILED: "career.error.PERSISTENCE_FAILED",
};
export function CareerUnavailable({
  titleKey,
  code = "PERSISTENCE_FAILED",
}: {
  titleKey: TranslationKey;
  code?: CareerErrorCode;
}) {
  const { t } = useI18n();
  return (
    <>
      <LocalizedPageTitle titleKey={titleKey} />
      <Panel title={t("career.storageHeading")}>
        <div className="career-content" role="alert">
          <p>{t("career.storageBody")}</p>
          <p>{t(errors[code])}</p>
          <Link className="text-link" href="/careers">
            {t("career.back")}
          </Link>
        </div>
      </Panel>
    </>
  );
}
export function CareerListView({
  careers,
}: {
  careers: readonly CareerSummary[];
}) {
  const { t, format } = useI18n();
  return (
    <>
      <LocalizedPageTitle titleKey="metadata.careers" />
      <div className="page-header">
        <div>
          <h1>{t("navigation.careers")}</h1>
          <p>{t("career.listBody")}</p>
        </div>
        <Link className="button-link" href="/careers/new">
          {t("career.new")}
        </Link>
      </div>
      {careers.length === 0 ? (
        <Panel title={t("navigation.careers")}>
          <EmptyState title={t("career.empty")}>
            {t("career.emptyBody")}
          </EmptyState>
        </Panel>
      ) : (
        <div className="career-list">
          {careers.map(({ career, playerTeam, season }) => (
            <Panel
              key={career.id}
              title={career.name}
              label={t(statuses[career.status])}
            >
              <div className="career-content">
                <h3>{playerTeam.name}</h3>
                <dl className="career-facts">
                  <div>
                    <dt>{t("career.currentSeason")}</dt>
                    <dd>{season.name}</dd>
                  </div>
                  <div>
                    <dt>{t("career.currentDate")}</dt>
                    <dd>
                      {format.date(new Date(career.currentDate), {
                        dateStyle: "long",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("career.updated")}</dt>
                    <dd>
                      {format.date(new Date(career.updatedAt), {
                        dateStyle: "medium",
                      })}
                    </dd>
                  </div>
                </dl>
                <Link className="text-link" href={`/career/${career.id}`}>
                  {t("career.continue")} →
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
export function NewCareerView({ options }: { options: CareerCreationOptions }) {
  const { t } = useI18n();
  const [databaseId, setDatabaseId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [name, setName] = useState("");
  const initial: CareerActionState = { error: null };
  const [state, action, pending] = useActionState(createCareerAction, initial);
  const database = options.databases.find((row) => row.id === databaseId);
  const season = database?.seasons.find((row) => row.id === seasonId);
  return (
    <>
      <LocalizedPageTitle titleKey="metadata.newCareer" />
      <div className="page-header">
        <div>
          <h1>{t("career.new")}</h1>
          <p>{t("career.newBody")}</p>
        </div>
        <Link className="text-link" href="/careers">
          {t("career.back")}
        </Link>
      </div>
      <Panel title={t("career.new")}>
        {options.databases.length === 0 ? (
          <EmptyState title={t("career.noSources")}>
            {t("career.noSourcesBody")}
          </EmptyState>
        ) : (
          <form action={action} className="career-form">
            <p>{t("career.snapshotNotice")}</p>
            <fieldset disabled={pending}>
              <label htmlFor="career-database">{t("career.database")}</label>
              <select
                id="career-database"
                name="gameDatabaseId"
                required
                value={databaseId}
                onChange={(e) => {
                  setDatabaseId(e.target.value);
                  setSeasonId("");
                  setTeamId("");
                }}
              >
                <option value="">{t("career.choose")}</option>
                {options.databases.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {row.version}
                  </option>
                ))}
              </select>
              <label htmlFor="career-season">{t("career.season")}</label>
              <select
                id="career-season"
                name="seasonId"
                required
                disabled={!database || pending}
                value={seasonId}
                onChange={(e) => {
                  setSeasonId(e.target.value);
                  setTeamId("");
                }}
              >
                <option value="">{t("career.choose")}</option>
                {database?.seasons.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <label htmlFor="career-team">{t("career.team")}</label>
              <select
                id="career-team"
                name="playerTeamId"
                required
                disabled={!season || pending}
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">{t("career.choose")}</option>
                {season?.teams.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              {season?.teams.length === 0 && (
                <p role="status">{t("career.noTeams")}</p>
              )}
              <label htmlFor="career-name">{t("career.name")}</label>
              <input
                id="career-name"
                name="name"
                required
                maxLength={CAREER_NAME_LIMIT}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
              {state.error && (
                <p role="alert" className="form-error">
                  {t(errors[state.error])}
                </p>
              )}
              <button
                type="submit"
                disabled={pending || !teamId || !name.trim()}
              >
                {t(pending ? "career.creating" : "career.create")}
              </button>
            </fieldset>
          </form>
        )}
      </Panel>
    </>
  );
}
export function CareerOverviewView({
  overview,
  progress,
}: {
  overview: CareerOverview;
  progress: CareerProgress;
}) {
  const { t, format } = useI18n();
  const { playerTeam, season } = overview;
  const career = progress.career;
  const { active, next } = progressSummary(progress);
  const nextEvent =
    !active && next
      ? { event: next, circuit: { name: next.circuitName } }
      : null;
  return (
    <>
      <LocalizedPageTitle titleKey="metadata.career" />
      <div className="page-header">
        <div>
          <p className="eyebrow accent">{t("career.overview")}</p>
          <h1>{career.name}</h1>
          <p>{t("career.worldNotice")}</p>
        </div>
        <Link className="text-link" href="/careers">
          {t("career.back")}
        </Link>
      </div>
      <ProgressPanel progress={progress} />
      <div className="dashboard-grid">
        <Panel
          title={t("dashboard.currentTeam")}
          label={t(statuses[career.status])}
        >
          <div className="career-content">
            <h3>{playerTeam.name}</h3>
            <p>{playerTeam.shortName}</p>
            <dl className="career-facts">
              <div>
                <dt>{t("dashboard.teamId")}</dt>
                <dd>
                  <code>{playerTeam.id}</code>
                </dd>
              </div>
            </dl>
          </div>
        </Panel>
        <Panel title={t("career.currentSeason")}>
          <div className="career-content">
            <h3>{season.name}</h3>
            <dl className="career-facts">
              <div>
                <dt>{t("career.currentDate")}</dt>
                <dd>
                  {format.date(new Date(career.currentDate), {
                    dateStyle: "long",
                  })}
                </dd>
              </div>
            </dl>
          </div>
        </Panel>
        {!active && (
          <Panel title={t("dashboard.nextEvent")}>
            {nextEvent ? (
              <div className="career-content">
                <p className="eyebrow">
                  {t("career.round", {
                    round: format.number(nextEvent.event.round),
                  })}
                </p>
                <h3>{nextEvent.event.name}</h3>
                <p>{nextEvent.circuit.name}</p>
                <p>
                  {format.date(new Date(nextEvent.event.startDate), {
                    dateStyle: "long",
                  })}
                </p>
              </div>
            ) : (
              <EmptyState title={t("career.noEvent")}>
                {t("career.noEventBody")}
              </EmptyState>
            )}
          </Panel>
        )}
        <Panel
          title={t("dashboard.championship")}
          label={t("common.notImplemented")}
        >
          <EmptyState title={t("dashboard.newSeason")}>
            {t("dashboard.standingsBody")}
          </EmptyState>
        </Panel>
      </div>
    </>
  );
}

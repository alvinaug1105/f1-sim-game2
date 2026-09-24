"use client";
import Link from "next/link";
import { useActionState } from "react";
import { RaceOperations } from "./viewer/operations";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import type { CareerRaceData, RaceErrorCode } from "../../game/domain/race-repository";
import { WEATHER_TYRE_COMPOUNDS } from "../../simulation/race/tyres/model";
import { raceAction } from "./actions";

export function RaceView({ data }: { data: CareerRaceData }) {
  return data.state ? <RaceOperations key={data.sessionId} initialData={data} /> : <RacePreparation data={data} />;
}

function RacePreparation({ data }: { data: CareerRaceData }) {
  const { t } = useI18n();
  const [actionState, action, pending] = useActionState(raceAction, { error: null as RaceErrorCode | null });
  const { progress, eventId } = data;
  const event = progress.events.find((e) => e.id === eventId)!;
  const session = event.weekend!.sessions.find((s) => s.id === data.sessionId)!;
  const canStart = ["AVAILABLE", "IN_PROGRESS"].includes(session.status);
  return <>
    <LocalizedPageTitle titleKey="race.title" />
    <div className="page-header">
      <div><p className="eyebrow">{t("race.title")}</p><h1>{event.name}</h1><p>{event.circuitName}</p></div>
      <Link className="text-link" href={`/career/${progress.career.id}/events/${eventId}`}>{t("race.back")}</Link>
    </div>
    <p className="development-notice">{t("incident.notice")}</p>
    <p>{t(canStart ? "race.ready" : "race.unavailable")}</p>
    <form action={action} className="race-controls">
      <input type="hidden" name="careerId" value={progress.career.id} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="lap" value={0} />
      <fieldset disabled={pending}>
        {canStart && <>
          <div className="tyre-selection">
            <h2>{t("tyre.starting")}</h2><p>{t("pit.startingNotice")}</p>
            {data.roster.map((row) => <label key={row.driverId} htmlFor={`tyre-${row.driverId}`}>
              {row.driverName}
              <select id={`tyre-${row.driverId}`} name={`tyre:${row.driverId}`} defaultValue="MEDIUM">
                {WEATHER_TYRE_COMPOUNDS.map((compound) => <option key={compound} value={compound}>{t(`tyre.${compound}`)}</option>)}
              </select>
            </label>)}
          </div>
          <button name="intent" value="start">{t("race.start")}</button>
        </>}
      </fieldset>
      {pending && <p role="status">{t("progression.pending")}</p>}
      {actionState.error && <p role="alert">{t(`race.error.${actionState.error}`)}</p>}
    </form>
    <Link className="text-link" href={`/career/${progress.career.id}`}>{t("progression.back")}</Link>
  </>;
}

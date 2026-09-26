"use client";
import Link from "next/link";
import { useActionState } from "react";
import { RaceOperations } from "./viewer/operations";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import type { RaceErrorCode } from "../../game/domain/race-repository";
import type { RacePreparationView, RaceViewData } from "./public-view";
import { raceAction } from "./actions";
import { useState } from "react";

/** Receives only the server's public projection (public-view.ts), never the authoritative Race state. */
export function RaceView({ data }: { data: RaceViewData }) {
  return data.state ? <RaceOperations key={data.sessionId} initialData={data} /> : <RacePreparation data={data} prep={data.preparation!} />;
}

function RacePreparation({ data, prep }: { data: RaceViewData; prep: RacePreparationView }) {
  const { t, format } = useI18n();
  const [actionState, action, pending] = useActionState(raceAction, { error: null as RaceErrorCode | null });
  const { progress, eventId } = data, sprint = data.kind === "SPRINT";
  // Built on the server from the configuration the Race will freeze at start: only the grid conditions and the
  // approximate forecast are sent — the weather generator and its timeline never reach the browser.
  const laps = prep.laps, grid = prep.conditions, mine = prep.mine, rivals = prep.rivals;
  const percent = (n: number) => format.percentage(n / 1000, { maximumFractionDigits: 0 });
  const event = progress.events.find((e) => e.id === eventId)!;
  const session = event.weekend!.sessions.find((s) => s.id === data.sessionId)!;
  const canStart = ["AVAILABLE", "IN_PROGRESS"].includes(session.status);
  return <>
    <LocalizedPageTitle titleKey={sprint ? "sprint.title" : "race.title"} />
    <div className="page-header">
      <div><p className="eyebrow">{t(sprint ? "sprint.title" : "race.title")}</p><h1>{event.name}</h1><p>{event.circuitName}</p></div>
      <Link className="text-link" href={`/career/${progress.career.id}/events/${eventId}`}>{t("race.back")}</Link>
    </div>
    <p className="development-notice">{t("incident.notice")}</p>
    <p>{t(sprint ? (canStart ? "sprint.ready" : "sprint.unavailable") : canStart ? "race.ready" : "race.unavailable")}</p>
    <form action={action} className="race-controls">
      <input type="hidden" name="careerId" value={progress.career.id} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="kind" value={data.kind ?? "RACE"} />
      <input type="hidden" name="lap" value={0} />
      <fieldset disabled={pending}>
        {canStart && <>
          <section className="race-context" aria-label={t("prep.context")}>
            <h2>{t("prep.context")}</h2>
            <dl>
              <div><dt>{t(sprint ? "sprint.distance" : "prep.laps")}</dt><dd>{sprint ? t("sprint.distanceValue", { laps: format.number(laps), km: format.number(laps * data.circuit.lengthMeters / 1000, { maximumFractionDigits: 1 }) }) : format.number(laps)}</dd></div>
              {sprint && <div><dt>{t("sprint.title")}</dt><dd>{t("sprint.gridNote")}</dd></div>}
              <div><dt>{t("prep.conditions")}</dt><dd>{t(grid.rainfallIntensity === 0 ? "weather.dry" : grid.rainfallIntensity < 650 ? "weather.light" : "weather.heavy")} · {t("weather.water")} {percent(grid.trackWater)} ({t(grid.trackWater < 100 ? "weather.dry" : grid.trackWater < 350 ? "weather.damp" : "weather.wet")}) · {format.number(grid.airTemperatureMilliC / 1000, { style: "unit", unit: "celsius", maximumFractionDigits: 0 })}</dd></div>
              <div><dt>{t("weather.forecast")}</dt><dd>{(() => { const windows = prep.forecast; return windows.length ? <ul>{windows.map((f, n) => <li key={n}>{t(f.rainfallMax < 200 ? "weather.easing" : "weather.expected")}: {t("weather.window", { from: format.number(f.arrivalMinLap), to: format.number(f.arrivalMaxLap), min: percent(f.rainfallMin), max: percent(f.rainfallMax) })}</li>)}</ul> : t("prep.noRain"); })()}<small>{t("weather.uncertainty")}</small></dd></div>
            </dl>
          </section>
          <div className="tyre-selection">
            <h2>{t("tyre.starting")}</h2><p>{t("pit.startingNotice")}</p>
            <h3>{t("prep.yourDrivers")}</h3>
            {mine.map((row) => <label key={row.driverId} htmlFor={`tyre-${row.driverId}`}>
              {row.driverName}
              <select id={`tyre-${row.driverId}`} name={`tyre:${row.driverId}`} defaultValue={prep.defaultCompound}>
                {prep.compounds.map((compound) => <option key={compound} value={compound}>{t(`tyre.${compound}`)}</option>)}
              </select>
            </label>)}
            {rivals.length > 0 && <><h3>{t("prep.rivals")}</h3><p className="ops-muted">{t("prep.rivalNote")}</p><ul className="rival-list">{rivals.map((row) => <li key={row.driverId}>{row.driverName} <span>{row.teamName}</span></li>)}</ul></>}
          </div>
          <button name="intent" value="start">{t(sprint ? "sprint.manage" : "race.start")}</button>
          {/* Sprint: Manage or Simulate — never a plain skip. Simulate runs the same v7 engine with both cars auto-managed. */}
          {sprint && <SimulateSubmit disabled={pending} />}
        </>}
      </fieldset>
      {pending && <p role="status">{t("progression.pending")}</p>}
      {actionState.error && <p role="alert">{t(`race.error.${actionState.error}`)}</p>}
    </form>
    <Link className="text-link" href={`/career/${progress.career.id}`}>{t("progression.back")}</Link>
  </>;
}

/** Sprint: confirmed submit of this form with intent=simulate (tyre choices ignored: both cars are auto-managed). */
function SimulateSubmit({ disabled }: { disabled: boolean }) {
  const { t } = useI18n(), [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="ops-secondary" disabled={disabled} onClick={() => setAsking(true)}>{t("sprint.simulate")}</button>;
  return <span className="confirm-inline" role="group" aria-label={t("sprint.simulate")}><span>{t("sprint.simulateConfirm")}</span>
    <button type="submit" name="intent" value="simulate" disabled={disabled}>{t("practice.confirm")}</button>
    <button type="button" className="ops-secondary" onClick={() => setAsking(false)}>{t("practice.cancel")}</button></span>;
}

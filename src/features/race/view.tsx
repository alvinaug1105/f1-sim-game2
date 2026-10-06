"use client";
import Link from "next/link";
import { useActionState } from "react";
import { RaceOperations } from "./viewer/operations";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import type { RaceErrorCode } from "../../game/domain/race-repository";
import type { RacePreparationView, RaceViewData } from "./public-view";
import { raceAction } from "./actions";
import { useState } from "react";
import { forecastItems, quietForecastKey } from "./forecast-copy";
import { isTyreCompound, type TyreCompound } from "../../simulation/race/tyres/model";
import { slickStartRisk } from "./viewer/race-view";
import { LiveHeader, SessionNav } from "../live/live-frame";
import { Icon } from "../../components/ui/icon";

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
  // v8E: warn (never forbid) when a player car would start on slicks while the grid strongly favours wet-weather tyres.
  const [choices, setChoices] = useState<Record<string, TyreCompound>>(() => Object.fromEntries(mine.map((r) => [r.driverId, prep.defaultCompound])));
  const [slickConfirmed, setSlickConfirmed] = useState(false);
  const slickRisk = slickStartRisk(prep.gridTyreFit, mine.map((r) => choices[r.driverId] ?? prep.defaultCompound));
  const percent = (n: number) => format.percentage(n / 1000, { maximumFractionDigits: 0 });
  const event = progress.events.find((e) => e.id === eventId)!;
  const session = event.weekend!.sessions.find((s) => s.id === data.sessionId)!;
  const canStart = ["AVAILABLE", "IN_PROGRESS"].includes(session.status);
  const weekendHref = `/career/${progress.career.id}/events/${eventId}`;
  const sessions = [...event.weekend!.sessions].sort((a, b) => a.order - b.order);
  return <div className="live live-prep" data-kind={sprint ? "SPRINT" : "RACE"}>
    <LocalizedPageTitle titleKey={sprint ? "sprint.title" : "race.title"} />
    <LiveHeader kind={sprint ? "SPRINT" : "RACE"} kindLabel={t(sprint ? "sprint.title" : "race.title")} title={event.name} circuit={event.circuitName}
      backHref={weekendHref} backLabel={t("race.back")} badge={sprint ? <strong className="session-kind-badge live-badge-sprint">{t("live.sprintFormat")}</strong> : null}
      nav={<SessionNav sessions={sessions} isCurrent={(x) => x.id === data.sessionId} weekendHref={weekendHref} />} />
    <p className="live-notice"><Icon name="info" size={14} />{t("incident.notice")}</p>
    <p className="live-lead">{t(sprint ? (canStart ? "sprint.ready" : "sprint.unavailable") : canStart ? "race.ready" : "race.unavailable")}</p>
    <form action={action} className="race-controls live-prep-form">
      <input type="hidden" name="careerId" value={progress.career.id} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="kind" value={data.kind ?? "RACE"} />
      <input type="hidden" name="lap" value={0} />
      <fieldset disabled={pending}>
        {canStart && <>
          <section className="race-context live-panel" aria-label={t("prep.context")}>
            <h2 className="live-panel-title">{t("prep.context")}</h2>
            <dl className="live-facts">
              <div><dt>{t(sprint ? "sprint.distance" : "prep.laps")}</dt><dd>{sprint ? t("sprint.distanceValue", { laps: format.number(laps), km: format.number(laps * data.circuit.lengthMeters / 1000, { maximumFractionDigits: 1 }) }) : format.number(laps)}</dd></div>
              {sprint && <div><dt>{t("sprint.title")}</dt><dd>{t("sprint.gridNote")}</dd></div>}
              <div><dt>{t("prep.conditions")}</dt><dd>{t(grid.rainfallIntensity === 0 ? "weather.dry" : grid.rainfallIntensity < 650 ? "weather.light" : "weather.heavy")} · {t("weather.water")} {percent(grid.trackWater)} ({t(grid.trackWater < 100 ? "weather.dry" : grid.trackWater < 350 ? "weather.damp" : "weather.wet")}) · {format.number(grid.airTemperatureMilliC / 1000, { style: "unit", unit: "celsius", maximumFractionDigits: 0 })}</dd></div>
              <div><dt>{t("weather.forecast")}</dt><dd>{(() => { const items = forecastItems(prep.forecast, prep.conditions.rainfallIntensity); return items.length ? <ul>{items.map(({ label, window: f }, n) => <li key={n}>{t(label)}: {t("weather.window", { from: format.number(f.arrivalMinLap), to: format.number(f.arrivalMaxLap), min: percent(f.rainfallMin), max: percent(f.rainfallMax) })}</li>)}</ul> : t(quietForecastKey(prep.conditions.rainfallIntensity)); })()}<small>{t("weather.uncertainty")}</small></dd></div>
            </dl>
          </section>
          <section className="tyre-selection live-panel">
            <h2 className="live-panel-title">{t("tyre.starting")}</h2><p className="ops-muted">{t("pit.startingNotice")}</p>
            {/* v8C: new sessions freeze the FIA B6.3.6 dry-tyre rule for the Grand Prix only (never the Sprint). */}
            <p className="tyre-rule-note">{t(sprint ? "regulation.notApplicable" : "regulation.preRace")}</p>
            <h3>{t("prep.yourDrivers")}</h3>
            {mine.map((row) => <label key={row.driverId} htmlFor={`tyre-${row.driverId}`} className="live-prep-driver">
              <span>{row.driverName}</span>
              <select id={`tyre-${row.driverId}`} name={`tyre:${row.driverId}`} value={choices[row.driverId] ?? prep.defaultCompound} onChange={(ev) => { if (isTyreCompound(ev.target.value)) { const next = ev.target.value; setChoices((c) => ({ ...c, [row.driverId]: next })); setSlickConfirmed(false); } }}>
                {prep.compounds.map((compound) => <option key={compound} value={compound}>{t(`tyre.${compound}`)}</option>)}
              </select>
            </label>)}
            {rivals.length > 0 && <details className="live-prep-rivals"><summary>{t("prep.rivals")} · {format.number(rivals.length)}</summary><p className="ops-muted">{t("prep.rivalNote")}</p><ul className="rival-list">{rivals.map((row) => <li key={row.driverId}>{row.driverName} <span>{row.teamName}</span></li>)}</ul></details>}
          </section>
          {slickRisk && <div className="slick-warning" role="alert"><p><Icon name="alert" size={14} />{t("prep.slickWarning")}</p>
            <label><input type="checkbox" checked={slickConfirmed} onChange={(ev) => setSlickConfirmed(ev.target.checked)} />{t("prep.slickConfirm")}</label></div>}
          <div className="live-prep-actions">
            <button name="intent" value="start" className="live-primary" disabled={slickRisk && !slickConfirmed}>{t(sprint ? "sprint.manage" : "race.start")}</button>
            {/* Sprint: Manage or Simulate — never a plain skip. Simulate runs the same v7 engine with both cars auto-managed. */}
            {sprint && <SimulateSubmit disabled={pending} />}
          </div>
        </>}
      </fieldset>
      {pending && <p role="status">{t("progression.pending")}</p>}
      {actionState.error && <p role="alert">{t(`race.error.${actionState.error}`)}</p>}
    </form>
    <Link className="ui-link" href={`/career/${progress.career.id}`}>{t("progression.back")}</Link>
  </div>;
}

/** Sprint: confirmed submit of this form with intent=simulate (tyre choices ignored: both cars are auto-managed). */
function SimulateSubmit({ disabled }: { disabled: boolean }) {
  const { t } = useI18n(), [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="ops-secondary" disabled={disabled} onClick={() => setAsking(true)}>{t("sprint.simulate")}</button>;
  return <span className="confirm-inline" role="group" aria-label={t("sprint.simulate")}><span>{t("sprint.simulateConfirm")}</span>
    <button type="submit" name="intent" value="simulate" disabled={disabled}>{t("practice.confirm")}</button>
    <button type="button" className="ops-secondary" onClick={() => setAsking(false)}>{t("practice.cancel")}</button></span>;
}

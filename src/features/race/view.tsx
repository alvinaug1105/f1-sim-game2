"use client";
import Link from "next/link";
import { PitPanel } from "./pit-panel";
import { useActionState } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import { formatRaceTime, formatRaceGap } from "../../i18n/race-time";
import type {
  CareerRaceData,
  RaceErrorCode,
} from "../../game/domain/race-repository";
import { TYRE_COMPOUNDS } from "../../simulation/race/tyres/model";
import { raceAction } from "./actions";
export function RaceView({ data }: { data: CareerRaceData }) {
  const { t, format, locale } = useI18n();
  const [actionState, action, pending] = useActionState(raceAction, {
    error: null as RaceErrorCode | null,
  });
  const { state, progress, eventId } = data;
  const event = progress.events.find((e) => e.id === eventId)!;
  const session = event.weekend!.sessions.find((s) => s.id === data.sessionId)!;
  const canStart =
    !state && ["AVAILABLE", "IN_PROGRESS"].includes(session.status);
  return (
    <>
      <LocalizedPageTitle titleKey="race.title" />
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("race.title")}</p>
          <h1>{event.name}</h1>
          <p>{event.circuitName}</p>
        </div>
        <Link
          className="text-link"
          href={`/career/${progress.career.id}/events/${eventId}`}
        >
          {t("race.back")}
        </Link>
      </div>
      <p className="development-notice">
        {t(
          state?.simulationVersion === 1
            ? "tyre.legacy"
            : state?.simulationVersion === 2
              ? "tyre.notice"
              : state?.simulationVersion === 3
                ? "traffic.notice"
                : state?.simulationVersion === 4 ? "pit.notice" : "command.notice",
        )}
      </p>
      {state ? (
        <>
          <h2>
            {t(state.status === "FINISHED" ? "race.finished" : "race.running")}
          </h2>
          <p>
            {t("race.lapCount", {
              lap: format.number(state.lap),
              total: format.number(state.input.totalLaps),
            })}
          </p>
          <p>
            {t("race.seed")}:{" "}
            {format.number(state.input.seed, { useGrouping: false })} ·{" "}
            {t("race.version")}: {format.number(state.simulationVersion)}
          </p>
        </>
      ) : (
        <p>{t(canStart ? "race.ready" : "race.unavailable")}</p>
      )}
      <form action={action} className="race-controls">
        <input type="hidden" name="careerId" value={progress.career.id} />
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="lap" value={state?.lap ?? 0} />
        <fieldset disabled={pending}>
          {canStart && (
            <div className="tyre-selection">
              <h2>{t("tyre.starting")}</h2>
              <p>{t("pit.startingNotice")}</p>
              {data.roster.map((row) => (
                <label key={row.driverId} htmlFor={`tyre-${row.driverId}`}>
                  {row.driverName}
                  <select
                    id={`tyre-${row.driverId}`}
                    name={`tyre:${row.driverId}`}
                    defaultValue="MEDIUM"
                  >
                    {TYRE_COMPOUNDS.map((compound) => (
                      <option key={compound} value={compound}>
                        {t(`tyre.${compound}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          {canStart && (
            <button name="intent" value="start">
              {t("race.start")}
            </button>
          )}
          {state?.status === "RUNNING" && (
            <>
              <button name="intent" value="lap">
                {t("race.lap")}
              </button>
              <button name="intent" value="five">
                {t("race.five")}
              </button>
              <button name="intent" value="finish">
                {t("race.finish")}
              </button>
            </>
          )}
        </fieldset>
        {pending && <p role="status">{t("progression.pending")}</p>}
        {actionState.error && (
          <p role="alert">{t(`race.error.${actionState.error}`)}</p>
        )}
      </form>
      {state && (
        <div className="race-table-scroll">
          <table className="race-table">
            <caption>
              {t(
                state.status === "FINISHED"
                  ? "race.classification"
                  : "race.timing",
              )}
            </caption>
            <thead>
              <tr>
                {(
                  [
                    "position",
                    "driver",
                    "team",
                    "total",
                    "gap",
                    "interval",
                    "last",
                    "best",
                    "fuel",
                  ] as const
                ).map((k) => (
                  <th key={k} scope="col">
                    {t(`race.${k}`)}
                  </th>
                ))}
                {state.simulationVersion >= 2 &&
                  (["compound", "age", "wear", "temperature"] as const).map(
                    (key) => (
                      <th key={key} scope="col">
                        {t(`tyre.${key}`)}
                      </th>
                    ),
                  )}
                {state.simulationVersion >= 3 &&
                  (["drs", "overtakes", "trafficLoss"] as const).map((key) => (
                    <th key={key} scope="col">
                      {t(`traffic.${key}`)}
                    </th>
                  ))}
                {state.simulationVersion >= 4 && (
                  <>
                    <th scope="col">{t("pit.stops")}</th>
                    <th scope="col">{t("pit.stint")}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {state.entrants.map((e) => {
                const label = data.labels.find(
                  (l) => l.entrantId === e.entrantId,
                )!;
                return (
                  <tr key={e.entrantId}>
                    <td>{format.number(e.position)}</td>
                    <th scope="row">{label.driverName}</th>
                    <td>{label.teamName}</td>
                    <td>{formatRaceTime(e.elapsedTimeMs, locale)}</td>
                    <td>
                      {e.position === 1
                        ? t("race.leader")
                        : e.gapToLeaderMs === null
                          ? t("race.lapped")
                          : formatRaceGap(e.gapToLeaderMs, locale)}
                    </td>
                    <td>
                      {e.intervalToAheadMs === null
                        ? t("race.lapped")
                        : formatRaceGap(e.intervalToAheadMs, locale)}
                    </td>
                    <td>
                      {e.lastLapTimeMs === null
                        ? t("race.noTime")
                        : formatRaceTime(e.lastLapTimeMs, locale)}
                    </td>
                    <td>
                      {e.bestLapTimeMs === null
                        ? t("race.noTime")
                        : formatRaceTime(e.bestLapTimeMs, locale)}
                    </td>
                    <td>
                      {format.number(e.fuelMassKg, {
                        style: "unit",
                        unit: "kilogram",
                        maximumFractionDigits: 3,
                      })}
                    </td>
                    {e.stint && (
                      <>
                        <td>{t(`tyre.${e.stint.tyre.compound}`)}</td>
                        <td>{format.number(e.stint.tyre.ageLaps)}</td>
                        <td>
                          {format.percentage(e.stint.tyre.wearPermille / 1000, {
                            maximumFractionDigits: 1,
                          })}
                        </td>
                        <td>
                          {format.number(
                            e.stint.tyre.temperatureMilliC / 1000,
                            {
                              style: "unit",
                              unit: "celsius",
                              maximumFractionDigits: 3,
                            },
                          )}
                        </td>
                      </>
                    )}
                    {e.track && (
                      <>
                        <td>
                          {t(
                            e.track.drsEligible
                              ? "traffic.drsActive"
                              : "traffic.drsInactive",
                          )}
                        </td>
                        <td>{format.number(e.track.overtakesCompleted)}</td>
                        <td>
                          {format.number(e.track.trafficLossMs)}{" "}
                          {t("traffic.milliseconds")}
                        </td>
                      </>
                    )}
                    {e.pit && (
                      <>
                        <td>{format.number(e.pit.stops.length)}</td>
                        <td>{format.number(e.stint!.number)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {state && state.simulationVersion >= 4 && (
        <section>
          <h2>{t("pit.strategy")}</h2>
          <p>{t("pit.semantics")}</p>
          {state.entrants.map((e) => (
            <PitPanel key={e.entrantId} data={data} entrant={e} />
          ))}
        </section>
      )}
      <Link className="text-link" href={`/career/${progress.career.id}`}>
        {t("progression.back")}
      </Link>
    </>
  );
}

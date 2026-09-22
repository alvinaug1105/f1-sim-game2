"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import { formatRaceTime, formatRaceGap } from "../../i18n/race-time";
import type {
  CareerRaceData,
  RaceErrorCode,
} from "../../game/domain/race-repository";
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
      <p className="development-notice">{t("race.notice")}</p>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Link className="text-link" href={`/career/${progress.career.id}`}>
        {t("progression.back")}
      </Link>
    </>
  );
}

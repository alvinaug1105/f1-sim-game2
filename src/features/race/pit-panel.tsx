"use client";
import { CommandPanel } from "./command-panel";
import { useActionState } from "react";
import { useI18n } from "../../i18n/provider";
import { TYRE_COMPOUNDS, WEATHER_TYRE_COMPOUNDS } from "../../simulation/race/tyres/model";
import type { RaceEntrantState } from "../../simulation/race/types";
import type {
  CareerRaceData,
  RaceErrorCode,
} from "../../game/domain/race-repository";
import { raceAction } from "./actions";
import { estimatePitWindow } from "./strategy-estimate";
export function PitPanel({
  data,
  entrant: e,
}: {
  data: CareerRaceData;
  entrant: RaceEntrantState;
}) {
  const { t, format } = useI18n();
  const [result, action, pending] = useActionState(raceAction, {
    error: null as RaceErrorCode | null,
  });
  const state = data.state!,
    pit = e.pit!,
    tyre = e.stint!.tyre;
  const label = data.labels.find((l) => l.entrantId === e.entrantId)!;
  const source = state.input.entrants.find((x) => x.entrantId === e.entrantId)!;
  const canCommand =
    source.strategyController === "PLAYER" &&
    state.status === "RUNNING" && e.incident?.status !== "RETIRED" &&
    state.lap < state.input.totalLaps - 1;
  const estimate = estimatePitWindow(state, e);
  const ms = (value: number) =>
    format.number(value, { style: "unit", unit: "millisecond" });
  return (
    <section className="pit-panel">
      <h3>{label.driverName}</h3>
      <p>
        {t("pit.stint")} {format.number(e.stint!.number)} ·{" "}
        {t(`tyre.${tyre.compound}`)} · {t("tyre.age")}{" "}
        {format.number(tyre.ageLaps)} · {t("tyre.wear")}{" "}
        {format.percentage(tyre.wearPermille / 1000, {
          maximumFractionDigits: 1,
        })}{" "}
        ·{" "}
        {format.number(tyre.temperatureMilliC / 1000, {
          style: "unit",
          unit: "celsius",
          maximumFractionDigits: 3,
        })}
      </p>
      <p>
        {pit.pendingCompound
          ? t("pit.requested", {
              compound: t(`tyre.${pit.pendingCompound}`),
              lap: format.number(state.lap + 1),
            })
          : t(e.incident?.status === "RETIRED" ? "incident.RETIRED" : state.status === "FINISHED" ? "pit.finished" : "pit.onTrack")}
      </p>
      {state.status === "RUNNING" && e.incident?.status !== "RETIRED" && (
        <p>
          {t("pit.estimate", { laps: format.number(estimate.lapsToCliff) })} ·{" "}
          {t("pit.loss")}: {ms(estimate.minimumLossMs)}–
          {ms(estimate.maximumLossMs)}
        </p>
      )}
      {source.strategyController === "DEVELOPMENT_AI" && e.incident?.status !== "RETIRED" && <p>{t("pit.ai")}</p>}
      {canCommand && (
        <form action={action}>
          <input
            type="hidden"
            name="careerId"
            value={data.progress.career.id}
          />
          <input type="hidden" name="eventId" value={data.eventId} />
          <input type="hidden" name="entrantId" value={e.entrantId} />
          <input type="hidden" name="lap" value={state.lap} />
          <input type="hidden" name="revision" value={pit.commandRevision} />
          <fieldset disabled={pending}>
            <label htmlFor={`pit-${e.entrantId}`}>
              {t("pit.newTyre")}
              <select
                id={`pit-${e.entrantId}`}
                name="compound"
                defaultValue={pit.pendingCompound ?? "HARD"}
                key={`${pit.commandRevision}-${pit.pendingCompound}`}
              >
                {(state.simulationVersion >= 6 ? WEATHER_TYRE_COMPOUNDS : TYRE_COMPOUNDS).map((c) => (
                  <option key={c} value={c}>
                    {t(`tyre.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <button name="intent" value="pitRequest">
              {t("pit.box")}
            </button>
            <button
              name="intent"
              value="pitCancel"
              disabled={!pit.pendingCompound}
            >
              {t("pit.cancel")}
            </button>
          </fieldset>
          {pending && <p role="status">{t("progression.pending")}</p>}
          {result.error && (
            <p role="alert">{t(`race.error.${result.error}`)}</p>
          )}
        </form>
      )}
      {e.commands && e.incident?.status !== "RETIRED" && <CommandPanel data={data} entrant={e} />}
      <details>
        <summary>{t("pit.history")}</summary>
        <h4>{t("pit.stints")}</h4>
        <ul>
          {pit.stints.map((s) => (
            <li key={s.number}>
              {t("pit.stintRecord", {
                number: format.number(s.number),
                compound: t(`tyre.${s.startingTyre.compound}`),
                start: format.number(s.startLap + 1),
                end:
                  s.endLap === null
                    ? t(e.incident?.status === "RETIRED" ? "pit.notRaced" : "pit.open")
                    : format.number(s.endLap),
              })}{" "}
              · {t("pit.startWear")}:{" "}
              {format.percentage(s.startingTyre.wearPermille / 1000, {
                maximumFractionDigits: 1,
              })}{" "}
              · {t("pit.endWear")}:{" "}
              {s.endingTyre
                ? format.percentage(s.endingTyre.wearPermille / 1000, {
                    maximumFractionDigits: 1,
                  })
                : t("pit.open")}
            </li>
          ))}
        </ul>
        <h4>{t("pit.stops")}</h4>
        {pit.stops.length === 0 ? (
          <p>{t("pit.none")}</p>
        ) : (
          <ul>
            {pit.stops.map((s) => (
              <li key={s.number}>
                {t("pit.stopRecord", {
                  lap: format.number(s.lap),
                  old: t(`tyre.${s.oldCompound}`),
                  next: t(`tyre.${s.newCompound}`),
                })}{" "}
                · {t("pit.lane")}: {ms(s.pitLaneLossMs)} · {t("pit.stationary")}
                : {ms(s.stationaryTimeMs)} · {t("pit.loss")}:{" "}
                {ms(s.totalLossMs)}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}

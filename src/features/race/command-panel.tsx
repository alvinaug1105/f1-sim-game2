"use client";
import { useActionState } from "react";
import { useI18n } from "../../i18n/provider";
import { PACE_MODES, FUEL_MODES, ERS_MODES, projectedFuelGrams } from "../../simulation/race/commands/model";
import type { CareerRaceData, RaceErrorCode } from "../../game/domain/race-repository";
import type { RaceEntrantState } from "../../simulation/race/types";
import { raceAction } from "./actions";
export function CommandPanel({data, entrant: e}: {data: CareerRaceData; entrant: RaceEntrantState}) {
  const {t, format} = useI18n();
  const [result, action, pending] = useActionState(raceAction, {error: null as RaceErrorCode | null});
  const s = data.state!, c = e.commands!;
  const source = s.input.entrants.find(x => x.entrantId === e.entrantId)!;
  const player = source.strategyController === "PLAYER" && source.teamId === data.progress.career.playerTeamId;
  return <section aria-label={t("command.title")}>
    <p>{t("command.energy")}: {format.percentage(c.ersCharge / s.input.commands!.capacity)} · {t("command.projectedFuel")}: {format.number(projectedFuelGrams(s,e) / 1000, {style:"unit",unit:"kilogram",signDisplay:"always",maximumFractionDigits:3})}</p>
    {!player && <p>{t("command.ai")}</p>}
    {player && s.status === "RUNNING" && e.incident?.status !== "RETIRED" && <p>{t("command.timing")}</p>}
    {([ ["paceMode", PACE_MODES], ["fuelMode", FUEL_MODES], ["ersMode", ERS_MODES] ] as const).map(([kind,modes]) => <form action={action} key={kind}>
      <p>{t(`command.${kind}`)}: <strong>{t(`command.${c[kind]}`)}</strong></p>
      {player && s.status === "RUNNING" && e.incident?.status !== "RETIRED" && <>
        <input type="hidden" name="careerId" value={data.progress.career.id}/><input type="hidden" name="eventId" value={data.eventId}/><input type="hidden" name="entrantId" value={e.entrantId}/><input type="hidden" name="lap" value={s.lap}/><input type="hidden" name="revision" value={c.commandRevision}/><input type="hidden" name="intent" value={kind}/>
        <fieldset disabled={pending}><legend>{t(`command.${kind}`)}</legend>{modes.map(mode => <button key={mode} name="mode" value={mode} aria-pressed={c[kind] === mode} disabled={c[kind] === mode}>{t(`command.${mode}`)}</button>)}</fieldset>
      </>}
    </form>)}
    {pending && <p role="status">{t("progression.pending")}</p>}
    {result.error && <p role="alert">{t(`race.error.${result.error}`)}</p>}
  </section>;
}

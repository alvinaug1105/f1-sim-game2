"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useI18n } from "../../i18n/provider";
import type { CareerSession } from "../../game/domain/progression";
import type { RaceErrorCode } from "../../game/domain/race-repository";
import { raceAction } from "./actions";
/** Confirmed Sprint form (Simulate Sprint / Simulate Remainder): the same v7 engine, both cars auto-managed. */
function SprintForm({ careerId, eventId, intent, label, confirmText }: { careerId: string; eventId: string; intent: "simulate" | "remainder"; label: string; confirmText: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(raceAction, { error: null as RaceErrorCode | null });
  const [asking, setAsking] = useState(false);
  return (
    <form action={action} className="transition-form">
      <input type="hidden" name="careerId" value={careerId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="kind" value="SPRINT" />
      <input type="hidden" name="intent" value={intent} />
      {!asking ? (
        <button type="button" disabled={pending} onClick={() => setAsking(true)}>{label}</button>
      ) : (
        <>
          <p role="status">{confirmText}</p>
          <button disabled={pending} type="submit">{pending ? t("progression.pending") : t("practice.confirm")}</button>
          <button type="button" className="secondary" disabled={pending} onClick={() => setAsking(false)}>{t("practice.cancel")}</button>
        </>
      )}
      {state.error && <p role="alert">{t(`race.error.${state.error}`)}</p>}
    </form>
  );
}
/** Weekend Sprint actions: Manage or Simulate — never a plain skip; Simulate Remainder when a Sprint is under way. */
export function SprintSessionControls({ careerId, eventId, session }: { careerId: string; eventId: string; session: CareerSession }) {
  const { t } = useI18n();
  const href = `/career/${careerId}/events/${eventId}/sprint`;
  if (session.status === "AVAILABLE")
    return <>
      <Link className="text-link" href={href}>{t("sprint.open")}</Link>
      <SprintForm careerId={careerId} eventId={eventId} intent="simulate" label={t("sprint.simulate")} confirmText={t("sprint.simulateConfirm")} />
    </>;
  if (session.status === "IN_PROGRESS")
    return <>
      <Link className="text-link" href={href}>{t("sprint.resume")}</Link>
      <SprintForm careerId={careerId} eventId={eventId} intent="remainder" label={t("sprint.remainder")} confirmText={t("sprint.remainderConfirm")} />
    </>;
  if (session.status === "COMPLETED") return <Link className="text-link" href={href}>{t("sprint.viewResults")}</Link>;
  return null;
}

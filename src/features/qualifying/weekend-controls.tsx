"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useI18n } from "../../i18n/provider";
import type { CareerSession } from "../../game/domain/progression";
import type { QualifyingErrorCode } from "../../game/domain/qualifying-repository";
import { qualifyingWeekendAction } from "./actions";
function WeekendForm({ careerId, eventId, intent, label, confirmText }: { careerId: string; eventId: string; intent: "simulate" | "remainder"; label: string; confirmText: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(qualifyingWeekendAction, { error: null as QualifyingErrorCode | null });
  const [asking, setAsking] = useState(false);
  return (
    <form action={action} className="transition-form">
      <input type="hidden" name="careerId" value={careerId} />
      <input type="hidden" name="eventId" value={eventId} />
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
      {state.error && <p role="alert">{t(`qualifying.error.${state.error}`)}</p>}
    </form>
  );
}
/** Weekend Qualifying actions: Manage or Simulate — never a plain skip or a development completion. */
export function QualifyingSessionControls({ careerId, eventId, session }: { careerId: string; eventId: string; session: CareerSession }) {
  const { t } = useI18n();
  const href = `/career/${careerId}/events/${eventId}/qualifying`;
  if (session.status === "AVAILABLE")
    return <>
      <Link className="text-link" href={href}>{t("qualifying.open")}</Link>
      <WeekendForm careerId={careerId} eventId={eventId} intent="simulate" label={t("qualifying.simulate")} confirmText={t("qualifying.simulateConfirm")} />
    </>;
  if (session.status === "IN_PROGRESS")
    return <>
      <Link className="text-link" href={href}>{t("qualifying.resume")}</Link>
      <WeekendForm careerId={careerId} eventId={eventId} intent="remainder" label={t("practice.simulateRemainder")} confirmText={t("qualifying.remainderConfirm")} />
    </>;
  if (session.status === "COMPLETED") return <Link className="text-link" href={href}>{t("qualifying.viewResults")}</Link>;
  return null;
}

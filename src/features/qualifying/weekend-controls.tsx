"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useI18n } from "../../i18n/provider";
import type { CareerSession } from "../../game/domain/progression";
import type { QualifyingErrorCode } from "../../game/domain/qualifying-repository";
import type { QualifyingKind } from "../../game/domain/qualifying-repository";
import { qualifyingWeekendAction } from "./actions";
import { textKey } from "./labels";
import { sessionHref } from "../career/session-links";
function WeekendForm({ careerId, eventId, kind, intent, label, confirmText }: { careerId: string; eventId: string; kind: QualifyingKind; intent: "simulate" | "remainder"; label: string; confirmText: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(qualifyingWeekendAction, { error: null as QualifyingErrorCode | null });
  const [asking, setAsking] = useState(false);
  return (
    <form action={action} className="transition-form">
      <input type="hidden" name="careerId" value={careerId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="kind" value={kind} />
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
/**
 * Weekend Qualifying actions for Grand Prix Qualifying or Sprint Qualifying (taken from the session's type): Manage or
 * Simulate — never a plain skip or a development completion.
 */
export function QualifyingSessionControls({ careerId, eventId, session }: { careerId: string; eventId: string; session: CareerSession }) {
  const { t } = useI18n();
  const kind: QualifyingKind = session.type === "SPRINT_QUALIFYING" ? "SPRINT_QUALIFYING" : "QUALIFYING";
  const href = sessionHref(`/career/${careerId}/events/${eventId}`, session), form = { careerId, eventId, kind };
  if (session.status === "AVAILABLE")
    return <>
      <Link className="text-link" href={href}>{t(textKey(kind, "open"))}</Link>
      <WeekendForm {...form} intent="simulate" label={t(textKey(kind, "simulate"))} confirmText={t(textKey(kind, "simulateConfirm"))} />
    </>;
  if (session.status === "IN_PROGRESS")
    return <>
      <Link className="text-link" href={href}>{t(textKey(kind, "resume"))}</Link>
      <WeekendForm {...form} intent="remainder" label={t("practice.simulateRemainder")} confirmText={t(textKey(kind, "remainderConfirm"))} />
    </>;
  if (session.status === "COMPLETED") return <Link className="text-link" href={href}>{t(textKey(kind, "viewResults"))}</Link>;
  return null;
}

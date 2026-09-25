"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useI18n } from "../../i18n/provider";
import type { CareerSession } from "../../game/domain/progression";
import type { PracticeErrorCode } from "../../game/domain/practice-repository";
import { practiceWeekendAction } from "./actions";
function WeekendForm({ careerId, eventId, sessionId = "", intent, label, confirmText }: { careerId: string; eventId: string; sessionId?: string; intent: "simulateSession" | "simulateRemainder" | "simulateAll"; label: string; confirmText?: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(practiceWeekendAction, { error: null as PracticeErrorCode | null });
  const [asking, setAsking] = useState(false);
  return (
    <form action={action} className="transition-form">
      <input type="hidden" name="careerId" value={careerId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="intent" value={intent} />
      {confirmText && !asking ? (
        <button type="button" disabled={pending} onClick={() => setAsking(true)}>{label}</button>
      ) : (
        <>
          {confirmText && <><input type="hidden" name="confirm" value="yes" /><p role="status">{confirmText}</p></>}
          <button disabled={pending} type="submit">{pending ? t("progression.pending") : confirmText ? t("practice.confirm") : label}</button>
          {confirmText && <button type="button" className="secondary" disabled={pending} onClick={() => setAsking(false)}>{t("practice.cancel")}</button>}
        </>
      )}
      {state.error && <p role="alert">{t(`practice.error.${state.error}`)}</p>}
    </form>
  );
}
/** Practice session actions on the weekend page. Skipping stays a progression action (it creates no session state). */
export function PracticeSessionControls({ careerId, eventId, session }: { careerId: string; eventId: string; session: CareerSession }) {
  const { t } = useI18n();
  const href = `/career/${careerId}/events/${eventId}/practice/${session.id}`;
  if (session.status === "AVAILABLE")
    return <>
      <Link className="text-link" href={href}>{t("practice.open")}</Link>
      <WeekendForm careerId={careerId} eventId={eventId} sessionId={session.id} intent="simulateSession" label={t("practice.simulateSession")} />
    </>;
  if (session.status === "IN_PROGRESS")
    return <>
      <Link className="text-link" href={href}>{t("practice.resume")}</Link>
      <WeekendForm careerId={careerId} eventId={eventId} sessionId={session.id} intent="simulateRemainder" label={t("practice.simulateRemainder")} confirmText={t("practice.simulateRemainderConfirm")} />
    </>;
  if (session.status === "COMPLETED") return <Link className="text-link" href={href}>{t("practice.viewSummary")}</Link>;
  return null;
}
export function SimulateAllPractice({ careerId, eventId }: { careerId: string; eventId: string }) {
  const { t } = useI18n();
  return <WeekendForm careerId={careerId} eventId={eventId} intent="simulateAll" label={t("practice.simulateAll")} confirmText={t("practice.simulateAllConfirm")} />;
}

"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import { Panel } from "../../components/ui/panel";
import {
  progressSummary,
  sessionActions,
  type CareerProgress,
  type ProgressionErrorCode,
  type SessionIntent,
} from "../../game/domain/progression";
import { progressionAction } from "./progression-actions";
function TransitionControl({
  careerId,
  eventId,
  sessionId = "",
  intent,
}: {
  careerId: string;
  eventId: string;
  sessionId?: string;
  intent: SessionIntent | "advance";
}) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(progressionAction, {
    error: null as ProgressionErrorCode | null,
  });
  return (
    <form action={action} className="transition-form">
      <input type="hidden" name="careerId" value={careerId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="intent" value={intent} />
      <button disabled={pending} type="submit">
        {t(pending ? "progression.pending" : `progression.${intent}`)}
      </button>
      {state.error && (
        <p role="alert">{t(`progression.error.${state.error}`)}</p>
      )}
    </form>
  );
}
export function ProgressPanel({ progress }: { progress: CareerProgress }) {
  const { t, format } = useI18n();
  const { active, next, completed, total, calendarComplete } =
    progressSummary(progress);
  const current = active?.weekend?.sessions.find(
    (s) => s.status === "AVAILABLE" || s.status === "IN_PROGRESS",
  );
  return (
    <Panel title={t("progression.progress")}>
      <div className="career-content">
        <p>
          {t("progression.count", {
            completed: format.number(completed),
            total: format.number(total),
          })}
        </p>
        {active ? (
          <>
            <h3>{t("progression.active")}</h3>
            <p>{active.name}</p>
            {current && (
              <p>
                {t(`progression.${current.type}`)} ·{" "}
                {t(`progression.${current.status}`)}
              </p>
            )}
            <Link
              className="text-link"
              href={`/career/${progress.career.id}/events/${active.id}`}
            >
              {t("progression.open")}
            </Link>
          </>
        ) : calendarComplete ? (
          <>
            <h3>{t("progression.calendarComplete")}</h3>
            <p>{t("progression.calendarBody")}</p>
          </>
        ) : (
          next && (
            <TransitionControl
              careerId={progress.career.id}
              eventId={next.id}
              intent="advance"
            />
          )
        )}
      </div>
    </Panel>
  );
}
export function WeekendView({
  progress,
  eventId,
}: {
  progress: CareerProgress;
  eventId: string;
}) {
  const { t, format } = useI18n();
  const event = progress.events.find((e) => e.id === eventId)!;
  return (
    <>
      <LocalizedPageTitle titleKey="progression.weekend" />
      <div className="page-header">
        <div>
          <p className="eyebrow">{t("progression.weekend")}</p>
          <h1>{event.name}</h1>
          <p>
            {event.circuitName} ·{" "}
            {t("career.round", { round: format.number(event.round) })}
          </p>
          <p>
            {t("career.currentDate")}:{" "}
            {format.date(new Date(progress.career.currentDate), {
              dateStyle: "long",
            })}
          </p>
        </div>
        <Link className="text-link" href={`/career/${progress.career.id}`}>
          {t("progression.back")}
        </Link>
      </div>
      <p className="development-notice">{t("progression.notice")}</p>
      <Panel title={t("progression.sessions")}>
        <div className="career-content">
          {!event.weekend ? (
            <p>{t("progression.notEntered")}</p>
          ) : (
            <>
              <ol className="session-list">
                {event.weekend.sessions.map((session) => (
                  <li key={session.id}>
                    <div>
                      <strong>{t(`progression.${session.type}`)}</strong>
                      <p>{t(`progression.${session.status}`)}</p>
                    </div>
                    <div className="session-actions">
                      {sessionActions(session).map((intent) => (
                        <TransitionControl
                          key={intent}
                          careerId={progress.career.id}
                          eventId={event.id}
                          sessionId={session.id}
                          intent={intent}
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
              {event.weekend.status === "COMPLETED" && (
                <p role="status">{t("progression.done")}</p>
              )}
            </>
          )}
        </div>
      </Panel>
    </>
  );
}

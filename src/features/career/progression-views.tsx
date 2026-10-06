"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import {
  type CareerProgress,
  type CareerSession,
  type ProgressionErrorCode,
  type SessionIntent,
} from "../../game/domain/progression";
import { progressionAction } from "./progression-actions";
import { isPractice, weekendFormatOf } from "../../game/domain/progression";
import { SprintSessionControls } from "../race/weekend-controls";
import {
  PracticeSessionControls,
  SimulateAllPractice,
} from "../practice/weekend-controls";
import { QualifyingSessionControls } from "../qualifying/weekend-controls";
import { Icon } from "../../components/ui/icon";
import { Alert, ButtonLink, StatusBadge } from "../../components/ui/primitives";
import type { WeekendHubExtras } from "./weekend-hub";
import { CircuitFacts, dateRange, Finishes, sessionIcon, sessionTone } from "./presentation";
/** A Career progression transition (today: "advance" to the next event). */
export function TransitionControl({
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
      <button disabled={pending} type="submit" className="ui-button ui-button--primary ui-button--large">
        {t(pending ? "progression.pending" : `progression.${intent}`)}
      </button>
      {state.error && (
        <p role="alert" className="form-error">{t(`progression.error.${state.error}`)}</p>
      )}
    </form>
  );
}
/** After the Grand Prix: the weekend's results and the championship. A finished Sprint already has results to show. */
function WeekendResultLinks({
  careerId,
  eventId,
  sessions,
}: {
  careerId: string;
  eventId: string;
  sessions: readonly { type: string; status: string }[];
}) {
  const { t } = useI18n();
  const done = (type: string) =>
    sessions.some((s) => s.type === type && s.status === "COMPLETED");
  if (!done("RACE") && !done("SPRINT")) return null;
  return (
    <div className="weekend-result-links">
      <Link
        className="button-link"
        href={`/career/${careerId}/events/${eventId}/results`}
      >
        {t("championship.viewWeekendResults")}
      </Link>
      {done("RACE") && (
        <Link className="text-link" href={`/career/${careerId}/standings`}>
          {t("championship.viewChampionship")}
        </Link>
      )}
    </div>
  );
}
/** The existing Manage / Simulate / View controls of one session (unchanged behaviour, per session type). */
function SessionControls({ careerId, eventId, session }: { careerId: string; eventId: string; session: CareerSession }) {
  const { t } = useI18n();
  if (session.type === "RACE")
    return session.status !== "LOCKED" ? (
      <Link className="text-link" href={`/career/${careerId}/events/${eventId}/race`}>{t("race.open")}</Link>
    ) : null;
  // The Sprint runs on the Race v7 engine: managed, or simulated with both cars auto-managed.
  if (session.type === "SPRINT") return <SprintSessionControls careerId={careerId} eventId={eventId} session={session} />;
  // Practice is never bypassed: not managing it yourself means simulating it.
  if (isPractice(session.type)) return <PracticeSessionControls careerId={careerId} eventId={eventId} session={session} />;
  // Qualifying is managed or simulated on the real engine; there is no development completion.
  return <QualifyingSessionControls careerId={careerId} eventId={eventId} session={session} />;
}
/** The existing per-session guidance, shown with the session it explains. */
function sessionHint(session: CareerSession) {
  if (session.status !== "AVAILABLE") return null;
  if (isPractice(session.type)) return "practice.simulateHint" as const;
  if (session.type === "QUALIFYING") return "qualifying.simulateHint" as const;
  if (session.type === "SPRINT_QUALIFYING") return "sprintQualifying.simulateHint" as const;
  if (session.type === "SPRINT") return "sprint.simulateHint" as const;
  return null;
}
/**
 * Race Weekend Hub (UIX-A). One weekend as one journey: the event briefing, the session progression track
 * (completed → current → upcoming), the next mission with its existing Manage / Simulate controls, the full schedule
 * with results, and the scoring note. `extras` (circuit, results, drivers) is optional presentation context.
 */
export function WeekendView({
  progress,
  eventId,
  extras = null,
}: {
  progress: CareerProgress;
  eventId: string;
  extras?: WeekendHubExtras | null;
}) {
  const i18n = useI18n();
  const { t, format } = i18n;
  const event = progress.events.find((e) => e.id === eventId)!;
  const careerId = progress.career.id;
  const sessions = [...(event.weekend?.sessions ?? [])].sort((a, b) => a.order - b.order);
  const current = sessions.find((s) => s.status === "AVAILABLE" || s.status === "IN_PROGRESS") ?? null;
  const done = sessions.filter((s) => s.status === "COMPLETED" || s.status === "SKIPPED").length;
  const weekendActive = event.weekend?.status === "ACTIVE";
  const practiceOpen = weekendActive && sessions.some((s) => isPractice(s.type) && (s.status === "AVAILABLE" || s.status === "IN_PROGRESS"));
  const dates = dateRange(i18n, event.startDate, event.endDate);
  const hint = current ? sessionHint(current) : null;
  return (
    <div className="wh">
      <LocalizedPageTitle titleKey="progression.weekend" />
      <header className="wh-header ui-surface ui-surface--raised ui-surface--cut ui-enter">
        <div className="wh-header-main">
          <p className="ui-label">
            {t("progression.weekend")} · <strong className="weekend-format">{t(`progression.format.${weekendFormatOf(event)}`)}</strong>
          </p>
          <h1>{event.name}</h1>
          <p className="wh-header-meta">
            <span><Icon name="pin" /> {event.circuitName}</span>
            <span>{t("career.round", { round: format.number(event.round) })}</span>
            <span><Icon name="calendar" /> {dates}</span>
          </p>
          <div className="wh-header-tags">
            {event.status === "COMPLETED" || event.weekend?.status === "COMPLETED"
              ? <StatusBadge tone="positive" icon="check">{t("progression.done")}</StatusBadge>
              : event.weekend
                ? <StatusBadge tone="signal" icon="play">{t("commandCentre.liveWeekend")}</StatusBadge>
                : <StatusBadge icon="lock">{t("weekendHub.notEnteredBadge")}</StatusBadge>}
            {event.weekend && (
              <span className="ui-meta num">{t("weekendHub.sessionsDone", { done: format.number(done), total: format.number(sessions.length) })}</span>
            )}
            <span className="ui-meta">{t("career.currentDate")}: {format.date(new Date(progress.career.currentDate), { dateStyle: "long" })}</span>
          </div>
        </div>
        {extras?.circuit && (
          <aside className="wh-header-side" aria-label={t("commandCentre.circuit")}>
            <p className="ui-label">{t("commandCentre.circuit")}</p>
            <CircuitFacts circuit={extras.circuit} />
          </aside>
        )}
      </header>
      <p className="wh-back">
        <Link className="ui-button ui-button--ghost" href={`/career/${careerId}`}><Icon name="arrowLeft" /> {t("progression.back")}</Link>
      </p>
      {!event.weekend ? (
        <Alert>{t("progression.notEntered")}</Alert>
      ) : (
        <>
          <section className="wh-track ui-enter" aria-labelledby="wh-track-title">
            <h2 id="wh-track-title" className="sr-only">{t("progression.sessions")}</h2>
            <ol className="wh-track-list">
              {sessions.map((s, i) => (
                <li key={s.id} className="wh-node" data-status={s.status} aria-current={current?.id === s.id ? "step" : undefined}>
                  <span className="wh-node-marker" aria-hidden="true"><Icon name={sessionIcon(s.status)} /></span>
                  <span className="wh-node-index ui-label num">{format.number(i + 1)}</span>
                  <span className="wh-node-name">{t(`progression.${s.type}`)}</span>
                  <StatusBadge tone={sessionTone(s.status)}>{t(`progression.${s.status}`)}</StatusBadge>
                  <Finishes finishes={extras?.results[s.type]} />
                </li>
              ))}
            </ol>
          </section>
          <div className="wh-grid">
            <section className="wh-next ui-surface ui-surface--raised" aria-labelledby="wh-next-title">
              {current ? (
                <>
                  <p className="ui-label">{t("commandCentre.nextSession")}</p>
                  <h2 id="wh-next-title" className="wh-next-title">{t(`progression.${current.type}`)}</h2>
                  <StatusBadge tone="signal" icon={sessionIcon(current.status)}>{t(`progression.${current.status}`)}</StatusBadge>
                  {hint && <p className="ui-meta wh-next-hint">{t(hint)}</p>}
                  <div className="session-actions wh-next-actions">
                    <SessionControls careerId={careerId} eventId={event.id} session={current} />
                  </div>
                  {practiceOpen && (
                    <div className="wh-next-secondary">
                      <SimulateAllPractice careerId={careerId} eventId={event.id} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="ui-label">{t("commandCentre.nextSession")}</p>
                  <h2 id="wh-next-title" className="wh-next-title">
                    {event.weekend.status === "COMPLETED" ? t("progression.done") : t("commandCentre.weekendDone")}
                  </h2>
                  {event.weekend.status === "COMPLETED" && <p role="status" className="ui-meta">{t("weekendHub.completeBody")}</p>}
                  <ButtonLink href={`/career/${careerId}`} variant="secondary" icon="home">{t("progression.back")}</ButtonLink>
                </>
              )}
              <WeekendResultLinks careerId={careerId} eventId={event.id} sessions={sessions} />
            </section>
            <aside className="wh-side">
              {extras && extras.drivers.length > 0 && (
                <section className="wh-side-panel ui-surface" aria-labelledby="wh-drivers-title">
                  <h2 id="wh-drivers-title" className="wh-side-title">{t("championship.playerDrivers")}</h2>
                  <ul className="cc-driver-list">
                    {extras.drivers.map((d) => (
                      <li key={d.id} className="cc-driver">
                        <span className="cc-driver-number num" aria-hidden="true">{d.carNumber ?? "—"}</span>
                        <span className="cc-driver-text"><strong>{d.name}</strong><span className="ui-meta">{d.abbreviation}</span></span>
                        <span className="cc-driver-standing">
                          <strong className="num">{d.scored ? t("championship.positionValue", { position: format.number(d.position) }) : "—"}</strong>
                          <span className="ui-meta num">{t("championship.pointsValue", { points: format.number(d.units / 2, { maximumFractionDigits: 1 }) })}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="wh-side-panel ui-surface" aria-labelledby="wh-rules-title">
                <h2 id="wh-rules-title" className="wh-side-title">{t("weekendHub.rules")}</h2>
                <p className="development-notice">{t("progression.notice")}</p>
              </section>
            </aside>
          </div>
          <section className="wh-schedule ui-surface" aria-labelledby="wh-schedule-title">
            <div className="ui-section-head"><h2 id="wh-schedule-title">{t("weekendHub.schedule")}</h2></div>
            <ol className="wh-schedule-list">
              {sessions.map((s) => (
                <li key={s.id} className="wh-row" data-status={s.status}>
                  <span className="wh-row-marker" aria-hidden="true"><Icon name={sessionIcon(s.status)} /></span>
                  <div className="wh-row-text">
                    <strong>{t(`progression.${s.type}`)}</strong>
                    <p>{t(`progression.${s.status}`)}</p>
                  </div>
                  <Finishes finishes={extras?.results[s.type]} />
                  <div className="session-actions">
                    {current?.id === s.id
                      ? <span className="ui-meta">{t("weekendHub.currentAbove")}</span>
                      : <SessionControls careerId={careerId} eventId={event.id} session={s} />}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

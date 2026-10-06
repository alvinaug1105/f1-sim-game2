"use client";
import Link from "next/link";
import { useActionState, type CSSProperties, type ReactNode } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import type {
  CareerProgress,
  CareerSession,
  ProgressionErrorCode,
  SessionIntent,
} from "../../game/domain/progression";
import { progressionAction } from "./progression-actions";
import { isPractice, weekendFormatOf } from "../../game/domain/progression";
import { SprintSessionControls } from "../race/weekend-controls";
import {
  PracticeSessionControls,
  SimulateAllPractice,
} from "../practice/weekend-controls";
import { QualifyingSessionControls } from "../qualifying/weekend-controls";
import { Icon, type IconName } from "../../components/ui/icon";
import { Alert, Module, SessionStatusBadge, Stat } from "../../components/ui/primitives";
import { teamStyle } from "../../components/ui/team-color";
import { CircuitFacts } from "./circuit-facts";
import { finishText, points, position } from "./presentation";
import type { WeekendExtras } from "./weekend-hub";
import type { TranslationKey } from "../../i18n/catalog";
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
      <button disabled={pending} type="submit">
        {t(pending ? "progression.pending" : `progression.${intent}`)}
      </button>
      {state.error && (
        <p role="alert">{t(`progression.error.${state.error}`)}</p>
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
/** The existing, unchanged session controls (Practice, Qualifying, Sprint Qualifying, Sprint, Grand Prix). */
function SessionControls({ careerId, eventId, session }: { careerId: string; eventId: string; session: CareerSession }) {
  const { t } = useI18n();
  if (session.type === "RACE")
    return session.status !== "LOCKED" ? (
      <Link className="text-link" href={`/career/${careerId}/events/${eventId}/race`}>
        {t("race.open")}
      </Link>
    ) : null;
  // The Sprint runs on the Race v7 engine: managed, or simulated with both cars auto-managed.
  if (session.type === "SPRINT") return <SprintSessionControls careerId={careerId} eventId={eventId} session={session} />;
  // Practice is never bypassed: not managing it yourself means simulating it.
  if (isPractice(session.type)) return <PracticeSessionControls careerId={careerId} eventId={eventId} session={session} />;
  // Qualifying is managed or simulated on the real engine; there is no development completion.
  return <QualifyingSessionControls careerId={careerId} eventId={eventId} session={session} />;
}
const hints: Partial<Record<CareerSession["type"], TranslationKey>> = {
  PRACTICE_1: "practice.simulateHint",
  PRACTICE_2: "practice.simulateHint",
  PRACTICE_3: "practice.simulateHint",
  QUALIFYING: "qualifying.simulateHint",
  SPRINT_QUALIFYING: "sprintQualifying.simulateHint",
  SPRINT: "sprint.simulateHint",
  RACE: "weekendHub.raceHint",
};
const stepIcon: Record<CareerSession["status"], IconName> = {
  COMPLETED: "check",
  AVAILABLE: "current",
  IN_PROGRESS: "current",
  LOCKED: "lock",
  SKIPPED: "chevron",
};
/**
 * Race Weekend Hub (UIX-A REDO): event identity, weekend progression, the next session's actions, the player's
 * drivers and the full schedule. Every action is an existing control; the hub only arranges them.
 */
export function WeekendView({
  progress,
  eventId,
  extras = {},
}: {
  progress: CareerProgress;
  eventId: string;
  extras?: WeekendExtras;
}) {
  const { t, format } = useI18n();
  const event = progress.events.find((e) => e.id === eventId)!;
  const careerId = progress.career.id;
  const weekendFormat = weekendFormatOf(event);
  const sessions = event.weekend ? [...event.weekend.sessions].sort((a, b) => a.order - b.order) : [];
  const current = sessions.find((s) => s.status === "AVAILABLE" || s.status === "IN_PROGRESS") ?? null;
  const day = (iso: string) => format.date(new Date(iso), { dateStyle: "medium" });
  const style = extras.teamColor ? (teamStyle(extras.teamColor) as CSSProperties) : undefined;
  const practiceOpen =
    event.weekend?.status === "ACTIVE" &&
    sessions.some((s) => isPractice(s.type) && (s.status === "AVAILABLE" || s.status === "IN_PROGRESS"));
  return (
    <div className="wh" style={style}>
      <LocalizedPageTitle titleKey="progression.weekend" />
      <Link className="ui-link wh-back" href={`/career/${careerId}`}>
        <Icon name="back" size={16} />
        {t("progression.back")}
      </Link>
      <section className="wh-hero" aria-labelledby="wh-title">
        <div className="wh-hero-main">
          <div className="wh-hero-top">
            <span className="ui-label">{t("progression.weekend")}</span>
            <strong className="weekend-format ui-format" data-format={weekendFormat}>
              {t(`progression.format.${weekendFormat}`)}
            </strong>
          </div>
          <p className="wh-round">{t("career.round", { round: format.number(event.round) })}</p>
          <h1 id="wh-title" className="ui-display wh-title">{event.name}</h1>
          <p className="wh-meta">
            <span><Icon name="circuit" size={16} />{event.circuitName}</span>
            <span>
              <Icon name="calendar" size={16} />
              {event.startDate === event.endDate ? day(event.startDate) : t("commandCentre.dateRange", { start: day(event.startDate), end: day(event.endDate) })}
            </span>
          </p>
          <p className="ui-meta">
            {t("career.currentDate")}: {format.date(new Date(progress.career.currentDate), { dateStyle: "long" })}
          </p>
        </div>
        {extras.circuit && (
          <div className="wh-hero-circuit">
            <CircuitFacts circuit={extras.circuit} />
          </div>
        )}
      </section>
      {!event.weekend ? (
        <Alert title={t("progression.sessions")} role="status">
          <p>{t("progression.notEntered")}</p>
        </Alert>
      ) : (
        <>
          <section className="ui-module wh-progress" aria-labelledby="wh-progress-title">
            <header className="ui-module-head">
              <h2 id="wh-progress-title">{t("weekendHub.progression")}</h2>
              {event.weekend.status === "COMPLETED" && <span className="ui-status" data-tone="done"><Icon name="check" size={12} />{t("progression.done")}</span>}
            </header>
            <ol className="wh-stepper">
              {sessions.map((s, i) => (
                <li key={s.id} data-status={s.status} aria-current={s.id === current?.id ? "step" : undefined}>
                  <span className="wh-step-node" aria-hidden="true"><Icon name={stepIcon[s.status]} size={16} /></span>
                  <span className="wh-step-text">
                    <span className="wh-step-index">{format.number(i + 1)}</span>
                    <span className="wh-step-name">{t(`progression.${s.type}`)}</span>
                    <SessionStatusBadge status={s.status} />
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <div className="wh-grid">
            <section className="ui-module wh-next" aria-labelledby="wh-next-title">
              <header className="ui-module-head">
                <h2 id="wh-next-title">{t(current ? "weekendHub.nextSession" : "weekendHub.weekendStatus")}</h2>
                {current && <SessionStatusBadge status={current.status} />}
              </header>
              <div className="ui-module-body">
                {current ? (
                  <>
                    <p className="ui-display wh-next-title">{t(`progression.${current.type}`)}</p>
                    {hints[current.type] && <p className="wh-next-hint">{t(hints[current.type]!)}</p>}
                    <div className="session-actions wh-actions">
                      <SessionControls careerId={careerId} eventId={event.id} session={current} />
                    </div>
                    {practiceOpen && (
                      <div className="wh-actions wh-actions-secondary">
                        <SimulateAllPractice careerId={careerId} eventId={event.id} />
                      </div>
                    )}
                  </>
                ) : event.weekend.status === "COMPLETED" ? (
                  <p role="status" className="wh-next-title ui-display">{t("progression.done")}</p>
                ) : (
                  <p className="ui-meta">{t("weekendHub.waiting")}</p>
                )}
                <WeekendResultLinks careerId={careerId} eventId={event.id} sessions={sessions} />
              </div>
            </section>
            <div className="wh-side">
              {extras.drivers && extras.drivers.length > 0 && <WeekendDrivers drivers={extras.drivers} />}
              <aside className="ui-module wh-rules" aria-labelledby="wh-rules-title">
                <header className="ui-module-head">
                  <h2 id="wh-rules-title">{t("weekendHub.rules")}</h2>
                </header>
                <div className="ui-module-body">
                  <p className="ui-note">
                    <Icon name="info" size={16} />
                    <span>{t("progression.notice")}</span>
                  </p>
                </div>
              </aside>
            </div>
          </div>
          <Module title={t("progression.sessions")} className="wh-schedule-module" labelledBy="wh-schedule">
            <ol className="session-list wh-schedule">
              {sessions.map((session) => (
                <li key={session.id} data-status={session.status}>
                  <div className="wh-schedule-name">
                    <span className="wh-step-node" aria-hidden="true"><Icon name={stepIcon[session.status]} size={14} /></span>
                    <strong>{t(`progression.${session.type}`)}</strong>
                    <SessionStatusBadge status={session.status} />
                  </div>
                  <div className="session-actions">
                    {session.id === current?.id ? (
                      <span className="ui-meta wh-schedule-here">{t("weekendHub.actionsAbove")}</span>
                    ) : (
                      <SessionControls careerId={careerId} eventId={event.id} session={session} />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Module>
        </>
      )}
    </div>
  );
}
function WeekendDrivers({ drivers }: { drivers: NonNullable<WeekendExtras["drivers"]> }) {
  const { t, format } = useI18n();
  return (
    <Module title={t("championship.playerDrivers")} className="wh-drivers" labelledBy="wh-drivers">
      <div className="ui-module-body">
        <ul className="wh-driver-list">
          {drivers.map((d) => (
            <li key={d.id} className="wh-driver">
              <span className="wh-driver-number" aria-hidden="true">{d.carNumber ?? d.abbreviation}</span>
              <div className="wh-driver-body">
                <p className="wh-driver-name">
                  <strong>{d.name}</strong>
                  {d.carNumber !== null && <span className="visually-hidden"> · {t("commandCentre.carNumber", { number: d.carNumber })}</span>}
                </p>
                <dl className="wh-driver-stats">
                  <Stat label={t("commandCentre.driverPosition")} value={position(t, d.position, d.tied)} unit={t("championship.pointsValue", { points: points(format, d.units) })} />
                  <Stat label={t("championship.grid")} value={d.qualifying !== null ? t("commandCentre.position", { position: d.qualifying }) : "—"} />
                  <DriverResult label={t("progression.SPRINT")} show={d.sprint !== null}>{finishText(t, d.sprint)}</DriverResult>
                  <Stat label={t("progression.RACE")} value={finishText(t, d.race)} />
                </dl>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Module>
  );
}
function DriverResult({ label, show, children }: { label: string; show: boolean; children: ReactNode }) {
  return show ? <Stat label={label} value={children} /> : null;
}

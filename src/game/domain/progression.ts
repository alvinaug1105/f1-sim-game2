import type { Career, CareerCalendarEvent } from "./career";
import type { WeekendFormat } from "./content";
export type SessionType =
  "PRACTICE_1" | "PRACTICE_2" | "PRACTICE_3" | "QUALIFYING" | "RACE" | "SPRINT_QUALIFYING" | "SPRINT";
export type SessionStatus =
  "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
export interface CareerSession {
  readonly id: string;
  readonly careerId: string;
  readonly careerRaceWeekendId: string;
  readonly type: SessionType;
  readonly order: number;
  readonly status: SessionStatus;
  readonly startedAtCareerDate: string | null;
  readonly completedAtCareerDate: string | null;
}
export interface RaceWeekend {
  readonly id: string;
  readonly careerId: string;
  readonly careerSeasonId: string;
  readonly careerCalendarEventId: string;
  readonly status: "ACTIVE" | "COMPLETED";
  readonly sessions: readonly CareerSession[];
}
export interface ProgressEvent extends CareerCalendarEvent {
  readonly circuitName: string;
  readonly weekend: RaceWeekend | null;
}
export interface CareerProgress {
  readonly career: Career;
  readonly events: readonly ProgressEvent[];
}
export type ProgressionErrorCode =
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "ACTIVE_WEEKEND"
  | "CALENDAR_COMPLETE"
  | "STALE_EVENT"
  | "PERSISTENCE_FAILED";
export class ProgressionError extends Error {
  constructor(
    readonly code: ProgressionErrorCode,
    options?: ErrorOptions,
  ) {
    super(`Career progression: ${code}`, options);
  }
}
export type SessionIntent =
  "start" | "simulatePractice" | "skipPractice" | "completeDevelopment";
const standardSequence: readonly SessionType[] = [
  "PRACTICE_1",
  "PRACTICE_2",
  "PRACTICE_3",
  "QUALIFYING",
  "RACE",
];
/** Sprint weekend: one Practice, then Sprint Qualifying → Sprint, then the Grand Prix Qualifying → Race. */
const sprintSequence: readonly SessionType[] = [
  "PRACTICE_1",
  "SPRINT_QUALIFYING",
  "SPRINT",
  "QUALIFYING",
  "RACE",
];
/** Career-snapshotted format; a missing value (Career created before Phase 15) is always STANDARD. */
export function weekendFormatOf(event: Pick<CareerCalendarEvent, "weekendFormat">): WeekendFormat {
  return event.weekendFormat === "SPRINT" ? "SPRINT" : "STANDARD";
}
export function getSessionSequence(format: WeekendFormat = "STANDARD"): readonly SessionType[] {
  return format === "SPRINT" ? sprintSequence : standardSequence;
}
export function isPractice(type: SessionType) {
  return (
    type === "PRACTICE_1" || type === "PRACTICE_2" || type === "PRACTICE_3"
  );
}
export function sessionActions(
  session: CareerSession,
): readonly SessionIntent[] {
  if (session.status === "AVAILABLE")
    return isPractice(session.type)
      ? ["simulatePractice", "skipPractice", "start"]
      : ["start"];
  return session.status === "IN_PROGRESS" ? ["completeDevelopment"] : [];
}
export function progressSummary(progress: CareerProgress) {
  const active = progress.events.find((e) => e.status === "CURRENT") ?? null;
  const next =
    [...progress.events]
      .filter((e) => e.status === "UPCOMING")
      .sort(
        (a, b) =>
          a.round - b.round ||
          a.startDate.localeCompare(b.startDate) ||
          a.id.localeCompare(b.id),
      )[0] ?? null;
  const completed = progress.events.filter(
    (e) => e.status === "COMPLETED",
  ).length;
  return {
    active,
    next,
    completed,
    total: progress.events.length,
    calendarComplete: !active && !next,
  };
}
/** Calendar dates are ISO YYYY-MM-DD, compared at UTC date precision; never move backwards. */
function later(a: string, b: string) {
  return a > b ? a : b;
}
export function enterNextEvent(
  progress: CareerProgress,
  expectedEventId: string,
  newId: () => string,
): CareerProgress {
  if (progress.career.status !== "ACTIVE")
    throw new ProgressionError("INVALID_TRANSITION");
  const { active, next } = progressSummary(progress);
  if (active || progress.events.some((e) => e.weekend?.status === "ACTIVE"))
    throw new ProgressionError("ACTIVE_WEEKEND");
  if (!next) throw new ProgressionError("CALENDAR_COMPLETE");
  if (next.id !== expectedEventId) throw new ProgressionError("STALE_EVENT");
  if (next.weekend) throw new ProgressionError("INVALID_TRANSITION");
  const id = newId();
  const weekend: RaceWeekend = {
    id,
    careerId: progress.career.id,
    careerSeasonId: next.careerSeasonId,
    careerCalendarEventId: next.id,
    status: "ACTIVE",
    sessions: getSessionSequence(weekendFormatOf(next)).map((type, index) => ({
      id: newId(),
      careerId: progress.career.id,
      careerRaceWeekendId: id,
      type,
      order: index + 1,
      status: index === 0 ? "AVAILABLE" : "LOCKED",
      startedAtCareerDate: null,
      completedAtCareerDate: null,
    })),
  };
  return {
    career: {
      ...progress.career,
      currentDate: later(progress.career.currentDate, next.startDate),
    },
    events: progress.events.map((e) =>
      e.id === next.id ? { ...e, status: "CURRENT", weekend } : e,
    ),
  };
}
export function transitionSession(
  progress: CareerProgress,
  eventId: string,
  sessionId: string,
  intent: SessionIntent,
): CareerProgress {
  const event = progress.events.find((e) => e.id === eventId);
  const weekend = event?.weekend;
  const session = weekend?.sessions.find((s) => s.id === sessionId);
  if (!event || !weekend || !session) throw new ProgressionError("NOT_FOUND");
  if (
    progress.career.status !== "ACTIVE" ||
    event.status !== "CURRENT" ||
    weekend.status !== "ACTIVE" ||
    !sessionActions(session).includes(intent)
  )
    throw new ProgressionError("INVALID_TRANSITION");
  const ordered = [...weekend.sessions].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((s) => s.id === sessionId);
  if (
    ordered
      .slice(0, index)
      .some(
        (s) =>
          s.status !== "COMPLETED" &&
          !(s.status === "SKIPPED" && isPractice(s.type)),
      )
  )
    throw new ProgressionError("INVALID_TRANSITION");
  const finishing = intent !== "start";
  const final = finishing && index === ordered.length - 1;
  const currentDate = final
    ? later(progress.career.currentDate, event.endDate)
    : progress.career.currentDate;
  const sessions = ordered.map((s, i): CareerSession => {
    if (s.id === sessionId)
      return {
        ...s,
        status:
          intent === "start"
            ? "IN_PROGRESS"
            : intent === "skipPractice"
              ? "SKIPPED"
              : "COMPLETED",
        startedAtCareerDate:
          s.startedAtCareerDate ??
          (intent === "skipPractice" ? null : progress.career.currentDate),
        completedAtCareerDate: finishing ? currentDate : null,
      };
    if (finishing && i === index + 1) {
      if (s.status !== "LOCKED")
        throw new ProgressionError("INVALID_TRANSITION");
      return { ...s, status: "AVAILABLE" };
    }
    return s;
  });
  return {
    career: { ...progress.career, currentDate },
    events: progress.events.map((e) =>
      e.id === eventId
        ? {
            ...e,
            status: final ? "COMPLETED" : "CURRENT",
            weekend: {
              ...weekend,
              status: final ? "COMPLETED" : "ACTIVE",
              sessions,
            },
          }
        : e,
    ),
  };
}
/** Internal application/persistence port; UI only invokes intent-based actions. */
export interface CareerProgressionRepository {
  getProgress(careerId: string): Promise<CareerProgress | null>;
  transition(
    careerId: string,
    change: (state: CareerProgress) => CareerProgress,
  ): Promise<CareerProgress>;
}

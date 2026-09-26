import { translate, type Locale } from "../src/i18n/catalog";
import { createFormatters } from "../src/i18n/format";
import { beforeEach, describe, expect, it } from "vitest";
import { createCareer } from "../src/features/career/create-career";
import {
  MemoryCareerRepository,
  input,
  runtime,
} from "./helpers/memory-career";
import {
  enterNextEvent,
  transitionSession,
  progressSummary,
  sessionActions,
  isPractice,
  type CareerProgress,
  type SessionIntent,
} from "../src/game/domain/progression";
let state: CareerProgress;
const newId = () => crypto.randomUUID();
beforeEach(async () => {
  const repo = new MemoryCareerRepository();
  const career = await createCareer(repo, input, runtime);
  const world = repo.worlds.get(career.id)!;
  state = {
    career,
    events: world.events.map((event) => ({
      ...event,
      circuitName: "Circuit",
      weekend: null,
    })),
  };
});
function enter() {
  state = enterNextEvent(state, progressSummary(state).next!.id, newId);
}
function act(index: number, intent: SessionIntent) {
  const event = progressSummary(state).active!;
  state = transitionSession(
    state,
    event.id,
    event.weekend!.sessions[index].id,
    intent,
  );
}
/** Completes the active weekend in session order, whatever its format (Practice is simulated, the rest run). */
function complete() {
  const sessions = progressSummary(state).active!.weekend!.sessions;
  sessions.forEach((s, i) => {
    if (isPractice(s.type)) act(i, "simulatePractice");
    else {
      act(i, "start");
      act(i, "completeDevelopment");
    }
  });
}
describe("Career progression domain", () => {
  it("selects lowest upcoming round independent of input order", () => {
    state = { ...state, events: [...state.events].reverse() };
    expect(progressSummary(state).next?.round).toBe(1);
  });
  it("ignores completed events", () => {
    state = {
      ...state,
      events: state.events.map((e, i) =>
        i === 0 ? { ...e, status: "COMPLETED" } : e,
      ),
    };
    expect(progressSummary(state).next?.round).toBe(2);
  });
  it("creates one available session and later locked sessions", () => {
    enter();
    expect(
      progressSummary(state).active!.weekend!.sessions.map((s) => s.status),
    ).toEqual(["AVAILABLE", "LOCKED", "LOCKED", "LOCKED", "LOCKED"]);
  });
  it("advances deterministically to event start", () => {
    enter();
    expect(state.career.currentDate).toBe("2026-03-06");
  });
  it("does not rewind overlapping calendars", () => {
    state = {
      ...state,
      career: { ...state.career, currentDate: "2026-04-01" },
    };
    enter();
    complete();
    expect(state.career.currentDate).toBe("2026-04-01");
  });
  it("rejects another weekend during active weekend", () => {
    enter();
    expect(() => enter()).toThrow("ACTIVE_WEEKEND");
  });
  it("rejects stale event identity", () => {
    expect(() => enterNextEvent(state, state.events[1].id, newId)).toThrow(
      "STALE_EVENT",
    );
  });
  it("rejects an inactive Career", () => {
    state = { ...state, career: { ...state.career, status: "ABANDONED" } };
    expect(() => enter()).toThrow("INVALID_TRANSITION");
  });
  it("Practice simulation completes and unlocks next session", () => {
    enter();
    act(0, "simulatePractice");
    expect(
      progressSummary(state)
        .active!.weekend!.sessions.slice(0, 2)
        .map((s) => s.status),
    ).toEqual(["COMPLETED", "AVAILABLE"]);
  });
  it("Practice can be skipped with a terminal game date", () => {
    enter();
    act(0, "skipPractice");
    const session = progressSummary(state).active!.weekend!.sessions[0];
    expect(session.status).toBe("SKIPPED");
    expect(session.startedAtCareerDate).toBeNull();
    expect(session.completedAtCareerDate).toBe(state.career.currentDate);
  });
  it("locked session cannot start", () => {
    enter();
    expect(() => act(1, "start")).toThrow("INVALID_TRANSITION");
  });
  it("locked session cannot complete", () => {
    enter();
    expect(() => act(1, "completeDevelopment")).toThrow("INVALID_TRANSITION");
  });
  it("completed session cannot complete twice", () => {
    enter();
    act(0, "simulatePractice");
    expect(() => act(0, "simulatePractice")).toThrow("INVALID_TRANSITION");
  });
  it("Race cannot start before qualifying resolves", () => {
    enter();
    expect(() => act(4, "start")).toThrow("INVALID_TRANSITION");
  });
  it("Qualifying cannot be skipped or simulated as practice", () => {
    enter();
    for (let i = 0; i < 3; i++) act(i, "skipPractice");
    expect(() => act(3, "skipPractice")).toThrow("INVALID_TRANSITION");
    expect(() => act(3, "simulatePractice")).toThrow("INVALID_TRANSITION");
  });
  it("available qualifying requires explicit start before completion", () => {
    enter();
    for (let i = 0; i < 3; i++) act(i, "simulatePractice");
    expect(() => act(3, "completeDevelopment")).toThrow("INVALID_TRANSITION");
    act(3, "start");
    expect(progressSummary(state).active!.weekend!.sessions[3].status).toBe(
      "IN_PROGRESS",
    );
  });
  it("Race cannot be skipped", () => {
    enter();
    for (let i = 0; i < 3; i++) act(i, "simulatePractice");
    act(3, "start");
    act(3, "completeDevelopment");
    expect(() => act(4, "skipPractice")).toThrow("INVALID_TRANSITION");
  });
  it("final completion closes weekend and event and advances date", () => {
    enter();
    complete();
    expect(state.events[0].status).toBe("COMPLETED");
    expect(state.events[0].weekend!.status).toBe("COMPLETED");
    expect(state.career.currentDate).toBe("2026-03-08");
  });
  it("next round does not automatically start", () => {
    enter();
    complete();
    expect(progressSummary(state).active).toBeNull();
    expect(progressSummary(state).next?.round).toBe(2);
    expect(state.events[1].weekend).toBeNull();
  });
  it("last event exposes calendar complete without completing Career", () => {
    // Calendar length is content data (the Pass A development calendar has 8 rounds).
    for (let i = 0; i < state.events.length; i++) {
      enter();
      complete();
    }
    expect(progressSummary(state)).toMatchObject({
      calendarComplete: true,
      completed: state.events.length,
      total: state.events.length,
    });
    expect(state.career.status).toBe("ACTIVE");
    expect(() => enterNextEvent(state, "anything", newId)).toThrow(
      "CALENDAR_COMPLETE",
    );
  });
  it("empty calendar is complete", () => {
    expect(progressSummary({ ...state, events: [] }).calendarComplete).toBe(
      true,
    );
  });
  it("does not mutate the input or another Career snapshot", () => {
    const other = structuredClone(state);
    const before = structuredClone(state);
    enter();
    complete();
    expect(other).toEqual(before);
  });
  it("rejects an unrelated session ID", () => {
    enter();
    expect(() =>
      transitionSession(state, state.events[0].id, newId(), "start"),
    ).toThrow("NOT_FOUND");
  });
  it("completed sessions expose no actions", () => {
    enter();
    act(0, "simulatePractice");
    expect(sessionActions(state.events[0].weekend!.sessions[0])).toEqual([]);
  });
});

it("English and Chinese formatting leave progression unchanged", () => {
  enter();
  act(0, "simulatePractice");
  const before = structuredClone(state);
  for (const locale of ["en", "zh-TW"] as const satisfies readonly Locale[]) {
    expect(translate(locale, "progression.PRACTICE_1")).not.toBe(
      "progression.PRACTICE_1",
    );
    expect(
      createFormatters(locale).date(new Date(state.career.currentDate), {
        dateStyle: "long",
      }),
    ).toBeTruthy();
  }
  expect(state).toEqual(before);
});

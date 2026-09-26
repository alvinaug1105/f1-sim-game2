import type { SessionType } from "../../game/domain/progression";
/** Route of each weekend session page (Sprint Qualifying and Sprint have their own pages beside Qualifying and Race). */
export function sessionHref(weekendHref: string, session: { readonly id: string; readonly type: SessionType | string }): string {
    const byType: Record<Exclude<SessionType, "PRACTICE_1" | "PRACTICE_2" | "PRACTICE_3">, string> = {
        SPRINT_QUALIFYING: "sprint-qualifying", SPRINT: "sprint", QUALIFYING: "qualifying", RACE: "race",
    };
    return session.type.startsWith("PRACTICE") ? `${weekendHref}/practice/${session.id}` : `${weekendHref}/${byType[session.type as keyof typeof byType]}`;
}

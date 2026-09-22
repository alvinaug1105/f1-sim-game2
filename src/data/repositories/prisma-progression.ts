import type { PrismaClient, Prisma } from "../generated/prisma/client";
import { assertContentId } from "../../game/domain/content-repository";
import {
  ProgressionError,
  type CareerProgress,
  type CareerProgressionRepository,
} from "../../game/domain/progression";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const date = (s: string) => new Date(`${s}T00:00:00.000Z`);
async function load(
  tx: Prisma.TransactionClient,
  careerId: string,
): Promise<CareerProgress | null> {
  const career = await tx.career.findUnique({ where: { id: careerId } });
  if (!career) return null;
  const events = await tx.careerCalendarEvent.findMany({
    where: { careerId, careerSeasonId: career.currentSeasonId },
    include: {
      circuit: true,
      weekend: { include: { sessions: { orderBy: { order: "asc" } } } },
    },
    orderBy: [{ round: "asc" }, { startDate: "asc" }],
  });
  return {
    career: {
      ...career,
      currentDate: iso(career.currentDate),
      createdAt: career.createdAt.toISOString(),
      updatedAt: career.updatedAt.toISOString(),
    },
    events: events.map(({ circuit, weekend, ...event }) => ({
      ...event,
      startDate: iso(event.startDate),
      endDate: iso(event.endDate),
      circuitName: circuit.name,
      weekend: weekend
        ? {
            id: weekend.id,
            careerId: weekend.careerId,
            careerSeasonId: weekend.careerSeasonId,
            careerCalendarEventId: weekend.careerCalendarEventId,
            status: weekend.status,
            sessions: weekend.sessions.map((s) => ({
              ...s,
              startedAtCareerDate: s.startedAtCareerDate
                ? iso(s.startedAtCareerDate)
                : null,
              completedAtCareerDate: s.completedAtCareerDate
                ? iso(s.completedAtCareerDate)
                : null,
            })),
          }
        : null,
    })),
  };
}
async function protect<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof ProgressionError) throw cause;
    throw new ProgressionError("PERSISTENCE_FAILED", { cause });
  }
}
function validate(id: string) {
  try {
    assertContentId(id);
  } catch {
    throw new ProgressionError("NOT_FOUND");
  }
}
export class PrismaProgressionRepository implements CareerProgressionRepository {
  constructor(private readonly client: PrismaClient) {}
  async getProgress(careerId: string) {
    validate(careerId);
    return protect(() =>
      this.client.$transaction((tx) => load(tx, careerId), {
        isolationLevel: "RepeatableRead",
      }),
    );
  }
  async transition(
    careerId: string,
    change: (state: CareerProgress) => CareerProgress,
  ) {
    validate(careerId);
    return protect(() =>
      this.client.$transaction(
        async (tx) => {
          // An UPDATE acquires the Career row lock and uses Prisma's configured schema.
          // ReadCommitted queries after the lock see the preceding request's commit.
          const locked = await tx.career.updateMany({
            where: { id: careerId },
            data: { updatedAt: new Date() },
          });
          if (!locked.count) throw new ProgressionError("NOT_FOUND");
          const before = await load(tx, careerId);
          if (!before) throw new ProgressionError("NOT_FOUND");
          const after = change(before);
          for (const event of after.events) {
            const previous = before.events.find((e) => e.id === event.id);
            if (previous === event) continue;
            const weekend = event.weekend;
            if (!weekend) throw new ProgressionError("INVALID_TRANSITION");
            if (!previous?.weekend) {
              const { sessions, ...data } = weekend;
              await tx.careerRaceWeekend.create({ data });
              await tx.careerSession.createMany({
                data: sessions.map((s) => ({
                  ...s,
                  startedAtCareerDate: null,
                  completedAtCareerDate: null,
                })),
              });
            } else {
              // Terminalize the old current session before unlocking the next partial-unique slot.
              const changed = weekend.sessions.filter(
                (s) =>
                  s !==
                  previous.weekend?.sessions.find((old) => old.id === s.id),
              );
              changed.sort(
                (a, b) =>
                  Number(a.status === "AVAILABLE") -
                  Number(b.status === "AVAILABLE"),
              );
              for (const s of changed)
                await tx.careerSession.update({
                  where: { id: s.id },
                  data: {
                    status: s.status,
                    startedAtCareerDate: s.startedAtCareerDate
                      ? date(s.startedAtCareerDate)
                      : null,
                    completedAtCareerDate: s.completedAtCareerDate
                      ? date(s.completedAtCareerDate)
                      : null,
                  },
                });
              await tx.careerRaceWeekend.update({
                where: { id: weekend.id },
                data: {
                  status: weekend.status,
                  completedAt:
                    weekend.status === "COMPLETED" ? new Date() : null,
                },
              });
            }
            await tx.careerCalendarEvent.update({
              where: { id: event.id },
              data: { status: event.status },
            });
          }
          await tx.career.update({
            where: { id: careerId },
            data: { currentDate: date(after.career.currentDate) },
          });
          return after;
        },
        { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 5000 },
      ),
    );
  }
}

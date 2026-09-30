import type { PrismaClient, Prisma } from "../generated/prisma/client";
import { assertContentId } from "../../game/domain/content-repository";
import { currentCarPerformance, legacyCarPerformance, storedPartDesign, type CarPartType } from "../../game/domain/car-development";
import { isCarPartType, isDesignFocus, isDesignProgramme, planCarPartDesign, type DesignFocus, type DesignPlan, type DesignProgramme } from "../../game/domain/car-design-project";
import { CarDesignError, type CarDesignProjectView, type CarDesignRepository } from "../../game/domain/car-design-repository";
import { readPlayerPhysical } from "./prisma-car-physical";
import { loadManagementTeams, startDesignForTeam } from "./prisma-car-management";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
type Client = Prisma.TransactionClient;
function choices(partType: unknown, focus: unknown, programme: unknown): { partType: CarPartType; focus: DesignFocus; programme: DesignProgramme } {
  if (!isCarPartType(partType) || !isDesignFocus(focus) || !isDesignProgramme(programme)) throw new CarDesignError("INVALID_CHOICE");
  return { partType, focus, programme };
}
function id(value: string) { try { assertContentId(value); } catch { throw new CarDesignError("NOT_FOUND"); } }
function projectView(row: {
  id: string; partType: CarPartType; newVersion: number; focus: DesignFocus; programme: DesignProgramme;
  status: "ACTIVE" | "COMPLETED"; startedAtCareerDate: Date; completesAtCareerDate: Date; completedAtCareerDate: Date | null;
  plannedLowSpeed: number; plannedMediumSpeed: number; plannedHighSpeed: number; plannedDragReduction: number; plannedDrsEfficiency: number;
}): CarDesignProjectView {
  return { id: row.id, partType: row.partType, newVersion: row.newVersion, focus: row.focus, programme: row.programme,
    status: row.status, startedAtCareerDate: iso(row.startedAtCareerDate), completesAtCareerDate: iso(row.completesAtCareerDate),
    completedAtCareerDate: row.completedAtCareerDate ? iso(row.completedAtCareerDate) : null,
    planned: { partType: row.partType, version: row.newVersion, stats: {
      lowSpeed: row.plannedLowSpeed, mediumSpeed: row.plannedMediumSpeed, highSpeed: row.plannedHighSpeed,
      dragReduction: row.plannedDragReduction, drsEfficiency: row.plannedDrsEfficiency,
    } },
  };
}
async function baseForPlayer(tx: Client, careerId: string, partType: CarPartType) {
  const career = await tx.career.findUnique({ where: { id: careerId }, select: { playerTeamId: true, currentSeasonId: true, currentDate: true, status: true } });
  if (!career) throw new CarDesignError("NOT_FOUND");
  if (career.status !== "ACTIVE") throw new CarDesignError("UNAVAILABLE");
  const scope = { careerId, careerSeasonId: career.currentSeasonId, careerTeamId: career.playerTeamId };
  const entry = await tx.careerSeasonTeamEntry.findFirst({ where: scope, select: { id: true } });
  if (!entry) throw new CarDesignError("UNAVAILABLE");
  const base = await tx.careerCarPartDesign.findFirst({ where: { ...scope, partType }, orderBy: { version: "desc" } });
  if (!base) throw new CarDesignError("LEGACY");
  return { career, scope, base };
}
function plan(base: Awaited<ReturnType<typeof baseForPlayer>>["base"], focus: DesignFocus, programme: DesignProgramme, dateString: string) {
  return planCarPartDesign(storedPartDesign(base), focus, programme, dateString);
}
async function protect<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    if (error instanceof CarDesignError) throw error;
    throw new CarDesignError("PERSISTENCE_FAILED", { cause: error });
  }
}
/** Called in the same locked transaction as Career date persistence; planned ratings are never recalculated. */
export async function settleDueDesignProjects(tx: Client, careerId: string, currentDate: string): Promise<void> {
  const due = await tx.careerCarDesignProject.findMany({
    where: { careerId, status: "ACTIVE", completesAtCareerDate: { lte: date(currentDate) } },
    orderBy: [{ completesAtCareerDate: "asc" }, { id: "asc" }],
  });
  for (const project of due) {
    await tx.careerCarPartDesign.create({ data: {
      careerId: project.careerId, careerSeasonId: project.careerSeasonId, careerTeamId: project.careerTeamId,
      partType: project.partType, version: project.newVersion, lowSpeed: project.plannedLowSpeed,
      mediumSpeed: project.plannedMediumSpeed, highSpeed: project.plannedHighSpeed,
      dragReduction: project.plannedDragReduction, drsEfficiency: project.plannedDrsEfficiency,
    } });
    await tx.careerCarDesignProject.update({ where: { id: project.id }, data: {
      status: "COMPLETED", completedAt: new Date(), completedAtCareerDate: date(currentDate),
    } });
  }
}
export class PrismaCarDesignRepository implements CarDesignRepository {
  constructor(private readonly client: PrismaClient) {}
  async getOverview(careerId: string) {
    id(careerId);
    return protect(() => this.client.$transaction(async tx => {
      const career = await tx.career.findUnique({ where: { id: careerId }, select: {
        playerTeamId: true, currentSeasonId: true, currentDate: true, status: true,
      } });
      if (!career) return null;
      const scope = { careerId, careerSeasonId: career.currentSeasonId, careerTeamId: career.playerTeamId };
      const entry = await tx.careerSeasonTeamEntry.findFirst({ where: scope, include: {
        team: true, partDesigns: { orderBy: [{ partType: "asc" }, { version: "asc" }] },
        designProjects: { orderBy: [{ startedAtCareerDate: "desc" }, { id: "asc" }] },
      } });
      if (!entry) throw new CarDesignError("UNAVAILABLE");
      const fitted = entry.partDesigns.filter(part => part.version === 1);
      const current = currentCarPerformance(fitted);
      const physical = await readPlayerPhysical(tx, careerId, career.currentSeasonId, career.playerTeamId, iso(career.currentDate));
      return {
        car: { careerId, teamId: career.playerTeamId, teamName: entry.team.name,
          overallPerformance: current?.overall ?? entry.carPerformance ?? legacyCarPerformance(entry.entryOrder),
          stats: current?.stats ?? null, parts: fitted.map(storedPartDesign) },
        careerDate: iso(career.currentDate), careerStatus: career.status,
        projects: entry.designProjects.map(projectView),
        availableDesigns: entry.partDesigns.filter(part => part.version > 1).map(storedPartDesign),
        physical,
      };
    }, { isolationLevel: "RepeatableRead" }));
  }
  async preview(careerId: string, partType: unknown, focus: unknown, programme: unknown) {
    id(careerId); const selected = choices(partType, focus, programme);
    return protect(() => this.client.$transaction(async tx => {
      const { career, base } = await baseForPlayer(tx, careerId, selected.partType);
      return plan(base, selected.focus, selected.programme, iso(career.currentDate));
    }, { isolationLevel: "ReadCommitted" }));
  }
  async start(careerId: string, partType: unknown, focus: unknown, programme: unknown, expectedPreview?: DesignPlan) {
    id(careerId); const selected = choices(partType, focus, programme);
    return protect(() => this.client.$transaction(async tx => {
      const locked = await tx.career.updateMany({ where: { id: careerId }, data: { updatedAt: new Date() } });
      if (!locked.count) throw new CarDesignError("NOT_FOUND");
      const career = await tx.career.findUniqueOrThrow({ where: { id: careerId } });
      const team = (await loadManagementTeams(tx, career, [career.playerTeamId]))[0];
      if (!team) throw new CarDesignError("UNAVAILABLE");
      const row = await startDesignForTeam(tx, { career, team }, selected.partType, selected.focus, selected.programme, expectedPreview);
      return projectView(row);
    }, { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 5000 }));
  }
}

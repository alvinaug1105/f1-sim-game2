import type { Prisma, Career } from "../generated/prisma/client";
import { CAR_PART_TYPES, CAR_PERFORMANCE_DIMENSIONS, aggregateCarPerformance, storedPartDesign, deriveSessionCarPerformance, type CarPartType } from "../../game/domain/car-development";
import { MAX_ACTIVE_DESIGN_PROJECTS, planCarPartDesign, type DesignFocus, type DesignProgramme, type DesignPlan } from "../../game/domain/car-design-project";
import { CAR_SLOTS, MAX_ACTIVE_MANUFACTURING_ORDERS, planManufacturing, type CarSlot } from "../../game/domain/car-manufacturing";
import { CarDesignError } from "../../game/domain/car-design-repository";
import { CarPhysicalError, type FitImpactView } from "../../game/domain/car-physical-repository";

const includes = { partDesigns: true, designProjects: true, manufacturingOrders: true, partUnits: true, fitments: true, drivers: true } as const;
export type ManagementTeam = Prisma.CareerSeasonTeamEntryGetPayload<{ include: typeof includes }>;
export interface TeamManagementContext { readonly career: Career; readonly team: ManagementTeam }
const iso = (value: Date) => value.toISOString().slice(0, 10);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const scope = ({ career, team }: TeamManagementContext) => ({ careerId: career.id, careerSeasonId: career.currentSeasonId, careerTeamId: team.careerTeamId });

/** Server-only shared operations. Callers acquire the Career row lock before loading these mutable contexts.
 * Relations are batched across all requested teams, rather than read per car/part or per AI decision. */
export async function loadManagementTeams(tx: Prisma.TransactionClient, career: Career, teamIds?: readonly string[]) {
  return tx.careerSeasonTeamEntry.findMany({ where: { careerId: career.id, careerSeasonId: career.currentSeasonId,
    ...(teamIds ? { careerTeamId: { in: [...teamIds] } } : { careerTeamId: { not: career.playerTeamId }, developmentStyle: { not: null } }),
  }, include: includes, orderBy: { entryOrder: "asc" } });
}
export function hasPhysicalFoundation(team: ManagementTeam): boolean {
  return team.fitments.length === CAR_SLOTS.length * CAR_PART_TYPES.length &&
    CAR_SLOTS.every(slot => team.drivers.some(driver => driver.role === "RACE_DRIVER" && driver.carSlot === slot));
}
export function fittedCarStats(team: ManagementTeam, slot: CarSlot) {
  return aggregateCarPerformance(team.fitments.filter(fitment => fitment.carSlot === slot).map(fitment => {
    const unit = team.partUnits.find(unit => unit.id === fitment.partUnitId);
    const design = team.partDesigns.find(design => design.id === unit?.designId);
    if (!design) throw new CarPhysicalError("LEGACY");
    return storedPartDesign(design);
  }));
}
export function fitImpact(context: TeamManagementContext, slot: CarSlot, designId: string): FitImpactView {
  const { team } = context;
  if (!hasPhysicalFoundation(team)) throw new CarPhysicalError("LEGACY");
  const design = team.partDesigns.find(design => design.id === designId);
  const available = team.partUnits.some(unit => unit.designId === designId && !team.fitments.some(fitment => fitment.partUnitId === unit.id));
  const old = team.fitments.find(fitment => fitment.carSlot === slot && fitment.partType === design?.partType);
  if (!design || !available || !old || team.partUnits.find(unit => unit.id === old.partUnitId)?.designId === designId) throw new CarPhysicalError("NO_UNIT");
  const before = fittedCarStats(team, slot);
  const after = aggregateCarPerformance(team.fitments.filter(fitment => fitment.carSlot === slot).map(fitment => {
    const unit = team.partUnits.find(unit => unit.id === fitment.partUnitId)!;
    return storedPartDesign(fitment.partType === design.partType ? design : team.partDesigns.find(row => row.id === unit.designId)!);
  }));
  return { slot, designId, partType: design.partType, version: design.version, before, after,
    beforeSessionPerformance: deriveSessionCarPerformance(before), afterSessionPerformance: deriveSessionCarPerformance(after) };
}
export async function startDesignForTeam(tx: Prisma.TransactionClient, context: TeamManagementContext,
  partType: CarPartType, focus: DesignFocus, programme: DesignProgramme, expected?: DesignPlan) {
  const { career, team } = context;
  if (career.status !== "ACTIVE") throw new CarDesignError("UNAVAILABLE");
  const base = team.partDesigns.filter(row => row.partType === partType).sort((a, b) => b.version - a.version)[0];
  if (!base) throw new CarDesignError("LEGACY");
  const active = team.designProjects.filter(project => project.status === "ACTIVE");
  if (active.some(project => project.partType === partType)) throw new CarDesignError("PART_ACTIVE");
  if (active.length >= MAX_ACTIVE_DESIGN_PROJECTS) throw new CarDesignError("CAPACITY");
  const plan = planCarPartDesign(storedPartDesign(base), focus, programme, iso(career.currentDate));
  if (expected && (expected.base?.version !== plan.base.version || expected.focus !== plan.focus || expected.programme !== plan.programme ||
    expected.startedAtCareerDate !== plan.startedAtCareerDate || expected.completesAtCareerDate !== plan.completesAtCareerDate ||
    expected.planned?.version !== plan.planned.version || expected.planned?.partType !== partType || expected.base?.partType !== partType ||
    expected.durationDays !== plan.durationDays || !CAR_PERFORMANCE_DIMENSIONS.every(dimension =>
      expected.base?.stats?.[dimension] === plan.base.stats[dimension] && expected.planned?.stats?.[dimension] === plan.planned.stats[dimension]))) throw new CarDesignError("STALE_PREVIEW");
  const row = await tx.careerCarDesignProject.create({ data: { ...scope(context), partType, newVersion: plan.planned.version,
    focus, programme, startedAtCareerDate: date(plan.startedAtCareerDate), completesAtCareerDate: date(plan.completesAtCareerDate),
    basePartDesignId: base.id, plannedLowSpeed: plan.planned.stats.lowSpeed, plannedMediumSpeed: plan.planned.stats.mediumSpeed,
    plannedHighSpeed: plan.planned.stats.highSpeed, plannedDragReduction: plan.planned.stats.dragReduction, plannedDrsEfficiency: plan.planned.stats.drsEfficiency,
  } });
  team.designProjects.push(row);
  return row;
}
export async function startManufacturingForTeam(tx: Prisma.TransactionClient, context: TeamManagementContext, designId: string, quantity: number, expectedCompletionDate?: string) {
  const { career, team } = context;
  if (career.status !== "ACTIVE") throw new CarPhysicalError("UNAVAILABLE");
  if (!hasPhysicalFoundation(team)) throw new CarPhysicalError("LEGACY");
  if (quantity !== 1 && quantity !== 2) throw new CarPhysicalError("INVALID_CHOICE");
  const design = team.partDesigns.find(row => row.id === designId);
  if (!design) throw new CarPhysicalError("NOT_FOUND");
  const active = team.manufacturingOrders.filter(order => order.status === "ACTIVE");
  if (active.some(order => order.designId === designId)) throw new CarPhysicalError("DESIGN_ACTIVE");
  if (active.length >= MAX_ACTIVE_MANUFACTURING_ORDERS) throw new CarPhysicalError("CAPACITY");
  const plan = planManufacturing(design.partType, quantity, iso(career.currentDate));
  if (expectedCompletionDate && expectedCompletionDate !== plan.completesAtCareerDate) throw new CarPhysicalError("STALE_PREVIEW");
  const row = await tx.careerCarManufacturingOrder.create({ data: { ...scope(context), partType: design.partType, designId, quantity,
    startedAtCareerDate: date(plan.startedAtCareerDate), completesAtCareerDate: date(plan.completesAtCareerDate) } });
  team.manufacturingOrders.push(row);
  return { ...row, design };
}
export async function fitDesignForTeam(tx: Prisma.TransactionClient, context: TeamManagementContext, slot: CarSlot, designId: string, sessionInProgress: boolean, expected?: FitImpactView) {
  if (context.career.status !== "ACTIVE") throw new CarPhysicalError("UNAVAILABLE");
  if (sessionInProgress) throw new CarPhysicalError("SESSION_IN_PROGRESS");
  const impact = fitImpact(context, slot, designId);
  if (expected && JSON.stringify(expected) !== JSON.stringify(impact)) throw new CarPhysicalError("STALE_PREVIEW");
  const { team } = context;
  const unit = team.partUnits.filter(unit => unit.designId === designId && !team.fitments.some(fitment => fitment.partUnitId === unit.id))
    .sort((a, b) => a.unitNumber - b.unitNumber || a.id.localeCompare(b.id))[0];
  const fitted = team.fitments.find(row => row.carSlot === slot && row.partType === impact.partType)!;
  await tx.careerCarFitment.update({ where: { careerId_careerSeasonId_careerTeamId_carSlot_partType: {
    ...scope(context), carSlot: slot, partType: impact.partType } }, data: { partUnitId: unit.id } });
  fitted.partUnitId = unit.id;
}

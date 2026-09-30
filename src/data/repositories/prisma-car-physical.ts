import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { assertContentId } from "../../game/domain/content-repository";
import { CAR_PART_TYPES, aggregateCarPerformance, deriveSessionCarPerformance, storedPartDesign, type StoredCarPartDesign } from "../../game/domain/car-development";
import { CAR_SLOTS, isCarSlot, planManufacturing, rosterFittedDesigns, type CarSlot } from "../../game/domain/car-manufacturing";
import { CarPhysicalError, type CarPhysicalRepository, type FitImpactView, type PhysicalOrderView, type PlayerPhysicalOverview } from "../../game/domain/car-physical-repository";

import { loadManagementTeams, startManufacturingForTeam, fitDesignForTeam } from "./prisma-car-management";

const iso = (value: Date) => value.toISOString().slice(0, 10);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
type Client = Prisma.TransactionClient;
function validId(value: string) { try { assertContentId(value); } catch { throw new CarPhysicalError("NOT_FOUND"); } }
async function protect<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    if (error instanceof CarPhysicalError) throw error;
    throw new CarPhysicalError("PERSISTENCE_FAILED", { cause: error });
  }
}
function orderView(row: {
  id: string; partType: typeof CAR_PART_TYPES[number]; quantity: number; status: "ACTIVE" | "COMPLETED";
  startedAtCareerDate: Date; completesAtCareerDate: Date; completedAtCareerDate: Date | null;
  design: { version: number };
}): PhysicalOrderView {
  return { id: row.id, partType: row.partType, version: row.design.version, quantity: row.quantity, status: row.status,
    startedAtCareerDate: iso(row.startedAtCareerDate), completesAtCareerDate: iso(row.completesAtCareerDate),
    completedAtCareerDate: row.completedAtCareerDate ? iso(row.completedAtCareerDate) : null };
}
/** One batched relational read per roster, shared by Practice, Qualifying, Sprint and Race. */
export async function loadRosterFitments(tx: Client, careerId: string, careerSeasonId: string) {
  const rows = await tx.careerCarFitment.findMany({
    where: { careerId, careerSeasonId }, include: { unit: { include: { design: true } } },
  });
  const all = rows.map(row => ({ careerTeamId: row.careerTeamId, carSlot: row.carSlot,
    design: row.unit.design as StoredCarPartDesign }));
  const result = new Map<string, StoredCarPartDesign[]>();
  for (const row of rows) {
    const key = `${row.careerTeamId}:${row.carSlot}`;
    if (!result.has(key)) result.set(key, rosterFittedDesigns(all, row.careerTeamId, row.carSlot));
  }
  return result;
}
export function fittedForRoster(fitted: ReadonlyMap<string, readonly StoredCarPartDesign[]>, teamId: string, slot: CarSlot | null) {
  if (!slot) return undefined;
  const parts = fitted.get(`${teamId}:${slot}`);
  if (!parts) throw new RangeError("Missing fitted car specification");
  return parts;
}

/** This read includes only the player's team; no rival physical rows enter the Car page. */
export async function readPlayerPhysical(tx: Client, careerId: string, seasonId: string, teamId: string, careerDate: string): Promise<PlayerPhysicalOverview | null> {
  const scope = { careerId, careerSeasonId: seasonId, careerTeamId: teamId };
  const drivers = await tx.careerSeasonDriverEntry.findMany({ where: { careerId, careerSeasonId: seasonId,
    teamEntry: { careerTeamId: teamId }, role: "RACE_DRIVER", carSlot: { not: null } }, include: { driver: true } });
  if (!drivers.length) return null; // Existing Careers retain their team-level specification.
  if (drivers.length !== CAR_SLOTS.length || drivers.some(driver => !driver.carSlot)) throw new RangeError("Incomplete car slots");
  const fitments = await tx.careerCarFitment.findMany({ where: scope, include: { unit: { include: { design: true } } } });
  const units = await tx.careerCarPartUnit.findMany({ where: scope, include: { fitment: true } });
  const designs = await tx.careerCarPartDesign.findMany({ where: scope, orderBy: [{ partType: "asc" }, { version: "asc" }] });
  const orders = await tx.careerCarManufacturingOrder.findMany({ where: scope, include: { design: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const cars = CAR_SLOTS.map(slot => {
    const driver = drivers.find(row => row.carSlot === slot);
    if (!driver) throw new RangeError("Missing car driver");
    const fitted = fitments.filter(row => row.carSlot === slot);
    const stats = aggregateCarPerformance(fitted.map(row => storedPartDesign(row.unit.design)));
    return { slot, driverName: `${driver.driver.firstName} ${driver.driver.lastName}`, stats,
      sessionPerformance: deriveSessionCarPerformance(stats),
      parts: fitted.map(row => ({ partType: row.partType, version: row.unit.design.version, unitNumber: row.unit.unitNumber })) };
  });
  const designViews = designs.map(row => ({ id: row.id, design: storedPartDesign(row),
    availableUnits: units.filter(unit => unit.designId === row.id && !unit.fitment).length,
    plans: ([1, 2] as const).map(quantity => { const plan = planManufacturing(row.partType, quantity, careerDate);
      return { quantity, durationDays: plan.durationDays, completesAtCareerDate: plan.completesAtCareerDate }; }),
  }));
  const fitImpacts: FitImpactView[] = [];
  for (const car of cars) for (const design of designViews) {
    if (!design.availableUnits || car.parts.some(part => part.partType === design.design.partType && part.version === design.design.version)) continue;
    const installed = fitments.filter(row => row.carSlot === car.slot).map(row =>
      row.partType === design.design.partType ? design.design : storedPartDesign(row.unit.design));
    const after = aggregateCarPerformance(installed);
    fitImpacts.push({ slot: car.slot, designId: design.id, partType: design.design.partType, version: design.design.version,
      before: car.stats, after, beforeSessionPerformance: car.sessionPerformance, afterSessionPerformance: deriveSessionCarPerformance(after) });
  }
  return { cars, designs: designViews, orders: orders.map(orderView), fitImpacts };
}

/** Called after design settlement in the same Career-locked date persistence transaction. */
export async function settleDueManufacturingOrders(tx: Client, careerId: string, currentDate: string): Promise<void> {
  const due = await tx.careerCarManufacturingOrder.findMany({ where: {
    careerId, status: "ACTIVE", completesAtCareerDate: { lte: date(currentDate) },
  }, orderBy: [{ completesAtCareerDate: "asc" }, { id: "asc" }] });
  for (const order of due) {
    const last = await tx.careerCarPartUnit.findFirst({ where: { designId: order.designId }, orderBy: { unitNumber: "desc" }, select: { unitNumber: true } });
    const first = (last?.unitNumber ?? 0) + 1;
    await tx.careerCarPartUnit.createMany({ data: Array.from({ length: order.quantity }, (_, index) => ({
      careerId: order.careerId, careerSeasonId: order.careerSeasonId, careerTeamId: order.careerTeamId,
      partType: order.partType, designId: order.designId, unitNumber: first + index,
      manufacturedAtCareerDate: date(currentDate),
    })) });
    await tx.careerCarManufacturingOrder.update({ where: { id: order.id }, data: {
      status: "COMPLETED", completedAt: new Date(), completedAtCareerDate: date(currentDate),
    } });
  }
}

export class PrismaCarPhysicalRepository implements CarPhysicalRepository {
  constructor(private readonly client: PrismaClient) {}
  async startManufacturing(careerId: string, designId: string, quantity: number, expectedCompletionDate?: string) {
    validId(careerId); validId(designId);
    if (quantity !== 1 && quantity !== 2) throw new CarPhysicalError("INVALID_CHOICE");
    return protect(() => this.client.$transaction(async tx => {
      const locked = await tx.career.updateMany({ where: { id: careerId }, data: { updatedAt: new Date() } });
      if (!locked.count) throw new CarPhysicalError("NOT_FOUND");
      const career = await tx.career.findUniqueOrThrow({ where: { id: careerId } });
      const team = (await loadManagementTeams(tx, career, [career.playerTeamId]))[0];
      if (!team) throw new CarPhysicalError("UNAVAILABLE");
      const order = await startManufacturingForTeam(tx, { career, team }, designId, quantity, expectedCompletionDate);
      return orderView(order);
    }, { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 5000 }));
  }
  async fit(careerId: string, slot: unknown, designId: string, expected?: FitImpactView) {
    validId(careerId); validId(designId);
    if (!isCarSlot(slot)) throw new CarPhysicalError("INVALID_CHOICE");
    return protect(() => this.client.$transaction(async tx => {
      const locked = await tx.career.updateMany({ where: { id: careerId }, data: { updatedAt: new Date() } });
      if (!locked.count) throw new CarPhysicalError("NOT_FOUND");
      const career = await tx.career.findUniqueOrThrow({ where: { id: careerId } });
      const team = (await loadManagementTeams(tx, career, [career.playerTeamId]))[0];
      if (!team) throw new CarPhysicalError("UNAVAILABLE");
      const running = await tx.careerSession.count({ where: { careerId, status: "IN_PROGRESS" } });
      await fitDesignForTeam(tx, { career, team }, slot, designId, running > 0, expected);
    }, { isolationLevel: "ReadCommitted", timeout: 15000, maxWait: 5000 }));
  }
}

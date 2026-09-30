import type { Prisma } from "../generated/prisma/client";
import { CAR_PART_TYPES, storedPartDesign, sourceCarStats } from "../../game/domain/car-development";
import { CAR_SLOTS, MAX_ACTIVE_MANUFACTURING_ORDERS } from "../../game/domain/car-manufacturing";
import { planAiCarDesign, isNonWorseDesign } from "../../game/domain/car-ai-development";
import { loadManagementTeams, hasPhysicalFoundation, fittedCarStats, startDesignForTeam, startManufacturingForTeam, fitDesignForTeam } from "./prisma-car-management";

/** Called under the existing Career lock, AFTER due designs and manufacturing settle.
 * No page reads, wall-clock scheduling, automatic cancellation or hidden performance mutation. */
export async function reconcileAiCarDevelopment(tx: Prisma.TransactionClient, careerId: string): Promise<void> {
  const career = await tx.career.findUniqueOrThrow({ where: { id: careerId } });
  if (career.status !== "ACTIVE") return;
  const teams = await loadManagementTeams(tx, career);
  if (!teams.length) return;
  const running = await tx.careerSession.count({ where: { careerId, status: "IN_PROGRESS" } }) > 0;
  for (const team of teams) {
    // NULL policy is deliberately opt-out for old saves, even when they have 17C physical cars.
    if (!team.developmentStyle || team.careerTeamId === career.playerTeamId || !hasPhysicalFoundation(team)) continue;
    const context = { career, team };
    if (!running) for (const partType of CAR_PART_TYPES) for (const slot of CAR_SLOTS) {
      const fitment = team.fitments.find(row => row.carSlot === slot && row.partType === partType)!;
      const fittedUnit = team.partUnits.find(row => row.id === fitment.partUnitId)!;
      const current = team.partDesigns.find(row => row.id === fittedUnit.designId)!;
      const upgrade = team.partDesigns.filter(row => row.partType === partType && isNonWorseDesign(storedPartDesign(row), storedPartDesign(current)) &&
        team.partUnits.some(unit => unit.designId === row.id && !team.fitments.some(fitment => fitment.partUnitId === unit.id)))
        .sort((a, b) => b.version - a.version)[0];
      if (upgrade) await fitDesignForTeam(tx, context, slot, upgrade.id, running);
    }
    for (const partType of CAR_PART_TYPES) {
      if (team.manufacturingOrders.filter(order => order.status === "ACTIVE").length >= MAX_ACTIVE_MANUFACTURING_ORDERS) break;
      const latest = team.partDesigns.filter(row => row.partType === partType).sort((a, b) => b.version - a.version)[0];
      if (!latest || team.manufacturingOrders.some(order => order.status === "ACTIVE" && order.designId === latest.id) ||
        team.partUnits.filter(unit => unit.designId === latest.id).length >= CAR_SLOTS.length) continue;
      const useful = team.fitments.filter(row => row.partType === partType).some(fitment => {
        const unit = team.partUnits.find(row => row.id === fitment.partUnitId)!;
        const current = team.partDesigns.find(row => row.id === unit.designId)!;
        return isNonWorseDesign(storedPartDesign(latest), storedPartDesign(current));
      });
      if (useful) await startManufacturingForTeam(tx, context, latest.id, 2);
    }
    // Each newly started project updates the context, so the second choice respects active-part exclusion and parity.
    while (true) {
      const decision = planAiCarDesign({ style: team.developmentStyle, initial: sourceCarStats(team),
        current: fittedCarStats(team, "CAR_1"), designs: team.partDesigns.map(storedPartDesign),
        activeParts: team.designProjects.filter(project => project.status === "ACTIVE").map(project => project.partType),
        projectsStarted: team.designProjects.length });
      if (!decision) break;
      await startDesignForTeam(tx, context, decision.partType, decision.focus, decision.programme);
    }
  }
}

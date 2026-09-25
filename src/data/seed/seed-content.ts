import type { PrismaClient } from "../generated/prisma/client";
import { validateContentDataset } from "../../game/domain/content-dataset";
import { developmentContent as data } from "./content-development";
/**
 * Updates only known development IDs, never deletes data. Reapplies canonical fixture values, so re-running it
 * converges on the same content (no duplicates: every row is upserted by its stable ID).
 */
export async function seedDevelopmentContent(
  client: PrismaClient,
): Promise<void> {
  validateContentDataset(data);
  await client.$transaction(
    async (tx) => {
      const existing = await tx.gameDatabase.findUnique({
        where: { id: data.database.id },
      });
      if (existing && existing.key !== data.database.key)
        throw new Error(
          "Development database ID is already occupied by a different dataset.",
        );
      await tx.gameDatabase.upsert({
        where: { id: data.database.id },
        create: data.database,
        update: data.database,
      });
      for (const row of data.teams)
        await tx.team.upsert({
          where: { id: row.id },
          create: row,
          update: row,
        });
      for (const row of data.drivers) {
        const value = {
          ...row,
          dateOfBirth: new Date(`${row.dateOfBirth}T00:00:00.000Z`),
        };
        await tx.driver.upsert({
          where: { id: row.id },
          create: value,
          update: value,
        });
      }
      for (const row of data.circuits)
        await tx.circuit.upsert({
          where: { id: row.id },
          create: row,
          update: row,
        });
      for (const row of data.seasons)
        await tx.season.upsert({
          where: { id: row.id },
          create: row,
          update: row,
        });
      for (const row of data.teamEntries)
        await tx.seasonTeamEntry.upsert({
          where: { id: row.id },
          create: row,
          update: row,
        });
      for (const row of data.driverEntries)
        await tx.seasonDriverEntry.upsert({
          where: { id: row.id },
          create: row,
          update: row,
        });
      // Descending round order: when the calendar grows, existing rounds only move later, so every update lands on
      // a round no other row still holds (unique season/round) and re-running the seed is idempotent.
      for (const row of [...data.events].sort((a, b) => b.round - a.round)) {
        const value = {
          ...row,
          startDate: new Date(`${row.startDate}T00:00:00.000Z`),
          endDate: new Date(`${row.endDate}T00:00:00.000Z`),
        };
        await tx.calendarEvent.upsert({
          where: { id: row.id },
          create: value,
          update: value,
        });
      }
    },
    { timeout: 15000 },
  );
}

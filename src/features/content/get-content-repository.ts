import "server-only";
import type { GameContentRepository } from "../../game/domain/content-repository";
import { getPrisma } from "../../data/prisma/client";
import { PrismaGameContentRepository } from "../../data/repositories/prisma-game-content";
/** Server-only composition root; UI-facing application queries use the domain contract. */
export function getContentRepository(): GameContentRepository {
  return new PrismaGameContentRepository(getPrisma());
}

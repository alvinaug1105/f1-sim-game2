import "server-only";
import { createPrismaClient, requireDatabaseUrl } from "./connection";
const globalClient = globalThis as typeof globalThis & {
  formulaContentPrisma?: ReturnType<typeof createPrismaClient>;
};
/** Lazy: no connection or environment requirement merely from importing a module/building the UI. */
export function getPrisma() {
  return (globalClient.formulaContentPrisma ??=
    createPrismaClient(requireDatabaseUrl()));
}

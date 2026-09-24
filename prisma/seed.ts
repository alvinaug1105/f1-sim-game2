import "dotenv/config";
import {
  createPrismaClient,
  requireDatabaseUrl,
} from "../src/data/prisma/connection";
import { seedDevelopmentContent } from "../src/data/seed/seed-content";
async function main() {
  const client = createPrismaClient(requireDatabaseUrl());
  try {
    await seedDevelopmentContent(client);
    console.info("Development content seeded successfully.");
  } finally {
    await client.$disconnect();
  }
}
main().catch((error) => {
  console.error("Development seed failed.", error);
  process.exitCode = 1;
});

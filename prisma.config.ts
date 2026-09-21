import "dotenv/config";
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // Offline format/validate/generate work without credentials. DB commands require an explicit URL.
  datasource: { url: process.env.DATABASE_URL },
});

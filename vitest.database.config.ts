import "dotenv/config";
import { defineConfig } from "vitest/config";
if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    "TEST_DATABASE_URL is required: use a disposable PostgreSQL database. No database tests were run.",
  );
export default defineConfig({
  test: {
    include: ["tests/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 60000,
  },
});

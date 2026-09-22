import { defineConfig, configDefaults } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: [...configDefaults.exclude, "tests/**/*.integration.test.ts"],
  },
});

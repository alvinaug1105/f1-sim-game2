import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "next-env.d.ts", "src/data/generated/**"]),
  {
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/features/**/*.{ts,tsx}",
      "src/i18n/**/*.{ts,tsx}",
    ],
    ignores: ["src/features/content/get-content-repository.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@prisma/*",
            "prisma",
            "prisma/*",
            "pg",
            "pg/*",
            "**/data/prisma/**",
            "@/data/prisma/*",
            "**/data/generated/**",
            "@/data/generated/*",
            "**/repositories/prisma-*",
            "**/seed/seed-content",
          ],
        },
      ],
    },
  },
  {
    files: ["src/game/**/*.ts", "src/simulation/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "react",
            "react/*",
            "next",
            "next/*",
            "@prisma/*",
            "prisma",
            "prisma/*",
            "pg",
            "pg/*",
            "@/app/*",
            "@/components/*",
            "@/features/*",
            "@/data/*",
            "**/data/**",
            "**/components/**",
            "**/features/**",
            "**/app/**",
            "@/i18n/*",
            "**/i18n/**",
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Inject a RandomSource for reproducibility.",
        },
      ],
    },
  },
]);

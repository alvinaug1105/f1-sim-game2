import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
const eslint = new ESLint();
describe("architectural import boundaries", () => {
  it.each([
    ["src/components/example.tsx", "@prisma/client"],
    ["src/app/example.tsx", "../data/prisma/client"],
    ["src/features/example.ts", "../data/generated/prisma/client"],
    ["src/components/example.tsx", "@/data/repositories/prisma-game-content"],
    ["src/game/domain/example.ts", "../../data/prisma/client"],
    ["src/game/domain/example.ts", "pg"],
    ["src/components/career-example.tsx", "@/data/repositories/prisma-career"],
    ["src/simulation/core/example.ts", "../../i18n/catalog"],
  ])(
    "rejects infrastructure/presentation leakage in %s from %s",
    async (filePath, module) => {
      const [result] = await eslint.lintText(`import '${module}';`, {
        filePath,
      });
      expect(
        result.messages.some(
          (message) => message.ruleId === "no-restricted-imports",
        ),
      ).toBe(true);
    },
  );
  it("allows the explicit server composition root", async () => {
    const [result] = await eslint.lintText(
      'import "../../data/prisma/client";',
      { filePath: "src/features/content/get-content-repository.ts" },
    );
    expect(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      ),
    ).toBe(false);
  });
});

it.each([
  "react",
  "next/navigation",
  "@prisma/client",
  "pg",
  "../../i18n/provider",
])("simulation rejects %s", async (module) => {
  const [result] = await eslint.lintText(`import '${module}';`, {
    filePath: "src/simulation/race/example.ts",
  });
  expect(
    result.messages.some((m) => m.ruleId === "no-restricted-imports"),
  ).toBe(true);
});
it.each([
  "window.localStorage",
  "localStorage",
  "sessionStorage",
  "Date.now()",
  "Math.random()",
])("simulation rejects ambient dependency %s", async (expression) => {
  const [result] = await eslint.lintText(
    `export const value = ${expression};`,
    { filePath: "src/simulation/race/example.ts" },
  );
  expect(
    result.messages.some((m) =>
      ["no-restricted-globals", "no-restricted-properties"].includes(
        m.ruleId ?? "",
      ),
    ),
  ).toBe(true);
});

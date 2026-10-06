import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
/**
 * UIXA2-REG-001: a `loading.tsx` is a Suspense boundary, so Next.js starts streaming the response (HTTP 200) before a
 * page below it can call `notFound()`. Every Career and Career-event page decides 404 itself, so no loading boundary
 * may sit above them — otherwise invalid Career / event URLs render the not-found UI with status 200.
 */
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
}
describe("Career route status semantics", () => {
  it("has no loading boundary above pages that call notFound()", () => {
    const app = new URL("../src/app/", import.meta.url).pathname;
    const loading = files(app).filter((f) => /[\\/]loading\.(t|j)sx?$/.test(f)).map((f) => f.slice(app.length));
    expect(loading).toEqual([]);
  });
});

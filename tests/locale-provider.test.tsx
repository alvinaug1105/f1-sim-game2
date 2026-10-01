// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, LanguageSelector, useI18n } from "../src/i18n/provider";
import { createBrowserLocaleStorage, readLocaleCookie } from "../src/i18n/browser-preference";
import { LOCALE_COOKIE_NAME, LOCALE_STORAGE_KEY, createLocaleStore } from "../src/i18n/locale-store";
import { type Locale, type TranslationKey } from "../src/i18n/catalog";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLElement, root: Root | null;
function Page({ title }: { title: TranslationKey }) { const { t } = useI18n(); return <><LanguageSelector /><h1>{t(title)}</h1></>; }
const titles = ["metadata.title", "metadata.careers", "metadata.car", "progression.weekend", "race.title"] as const;
function mount(title: TranslationKey, hydrate = false) {
  const initialLocale = readLocaleCookie(document.cookie) ?? "en";
  const page = <I18nProvider initialLocale={initialLocale}><Page title={title} /></I18nProvider>;
  act(() => { if (hydrate) { host.innerHTML = renderToString(page); root = hydrateRoot(host, page); }
    else { root = createRoot(host); root.render(page); } });
}
function choose(locale: Locale) { act(() => { const select = host.querySelector("select")!; select.value = locale; select.dispatchEvent(new Event("change", { bubbles: true })); }); }
function reload(title: TranslationKey) { act(() => root?.unmount()); host.replaceChildren(); mount(title, true); }
beforeEach(() => { document.cookie = `${LOCALE_COOKIE_NAME}=; Path=/; Max-Age=0`; localStorage.clear(); host = document.createElement("div"); document.body.append(host); root = null; });
afterEach(() => { act(() => root?.unmount()); host.remove(); delete (document as unknown as { cookie?: string }).cookie; vi.restoreAllMocks(); });
describe("locale provider reload and navigation", () => {
  it.each(["en", "zh-TW"] as const)("keeps %s through provider hydration and direct Career/Car/Weekend/Race reloads", locale => {
    const warnings = vi.spyOn(console, "error");
    mount("metadata.title"); choose(locale);
    for (const title of titles) {
      act(() => root!.render(<I18nProvider><Page title={title} /></I18nProvider>));
      expect(host.querySelector("select")!.value).toBe(locale);
      reload(title);
      expect(host.querySelector("select")!.value).toBe(locale);
      expect(document.documentElement.lang).toBe(locale);
      expect(host.querySelector("h1")!.textContent).not.toBe(title);
    }
    expect(warnings).not.toHaveBeenCalled();
  });
  it("uses the cookie over a conflicting legacy preference, and imports old preferences once", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "zh-TW"); mount("metadata.title");
    expect(host.querySelector("select")!.value).toBe("zh-TW");
    expect(readLocaleCookie(document.cookie)).toBe("zh-TW");
    localStorage.setItem(LOCALE_STORAGE_KEY, "en"); reload("metadata.car");
    expect(host.querySelector("select")!.value).toBe("zh-TW");
  });
  it("starts the server and hydration in Chinese without an English render", () => {
    document.cookie = `${LOCALE_COOKIE_NAME}=zh-TW; Path=/`;
    const html = renderToString(<I18nProvider initialLocale="zh-TW"><Page title="metadata.car" /></I18nProvider>);
    expect(html).toContain("賽車研發"); expect(html).not.toContain("Car development");
    mount("metadata.car", true);
    expect(host.querySelector("select")!.value).toBe("zh-TW");
  });
  it("reports unavailable persistence when cookies and legacy storage are rejected", () => {
    Object.defineProperty(document, "cookie", { configurable: true, get: () => "", set: () => {} });
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("denied"); });
    mount("metadata.title"); choose("zh-TW");
    expect(host.querySelector("select")!.value).toBe("zh-TW");
    expect(host.querySelector('[role="status"]')!.textContent).toContain("語言");
    reload("metadata.title"); expect(host.querySelector("select")!.value).toBe("en");
    expect(host.querySelector('[role="status"]')).not.toBeNull();
  });
  it("persists through cookies even if localStorage alone is blocked", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("denied"); });
    mount("metadata.title"); choose("zh-TW"); reload("metadata.car");
    expect(host.querySelector("select")!.value).toBe("zh-TW");
    expect(host.querySelector('[role="status"]')).toBeNull();
  });
  it("cookie preferences only write presentation storage and keep the SSR snapshot stable", () => {
    let cookie = `${LOCALE_COOKIE_NAME}=zh-TW`;
    const writes: string[] = [];
    const game = Object.freeze({ careerDate: "2026-03-01", points: 25, raceSeed: 7 });
    const store = createLocaleStore(() => createBrowserLocaleStorage({ readCookie: () => cookie,
      writeCookie: value => { cookie = value; }, secure: false,
      legacyStorage: () => ({ getItem: () => null, setItem: (key, value) => { writes.push(`${key}:${value}`); } }),
    }), "zh-TW");
    store.subscribe(() => {}); store.setLocale("en");
    expect(store.getSnapshot().locale).toBe("en");
    expect(store.getServerSnapshot().locale).toBe("zh-TW");
    expect(writes).toEqual([`${LOCALE_STORAGE_KEY}:en`]);
    expect(game).toEqual({ careerDate: "2026-03-01", points: 25, raceSeed: 7 });
    expect(cookie).toContain("Path=/; Max-Age=31536000; SameSite=Lax");
  });
});

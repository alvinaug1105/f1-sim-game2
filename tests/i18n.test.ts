import { describe, expect, it } from "vitest";
import en from "../src/i18n/en/messages.json";
import zhTW from "../src/i18n/zh-TW/messages.json";
import { translate, lookupMessage, resolveLocale } from "../src/i18n/catalog";
import {
  createLocaleStore,
  LOCALE_STORAGE_KEY,
  type PreferenceStorage,
} from "../src/i18n/locale-store";
import { createFormatters } from "../src/i18n/format";
import { advanceSimulation } from "../src/simulation/core/clock";
import { createSeededRandom } from "../src/simulation/core/random";
import {
  developmentTeam,
  developmentEvent,
} from "../src/data/seed/development";
function memoryStorage() {
  const values = new Map<string, string>();
  const storage: PreferenceStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  return { storage, values };
}
describe("translation catalogs", () => {
  it("loads English", () => {
    expect(translate("en", "dashboard.heading")).toBe("Operations overview");
  });
  it("loads Traditional Chinese", () => {
    expect(translate("zh-TW", "dashboard.heading")).toBe("營運總覽");
  });
  it("keeps both catalogs complete and placeholders consistent", () => {
    expect(Object.keys(zhTW).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(zhTW[key].trim()).not.toBe("");
      expect(zhTW[key].match(/\{\w+\}/g) ?? []).toEqual(
        en[key].match(/\{\w+\}/g) ?? [],
      );
    }
  });
  it("falls back to English and then a visible key", () => {
    expect(lookupMessage({}, en, "errors.retry")).toBe("Try again");
    expect(lookupMessage({ "errors.retry": " " }, en, "errors.retry")).toBe(
      "Try again",
    );
    expect(lookupMessage({}, en, "future.missing")).toBe("future.missing");
    expect(lookupMessage({}, en, "constructor")).toBe("constructor");
  });
  it("interpolates messages without changing identifiers", () => {
    expect(
      translate("zh-TW", "errors.reference", { reference: "team-dev-001" }),
    ).toBe("參考編號：team-dev-001");
  });
  it("defaults unsupported locales to English", () => {
    expect(resolveLocale("xx")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
    expect(resolveLocale("zh-TW")).toBe("zh-TW");
  });
});
describe("locale preference", () => {
  it("restores a preference in a fresh store, as after refresh", () => {
    const { storage, values } = memoryStorage();
    const first = createLocaleStore(() => storage);
    first.subscribe(() => {});
    first.setLocale("zh-TW");
    expect(values.get(LOCALE_STORAGE_KEY)).toBe("zh-TW");
    const reopened = createLocaleStore(() => storage);
    reopened.subscribe(() => {});
    expect(reopened.getSnapshot().locale).toBe("zh-TW");
    expect(reopened.getServerSnapshot().locale).toBe("en");
  });
  it("notifies subscribers and supports unsubscribe", () => {
    const { storage } = memoryStorage();
    const store = createLocaleStore(() => storage);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls++;
    });
    store.setLocale("zh-TW");
    expect(calls).toBe(1);
    unsubscribe();
    store.setLocale("en");
    expect(calls).toBe(1);
  });
  it("survives unavailable storage and keeps the choice for this visit", () => {
    const store = createLocaleStore(() => {
      throw new Error("Storage denied");
    });
    store.subscribe(() => {});
    store.setLocale("zh-TW");
    expect(store.getSnapshot()).toEqual({
      locale: "zh-TW",
      persistenceAvailable: false,
    });
  });
  it("recovers invalid saved preferences and reloads external changes", () => {
    const { storage } = memoryStorage();
    storage.setItem(LOCALE_STORAGE_KEY, "unsupported");
    const store = createLocaleStore(() => storage);
    store.subscribe(() => {});
    expect(store.getSnapshot().locale).toBe("en");
    storage.setItem(LOCALE_STORAGE_KEY, "zh-TW");
    store.reload();
    expect(store.getSnapshot().locale).toBe("zh-TW");
  });
  it("changes only its preference and leaves game state and simulation outcomes identical", () => {
    const { storage, values } = memoryStorage();
    const store = createLocaleStore(() => storage);
    store.subscribe(() => {});
    const state = Object.freeze({ tick: 12 });
    const original = structuredClone({
      state,
      developmentTeam,
      developmentEvent,
    });
    const randomA = createSeededRandom(42),
      randomB = createSeededRandom(42);
    const before = { state: advanceSimulation(state), random: randomA.next() };
    store.setLocale("zh-TW");
    expect({ state: advanceSimulation(state), random: randomB.next() }).toEqual(
      before,
    );
    expect({ state, developmentTeam, developmentEvent }).toEqual(original);
    expect([...values.keys()]).toEqual([LOCALE_STORAGE_KEY]);
  });
});
describe("presentation formatting", () => {
  it.each(["en", "zh-TW"] as const)("uses Intl for %s", (locale) => {
    const format = createFormatters(locale);
    const date = new Date("2026-09-21T00:00:00Z");
    expect(format.number(12345.6)).toBe(
      new Intl.NumberFormat(locale).format(12345.6),
    );
    expect(format.currency(1234, "TWD")).toBe(
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "TWD",
      }).format(1234),
    );
    expect(format.percentage(0.25)).toBe(
      new Intl.NumberFormat(locale, { style: "percent" }).format(0.25),
    );
    expect(format.date(date)).toBe(
      new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(date),
    );
  });
});

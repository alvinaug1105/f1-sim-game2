import { isLocale, resolveLocale, type Locale } from "./catalog";
import { LOCALE_COOKIE_NAME, LOCALE_STORAGE_KEY, type PreferenceStorage } from "./locale-store";

export function readLocaleCookie(cookies: string): Locale | null {
  const value = cookies.split(";").map(part => part.trim())
    .find(part => part.startsWith(`${LOCALE_COOKIE_NAME}=`))?.slice(LOCALE_COOKIE_NAME.length + 1);
  return isLocale(value) ? value : null;
}

interface BrowserPreference {
  readCookie(): string;
  writeCookie(value: string): void;
  legacyStorage(): PreferenceStorage;
  secure: boolean;
}

/** The cookie is authoritative and shared with SSR. localStorage is a legacy import/mirror only. */
export function createBrowserLocaleStorage(browser: BrowserPreference): PreferenceStorage {
  function save(locale: Locale) {
    browser.writeCookie(`${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${browser.secure ? "; Secure" : ""}`);
    if (readLocaleCookie(browser.readCookie()) !== locale) throw new Error("Language cookie rejected");
    // A blocked legacy store cannot invalidate a successfully persisted cookie.
    try { browser.legacyStorage().setItem(LOCALE_STORAGE_KEY, locale); } catch { /* Cookie already saved. */ }
  }
  return {
    getItem() {
      const saved = readLocaleCookie(browser.readCookie());
      if (saved) return saved;
      let legacy: string | null = null;
      try { legacy = browser.legacyStorage().getItem(LOCALE_STORAGE_KEY); } catch { /* Cookie storage may still work. */ }
      const locale = resolveLocale(legacy);
      save(locale);
      return locale;
    },
    setItem(_key, value) { save(resolveLocale(value)); },
  };
}

import { resolveLocale, type Locale } from "./catalog";
export const LOCALE_STORAGE_KEY = "formula-operations.locale";
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface LocaleSnapshot {
  readonly locale: Locale;
  readonly persistenceAvailable: boolean;
}
export const DEFAULT_SNAPSHOT: LocaleSnapshot = {
  locale: "en",
  persistenceAvailable: true,
};
/** This store can only change a UI preference; it never accepts or imports game state. */
export function createLocaleStore(getStorage: () => PreferenceStorage) {
  let snapshot = DEFAULT_SNAPSHOT;
  let initialized = false;
  const listeners = new Set<() => void>();
  function update(locale: Locale, persistenceAvailable: boolean) {
    if (
      snapshot.locale === locale &&
      snapshot.persistenceAvailable === persistenceAvailable
    )
      return;
    snapshot = { locale, persistenceAvailable };
    listeners.forEach((listener) => listener());
  }
  function reload() {
    try {
      update(resolveLocale(getStorage().getItem(LOCALE_STORAGE_KEY)), true);
    } catch {
      update(snapshot.locale, false);
    }
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => DEFAULT_SNAPSHOT,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!initialized) {
        initialized = true;
        reload();
      }
      return () => {
        listeners.delete(listener);
      };
    },
    reload,
    setLocale(locale: Locale) {
      const validLocale = resolveLocale(locale);
      try {
        getStorage().setItem(LOCALE_STORAGE_KEY, validLocale);
        update(validLocale, true);
      } catch {
        update(validLocale, false);
      }
    },
  };
}

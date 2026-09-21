"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  locales,
  resolveLocale,
  translate,
  type TranslationKey,
  type Locale,
} from "./catalog";
import { createFormatters } from "./format";
import { createLocaleStore, LOCALE_STORAGE_KEY } from "./locale-store";
interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  persistenceAvailable: boolean;
  t: (
    key: TranslationKey,
    values?: Readonly<Record<string, string | number>>,
  ) => string;
  format: ReturnType<typeof createFormatters>;
}
const I18nContext = createContext<I18nContextValue | null>(null);
export function I18nProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createLocaleStore(() => window.localStorage));
  const { locale, persistenceAvailable } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === LOCALE_STORAGE_KEY || event.key === null)
        store.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [store]);
  useEffect(() => {
    document.documentElement.lang = locale;
    const description = document.querySelector('meta[name="description"]');
    if (description)
      description.setAttribute(
        "content",
        translate(locale, "metadata.description"),
      );
  }, [locale]);
  const value = useMemo(
    () => ({
      locale,
      persistenceAvailable,
      setLocale: store.setLocale,
      t: (
        key: TranslationKey,
        values?: Readonly<Record<string, string | number>>,
      ) => translate(locale, key, values),
      format: createFormatters(locale),
    }),
    [locale, persistenceAvailable, store],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider.");
  return value;
}
export function LanguageSelector() {
  const { locale, setLocale, t, persistenceAvailable } = useI18n();
  return (
    <div className="language-control">
      <label htmlFor="interface-language">{t("common.language")}</label>
      <select
        id="interface-language"
        value={locale}
        onChange={(event) => setLocale(resolveLocale(event.target.value))}
      >
        {locales.map((option) => (
          <option key={option.code} value={option.code} lang={option.code}>
            {option.label}
          </option>
        ))}
      </select>
      {!persistenceAvailable && (
        <span className="language-warning" role="status">
          {t("common.storageUnavailable")}
        </span>
      )}
    </div>
  );
}
export function LocalizedPageTitle({ titleKey }: { titleKey: TranslationKey }) {
  const { t } = useI18n();
  useEffect(() => {
    document.title = t(titleKey);
  }, [t, titleKey]);
  return null;
}

import en from "./en/messages.json";
import zhTW from "./zh-TW/messages.json";
export const locales = [
  { code: "en", label: "English" },
  { code: "zh-TW", label: "繁體中文" },
] as const;
export type Locale = (typeof locales)[number]["code"];
export type TranslationKey = keyof typeof en;
export type Messages = Readonly<Partial<Record<TranslationKey, string>>>;
export const catalogs: Record<Locale, Messages> = { en, "zh-TW": zhTW };
export function isLocale(value: unknown): value is Locale {
  return locales.some((locale) => locale.code === value);
}
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}
/** Missing locale text → English → visible key. Never render an empty label. */
export function lookupMessage(
  messages: Readonly<Record<string, string | undefined>>,
  fallback: Readonly<Record<string, string | undefined>>,
  key: string,
): string {
  const own = (source: Readonly<Record<string, string | undefined>>) =>
    Object.hasOwn(source, key) && source[key]?.trim() ? source[key] : undefined;
  return own(messages) ?? own(fallback) ?? key;
}
export function translate(
  locale: Locale,
  key: TranslationKey,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return lookupMessage(catalogs[locale], en, key).replace(
    /\{(\w+)\}/g,
    (placeholder, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

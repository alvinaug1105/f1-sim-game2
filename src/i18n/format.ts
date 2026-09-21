import type { Locale } from "./catalog";
/** Display formatting only. Never use formatted values as simulation input. */
export function createFormatters(locale: Locale) {
  return {
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value),
    currency: (value: number, currency: string) =>
      new Intl.NumberFormat(locale, { style: "currency", currency }).format(
        value,
      ),
    percentage: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, { ...options, style: "percent" }).format(
        value,
      ),
    date: (value: Date, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(
        value,
      ),
  };
}

import type { Locale } from "./catalog";
/** Clock-style durations, not Date instants: hours never wrap at midnight. */
export function formatRaceTime(ms: number, locale: Locale): string {
  if (!Number.isSafeInteger(ms) || ms < 0)
    throw new RangeError("Race time must be non-negative integer milliseconds");
  const hours = Math.floor(ms / 3600000),
    minutes = Math.floor(ms / 60000) % 60,
    seconds = Math.floor(ms / 1000) % 60;
  const n = (value: number, digits = 1) =>
    new Intl.NumberFormat(locale, {
      minimumIntegerDigits: digits,
      useGrouping: false,
      maximumFractionDigits: 0,
    }).format(value);
  const decimal =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((p) => p.type === "decimal")?.value ?? ".";
  return `${hours ? n(hours) + ":" + n(minutes, 2) : n(Math.floor(ms / 60000))}:${n(seconds, 2)}${decimal}${n(ms % 1000, 3)}`;
}
export function formatRaceGap(ms: number, locale: Locale): string {
  if (!Number.isSafeInteger(ms) || ms < 0)
    throw new RangeError("Gap must be non-negative integer milliseconds");
  return new Intl.NumberFormat(locale, {
    signDisplay: "always",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(ms / 1000);
}

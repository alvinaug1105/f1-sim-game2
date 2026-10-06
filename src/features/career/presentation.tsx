"use client";
import { useI18n } from "../../i18n/provider";
import { Stat, StatusBadge, type Tone } from "../../components/ui/primitives";
import type { IconName } from "../../components/ui/icon";
import type { SessionStatus } from "../../game/domain/progression";
import type { EventBrief, PlayerFinish } from "./command-centre";
/** Presentation pieces shared by the Career Command Centre and the Race Weekend Hub (UIX-A). */
export type I18n = ReturnType<typeof useI18n>;
export function dateRange({ t, format }: I18n, start: string, end: string) {
  const day = (iso: string) => format.date(new Date(iso), { day: "numeric", month: "short" });
  return start === end ? day(start) : t("commandCentre.dateRange", { start: day(start), end: day(end) });
}
/** Localised region name from the circuit's ISO country code (no translation strings needed). */
function regionName(locale: string, code: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
/** Circuit facts; only rendered when the circuit is known. */
export function CircuitFacts({ circuit }: { circuit: NonNullable<EventBrief["circuit"]> }) {
  const { t, format, locale } = useI18n();
  return (
    <dl className="cc-facts">
      <Stat label={t("commandCentre.length")}>{t("commandCentre.kilometres", { value: format.number(circuit.lengthMeters / 1000, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) })}</Stat>
      <Stat label={t("commandCentre.laps")}><span className="num">{format.number(circuit.laps)}</span></Stat>
      <Stat label={t("commandCentre.location")}>{[circuit.city, regionName(locale, circuit.countryCode)].filter(Boolean).join(", ")}</Stat>
    </dl>
  );
}
/** Session state as a shape (icon) — always rendered beside the state text. */
export function sessionIcon(status: SessionStatus): IconName {
  return status === "COMPLETED" ? "check" : status === "IN_PROGRESS" ? "play" : status === "AVAILABLE" ? "dot" : status === "SKIPPED" ? "skip" : "lock";
}
export function sessionTone(status: SessionStatus): Tone {
  return status === "COMPLETED" || status === "SKIPPED" ? "muted" : status === "IN_PROGRESS" || status === "AVAILABLE" ? "signal" : "neutral";
}
/** The player's cars' classified finishes as chips: abbreviation + P# / DNF / DSQ (text, never colour alone). */
export function Finishes({ finishes }: { finishes: readonly PlayerFinish[] | null | undefined }) {
  const { t, format } = useI18n();
  if (!finishes?.length) return null;
  return (
    <span className="ui-finishes">
      {finishes.map((f) => (
        <StatusBadge key={f.driverId} tone={f.disqualified ? "critical" : f.retired ? "warning" : f.position <= 3 ? "signal" : "neutral"}>
          <span className="cc-chip-abbr">{f.abbreviation}</span>{" "}
          <span className="num">{f.disqualified ? t("commandCentre.dsq") : f.retired ? t("commandCentre.dnf") : t("championship.positionValue", { position: format.number(f.position) })}</span>
        </StatusBadge>
      ))}
    </span>
  );
}

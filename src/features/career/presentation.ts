import type { useI18n } from "../../i18n/provider";
import type { Finish } from "./command-centre";
/** Shared Career presentation formatting (UIX-A REDO): points from half-point units, positions, finishes. */
type T = ReturnType<typeof useI18n>["t"];
type F = ReturnType<typeof useI18n>["format"];
export const points = (format: F, units: number) => format.number(units / 2, { maximumFractionDigits: 1 });
export const position = (t: T, value: number | null, tied: boolean) =>
  value === null ? "—" : t(tied ? "commandCentre.tiedPosition" : "commandCentre.position", { position: value });
export function finishText(t: T, f: Finish | null) {
  if (!f) return "—";
  if (f.disqualified) return t("commandCentre.dsq");
  if (f.retired) return t("commandCentre.dnf");
  return t("commandCentre.position", { position: f.position });
}

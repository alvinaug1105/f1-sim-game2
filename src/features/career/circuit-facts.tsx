"use client";
import { useI18n } from "../../i18n/provider";
import { Stat } from "../../components/ui/primitives";
import type { CircuitCard } from "./circuit-card";
import { OUTLINE_VIEWBOX } from "./circuit-geometry-box";
/** Circuit facts with the real track outline (start/finish marked) — Command Centre focus round and Weekend Hub. */
export function CircuitFacts({ circuit, compact = false }: { circuit: CircuitCard; compact?: boolean }) {
  const { t, format, locale } = useI18n();
  let region = circuit.countryCode;
  try {
    region = new Intl.DisplayNames([locale], { type: "region" }).of(circuit.countryCode) ?? circuit.countryCode;
  } catch {
    // An unknown code stays as the raw code.
  }
  const km = (m: number, digits: number) => t("commandCentre.km", { value: format.number(m / 1000, { minimumFractionDigits: digits, maximumFractionDigits: digits }) });
  return (
    <div className="circuit-facts" data-compact={compact}>
      {circuit.outline && (
        <svg className="circuit-outline" viewBox={`0 0 ${OUTLINE_VIEWBOX.width} ${OUTLINE_VIEWBOX.height}`} role="img"
          aria-label={t("commandCentre.outline", { circuit: circuit.name })}>
          <path className="circuit-outline-base" d={circuit.outline.path} />
          <path className="circuit-outline-line" d={circuit.outline.path} />
          <circle className="circuit-outline-start" cx={circuit.outline.start.x} cy={circuit.outline.start.y} r="4.5" />
        </svg>
      )}
      <div className="circuit-facts-text">
        {compact ? (
          <p className="ui-meta">{circuit.city ? `${circuit.city}, ${region}` : region}</p>
        ) : (
          <>
            <h3 className="circuit-facts-name">{circuit.name}</h3>
            <p className="ui-meta">{circuit.city ? `${circuit.city}, ${region}` : region}</p>
          </>
        )}
        <dl className="ui-stats circuit-facts-stats">
          <Stat label={t("commandCentre.length")} value={km(circuit.lengthMeters, 3)} />
          <Stat label={t("commandCentre.laps")} value={format.number(circuit.laps)} />
          <Stat label={t("commandCentre.distance")} value={km(circuit.distanceMeters, 1)} />
          {circuit.sprintLaps !== null && <Stat label={t("commandCentre.sprintLaps")} value={format.number(circuit.sprintLaps)} />}
          {circuit.direction && !compact && <Stat label={t("commandCentre.direction")} value={t(`commandCentre.direction.${circuit.direction}`)} />}
        </dl>
      </div>
    </div>
  );
}

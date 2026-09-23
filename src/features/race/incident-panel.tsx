"use client";
import { useI18n } from "../../i18n/provider";
import type { CareerRaceData } from "../../game/domain/race-repository";
export function IncidentPanel({ data }: {
    data: CareerRaceData;
}) {
    const { t, format } = useI18n(), s = data.state!, control = s.incidents!;
    return <section className="pit-panel" aria-label={t("incident.control")}>
  <h2>{t("incident.control")}: {t(`incident.${control.mode}`)}</h2>
  {control.mode !== "GREEN" && <p>{t("incident.remaining", { count: format.number(control.remainingLaps) })}</p>}
  {(control.mode !== "GREEN" || control.drsDelay > 0 || s.weather?.drsState === "DRS_DISABLED_WET") && <p>{t("incident.drsSuspended")}{control.mode === "GREEN" && control.drsDelay > 0 && <> · {t("incident.restart", { count: format.number(control.drsDelay) })}</>}</p>}
  <h3>{t("incident.events")}</h3>
  {control.events.length === 0 ? <p>{t("incident.empty")}</p> : <ol>{control.events.map(e => <li key={e.sequence}>{t("incident.lap", { lap: format.number(e.lap) })} — {t(`incident.${e.type}`)}{e.kind && <> · {t(`incident.${e.kind}`)}</>}{e.severity && <> · {t(`incident.${e.severity}`)}</>}{e.entrantIds.map(id => <span key={id}> · {data.labels.find(l => l.entrantId === id)?.driverName ?? id}</span>)}{e.timeLossMs > 0 && <> · {format.number(e.timeLossMs / 1000, { style: "unit", unit: "second", maximumFractionDigits: 3 })}</>}</li>)}</ol>}
 </section>;
}

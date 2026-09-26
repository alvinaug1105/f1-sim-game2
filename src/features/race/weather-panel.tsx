"use client";
import { useI18n } from "../../i18n/provider";
import type { RacePublicState } from "./public-view";
/** Current conditions and the public approximate forecast (server-projected; never the truth timeline). */
export function WeatherPanel({state}:{state:RacePublicState}) {
 const {t,format}=useI18n(),w=state.weather!;
 const percent=(n:number)=>format.percentage(n/1000,{maximumFractionDigits:1});
 const temperature=(n:number)=>format.number(n/1000,{style:"unit",unit:"celsius",maximumFractionDigits:1});
 return <section className="pit-panel" aria-label={t("weather.title")}>
  <h2>{t("weather.title")}</h2>
  <p>{t("weather.rain")}: {percent(w.rainfallIntensity)} · {t(w.rainfallIntensity===0?"weather.dry":w.rainfallIntensity<650?"weather.light":"weather.heavy")}</p>
  <p>{t("weather.water")}: {percent(w.trackWater)} · {t(w.trackWater<100?"weather.dry":w.trackWater<350?"weather.damp":"weather.wet")}</p>
  <p>{t("weather.air")}: {temperature(w.airTemperatureMilliC)} · {t("weather.track")}: {temperature(w.trackTemperatureMilliC)}</p>
  <p>{state.incidents && (state.incidents.mode!=="GREEN"||state.incidents.drsDelay>0) ? t("incident.drsSuspended") : t(`weather.${w.drsState}`)}</p>
  {state.status==="RUNNING" && <><h3>{t("weather.forecast")}</h3><p>{t("weather.uncertainty")}</p><ul>{(state.forecast??[]).map((f,n)=><li key={n}>{t(f.rainfallMax<200?"weather.easing":"weather.expected")}: {t("weather.window",{from:format.number(f.arrivalMinLap),to:format.number(f.arrivalMaxLap),min:percent(f.rainfallMin),max:percent(f.rainfallMax)})}</li>)}</ul></>}
 </section>;
}

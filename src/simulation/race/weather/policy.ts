import type { RaceEntrantState, RaceSimulationInput } from "../types";
import { WEATHER_TYRE_COMPOUNDS, tyreContributions, type TyreState } from "../tyres/model";
import { evolveWeather, forecastRain, waterPenaltyMs, advanceWeatherTyre, type WeatherState, type WeatherConfiguration } from "./model";
/** Policy cannot receive the hidden timeline. Current observations + public forecast only. */
export function weatherPitChoice(e:RaceEntrantState,input:Omit<RaceSimulationInput,"weather">,weather:WeatherState,c:Omit<WeatherConfiguration,"timeline"|"initial">,lap:number){
 const remaining=input.totalLaps-lap-1;
 if(remaining<1||lap-e.stint!.startedAtLap<c.strategy.minimumStintLaps)return null;
 const horizon=Math.min(remaining,c.strategy.horizonLaps),pace=input.commands!.pace[e.commands!.paceMode];
 const tyres={...input.tyres!,tyreWearMultiplierPermille:Math.round(input.tyres!.tyreWearMultiplierPermille*pace.tyreWearMultiplierPermille/1000),tyreEnergyMultiplierPermille:Math.round(input.tyres!.tyreEnergyMultiplierPermille*pace.tyreEnergyMultiplierPermille/1000)};
 // Mechanics use only numeric profiles; timeline/initial are not consulted by these functions.
 const numeric=c;
 function cost(initial:TyreState){let t=initial,w=weather,total=0;for(let n=1;n<=horizon;n++){w=evolveWeather(w,forecastRain(c,lap+n+1,w.rainfallIntensity),w.airTemperatureMilliC,numeric);const x=tyreContributions(t,tyres.profiles[t.compound]);total+=x.tyreCompoundMs+x.tyreWearMs+x.tyreTemperatureMs+waterPenaltyMs(t.compound,w.trackWater,numeric);t=advanceWeatherTyre(t,tyres,w,numeric);}return total;}
 const oldCost=cost(advanceWeatherTyre(e.stint!.tyre,tyres,weather,numeric));
 const candidates=WEATHER_TYRE_COMPOUNDS.map(compound=>({compound,cost:cost({compound,ageLaps:0,wearPermille:0,temperatureMilliC:input.pits!.newTyreTemperatureMilliC})})).sort((a,b)=>a.cost-b.cost||WEATHER_TYRE_COMPOUNDS.indexOf(a.compound)-WEATHER_TYRE_COMPOUNDS.indexOf(b.compound));
 return oldCost-candidates[0].cost>input.pits!.pitLaneLossMs+input.pits!.stationaryBaseMs+c.strategy.marginMs?candidates[0].compound:null;
}

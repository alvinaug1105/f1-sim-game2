import { commandInput } from "./commands";
import { weatherTyreConfiguration } from "../../src/simulation/race/tyres/profiles";
import { developmentWeather, type WeatherConfiguration, waterPenaltyMs } from "../../src/simulation/race/weather/model";
import { createRace, advanceRaceLap } from "../../src/simulation/race/engine";
import { WEATHER_TYRE_COMPOUNDS, tyreContributions } from "../../src/simulation/race/tyres/model";
import type { RaceSimulationInput } from "../../src/simulation/race/types";
export function weatherInput(count=1,seed=42,totalLaps=58):RaceSimulationInput {
 return {...commandInput(count),seed,totalLaps,tyres:weatherTyreConfiguration(),weather:developmentWeather(seed,totalLaps)};
}
export function constantWeather(rainfall:number,water=0):WeatherConfiguration {
 const c=developmentWeather(42,58);
 return {...c,timeline:[{startLap:1,rainfall,airTemperatureMilliC:22000}],forecast:[{arrivalMinLap:1,arrivalMaxLap:1,rainfallMin:rainfall,rainfallMax:rainfall}],initial:{...c.initial,rainfallIntensity:rainfall,trackWater:water,drsState:water>=c.drsDisableWater?"DRS_DISABLED_WET":"DRS_ENABLED"}};
}
export function crossoverMeasurements() {
 const i=weatherInput(),c=i.weather!;
 return [0,100,200,300,400,500,600,700,800,900,1000].map(water=>({water,...Object.fromEntries(WEATHER_TYRE_COMPOUNDS.map(compound=>{
  const p=i.tyres!.profiles[compound],t={compound,ageLaps:0,wearPermille:0,temperatureMilliC:Math.round((p.idealTemperatureMinMilliC+p.idealTemperatureMaxMilliC)/2)};
  const x=tyreContributions(t,p);return [compound,x.tyreCompoundMs+x.tyreWearMs+x.tyreTemperatureMs+waterPenaltyMs(compound,water,c)];
 }))}));
}
export function weatherScenario(configuration:WeatherConfiguration,compound:"MEDIUM"|"WET"="MEDIUM") {
 const i=weatherInput();let s=createRace({...i,weather:configuration,entrants:i.entrants.map(e=>({...e,strategyController:"DEVELOPMENT_AI",startingTyre:{...e.startingTyre!,compound}}))});
 const checkpoints=[];
 while(s.status==="RUNNING"){s=advanceRaceLap(s);checkpoints.push({lap:s.lap,rain:s.weather!.rainfallIntensity,water:s.weather!.trackWater,drs:s.weather!.drsState,compound:s.entrants[0].stint!.tyre.compound});}
 return {state:s,checkpoints,stops:s.entrants[0].pit!.stops};
}

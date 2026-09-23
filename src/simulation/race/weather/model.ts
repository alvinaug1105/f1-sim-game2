import { createSeededRandom } from "../../core/random";
import { advanceTyre, type TyreConfiguration, type TyreState, type TyreCompound } from "../tyres/model";
export interface WeatherSegment { startLap: number; rainfall: number; airTemperatureMilliC: number }
export interface ForecastWindow { arrivalMinLap: number; arrivalMaxLap: number; rainfallMin: number; rainfallMax: number }
export interface WeatherState { rainfallIntensity: number; airTemperatureMilliC: number; trackTemperatureMilliC: number; trackWater: number; drsState: "DRS_ENABLED" | "DRS_DISABLED_WET" }
export interface WaterProfile { centre: number; basePenaltyMs: number; curveMs: number; dryWearMultiplierPermille: number; wetTargetMilliC: number; dryTargetMilliC: number }
export interface WeatherConfiguration {
 version: 1; timeline: readonly WeatherSegment[]; forecast: readonly ForecastWindow[];
 initial: WeatherState;
 circuit: { accumulationPermille: number; drainagePerLap: number; dryingPerLap: number; wetGripSensitivityPermille: number };
 drsDisableWater: number; drsEnableWater: number;
 forecastAccuracy: { lapUncertainty: number; intensityUncertainty: number };
 strategy: { horizonLaps: number; minimumStintLaps: number; marginMs: number };
 waterProfiles: Readonly<Record<TyreCompound, WaterProfile>>;
}
export function developmentWeather(seed: number, totalLaps: number, accuracy = { lapUncertainty: 2, intensityUncertainty: 150 }): WeatherConfiguration {
 integer(accuracy.lapUncertainty,0,10); integer(accuracy.intensityUncertainty,0,500);
 const rng=createSeededRandom((seed ^ 0xa71e39bd) >>> 0);
 const shift=Math.floor(rng.next()*3)-1;
 const starts=[1,Math.max(2,Math.round(totalLaps*0.16)+shift),Math.max(3,Math.round(totalLaps*0.33)),Math.max(4,Math.round(totalLaps*0.48)),Math.max(5,Math.round(totalLaps*0.55))];
 const rain=[0,450+Math.floor(rng.next()*41)-20,1000,200,0];
 const timeline=starts.map((startLap,n)=>({startLap,rainfall:rain[n],airTemperatureMilliC:n===0||n===4?24000:19000})).filter((s,n,a)=>s.startLap<=totalLaps&&(n===0||s.startLap>a[n-1].startLap));
 const forecast=timeline.map(s=>{const spread=Math.min(1,accuracy.lapUncertainty),error=Math.floor(rng.next()*(spread*2+1))-spread;return {arrivalMinLap:Math.max(1,s.startLap+error-accuracy.lapUncertainty),arrivalMaxLap:Math.max(1,s.startLap+error+accuracy.lapUncertainty),rainfallMin:Math.max(0,s.rainfall-accuracy.intensityUncertainty),rainfallMax:Math.min(1000,s.rainfall+accuracy.intensityUncertainty)};});
 const dry:WaterProfile={centre:0,basePenaltyMs:0,curveMs:28000,dryWearMultiplierPermille:1000,wetTargetMilliC:80000,dryTargetMilliC:98000};
 return {version:1,timeline,forecast,initial:{rainfallIntensity:0,airTemperatureMilliC:24000,trackTemperatureMilliC:34000,trackWater:0,drsState:"DRS_ENABLED"},circuit:{accumulationPermille:180,drainagePerLap:20,dryingPerLap:45,wetGripSensitivityPermille:1000},drsDisableWater:300,drsEnableWater:180,forecastAccuracy:{...accuracy},strategy:{horizonLaps:10,minimumStintLaps:3,marginMs:1500},waterProfiles:{SOFT:{...dry},MEDIUM:{...dry},HARD:{...dry},INTERMEDIATE:{centre:400,basePenaltyMs:1000,curveMs:10000,dryWearMultiplierPermille:2500,wetTargetMilliC:76000,dryTargetMilliC:115000},WET:{centre:850,basePenaltyMs:1600,curveMs:18000,dryWearMultiplierPermille:4000,wetTargetMilliC:66000,dryTargetMilliC:125000}}};
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
function integer(n:number,min:number,max:number){if(!Number.isSafeInteger(n)||n<min||n>max)throw new RangeError("Invalid weather value");}
export function validateWeatherState(s:WeatherState){integer(s.rainfallIntensity,0,1000);integer(s.trackWater,0,1000);integer(s.airTemperatureMilliC,-20000,60000);integer(s.trackTemperatureMilliC,-20000,80000);if(!["DRS_ENABLED","DRS_DISABLED_WET"].includes(s.drsState))throw new RangeError("Invalid DRS weather state");}
export function validateWeatherConfiguration(c:WeatherConfiguration,totalLaps:number){
 if(c.version!==1||c.timeline.length<1||c.timeline[0].startLap!==1)throw new RangeError("Invalid weather timeline");
 validateWeatherState(c.initial);let previous=0;
 for(const s of c.timeline){integer(s.startLap,previous+1,totalLaps);previous=s.startLap;integer(s.rainfall,0,1000);integer(s.airTemperatureMilliC,-20000,60000);}
 integer(c.circuit.accumulationPermille,0,1000);integer(c.circuit.drainagePerLap,0,200);integer(c.circuit.dryingPerLap,0,200);integer(c.circuit.wetGripSensitivityPermille,250,3000);
 integer(c.drsEnableWater,0,999);integer(c.drsDisableWater,c.drsEnableWater+1,1000);
 integer(c.strategy.horizonLaps,1,30);integer(c.strategy.minimumStintLaps,1,20);integer(c.strategy.marginMs,0,10000);
 integer(c.forecastAccuracy.lapUncertainty,0,10);integer(c.forecastAccuracy.intensityUncertainty,0,500);
 if(c.forecast.length!==c.timeline.length)throw new RangeError("Missing forecast");
 for(const f of c.forecast){integer(f.arrivalMinLap,1,totalLaps+10);integer(f.arrivalMaxLap,f.arrivalMinLap,totalLaps+10);integer(f.rainfallMin,0,1000);integer(f.rainfallMax,f.rainfallMin,1000);}
 for(const compound of ["SOFT","MEDIUM","HARD","INTERMEDIATE","WET"] as const){const p=c.waterProfiles[compound];integer(p.centre,0,1000);integer(p.basePenaltyMs,0,10000);integer(p.curveMs,0,60000);integer(p.dryWearMultiplierPermille,1000,6000);integer(p.wetTargetMilliC,0,160000);integer(p.dryTargetMilliC,0,160000);}
}
/** One whole-lap integration; no instantaneous wet/dry transition. */
export function evolveWeather(previous:WeatherState,rainfall:number,air:number,c:Pick<WeatherConfiguration,"circuit"|"drsDisableWater"|"drsEnableWater">):WeatherState{
 const target=air+Math.round(10000*(1000-rainfall)/1000);
 const trackTemperatureMilliC=previous.trackTemperatureMilliC+Math.round((target-previous.trackTemperatureMilliC)/4);
 const addition=Math.round(rainfall*c.circuit.accumulationPermille/1000);
 const drying=Math.round(c.circuit.dryingPerLap*(1000-rainfall)/1000*clamp(trackTemperatureMilliC,10000,60000)/30000);
 const trackWater=clamp(previous.trackWater+addition-c.circuit.drainagePerLap-drying,0,1000);
 const drsState=trackWater>=c.drsDisableWater?"DRS_DISABLED_WET":trackWater<=c.drsEnableWater?"DRS_ENABLED":previous.drsState;
 return {rainfallIntensity:rainfall,airTemperatureMilliC:air,trackTemperatureMilliC,trackWater,drsState};
}
export function advanceWeather(previous:WeatherState,c:WeatherConfiguration,lap:number){validateWeatherState(previous);const segment=[...c.timeline].reverse().find(s=>s.startLap<=lap)!;return evolveWeather(previous,segment.rainfall,segment.airTemperatureMilliC,c);}
export function waterPenaltyMs(compound:TyreCompound,water:number,c:Pick<WeatherConfiguration,"waterProfiles"|"circuit">){const p=c.waterProfiles[compound];return Math.round((p.basePenaltyMs+p.curveMs*((water-p.centre)/1000)**2)*c.circuit.wetGripSensitivityPermille/1000);}
/** Existing thermal response and pace multipliers remain active; weather changes target and wear inputs. */
export function advanceWeatherTyre(tyre:TyreState,tyres:TyreConfiguration,weather:WeatherState,c:Pick<WeatherConfiguration,"waterProfiles">){
 const p=c.waterProfiles[tyre.compound],dryFraction=(1000-weather.trackWater)/1000;
 const wear=Math.round(1000+(p.dryWearMultiplierPermille-1000)*dryFraction*dryFraction);
 const original=tyres.profiles[tyre.compound];
 const target=Math.round(p.wetTargetMilliC+(p.dryTargetMilliC-p.wetTargetMilliC)*dryFraction+(weather.trackTemperatureMilliC-30000)/4);
 return advanceTyre(tyre,{...tyres,tyreWearMultiplierPermille:Math.round(tyres.tyreWearMultiplierPermille*wear/1000),profiles:{...tyres.profiles,[tyre.compound]:{...original,targetTemperatureMilliC:clamp(target,0,160000)}}});
}
/** Shared approximate forecast; never returns or aliases truth segments. */
export function forecastAt(c:Pick<WeatherConfiguration,"forecast">,lap:number):readonly ForecastWindow[]{return structuredClone(c.forecast.filter(f=>f.arrivalMaxLap>=lap));}
export function forecastRain(c:Pick<WeatherConfiguration,"forecast">,lap:number,currentRain:number){let rain=currentRain;for(const f of c.forecast)if(Math.round((f.arrivalMinLap+f.arrivalMaxLap)/2)<=lap)rain=Math.round((f.rainfallMin+f.rainfallMax)/2);return rain;}

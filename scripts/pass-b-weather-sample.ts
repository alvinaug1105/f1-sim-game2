/** Builder-only deterministic occurrence sample. No Racecraft/balance campaign or simulated finishing outcomes. */
import { writeFileSync } from 'node:fs';
import { developmentContent as source } from '../src/data/seed/content-development';
import { careerRaceWeather } from '../src/features/race/weather-scenarios';
import { forecastItems } from '../src/features/race/forecast-copy';
import { evolveWeather, type WeatherConfiguration } from '../src/simulation/race/weather/model';
import { familyCostsMs } from '../src/simulation/race/tyres/suitability';
import { weatherTyreConfiguration } from '../src/simulation/race/tyres/profiles';
import { defaultPitConfiguration } from '../src/simulation/race/pits/profiles';
const tyres = weatherTyreConfiguration(), pit = defaultPitConfiguration();
function measure(c: WeatherConfiguration, laps: number) {
  let weather = c.initial, interGain = 0, wetGain = 0;
  const bestFamilies = new Set<string>();
  for (let lap = 1; lap <= laps; lap++) {
    const segment = [...c.timeline].reverse().find(s => s.startLap <= lap)!;
    weather = evolveWeather(weather, segment.rainfall, segment.airTemperatureMilliC, c);
    const costs = familyCostsMs(weather, tyres, c);
    const best = (Object.keys(costs) as (keyof typeof costs)[]).sort((a,b)=>costs[a]! - costs[b]!)[0];
    bestFamilies.add(best);
    if (best === 'INTERMEDIATE') interGain += costs.DRY! - costs.INTERMEDIATE!;
    if (best === 'WET') wetGain += costs.INTERMEDIATE! - costs.WET!;
  }
  const stop = pit.pitLaneLossMs + pit.stationaryBaseMs + c.strategy.marginMs;
  return { dry: c.timeline.every(s => s.rainfall === 0), forecastRain: forecastItems(c.forecast,c.initial.rainfallIntensity).length > 0,
    inter: interGain > stop, wet: wetGain > stop, mixed: bestFamilies.size > 1 && (interGain > stop || wetGain > stop) };
}
const seasons = Array.from({length:40},(_,n)=>source.events.map(e=> {
  const circuit = source.circuits.find(c=>c.id===e.circuitId)!;
  return { season:n+1, round:e.round, profile:circuit.climateProfile,
    ...measure(careerRaceWeather(`pass-b-season-${n+1}`,e.id,circuit.id,circuit.defaultLapCount,'RACE',circuit.climateProfile),circuit.defaultLapCount) };
}));
const rows=seasons.flat();
function aggregate(r: typeof rows) { return { count:r.length,...Object.fromEntries(['dry','forecastRain','inter','wet','mixed'].map(k=>[k+'Percent',Math.round(10000*r.filter(x=>x[k as 'dry']).length/r.length)/100])) }; }
const counts=seasons.map(s=>s.filter(r=>r.forecastRain).length).sort((a,b)=>a-b);
const output={ definitions:{dry:'No actual rain in the generated timeline.',forecastRain:'Existing player-public forecastItems announces rain; no truth used for visibility.',inter:'Idealized current-family gain over DRY during INTER-fastest laps repays one default green stop + margin.',wet:'Idealized current-family gain over INTER during WET-fastest laps repays one default green stop + margin.',mixed:'Multiple fastest families and a materially useful wet-family plan. Proxy, not an optimized tyre strategy or QA balance verdict.'},
  seasons:40,overall:aggregate(rows),seasonLevel:{meanRainVisible:counts.reduce((a,b)=>a+b,0)/40,medianRainVisible:(counts[19]+counts[20])/2,minRainVisible:counts[0],maxRainVisible:counts[39],meanStrategicallyWet:seasons.reduce((a,s)=>a+s.filter(r=>r.inter||r.wet).length,0)/40},
  profiles:Object.fromEntries([...new Set(rows.map(r=>r.profile))].map(p=>[p,aggregate(rows.filter(r=>r.profile===p))])),rows};
writeFileSync('docs/verification/pass-b-weather.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({...output,rows:undefined},null,2));

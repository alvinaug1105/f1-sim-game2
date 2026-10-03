import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const repo = resolve(process.env.RACE_QA_REPO || process.cwd());
const fromRepo = (path) => import(pathToFileURL(resolve(repo, path)).href);
const [{ developmentContent }, race, profiles, progression, tuning, weatherModel, weatherScenarios, ai, tyres, incidents, interaction, commandModel, racecraftModel] = await Promise.all([
  fromRepo("src/data/seed/content-development.ts"),
  fromRepo("src/simulation/race/engine.ts"),
  fromRepo("src/features/race/development-profiles.ts"),
  fromRepo("src/data/seed/circuit-progression.ts"),
  fromRepo("src/features/race/v8d-tuning.ts"),
  fromRepo("src/simulation/race/weather/model.ts"),
  fromRepo("src/features/race/weather-scenarios.ts"),
  fromRepo("src/simulation/race/pits/ai-strategy.ts"),
  fromRepo("src/simulation/race/tyres/profiles.ts"),
  fromRepo("src/simulation/race/incidents/model.ts"),
  fromRepo("src/simulation/race/traffic/profiles.ts"),
  fromRepo("src/simulation/race/commands/model.ts"),
  fromRepo("src/simulation/race/traffic/racecraft.ts"),
]);
const importOnly = process.env.RACE_QA_IMPORT_ONLY === "1";
const inputFile = process.argv[2], outDir = process.argv[3], workerId = Number(process.argv[4]);
if (!importOnly && (!inputFile || !outDir || !Number.isInteger(workerId))) throw new Error("worker arguments missing");
const circuits = new Map(developmentContent.circuits.map(c => [c.id, c]));
const drivers = developmentContent.driverEntries;
const teams = new Map(developmentContent.teamEntries.map(t => [t.teamId, t]));
const profileByKey = new Map(developmentContent.circuits.map(c => [c.key, c]));
const { createRace, advanceRace, raceResult } = race;
const { developmentBaseLapTimeMs, developmentCommandFuelKg, sprintLapCount } = profiles;
const { DEFAULT_RACE_PARAMETERS } = race;
const { progressionDForCircuit } = progression;
const { v8dTuningBundle } = tuning;
const { climateWeather, scenarioWeather, aiStartingCompound } = weatherScenarios;
const { aiDryStartingCompound, aiWetStartingCompound, publicWeather, strategyPreference } = ai;
const { startingTyre } = tyres;
const { defaultIncidentConfiguration, defaultReliability } = incidents;
const { developmentDriverInteraction } = interaction;
const { defaultCommandConfiguration } = commandModel;
const { lateRaceAttackWindow } = racecraftModel;
const { requestPitStop } = await fromRepo("src/simulation/race/pits/model.ts");

const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
};
const hash = value => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
function customWeather(seed, laps, kind) {
  const base = weatherModel.developmentWeather(seed, laps);
  const at = x => Math.max(1, Math.min(laps, Math.round(1 + x * (laps - 1))));
  let points;
  if (kind === "DAMP") points = [[0, 0], [.02, 0]];
  else if (kind === "DRYING") points = [[0, 900], [.32, 700], [.62, 180], [.82, 0]];
  else if (kind === "EARLY_RAIN") points = [[0, 0], [.12, 780], [.36, 600], [.6, 120], [.82, 0]];
  else if (kind === "LATE_RAIN") points = [[0, 0], [.68, 0], [.76, 720], [.91, 300]];
  else if (kind === "MULTI_TRANSITION") points = [[0, 0], [.16, 420], [.31, 0], [.47, 880], [.7, 240], [.87, 0]];
  else return scenarioWeather(seed, laps, kind);
  const timeline = points.map(([fraction, rainfall]) => ({ startLap: at(fraction), rainfall, airTemperatureMilliC: rainfall > 0 ? 19000 : 24000 }))
    .filter((s, i, a) => i === 0 || s.startLap > a[i - 1].startLap);
  const forecast = timeline.map(s => ({ arrivalMinLap: Math.max(1, s.startLap - 2), arrivalMaxLap: Math.min(laps, s.startLap + 2), rainfallMin: Math.max(0, s.rainfall - 150), rainfallMax: Math.min(1000, s.rainfall + 150) }));
  const first = timeline[0], wet = first.rainfall >= 500;
  return { ...base, timeline, forecast, initial: { rainfallIntensity: first.rainfall, airTemperatureMilliC: first.airTemperatureMilliC, trackTemperatureMilliC: first.airTemperatureMilliC + (wet ? 2000 : 10000), trackWater: wet ? Math.min(1000, first.rainfall) : kind === "DAMP" ? 250 : 0, drsState: wet ? "DRS_DISABLED_WET" : "DRS_ENABLED" } };
}
function buildInput(job) {
  const c = circuits.get(job.circuitId);
  if (!c) throw new Error(`unknown circuit ${job.circuitId}`);
  const laps = job.sessionKind === "SPRINT" ? sprintLapCount(c.lengthMeters) : c.defaultLapCount;
  const progression = progressionDForCircuit(c.id, job.sessionKind === "SPRINT" ? "SPRINT" : "RACE");
  const baseLapTimeMs = developmentBaseLapTimeMs(c.lengthMeters);
  const fuelBurnPerLapKg = Math.round(c.lengthMeters / 1000 * .3 * 1000) / 1000;
  const initialFuelKg = developmentCommandFuelKg(Math.round(fuelBurnPerLapKg * laps * 1000) / 1000);
  const raceProfile = { overtakingDifficulty:c.overtakingDifficulty, dirtyAirSensitivityPermille:c.dirtyAirSensitivityPermille, drsEffectivenessPermille:c.drsEffectivenessPermille };
  const bundle = v8dTuningBundle(progression, baseLapTimeMs, true, raceProfile);
  const weather = job.weatherKind && job.weatherKind !== "CLIMATE" ? customWeather(job.raceSeed, laps, job.weatherKind) : climateWeather(job.raceSeed, laps, c.climateProfile);
  const incidentsCfg = { ...defaultIncidentConfiguration(), pitTrackSectionMs: bundle.pitTiming.pitTrackSectionMs, ...(job.incidentProfile?.overrides ?? {}) };
  const p = defaultCommandConfiguration();
  const commands = { ...p, racecraft: bundle.racecraft };
  const roster = drivers.map((d, i) => {
    const team = teams.get(d.teamId);
    if (!team) throw new Error(`missing team entry for ${d.driverId}`);
    const preference = strategyPreference(job.raceSeed, i + 1);
    const proposed = aiStartingCompound(weather.initial);
    const compound = proposed === "MEDIUM" ? aiDryStartingCompound(preference) : aiWetStartingCompound(proposed, weather.initial, bundle.tyres, publicWeather(weather), bundle.strategy, preference);
    const isPlayer = job.campaign === "C" && i + 1 === 10;
    return {
      entrantId: `qa-v8-${String(i + 1).padStart(2, "0")}`,
      driverId: d.driverId,
      teamId: d.teamId,
      gridPosition: i + 1,
      driver: { pace: d.pace, consistency: d.consistency },
      car: { performance: team.carPerformance },
      startingTyre: startingTyre(compound),
      reliability: { ...defaultReliability(), ...(job.incidentProfile?.reliability ?? {}) },
      strategyController: isPlayer ? "PLAYER" : "DEVELOPMENT_AI",
      interaction: developmentDriverInteraction(),
    };
  });
  const incidentsInput = { ...incidentsCfg };
  return {
    seed: job.raceSeed, totalLaps: laps,
    circuit: { baseLapTimeMs, fuelEffectMsPerKg: 30 },
    initialFuelKg, fuelBurnPerLapKg,
    parameters: { ...DEFAULT_RACE_PARAMETERS },
    entrants: roster,
    progression,
    incidents: incidentsInput,
    weather,
    commands,
    tyres: bundle.tyres,
    pits: { ...awaitableDefaultPits(), pitLaneLossMs: bundle.pitTiming.pitLaneLossMs, strategy: bundle.strategy },
    interaction: bundle.interaction,
  };
}
function awaitableDefaultPits() {
  // A synchronous default profile; loaded once through the cached dynamic module below.
  return pitDefaults();
}
const { defaultPitConfiguration: pitDefaults } = await fromRepo("src/simulation/race/pits/profiles.ts");
function applyIntent(state, entrantId, key, value) {
  const e = state.entrants.find(x => x.entrantId === entrantId);
  const entrant = state.input.entrants.find(x => x.entrantId === entrantId);
  if (!e || !entrant || entrant.strategyController !== "PLAYER") throw new Error("reference player missing");
  const commands = { ...e.commands, commandRevision: e.commands.commandRevision + 1 };
  let progression = state.progression;
  if (key === "paceMode" || key === "fuelMode") commands[key] = value;
  else {
    const car = progression.cars[entrantId];
    progression = { ...progression, cars: { ...progression.cars, [entrantId]: { ...car, assistance: { ...car.assistance, policy: value } } } };
  }
  return { ...state, progression, entrants: state.entrants.map(x => x.entrantId === entrantId ? { ...x, commands } : x) };
}
function setModes(state, id, modes) {
  for (const key of ["paceMode", "fuelMode", "energyPolicy"]) if (modes[key] !== undefined) {
    const current = key === "energyPolicy" ? state.progression.cars[id].assistance.policy : state.entrants.find(e => e.entrantId === id).commands[key];
    if (current !== modes[key]) state = applyIntent(state, id, key, modes[key]);
  }
  return state;
}
const patterns = seedIndex => {
  const k = (seedIndex - 1) % 10;
  if (k === 0) return [{ paceMode:"CONSERVE",fuelMode:"CONSERVE",energyPolicy:"RECHARGE" },{ paceMode:"STANDARD",fuelMode:"BALANCED",energyPolicy:"BALANCED" },{ paceMode:"ATTACK",fuelMode:"PUSH",energyPolicy:"BOOST" }];
  if (k === 1) return [{ paceMode:"ATTACK",fuelMode:"PUSH",energyPolicy:"BOOST" },{ paceMode:"STANDARD",fuelMode:"BALANCED",energyPolicy:"BALANCED" },{ paceMode:"CONSERVE",fuelMode:"CONSERVE",energyPolicy:"RECHARGE" }];
  if (k === 2) return [{ energyPolicy:"BOOST" },{ energyPolicy:"RECHARGE" },{ energyPolicy:"BOOST" }];
  if (k === 3) return [{ energyPolicy:"RECHARGE" },{ energyPolicy:"BOOST" },{ energyPolicy:"RECHARGE" }];
  if (k === 4) return [{ energyPolicy:"BALANCED" },{ energyPolicy:"BOOST" },{ energyPolicy:"BALANCED" }];
  if (k === 5) return [{ fuelMode:"PUSH" },{ fuelMode:"CONSERVE" },{ fuelMode:"PUSH" }];
  if (k === 6) return [{ fuelMode:"CONSERVE" },{ fuelMode:"PUSH" },{ fuelMode:"CONSERVE" }];
  if (k === 7) return [{ paceMode:"ATTACK" },{ paceMode:"CONSERVE" },{ paceMode:"ATTACK" }];
  if (k === 8) return [{ paceMode:"ATTACK",fuelMode:"PUSH",energyPolicy:"BOOST" },{ paceMode:"CONSERVE",fuelMode:"CONSERVE",energyPolicy:"RECHARGE" },{ paceMode:"ATTACK",fuelMode:"PUSH",energyPolicy:"BOOST" }];
  return [{ paceMode:"CONSERVE",fuelMode:"CONSERVE",energyPolicy:"RECHARGE" },{ paceMode:"PUSH",fuelMode:"PUSH",energyPolicy:"BOOST" },{ paceMode:"ATTACK",fuelMode:"CONSERVE",energyPolicy:"BALANCED" }];
};
function runRace(job) {
  const input = buildInput(job);
  if (input.entrants.length !== 22) throw new Error("wrong field size");
  const s0 = createRace(input);
  if (s0.input.progression?.version !== 4 || s0.simulationVersion !== 8) throw new Error("wrong revision contract");
  const player = job.campaign === "C" ? s0.input.entrants.find(e => e.gridPosition === 10) : null;
  let s = s0;
  const passAttemptsById = Object.fromEntries(s0.entrants.map(e => [e.entrantId, 0]));
  let passAttempts = 0, earlyPassAttempts = 0, latePassAttempts = 0, earlyPasses = 0, latePasses = 0, drsEligibleObservations = 0, drsBenefitObservations = 0, drsBenefitMsTotal = 0, nearFloorSamples = 0, exactFloorSamples = 0, longestPairRun = 0;
  let currentPairRuns = new Map(), maxWearById = Object.fromEntries(s0.entrants.map(e => [e.entrantId, 0]));
  let deepCliffLaps = 0, pitRouteErrors = 0, numericErrors = 0, fuelCreationChecks = 0, fuelCreation = 0;
  const attemptCause = new Map();
  const attemptsById = Object.fromEntries(s0.entrants.map(e => [e.entrantId, []]));
  const lapTelemetryById = Object.fromEntries(s0.entrants.map(e => [e.entrantId, []]));
  const commandSchedule = [];
  const lateSchedules = job.planKind === "PHASE" ? patterns(job.seedIndex) : null;
  const transitionLaps = lateSchedules ? [Math.max(1,Math.floor(input.totalLaps*.25)),Math.max(1,Math.floor(input.totalLaps*.5)),Math.max(1,Math.floor(input.totalLaps*.75))] : [];
  const playerId = player?.entrantId;
  const startCompound = playerId ? s.entrants.find(e=>e.entrantId===playerId).stint?.tyre.compound : null;
  const pitCompound = startCompound === "HARD" ? "MEDIUM" : "HARD";
  const playerPitLap = Math.max(2,Math.floor(input.totalLaps*.5));
  if (playerId) {
    s = setModes(s, playerId, { paceMode:job.paceMode, fuelMode:job.fuelMode, energyPolicy:job.energyPolicy });
    const e=s.entrants.find(x=>x.entrantId===playerId); commandSchedule.push({lap:0,paceMode:e.commands.paceMode,fuelMode:e.commands.fuelMode,energyPolicy:s.progression.cars[playerId].assistance.policy});
  }
  let scheduleCursor = 0;
  while (s.status === "RUNNING") {
    const upcomingLap = s.lap + 1;
    if (lateSchedules && scheduleCursor < transitionLaps.length && s.lap === transitionLaps[scheduleCursor]) {
      s = setModes(s, playerId, lateSchedules[scheduleCursor]);
      const e=s.entrants.find(x=>x.entrantId===playerId); commandSchedule.push({lap:s.lap,paceMode:e.commands.paceMode,fuelMode:e.commands.fuelMode,energyPolicy:s.progression.cars[playerId].assistance.policy});
      scheduleCursor++;
    }
    if (playerId && upcomingLap === playerPitLap) {
      const e=s.entrants.find(x=>x.entrantId===playerId);
      if (e?.incident?.status === "RUNNING" && e.pit?.pendingCompound !== pitCompound) s=requestPitStop(s,playerId,pitCompound);
    }
    const before = s;
    s = advanceRace(s, 1);
    const beforeEventCount = before.incidents?.events.length ?? 0;
    for (const ev of (s.incidents?.events ?? []).slice(beforeEventCount).filter(x => x.type === "OVERTAKE")) {
      const attacker = before.entrants.find(x => x.entrantId === ev.entrantIds[0]);
      const late = Boolean(attacker && lateRaceAttackWindow(s.input.commands?.racecraft, s.input.interaction, attacker.completedLaps, input.totalLaps)?.late);
      if (late) latePasses++; else earlyPasses++;
    }
    const beforeById = new Map(before.entrants.map(e=>[e.entrantId,e]));
    for (const e of s.entrants) {
      const b = beforeById.get(e.entrantId);
      const late = Boolean(lateRaceAttackWindow(s.input.commands?.racecraft, s.input.interaction, b?.completedLaps ?? e.completedLaps, input.totalLaps)?.late);
      if (e.track?.attempted) { passAttempts++; passAttemptsById[e.entrantId]++; attemptsById[e.entrantId].push({leaderLap:s.lap,attackerCompletedLaps:b?.completedLaps??e.completedLaps,late}); if (late) latePassAttempts++; else earlyPassAttempts++; if (!e.track.passed) attemptCause.set(e.entrantId,(attemptCause.get(e.entrantId)||0)+1); }
      if (b && e.completedLaps > b.completedLaps) {
        const car=s.progression.cars[e.entrantId], lapCommand=car.lapCommands??b.commands;
        lapTelemetryById[e.entrantId].push({lap:e.completedLaps,lapTimeMs:e.lastLapTimeMs,fuelKg:e.fuelMassKg,paceMode:lapCommand?.paceMode??null,fuelMode:lapCommand?.fuelMode??null,energyPolicy:car.assistance?.policy??null,energy:car.assistance?.energy??null,tyreCompound:e.stint?.tyre?.compound??null,tyreAgeLaps:e.stint?.tyre?.ageLaps??null,tyreWearPermille:e.stint?.tyre?.wearPermille??null,tyreTemperatureMilliC:e.stint?.tyre?.temperatureMilliC??null});
      }
      if (e.track?.drsEligible) drsEligibleObservations++;
      if ((e.track?.drsBenefitMs ?? 0) !== 0) { drsBenefitObservations++; drsBenefitMsTotal += e.track.drsBenefitMs; }
      if (Number.isFinite(e.stint?.tyre?.wearPermille)) maxWearById[e.entrantId]=Math.max(maxWearById[e.entrantId],e.stint.tyre.wearPermille);
      if (![e.elapsedTimeMs,e.fuelMassKg,e.track?.progressMicrolaps,e.stint?.tyre?.wearPermille,e.stint?.tyre?.temperatureMilliC].every(Number.isFinite) || e.elapsedTimeMs < 0 || e.fuelMassKg < 0 || e.track.progressMicrolaps < 0 || e.track.progressMicrolaps > input.totalLaps * 1000000 || e.stint.tyre.wearPermille < 0) numericErrors++;
      if (b && e.fuelMassKg > b.fuelMassKg + 0.000001) { fuelCreation++; }
      fuelCreationChecks++;
      const energy=e.entrantId && s.progression?.cars[e.entrantId]?.assistance;
      const cap=input.progression.assistance.capacity;
      if (!Number.isSafeInteger(energy?.energy)||energy.energy<0||energy.energy>cap||!Number.isSafeInteger(energy?.deploymentRemainder)||energy.deploymentRemainder<0||energy.deploymentRemainder>999||!Number.isSafeInteger(energy?.recoveryRemainder)||energy.recoveryRemainder<0||energy.recoveryRemainder>999) numericErrors++;
      const profile=input.tyres.profiles[e.stint?.tyre?.compound];
      if (profile && e.stint.tyre.wearPermille > profile.cliffWear + 100) deepCliffLaps++;
    }
    const present = new Map();
    for (const e of s.entrants) {
      if(e.position<=1||e.intervalToAheadMs==null) continue;
      const ahead=s.entrants.find(x=>x.position===e.position-1);
      if(!ahead||ahead.completedLaps!==e.completedLaps) continue;
      const key=`${ahead.entrantId}:${e.entrantId}`;
      const gap=e.intervalToAheadMs;
      if(gap<=100){nearFloorSamples++;if(gap<=80)exactFloorSamples++;const n=(currentPairRuns.get(key)||0)+1;present.set(key,n);longestPairRun=Math.max(longestPairRun,n);}
    }
    currentPairRuns=present;
  }
  const allowed={TRACK:["ENTRY"],ENTRY:["LANE"],LANE:["SERVICE","EXIT"],SERVICE:["LANE"],EXIT:["TRACK"]};
  for (const car of Object.values(s.progression.cars)) if(car.observations?.length) for(let i=1;i<car.observations.length;i++) if(car.observations[i].route!==car.observations[i-1].route&&!allowed[car.observations[i-1].route]?.includes(car.observations[i].route)) pitRouteErrors++;
  const results = raceResult(s);
  const events=s.incidents?.events ?? [];
  const control=events.reduce((a,e)=>{a[e.type]=(a[e.type]||0)+1;return a;},{});
  const entrants=s.entrants.map(e=>{
    const source=input.entrants.find(x=>x.entrantId===e.entrantId);
    const profile=input.tyres.profiles[e.stint.tyre.compound];
    return {
      entrantId:e.entrantId,driverId:e.driverId,teamId:e.teamId,gridPosition:source.gridPosition,startingTyre:source.startingTyre.compound,
      position:e.position,roadPosition:results.find(x=>x.entrantId===e.entrantId)?.roadPosition ?? null,
      status:e.incident.status,completedLaps:e.completedLaps,totalTimeMs:e.elapsedTimeMs,bestLapTimeMs:e.bestLapTimeMs,
      fuelStartKg:input.initialFuelKg,fuelEndKg:e.fuelMassKg,fuelUsedKg:Math.round((input.initialFuelKg-e.fuelMassKg)*1000)/1000,
      starved:events.some(x=>x.entrantIds.includes(e.entrantId)&&x.kind==="FUEL_STARVATION"),
      tyreCompound:e.stint.tyre.compound,tyreAgeLaps:e.stint.tyre.ageLaps,tyreWearPermille:e.stint.tyre.wearPermille,
      maxTyreWearPermille:maxWearById[e.entrantId],tyreCliffWear:profile.cliffWear,
      pits:e.pit?.stops?.length ?? 0,pitStops:e.pit?.stops??[],stints:e.pit?.stints?.map(x=>({number:x.number,startLap:x.startLap,endLap:x.endLap,startingTyre:x.startingTyre.compound,endingTyre:x.endingTyre?.compound??null}))??[],passes:events.filter(x=>x.type==="OVERTAKE"&&x.entrantIds[0]===e.entrantId).length,
      lappingPasses:s.progression.cars[e.entrantId].completedLappingPasses,attempts:passAttemptsById[e.entrantId],
      paceMode:e.commands?.paceMode??null,fuelMode:e.commands?.fuelMode??null,energyEnd:s.progression.cars[e.entrantId].assistance.energy,
      energyPolicy:s.progression.cars[e.entrantId].assistance.policy,
      attemptedLaps:attemptsById[e.entrantId],lapTelemetry:lapTelemetryById[e.entrantId],
      routeTransitions:s.progression.cars[e.entrantId].observations??[],
      disqualified:results.find(x=>x.entrantId===e.entrantId)?.disqualified ?? false,
    };
  });
  const positions=entrants.map(e=>e.position);
  const classificationOk=positions.length===22&&new Set(positions).size===22&&positions.every((p,i)=>p===i+1)&&results.length===22;
  const digest=hash({status:s.status,lap:s.lap,results,entrants:s.entrants,progression:s.progression,incidents:s.incidents,weather:s.weather,rngState:s.rngState});
  return {
    scenarioId:job.scenarioId,campaign:job.campaign,sessionKind:job.sessionKind,circuitId:job.circuitId,circuitName:job.circuitName,
    seedIndex:job.seedIndex,raceSeed:job.raceSeed,configurationHash:job.configurationHash,productionSHA:job.productionSHA,testedSHA:job.testedSHA,qaShardId:job.qaShardId,
    totalLaps:input.totalLaps,entrantCount:s.entrants.length,status:s.status,revision:s.input.progression.version,simulationVersion:s.simulationVersion,
    winner:results[0]?.entrantId??null,finishPositions:entrants.map(e=>e.position),classified:classificationOk,
    raceTimeMs:Math.max(...entrants.map(e=>e.totalTimeMs)),passAttempts,earlyPassAttempts,latePassAttempts,earlyPasses,latePasses,passes:events.filter(e=>e.type==="OVERTAKE").length,
    drsEligibleObservations,drsBenefitObservations,drsBenefitMsTotal,drsPasses:events.filter(e=>e.type==="OVERTAKE"&&e.cause==="DRS").length,
    commandSchedule,initialWeather:input.weather?.initial??null,weatherTimeline:input.weather?.timeline??[],weatherForecast:input.weather?.forecast??[],finishWeather:s.weather??null,
    nearFloorSamples,exactFloorSamples,longestSamePairNearFloorRun:longestPairRun,deepCliffLaps,numericErrors,fuelCreation,fuelCreationChecks,pitRouteErrors,
    pitStops:entrants.reduce((n,e)=>n+e.pits,0),incidents:control.INCIDENT||0,
    safetyCarStarts:control.SAFETY_CAR_START||0,vscStarts:control.VSC_START||0,retirements:entrants.filter(e=>e.status==="RETIRED").length,
    dsqs:entrants.filter(e=>e.disqualified).length,eventCounts:control,events,finalDigest:digest,entrants,
  };
}

export { buildInput, runRace };
if (!importOnly) {
const inputPath = process.argv[2];
const outPath = process.argv[3];
const wid = Number(process.argv[4]);
if (!inputPath || !outPath || !Number.isInteger(wid)) throw new Error("missing args");
await import("node:fs/promises").then(async fs=>fs.mkdir(outPath,{recursive:true}));
const output=createWriteStream(`${outPath}/telemetry-worker-${String(wid).padStart(2,"0")}.jsonl.gz`);
const gzip=createGzip({level:6}); gzip.pipe(output);
let completed=0,failed=0,valid=0,totalRuntimeMs=0,totalLaps=0,totalPassAttempts=0,totalEarlyPassAttempts=0,totalLatePassAttempts=0,totalEarlyPasses=0,totalLatePasses=0,totalPasses=0,totalDrsEligibleObservations=0,totalDrsBenefitObservations=0,totalDrsBenefitMsTotal=0,totalDrsPasses=0,totalPitStops=0,totalIncidents=0,totalSc=0,totalVsc=0,totalRetirements=0,totalDsqs=0,totalFuelCreation=0,totalNumeric=0,totalClassErrors=0;
const started=Date.now();
const lines=createInterface({input:createReadStream(inputPath),crlfDelay:Infinity});
for await (const line of lines) {
  if (!line) continue;
  const job=JSON.parse(line), t=performance.now();
  try {
    const row=runRace(job);
    row.wallMs=Math.round(performance.now()-t);
    row.validFullRace=row.status==="FINISHED"&&row.entrantCount===22&&row.revision===4&&row.simulationVersion===8&&row.totalLaps>0;
    if (!row.validFullRace) failed++;
    else {
      valid++;totalRuntimeMs+=row.wallMs;totalLaps+=row.totalLaps;totalPassAttempts+=row.passAttempts;totalEarlyPassAttempts+=row.earlyPassAttempts;totalLatePassAttempts+=row.latePassAttempts;totalEarlyPasses+=row.earlyPasses;totalLatePasses+=row.latePasses;totalPasses+=row.passes;totalDrsEligibleObservations+=row.drsEligibleObservations;totalDrsBenefitObservations+=row.drsBenefitObservations;totalDrsBenefitMsTotal+=row.drsBenefitMsTotal;totalDrsPasses+=row.drsPasses;totalPitStops+=row.pitStops;totalIncidents+=row.incidents;totalSc+=row.safetyCarStarts;totalVsc+=row.vscStarts;totalRetirements+=row.retirements;totalDsqs+=row.dsqs;totalFuelCreation+=row.fuelCreation;totalNumeric+=row.numericErrors;totalClassErrors+=row.classified?0:1;
    }
    const ok=gzip.write(JSON.stringify(row)+"\n");if(!ok)await once(gzip,"drain");
  } catch (error) {
    failed++;
    const row={scenarioId:job.scenarioId,campaign:job.campaign,sessionKind:job.sessionKind,circuitId:job.circuitId,circuitName:job.circuitName,seedIndex:job.seedIndex,raceSeed:job.raceSeed,configurationHash:job.configurationHash,productionSHA:job.productionSHA,testedSHA:job.testedSHA,qaShardId:job.qaShardId,status:"FAILED",validFullRace:false,error:String(error?.stack||error)};
    const ok=gzip.write(JSON.stringify(row)+"\n");if(!ok)await once(gzip,"drain");
  }
  completed++;
  if(completed%10===0) {
    const snapshot={worker:wid,completed,valid,failed,elapsedMs:Date.now()-started};
    process.stdout.write(JSON.stringify(snapshot)+"\n");
    await import("node:fs/promises").then(fs=>fs.writeFile(`${outPath}/progress-${String(wid).padStart(2,"0")}.json`,JSON.stringify(snapshot)));
  }
}
gzip.end(); await once(output,"finish");
const aggregate={worker:wid,completed,valid,failed,totalRuntimeMs,totalLaps,totalPassAttempts,totalEarlyPassAttempts,totalLatePassAttempts,totalEarlyPasses,totalLatePasses,totalPasses,totalDrsEligibleObservations,totalDrsBenefitObservations,totalDrsBenefitMsTotal,totalDrsPasses,totalPitStops,totalIncidents,totalSc,totalVsc,totalRetirements,totalDsqs,totalFuelCreation,totalNumeric,totalClassErrors,elapsedMs:Date.now()-started};
await import("node:fs/promises").then(fs=>fs.writeFile(`${outPath}/aggregate-${String(wid).padStart(2,"0")}.json`,JSON.stringify(aggregate,null,2)));
process.stdout.write(JSON.stringify(aggregate)+"\n");
}

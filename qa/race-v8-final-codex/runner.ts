import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { gzip } from "node:zlib";
import { performance } from "node:perf_hooks";
import { createRace, advanceRaceLap } from "../../src/simulation/race/engine";
import { validateProgressionState, LAP_UNITS } from "../../src/simulation/race/progression/model";
import { developmentContent } from "../../src/data/seed/content-development";
import { aiDryStartingCompound, aiWetStartingCompound, publicWeather, strategyPreference } from "../../src/simulation/race/pits/ai-strategy";
import { aiStartingCompound } from "../../src/features/race/weather-scenarios";
import { careerGrid, raceRepository } from "../../tests/helpers/grid";
import { startCareerRace } from "../../src/features/race/service";
import type { WeatherConfiguration } from "../../src/simulation/race/weather/model";
import { startingTyre } from "../../src/simulation/race/tyres/profiles";
import type { RaceSimulationInput, RaceSimulationState } from "../../src/simulation/race/types";
import { PRODUCTION_SHA, buildPilotManifest, buildPrimaryManifest, contentLock, manifestHash, manifestStats, type Scenario, type WeatherProfile } from "./manifest";

const OUT = process.env.QA_OUT ?? "qa-out";
const playerTeamKey = "team-mclaren";
const rev4 = 4;

function git(args: string[]) { return execFileSync("git", args, { encoding: "utf8" }).trim(); }

export function verifyProductionBase() {
  if (git(["cat-file", "-e", `${PRODUCTION_SHA}^{commit}`]) !== "") throw new Error("Exact production base SHA cannot be resolved");
  execFileSync("git", ["merge-base", "--is-ancestor", PRODUCTION_SHA, "HEAD"]);
  const changed = git(["diff", "--name-only", `${PRODUCTION_SHA}..HEAD`]).split("\n").filter(Boolean);
  const unexpected = changed.filter((path) => !path.startsWith("qa/race-v8-final-codex/") && path !== ".github/workflows/race-v8-final-codex.yml");
  if (unexpected.length) throw new Error(`Production or out-of-scope files changed: ${unexpected.join(", ")}`);
  return { productionBaseSha: PRODUCTION_SHA, qaHarnessSha: git(["rev-parse", "HEAD"]), changedFiles: changed };
}

function deterministicId(driverId: string) {
  const hex = createHash("sha256").update(`${PRODUCTION_SHA}\u001f${driverId}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function lapAt(total: number, fraction: number) { return Math.max(2, Math.min(total, Math.round(total * fraction))); }

function controlledWeather(base: WeatherConfiguration, totalLaps: number, profile: WeatherProfile): WeatherConfiguration {
  if (profile === "SEEDED_DEVELOPMENT") return base;
  const schedules: Record<Exclude<WeatherProfile, "SEEDED_DEVELOPMENT">, { start: number; rain: number }[]> = {
    DRY: [{ start: 1, rain: 0 }],
    LIGHT_WET: [{ start: 1, rain: 220 }, { start: lapAt(totalLaps, 0.45), rain: 360 }, { start: lapAt(totalLaps, 0.76), rain: 0 }],
    INTERMEDIATE: [{ start: 1, rain: 520 }, { start: lapAt(totalLaps, 0.38), rain: 430 }, { start: lapAt(totalLaps, 0.72), rain: 300 }],
    HEAVY_WET: [{ start: 1, rain: 1000 }, { start: lapAt(totalLaps, 0.4), rain: 900 }, { start: lapAt(totalLaps, 0.78), rain: 1000 }],
    DRYING: [{ start: 1, rain: 1000 }, { start: lapAt(totalLaps, 0.32), rain: 500 }, { start: lapAt(totalLaps, 0.62), rain: 0 }],
    MIXED_TRANSITION: [{ start: 1, rain: 0 }, { start: lapAt(totalLaps, 0.22), rain: 680 }, { start: lapAt(totalLaps, 0.48), rain: 1000 }, { start: lapAt(totalLaps, 0.74), rain: 100 }],
  };
  const compact = schedules[profile].filter((x, i, all) => i === 0 || x.start > all[i - 1].start).map((x) => ({ startLap: x.start, rainfall: x.rain, airTemperatureMilliC: x.rain > 0 ? 19000 : 24000 }));
  const spreadLap = base.forecastAccuracy.lapUncertainty;
  const spreadRain = base.forecastAccuracy.intensityUncertainty;
  const forecast = compact.map((s) => ({
    arrivalMinLap: Math.max(1, s.startLap - spreadLap),
    arrivalMaxLap: Math.min(totalLaps + 10, s.startLap + spreadLap),
    rainfallMin: Math.max(0, s.rainfall - spreadRain),
    rainfallMax: Math.min(1000, s.rainfall + spreadRain),
  }));
  const initialWater: Record<Exclude<WeatherProfile, "SEEDED_DEVELOPMENT">, number> = {
    DRY: 0, LIGHT_WET: 45, INTERMEDIATE: 300, HEAVY_WET: 760, DRYING: 760, MIXED_TRANSITION: 0,
  };
  const water = initialWater[profile];
  const initialRain = compact[0].rainfall;
  return {
    ...base,
    timeline: compact,
    forecast,
    initial: {
      ...base.initial,
      rainfallIntensity: initialRain,
      trackWater: water,
      drsState: water >= base.drsDisableWater ? "DRS_DISABLED_WET" as const : "DRS_ENABLED" as const,
    },
  };
}

function startingCompound(input: RaceSimulationInput, entrant: RaceSimulationInput["entrants"][number]) {
  const weather = input.weather!;
  const preference = strategyPreference(input.seed, entrant.gridPosition);
  const proposed = aiStartingCompound(weather.initial);
  if (proposed === "MEDIUM") return aiDryStartingCompound(preference);
  return aiWetStartingCompound(proposed, weather.initial, input.tyres!, publicWeather(weather), input.pits!.strategy!, preference);
}

function stressGrid(grid: Awaited<ReturnType<typeof careerGrid>>) {
  return [...grid.roster]
    .sort((a, b) => (a.balance?.carPerformance ?? 0) - (b.balance?.carPerformance ?? 0) || (a.balance?.pace ?? 0) - (b.balance?.pace ?? 0) || a.driverId.localeCompare(b.driverId))
    .map((row) => row.driverId);
}

async function initialRace(grid: Awaited<ReturnType<typeof careerGrid>>, scenario: Scenario): Promise<RaceSimulationState> {
  const startingGrid = scenario.gridProfile === "FAST_CARS_MIDFIELD" ? stressGrid(grid) : null;
  const data = raceRepository(grid, startingGrid, { kind: scenario.sessionType, eventIndex: scenario.eventIndex });
  startCareerRace(data.repository, grid.career.id, data.eventId, scenario.seed, {}, true, true, true, true, true, true, rev4);
  const created = data.get().state;
  if (!created) throw new Error("Production Race creation returned no state");
  if (created.simulationVersion !== 8 || created.input.progression?.version !== 4) throw new Error("Production factory did not freeze simulationVersion 8 / progression revision 4");
  if (created.input.entrants.length !== 22) throw new Error(`Expected 22 entrants, found ${created.input.entrants.length}`);
  if (created.input.circuit.baseLapTimeMs < 1000 || created.input.totalLaps < 1) throw new Error("Invalid production circuit or distance");

  let input: RaceSimulationInput = {
    ...created.input,
    weather: controlledWeather(created.input.weather!, created.input.totalLaps, scenario.weatherProfile),
    entrants: created.input.entrants.map((entrant) => ({
      ...entrant,
      entrantId: deterministicId(entrant.driverId),
      ...(scenario.commandProfile.includes("/") && entrant.teamId === grid.playerTeamId ? { strategyController: "PLAYER" as const } : {}),
    })),
  };
  // The player's deterministic command profile is applied only in the command factorial.
  if (scenario.commandProfile.includes("/")) {
    const [pace, fuel] = scenario.commandProfile.split("/");
    if (!input.commands || !input.progression?.assistance) throw new Error("Factorial commands need revision-4 command and assistance state");
    input = {
      ...input,
      entrants: input.entrants.map((entrant) => ({ ...entrant, startingTyre: startingTyre(startingCompound(input, entrant)) })),
    };
    const seedState = createRace(input);
    const state = {
      ...seedState,
      entrants: seedState.entrants.map((entrant) => input.entrants.find((x) => x.entrantId === entrant.entrantId)?.teamId === grid.playerTeamId
        ? { ...entrant, commands: { ...entrant.commands!, paceMode: pace as NonNullable<typeof entrant.commands>["paceMode"], fuelMode: fuel as NonNullable<typeof entrant.commands>["fuelMode"], ersMode: "NEUTRAL" as const } }
        : entrant),
      progression: {
        ...seedState.progression!,
        cars: Object.fromEntries(Object.entries(seedState.progression!.cars).map(([id, car]) => [id, {
          ...car,
          assistance: seedState.entrants.find((e) => e.entrantId === id)?.teamId === grid.playerTeamId
            ? { ...car.assistance!, policy: scenario.commandProfile.split("/")[2] as NonNullable<typeof car.assistance>["policy"] }
            : car.assistance,
        }])),
      },
    } as RaceSimulationState;
    validateProgressionState(state);
    return state;
  }

  // Wet-grid starts follow current-condition economics (same production helpers as the service path).
  if (scenario.weatherProfile !== "SEEDED_DEVELOPMENT") {
    input = {
      ...input,
      entrants: input.entrants.map((entrant) => ({ ...entrant, startingTyre: startingTyre(startingCompound(input, entrant)) })),
    };
  }
  const state = createRace(input);
  validateProgressionState(state);
  return state;
}

function assertFiniteTree(value: unknown, path: string) {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Non-finite authoritative number at ${path}: ${value}`);
  if (Array.isArray(value)) { value.forEach((v, i) => assertFiniteTree(v, `${path}[${i}]`)); return; }
  if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) assertFiniteTree(child, `${path}.${key}`);
}

function invariantCheck(state: RaceSimulationState) {
  validateProgressionState(state);
  assertFiniteTree(state, "state");
  const ids = new Set<string>(), positions = new Set<number>();
  const source = new Map(state.input.entrants.map((e) => [e.entrantId, e]));
  for (const entrant of state.entrants) {
    if (ids.has(entrant.entrantId) || positions.has(entrant.position)) throw new Error("Duplicate entrant identity or classification position");
    ids.add(entrant.entrantId); positions.add(entrant.position);
    if (!Number.isSafeInteger(entrant.elapsedTimeMs) || entrant.elapsedTimeMs < 0) throw new Error(`Invalid elapsed time: ${entrant.entrantId}`);
    if (entrant.completedLaps < 0 || entrant.completedLaps > state.input.totalLaps) throw new Error(`Invalid lap count: ${entrant.entrantId}`);
    if (entrant.fuelMassKg < 0 || entrant.fuelMassKg > state.input.initialFuelKg) throw new Error(`Invalid fuel state: ${entrant.entrantId}`);
    if (entrant.gapToLeaderMs !== null && entrant.gapToLeaderMs < 0) throw new Error(`Negative leader gap: ${entrant.entrantId}`);
    if (entrant.intervalToAheadMs !== null && entrant.intervalToAheadMs < 0) throw new Error(`Negative interval: ${entrant.entrantId}`);
    if (entrant.track!.progressMicrolaps < 0 || entrant.track!.progressMicrolaps > state.input.totalLaps * LAP_UNITS) throw new Error(`Invalid distance: ${entrant.entrantId}`);
    if (entrant.stint!.tyre.ageLaps < 0 || entrant.stint!.tyre.wearPermille < 0) throw new Error(`Invalid tyre state: ${entrant.entrantId}`);
    if (source.get(entrant.entrantId)?.startingTyre === undefined) throw new Error(`Entrant identity is absent from input: ${entrant.entrantId}`);
    if (state.progression!.cars[entrant.entrantId].assistance!.energy < 0 || state.progression!.cars[entrant.entrantId].assistance!.energy > state.input.progression!.assistance!.capacity) throw new Error(`Invalid energy state: ${entrant.entrantId}`);
  }
  if (ids.size !== state.input.entrants.length) throw new Error("Active entrant count changed unexpectedly");
}

function entrantLap(state: RaceSimulationState, previous: RaceSimulationState | null) {
  const inputs = new Map(state.input.entrants.map((e) => [e.entrantId, e]));
  const prior = new Map((previous?.entrants ?? []).map((e) => [e.entrantId, e]));
  return state.entrants.map((e) => {
    const car = state.progression!.cars[e.entrantId];
    const before = prior.get(e.entrantId);
    const command = e.commands;
    const source = inputs.get(e.entrantId)!;
    return {
      entrantId: e.entrantId,
      driverId: source.driverId,
      teamId: source.teamId,
      gridPosition: source.gridPosition,
      position: e.position,
      completedLaps: e.completedLaps,
      progressMicrolaps: e.track!.progressMicrolaps,
      localMicrolaps: e.track!.progressMicrolaps % LAP_UNITS,
      elapsedTimeMs: e.elapsedTimeMs,
      lastLapTimeMs: e.lastLapTimeMs,
      bestLapTimeMs: e.bestLapTimeMs,
      gapToLeaderMs: e.gapToLeaderMs,
      intervalToAheadMs: e.intervalToAheadMs,
      fuelMassKg: e.fuelMassKg,
      tyre: { compound: e.stint!.tyre.compound, ageLaps: e.stint!.tyre.ageLaps, wearPermille: e.stint!.tyre.wearPermille, temperatureMilliC: e.stint!.tyre.temperatureMilliC },
      commands: command ? { paceMode: command.paceMode, fuelMode: command.fuelMode, ersMode: command.ersMode, ersCharge: command.ersCharge } : null,
      energy: { ...car.assistance!, policy: car.assistance!.policy },
      activeAero: car.assistance!.aero,
      overtakeMode: car.assistance!.overtake,
      pitRoute: car.route,
      pitEntryLap: car.pitEntryLap,
      attemptedThisLap: car.attemptedLap === state.lap,
      passedThisLap: (e.track!.overtakesCompleted ?? 0) > (before?.track!.overtakesCompleted ?? 0),
      totalOvertakes: e.track!.overtakesCompleted ?? 0,
      drsEligible: e.track!.drsEligible,
      drsBenefitMs: e.track!.drsBenefitMs,
      lapsDown: Math.max(0, Math.floor(((state.entrants.find((x) => x.position === 1)?.track!.progressMicrolaps ?? 0) - e.track!.progressMicrolaps) / LAP_UNITS)),
      stints: e.pit?.stints ?? [],
      stops: e.pit?.stops ?? [],
    };
  });
}

async function gzipLines(file: string) {
  mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  const output = createWriteStream(file);
  const zip = gzip({ level: 6 });
  zip.pipe(output);
  return {
    async write(value: unknown) {
      if (!zip.write(`${JSON.stringify(value)}\n`)) await once(zip, "drain");
    },
    async close() { zip.end(); await once(output, "finish"); },
  };
}

async function executeScenario(grid: Awaited<ReturnType<typeof careerGrid>>, scenario: Scenario) {
  const startedAt = performance.now();
  let state = await initialRace(grid, scenario);
  const input = state.input;
  const rows: unknown[] = [];
  let previous: RaceSimulationState | null = null;
  let stepCount = 0;
  while (state.status === "RUNNING") {
    previous = state;
    state = advanceRaceLap(state);
    stepCount++;
    if (stepCount > input.totalLaps + 2) throw new Error("Race exceeded its scheduled distance without finishing");
    invariantCheck(state);
    const addedEvents = state.incidents!.events.slice(previous.incidents!.events.length);
    rows.push({ lap: state.lap, weather: state.weather, raceControl: state.incidents!.mode, events: addedEvents, entrants: entrantLap(state, previous) });
  }
  if (state.status !== "FINISHED" || state.lap !== input.totalLaps) throw new Error(`Incomplete Race status=${state.status} lap=${state.lap}/${input.totalLaps}`);
  invariantCheck(state);
  const finishOrder = [...state.entrants].sort((a, b) => a.position - b.position);
  if (finishOrder.length !== 22 || finishOrder[0].position !== 1 || finishOrder.some((e, i) => e.position !== i + 1)) throw new Error("Classification positions are not total and unique");
  const elapsed = performance.now() - startedAt;
  return {
    scenario,
    productionSha: PRODUCTION_SHA,
    simulationVersion: state.simulationVersion,
    progressionRevision: state.input.progression!.version,
    input,
    laps: rows,
    classification: finishOrder.map((e) => ({ entrantId: e.entrantId, driverId: input.entrants.find((x) => x.entrantId === e.entrantId)!.driverId, teamId: input.entrants.find((x) => x.entrantId === e.entrantId)!.teamId, position: e.position, status: e.incident!.status, completedLaps: e.completedLaps, elapsedTimeMs: e.elapsedTimeMs, bestLapTimeMs: e.bestLapTimeMs, gapToLeaderMs: e.gapToLeaderMs, disqualified: state.progression!.classification?.entries.find((r) => r.entrantId === e.entrantId)?.status === "DISQUALIFIED" })),
    finalEvents: state.incidents!.events,
    finalStints: finishOrder.map((e) => ({ driverId: input.entrants.find((x) => x.entrantId === e.entrantId)!.driverId, stints: e.pit?.stints ?? [], stops: e.pit?.stops ?? [] })),
    finalState: state,
    runtimeMs: elapsed,
    completed: true,
  };
}

function timestamp() { return new Date().toISOString(); }
function systemIdentity() {
  return {
    runnerName: process.env.RUNNER_NAME ?? process.env.GITHUB_ACTIONS_RUNNER_NAME ?? "unknown",
    os: process.platform,
    arch: process.arch,
    node: process.version,
    cpuCount: Number(process.env.RUNNER_CPU_COUNT ?? 0) || undefined,
    startedAt: timestamp(),
  };
}

async function runPilot() {
  verifyProductionBase();
  mkdirSync(OUT, { recursive: true });
  const lock = contentLock();
  const sprintNames = lock.sprintCircuitIds.map((id) => developmentContent.circuits.find((c) => c.id === id)?.key).sort();
  const expectedSprints = ["circuit-marina-bay", "circuit-miami", "circuit-montreal", "circuit-shanghai", "circuit-silverstone", "circuit-zandvoort"].sort();
  if (lock.circuitCount !== 24 || lock.eventCount !== 24 || lock.teamCount !== 11 || lock.raceDriverCount !== 22) throw new Error(`Unexpected 2026 content lock: ${JSON.stringify(lock)}`);
  if (JSON.stringify(sprintNames) !== JSON.stringify(expectedSprints)) throw new Error(`Unexpected Sprint venues: ${JSON.stringify(sprintNames)}`);
  const manifest = buildPilotManifest();
  const hash = manifestHash(manifest);
  writeFileSync(`${OUT}/pilot-manifest.json`, JSON.stringify({ namespace: "R8_FINAL_CODEX_CLOSURE_FRESH_N2_PILOT", planned: manifest.length, manifestHash: hash, contentLock: lock, scenarios: manifest }, null, 2));
  writeFileSync(`${OUT}/pilot-manifest.sha256`, `${hash}  pilot-manifest.json\n`);
  const grid = await careerGrid(playerTeamKey, developmentContent);
  const writer = await gzipLines(`${OUT}/pilot-raw.jsonl.gz`);
  const runtimes: number[] = [];
  const failures: unknown[] = [];
  let completed = 0, successfulRetries = 0, failedAttempts = 0;
  for (const scenario of manifest) {
    let result: Awaited<ReturnType<typeof executeScenario>> | null = null;
    let firstError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await executeScenario(grid, scenario);
        if (attempt === 2) successfulRetries++;
        break;
      } catch (error) {
        failedAttempts++;
        firstError ??= error;
        failures.push({ scenarioId: scenario.scenarioId, seed: scenario.seed, attempt, at: timestamp(), error: String(error), stack: error instanceof Error ? error.stack : null });
      }
    }
    if (!result) throw new Error(`Pilot scenario failed twice: ${scenario.scenarioId}; first=${String(firstError)}`);
    completed++;
    runtimes.push(result.runtimeMs);
    await writer.write(result);
    if (completed % 10 === 0) writeFileSync(`${OUT}/pilot-progress.json`, JSON.stringify({ completed, planned: manifest.length, failedAttempts, successfulRetries, elapsedMs: runtimes.reduce((a, b) => a + b, 0), memory: process.memoryUsage() }));
  }
  await writer.close();
  writeFileSync(`${OUT}/pilot-failed-runs.json`, JSON.stringify(failures, null, 2));
  const sorted = [...runtimes].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  const mean = runtimes.reduce((a, b) => a + b, 0) / Math.max(1, runtimes.length);
  const summary = {
    stage: "pilot", namespace: "R8_FINAL_CODEX_CLOSURE_FRESH_N2_PILOT", manifestHash: hash,
    runner: systemIdentity(), productionBaseSha: PRODUCTION_SHA, headSha: git(["rev-parse", "HEAD"]),
    planned: manifest.length, validComplete: completed, failedAttempts, successfulRetries, repeatedFailures: failures.filter((f: any) => f.attempt === 2).length,
    validRevision4: true, allCircuitIdsResolved: manifest.every((s) => developmentContent.circuits.some((c) => c.id === s.circuitId)), contentLock: lock,
    categoryCounts: manifestStats(manifest), runtimeMs: { mean, median: percentile(0.5), p95: percentile(0.95), worst: sorted.at(-1) },
    peakRssBytes: process.resourceUsage().maxRSS * 1024, memoryAtEnd: process.memoryUsage(), artifacts: ["pilot-manifest.json", "pilot-manifest.sha256", "pilot-raw.jsonl.gz", "pilot-failed-runs.json"],
  };
  writeFileSync(`${OUT}/pilot-summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

async function runPrimaryShard(shard: number, shards: number) {
  verifyProductionBase();
  if (!Number.isInteger(shard) || !Number.isInteger(shards) || shard < 0 || shards < 1 || shard >= shards) throw new Error("Invalid primary shard");
  mkdirSync(OUT, { recursive: true });
  const manifest = buildPrimaryManifest();
  const hash = manifestHash(manifest);
  const selected = manifest.filter((_, i) => i % shards === shard);
  const grid = await careerGrid(playerTeamKey, developmentContent);
  const basePath = `${OUT}/primary-${String(shard).padStart(2, "0")}-of-${String(shards).padStart(2, "0")}`;
  if (shard === 0) {
    writeFileSync(`${OUT}/primary-manifest.json`, JSON.stringify({ namespace: "R8_FINAL_CODEX_CLOSURE_FRESH_N2", planned: manifest.length, manifestHash: hash, categoryCounts: manifestStats(manifest), contentLock: contentLock(), scenarios: manifest }, null, 2));
    writeFileSync(`${OUT}/primary-manifest.sha256`, `${hash}  primary-manifest.json\n`);
  }
  const writer = await gzipLines(`${basePath}-raw.jsonl.gz`);
  const runtimes: number[] = [];
  const failures: unknown[] = [];
  let completed = 0, successfulRetries = 0, failedAttempts = 0;
  for (const scenario of selected) {
    let result: Awaited<ReturnType<typeof executeScenario>> | null = null;
    let firstError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try { result = await executeScenario(grid, scenario); if (attempt === 2) successfulRetries++; break; }
      catch (error) {
        failedAttempts++;
        firstError ??= error;
        failures.push({ scenarioId: scenario.scenarioId, seed: scenario.seed, attempt, at: timestamp(), error: String(error), stack: error instanceof Error ? error.stack : null });
      }
    }
    if (!result) throw new Error(`Primary scenario failed twice: ${scenario.scenarioId}; first=${String(firstError)}`);
    completed++;
    runtimes.push(result.runtimeMs);
    await writer.write(result);
    if (completed % 25 === 0) writeFileSync(`${basePath}-progress.json`, JSON.stringify({ shard, shards, completed, selected: selected.length, failedAttempts, successfulRetries, memory: process.memoryUsage() }));
  }
  await writer.close();
  writeFileSync(`${basePath}-failed-runs.json`, JSON.stringify(failures, null, 2));
  const sorted = [...runtimes].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  const summary = {
    stage: "primary", shard, shards, namespace: "R8_FINAL_CODEX_CLOSURE_FRESH_N2", manifestHash: hash,
    runner: systemIdentity(), productionBaseSha: PRODUCTION_SHA, headSha: git(["rev-parse", "HEAD"]),
    planned: selected.length, validComplete: completed, failedAttempts, successfulRetries, repeatedFailures: failures.filter((f: any) => f.attempt === 2).length,
    categoryCounts: selected.reduce((a, s) => ({ ...a, [s.scenarioCategory]: (a[s.scenarioCategory] ?? 0) + 1 }), {} as Record<string, number>),
    runtimeMs: { mean: runtimes.reduce((a, b) => a + b, 0) / Math.max(1, runtimes.length), median: percentile(0.5), p95: percentile(0.95), worst: sorted.at(-1) },
    peakRssBytes: process.resourceUsage().maxRSS * 1024, memoryAtEnd: process.memoryUsage(),
  };
  writeFileSync(`${basePath}-summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

const args = process.argv.slice(2);
if (args[0] === "pilot") await runPilot();
else if (args[0] === "primary") await runPrimaryShard(Number(args[1]), Number(args[2]));
else if (args[0] === "manifest") {
  const full = buildPrimaryManifest();
  console.log(JSON.stringify({ length: full.length, hash: manifestHash(full), counts: manifestStats(full) }, null, 2));
} else throw new Error("Usage: runner.ts pilot | primary <shard> <shards> | manifest");

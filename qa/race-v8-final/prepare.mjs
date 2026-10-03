import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PRODUCTION_SHA = "55846a9c465b58fc5687517ace67772421868dff";
const REPOSITORY = "alvinaug1105/f1-sim-game2";
const SHARD_COUNT = 16;
const mode = process.argv[2];
const outDir = resolve(process.argv[3] || "qa-out/prepared");
if (!["pilot", "full"].includes(mode)) throw new Error("usage: prepare.mjs pilot|full OUTPUT_DIR");

const repo = resolve(process.env.RACE_QA_REPO || process.cwd());
const { developmentContent } = await import(pathToFileURL(join(repo, "src/data/seed/content-development.ts")).href);
const circuits = developmentContent.circuits;
if (circuits.length !== 24) throw new Error(`expected 24 production circuits, found ${circuits.length}`);

const aliasByKey = {
  "circuit-silver-coast": "MELBOURNE", "circuit-mountain-park": "SUZUKA", "circuit-shanghai": "SHANGHAI",
  "circuit-bahrain": "BAHRAIN", "circuit-monaco": "MONACO", "circuit-silverstone": "SILVERSTONE",
  "circuit-spa-francorchamps": "SPA", "circuit-marina-bay": "SINGAPORE", "circuit-jeddah": "JEDDAH",
  "circuit-miami": "MIAMI", "circuit-montreal": "MONTREAL", "circuit-barcelona": "BARCELONA",
  "circuit-red-bull-ring": "SPIELBERG", "circuit-hungaroring": "HUNGARORING", "circuit-zandvoort": "ZANDVOORT",
  "circuit-monza": "MONZA", "circuit-madrid": "MADRID", "circuit-baku": "BAKU", "circuit-cota": "COTA",
  "circuit-mexico-city": "MEXICO_CITY", "circuit-interlagos": "INTERLAGOS", "circuit-las-vegas": "LAS_VEGAS",
  "circuit-lusail": "LUSAIL", "circuit-yas-marina": "ABU_DHABI",
};
const byKey = new Map(circuits.map(c => [c.key, c]));
const circuit = key => {
  const value = byKey.get(key);
  if (!value) throw new Error(`production content is missing ${key}`);
  return value;
};
const circuitsByKeys = keys => keys.map(name => circuit(`circuit-${name}`));
const sprintCircuits = circuitsByKeys(["shanghai", "miami", "montreal", "silverstone", "zandvoort", "marina-bay"]);
const commandCircuits = circuitsByKeys(["monaco", "monza", "baku", "silverstone", "mountain-park", "spa-francorchamps", "marina-bay", "bahrain", "interlagos", "zandvoort"]);
const trafficCircuits = circuitsByKeys(["monaco", "monza", "baku", "silverstone", "mountain-park", "spa-francorchamps", "marina-bay", "hungaroring", "bahrain", "zandvoort", "las-vegas", "mexico-city"]);
const weatherKinds = [
  ["DRY", "DRY"], ["DAMP", "DAMP"], ["RAIN_ONSET", "MOSTLY_DRY"], ["HEAVY_RAIN", "WET"], ["WET_GRID", "WET"],
  ["DRYING", "DRYING"], ["EARLY_RAIN", "EARLY_RAIN"], ["LATE_RAIN", "LATE_RAIN"], ["MIXED", "MIXED"], ["MULTI_TRANSITION", "MULTI_TRANSITION"],
];
const incidentGroups = [
  ["BASELINE", {}, {}],
  ["LOW_RELIABILITY", {}, { reliability: 70, powerUnitCondition: 70, gearboxCondition: 70 }],
  ["HIGH_RELIABILITY", {}, { reliability: 100, powerUnitCondition: 100, gearboxCondition: 100 }],
  ["LOW_CONTROL", {}, { control: 20 }],
  ["HIGH_CONTROL", {}, { control: 100 }],
  ["ELEVATED_DRIVER_RISK", { baseErrorPpm: 1800, controlDeficitPpm: 40 }, { control: 45 }],
  ["MECHANICAL_RISK", { baseMechanicalPpm: 700, conditionDeficitPpm: 55, distanceRiskPpm: 300 }, { reliability: 72, powerUnitCondition: 72, gearboxCondition: 72 }],
  ["VSC_FREQUENCY", { vscMinorPermille: 100, vscRetirementPermille: 900 }, { reliability: 85 }],
  ["SC_FREQUENCY", { scMajorPermille: 1000, doubleContactRetirementPermille: 300 }, { reliability: 85 }],
  ["INCIDENT_AND_NEUTRALISATION", { baseErrorPpm: 1500, battleRiskPpm: 500, scMajorPermille: 900, vscMinorPermille: 80 }, { control: 35, reliability: 80, powerUnitCondition: 80, gearboxCondition: 80 }],
];
const paces = ["CONSERVE", "LIGHT", "STANDARD", "PUSH", "ATTACK"];
const fuels = ["CONSERVE", "BALANCED", "PUSH"];
const energies = ["RECHARGE", "BALANCED", "BOOST"];
const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`
    : JSON.stringify(value);
const hash = value => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");

function add(jobs, { scenarioId, campaign, sessionKind = "RACE", c, seedIndex, weatherKind = "CLIMATE", paceMode = null, fuelMode = null, energyPolicy = null, planKind = "FIXED", incidentProfile = null }) {
  const config = { campaign, sessionKind, circuitId: c.id, weatherKind, paceMode, fuelMode, energyPolicy, planKind, incidentProfile };
  const seedGroupId = campaign === "C" ? `C|${c.id}|${String(seedIndex).padStart(3, "0")}` : `${campaign}|${scenarioId}`;
  jobs.push({
    scenarioId, campaign, sessionKind, circuitId: c.id, circuitName: c.name, circuitKey: c.key, seedIndex,
    configurationHash: hash(config), productionSHA: PRODUCTION_SHA, testedSHA: PRODUCTION_SHA,
    weatherKind, paceMode, fuelMode, energyPolicy, planKind, incidentProfile, seedGroupId,
  });
}

function buildPrimary() {
  const jobs = [];
  for (const c of circuits) for (let i = 1; i <= 500; i++) add(jobs, { scenarioId: `GP:${aliasByKey[c.key]}:${String(i).padStart(6, "0")}`, campaign: "A", c, seedIndex: i });
  for (const c of sprintCircuits) for (let i = 1; i <= 500; i++) add(jobs, { scenarioId: `SPRINT:${aliasByKey[c.key]}:${String(i).padStart(6, "0")}`, campaign: "B", sessionKind: "SPRINT", c, seedIndex: i });
  for (const c of commandCircuits) for (const paceMode of paces) for (const fuelMode of fuels) for (const energyPolicy of energies) for (let i = 1; i <= 20; i++) {
    const planKind = i <= 10 ? "FIXED" : "PHASE";
    add(jobs, { scenarioId: `CMD:${aliasByKey[c.key]}:${paceMode}:${fuelMode}:${energyPolicy}:${String(i).padStart(3, "0")}`, campaign: "C", c, seedIndex: i, paceMode, fuelMode, energyPolicy, planKind });
  }
  for (const c of trafficCircuits) for (let i = 1; i <= 250; i++) add(jobs, { scenarioId: `TRAFFIC:${aliasByKey[c.key]}:${String(i).padStart(6, "0")}`, campaign: "D", c, seedIndex: i });
  for (const [group, weatherKind] of weatherKinds) for (let i = 1; i <= 200; i++) {
    const c = commandCircuits[(i - 1) % commandCircuits.length];
    add(jobs, { scenarioId: `WEATHER:${group}:${aliasByKey[c.key]}:${String(i).padStart(3, "0")}`, campaign: "E", c, seedIndex: i, weatherKind });
  }
  const incidentCircuits = trafficCircuits.slice(0, 10);
  for (let g = 0; g < incidentGroups.length; g++) for (let i = 1; i <= 100; i++) {
    const [group, overrides, reliability] = incidentGroups[g];
    const c = incidentCircuits[(i - 1) % incidentCircuits.length];
    add(jobs, { scenarioId: `INCIDENT:${group}:${aliasByKey[c.key]}:${String(i).padStart(3, "0")}`, campaign: "F", c, seedIndex: i, incidentProfile: { overrides, reliability } });
  }
  const expected = { A: 12000, B: 3000, C: 9000, D: 3000, E: 2000, F: 1000 };
  const counts = Object.fromEntries(Object.keys(expected).map(k => [k, jobs.filter(j => j.campaign === k).length]));
  if (jobs.length !== 30000 || canonical(counts) !== canonical(expected)) throw new Error(`primary matrix mismatch: ${JSON.stringify(counts)}`);
  if (new Set(jobs.map(j => j.scenarioId)).size !== jobs.length) throw new Error("duplicate primary scenario IDs");
  return jobs;
}

const seedRanges = JSON.parse(readFileSync(join(repo, "qa/race-v8-final/seed-ranges.json"), "utf8"));
for (const name of ["primary", "pilot", "supplemental"]) {
  const range = seedRanges.ranges?.[name];
  if (!Number.isInteger(range?.start) || !Number.isInteger(range?.capacity) || range.start < 0 || range.start + range.capacity > 0xffff_ffff) throw new Error(`invalid ${name} seed range`);
}

function groupsFor(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const rows = groups.get(job.seedGroupId) || [];
    rows.push(job);
    groups.set(job.seedGroupId, rows);
  }
  return [...groups.entries()].map(([id, rows]) => ({ id, rows }));
}

function allocateShards(jobs, shardCount) {
  const groups = groupsFor(jobs);
  const shards = Array.from({ length: shardCount }, (_, index) => ({ id: index + 1, groups: [], weight: 0 }));
  groups.sort((a, b) => b.rows.length - a.rows.length || a.id.localeCompare(b.id));
  for (const group of groups) {
    shards.sort((a, b) => a.weight - b.weight || a.id - b.id);
    const shard = shards[0];
    shard.groups.push(group);
    shard.weight += group.rows.length;
    for (const job of group.rows) job.qaShardId = `shard-${String(shard.id).padStart(2, "0")}`;
  }
  return shards.sort((a, b) => a.id - b.id);
}

function allocateSeeds(shards, start, capacity) {
  let candidate = start;
  const all = new Set();
  for (const shard of shards) {
    shard.groups.sort((a, b) => a.id.localeCompare(b.id));
    shard.seedValues = [];
    for (const group of shard.groups) {
      if (candidate >= start + capacity) throw new Error("pre-reserved deterministic seed range exhausted");
      const seed = candidate++;
      all.add(seed);
      shard.seedValues.push(seed);
      for (const job of group.rows) job.raceSeed = seed;
    }
    shard.minSeed = Math.min(...shard.seedValues);
    shard.maxSeed = Math.max(...shard.seedValues);
    shard.uniqueSeedCount = shard.seedValues.length;
  }
  if (all.size !== groupsFor(shards.flatMap(s => s.groups.flatMap(g => g.rows))).length) throw new Error("seed allocation is not unique by seed group");
  return all;
}

function pilotSubset(primary) {
  const selected = primary.filter(j =>
    (j.campaign === "A" && j.seedIndex === 1) ||
    (j.campaign === "B" && j.seedIndex === 1) ||
    (j.campaign === "C" && j.circuitKey === "circuit-monaco" && j.seedIndex === 1) ||
    (j.campaign === "D" && j.seedIndex === 1) ||
    (j.campaign === "E" && j.seedIndex === 1) ||
    (j.campaign === "F" && j.circuitKey === "circuit-monaco" && j.seedIndex === 1 && ["BASELINE", "LOW_RELIABILITY", "SC_FREQUENCY"].some(g => j.scenarioId.includes(`:${g}:`))));
  if (selected.length !== 100) throw new Error(`pilot selection expected 100 races, got ${selected.length}`);
  return selected;
}

async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }
async function writeJsonl(path, jobs) { await writeFile(path, `${jobs.map(j => JSON.stringify(j)).join("\n")}\n`); }

await mkdir(outDir, { recursive: true });
const primary = buildPrimary();
const primaryShards = allocateShards(primary, SHARD_COUNT);
const primarySeedSet = allocateSeeds(primaryShards, seedRanges.ranges.primary.start, seedRanges.ranges.primary.capacity);

if (mode === "pilot") {
  const jobs = pilotSubset(primary);
  const pilotShard = { id: 1, groups: groupsFor(jobs), weight: jobs.length };
  for (const job of jobs) job.qaShardId = "pilot-01";
  allocateSeeds([pilotShard], seedRanges.ranges.pilot.start, seedRanges.ranges.pilot.capacity);
  await writeJsonl(join(outDir, "manifest.jsonl"), jobs);
  await writeJsonl(join(outDir, "jobs.jsonl"), jobs);
  const manifest = await readFile(join(outDir, "manifest.jsonl"), "utf8");
  await writeFile(join(outDir, "manifest.sha256"), `${hash(manifest)}  manifest.jsonl\n`);
  await writeJson(join(outDir, "run.json"), {
    repository: REPOSITORY, productionSHA: PRODUCTION_SHA, qaMode: "pilot", qaShardId: "pilot-01", totalJobs: jobs.length,
    campaignCounts: Object.fromEntries(["A", "B", "C", "D", "E", "F"].map(k => [k, jobs.filter(j => j.campaign === k).length])),
    seedPolicy: seedRanges.seedPolicy, priorLocalSeedSources: seedRanges.priorLocalSeedSources,
    priorLocalSeedCount: seedRanges.priorLocalSeedCount, priorLocalSeedDigest: seedRanges.priorLocalSeedDigest, primaryUniqueSeedCount: primarySeedSet.size,
    seedRange: { min: Math.min(...jobs.map(j => j.raceSeed)), max: Math.max(...jobs.map(j => j.raceSeed)) },
  });
} else {
  await writeJsonl(join(outDir, "manifest.jsonl"), primary);
  const manifest = await readFile(join(outDir, "manifest.jsonl"), "utf8");
  await writeFile(join(outDir, "manifest.sha256"), `${hash(manifest)}  manifest.jsonl\n`);
  await mkdir(join(outDir, "shards"), { recursive: true });
  for (const shard of primaryShards) {
    const id = `shard-${String(shard.id).padStart(2, "0")}`;
    const dir = join(outDir, "shards", id);
    await mkdir(dir, { recursive: true });
    const rows = shard.groups.flatMap(g => g.rows).sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
    await writeJsonl(join(dir, "jobs.jsonl"), rows);
    await writeJson(join(dir, "shard.json"), { shardId: id, campaignCounts: Object.fromEntries(["A", "B", "C", "D", "E", "F"].map(k => [k, rows.filter(j => j.campaign === k).length])), raceCount: rows.length, seedRange: { min: shard.minSeed, max: shard.maxSeed }, uniqueSeedCount: shard.uniqueSeedCount, productionSHA: PRODUCTION_SHA });
  }
  await writeJson(join(outDir, "run.json"), {
    repository: REPOSITORY, productionSHA: PRODUCTION_SHA, qaMode: "full-primary", totalJobs: primary.length,
    campaignCounts: { A: 12000, B: 3000, C: 9000, D: 3000, E: 2000, F: 1000 }, shardCount: SHARD_COUNT,
    uniqueRaceSeedGroups: primarySeedSet.size, intentionalPairedCommandSeeds: 9000 - 200,
    seedPolicy: `${seedRanges.seedPolicy}; primary assignments fill the primary range in deterministic shard order; 45-policy command pairs share one seed per circuit and seed index`,
    priorLocalSeedSources: seedRanges.priorLocalSeedSources, priorLocalSeedCount: seedRanges.priorLocalSeedCount, priorLocalSeedDigest: seedRanges.priorLocalSeedDigest,
    shards: primaryShards.map(s => ({ shardId: `shard-${String(s.id).padStart(2, "0")}`, raceCount: s.weight, uniqueSeedCount: s.uniqueSeedCount, seedRange: { min: s.minSeed, max: s.maxSeed } })),
  });
}

console.log(JSON.stringify({ mode, productionSHA: PRODUCTION_SHA, output: outDir, jobs: mode === "pilot" ? 100 : primary.length, shardCount: mode === "pilot" ? 1 : SHARD_COUNT }));

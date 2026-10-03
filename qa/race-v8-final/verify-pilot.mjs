import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

const PRODUCTION_SHA = "55846a9c465b58fc5687517ace67772421868dff";
const dir = resolve(process.argv[2] || "qa-out/pilot");
const expectedCounts = { A: 24, B: 6, C: 45, D: 12, E: 10, F: 3 };
const manifestText = await readFile(`${dir}/manifest.jsonl`, "utf8");
const checksumText = await readFile(`${dir}/manifest.sha256`, "utf8");
const checksum = createHash("sha256").update(manifestText).digest("hex");
if (!checksumText.startsWith(`${checksum}  manifest.jsonl`)) throw new Error("pilot manifest checksum mismatch");
const manifest = manifestText.trim().split("\n").map(line => JSON.parse(line));
const telemetryPath = `${dir}/telemetry/telemetry-worker-01.jsonl.gz`;
const rows = [];
for await (const line of createInterface({ input: createReadStream(telemetryPath).pipe(createGunzip()), crlfDelay: Infinity })) {
  if (line) rows.push(JSON.parse(line));
}

const errors = [];
if (manifest.length !== 100 || rows.length !== 100) errors.push(`expected 100 manifest/race rows; got ${manifest.length}/${rows.length}`);
if (new Set(manifest.map(j => j.scenarioId)).size !== 100) errors.push("pilot scenario IDs are not unique");
if (new Set(manifest.map(j => j.raceSeed)).size !== 56) errors.push(`expected 56 deterministic seed groups (45 paired command rows sharing one seed, plus 55 other rows); got ${new Set(manifest.map(j => j.raceSeed)).size}`);
const campaignCounts = Object.fromEntries(["A", "B", "C", "D", "E", "F"].map(c => [c, manifest.filter(j => j.campaign === c).length]));
for (const [campaign, count] of Object.entries(expectedCounts)) if (campaignCounts[campaign] !== count) errors.push(`campaign ${campaign} expected ${count} rows, got ${campaignCounts[campaign]}`);
const rowsById = new Map(rows.map(row => [row.scenarioId, row]));
if (rowsById.size !== rows.length) errors.push("telemetry scenario IDs are not unique");
for (const job of manifest) {
  const row = rowsById.get(job.scenarioId);
  if (!row) { errors.push(`missing telemetry for ${job.scenarioId}`); continue; }
  if (job.productionSHA !== PRODUCTION_SHA || row.productionSHA !== PRODUCTION_SHA || row.testedSHA !== PRODUCTION_SHA) errors.push(`${job.scenarioId}: production SHA mismatch`);
  if (job.raceSeed !== row.raceSeed || job.configurationHash !== row.configurationHash) errors.push(`${job.scenarioId}: manifest/telemetry identity mismatch`);
  if (!row.validFullRace || row.status !== "FINISHED" || row.entrantCount !== 22 || row.simulationVersion !== 8 || row.revision !== 4 || !Number.isInteger(row.totalLaps) || row.totalLaps <= 0) errors.push(`${job.scenarioId}: incomplete or wrong-version race`);
  if (row.classified !== true || row.entrants?.length !== 22 || new Set(row.finishPositions || []).size !== 22) errors.push(`${job.scenarioId}: classification integrity failed`);
  if (row.numericErrors !== 0 || row.fuelCreation !== 0 || row.pitRouteErrors !== 0) errors.push(`${job.scenarioId}: numeric/fuel/pit-route invariant failure`);
  if (row.drsEligibleObservations !== 0 || row.drsBenefitObservations !== 0 || row.drsPasses !== 0) errors.push(`${job.scenarioId}: revision-4 DRS effect observed`);
  for (const entrant of row.entrants || []) {
    if (!Number.isInteger(entrant.position) || entrant.position < 1 || entrant.position > 22 || !Number.isFinite(entrant.totalTimeMs) || entrant.totalTimeMs < 0 || !Number.isFinite(entrant.fuelEndKg) || entrant.fuelEndKg < 0) errors.push(`${job.scenarioId}/${entrant.entrantId}: entrant result/numeric invariant failed`);
  }
}

const runner = {
  runnerEnvironment: process.env.RUNNER_ENVIRONMENT || null,
  runnerOS: process.env.RUNNER_OS || null,
  runnerArch: process.env.RUNNER_ARCH || null,
  runnerName: process.env.RUNNER_NAME || null,
  githubRunId: process.env.GITHUB_RUN_ID || null,
  githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  githubJob: process.env.GITHUB_JOB || null,
  githubSHA: process.env.GITHUB_SHA || null,
};
if (runner.runnerEnvironment !== "github-hosted" || runner.runnerOS !== "Linux") errors.push(`pilot did not prove GitHub-hosted Linux runner identity: ${JSON.stringify(runner)}`);
const summary = {
  verdict: errors.length ? "FAIL" : "PASS",
  productionSHA: PRODUCTION_SHA,
  pilotRaceCount: rows.length,
  campaignCounts,
  uniqueCircuitCount: new Set(manifest.map(j => j.circuitId)).size,
  uniqueSeedCount: new Set(manifest.map(j => j.raceSeed)).size,
  validFullRaceCount: rows.filter(r => r.validFullRace).length,
  failedRaceCount: rows.filter(r => !r.validFullRace).length,
  numericErrors: rows.reduce((n, r) => n + (r.numericErrors || 0), 0),
  classificationErrors: rows.filter(r => !r.classified).length,
  fuelCreationEvents: rows.reduce((n, r) => n + (r.fuelCreation || 0), 0),
  runner,
  errors,
};
await writeFile(`${dir}/runner.json`, `${JSON.stringify(runner, null, 2)}\n`);
await writeFile(`${dir}/pilot-summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;

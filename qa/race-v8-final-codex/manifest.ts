import { createHash } from "node:crypto";
import { developmentContent } from "../../src/data/seed/content-development";

export const NAMESPACE = "R8_FINAL_CODEX_CLOSURE_FRESH_N2";
export const PRODUCTION_SHA = "55846a9c465b58fc5687517ace67772421868dff";

export type SessionType = "RACE" | "SPRINT";
export type WeatherProfile = "SEEDED_DEVELOPMENT" | "DRY" | "LIGHT_WET" | "INTERMEDIATE" | "HEAVY_WET" | "DRYING" | "MIXED_TRANSITION";
export type Scenario = {
  scenarioId: string;
  seed: number;
  circuitId: string;
  circuitName: string;
  eventIndex: number;
  sessionType: SessionType;
  progressionRevision: 4;
  weatherProfile: WeatherProfile;
  commandProfile: string;
  scenarioCategory: string;
  seedReuseGroup?: string;
  gridProfile: "STANDARD" | "FAST_CARS_MIDFIELD";
};

const circuitId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sprintEventIndices = [1, 5, 6, 10, 13, 17] as const;
const sprintVenues = new Set(sprintEventIndices.map((i) => developmentContent.events[i].circuitId));
const commandPaces = ["CONSERVE", "LIGHT", "STANDARD", "PUSH", "ATTACK"] as const;
const commandFuels = ["CONSERVE", "BALANCED", "PUSH"] as const;
const commandEnergies = ["RECHARGE", "BALANCED", "BOOST"] as const;
const commandCircuits = ["circuit-bahrain", "circuit-monaco", "circuit-silverstone", "circuit-spa-francorchamps", "circuit-hungaroring", "circuit-monza", "circuit-mountain-park", "circuit-marina-bay", "circuit-baku", "circuit-interlagos"];
const trafficCircuits = ["circuit-bahrain", "circuit-jeddah", "circuit-monaco", "circuit-silverstone", "circuit-spa-francorchamps", "circuit-hungaroring", "circuit-monza", "circuit-mountain-park", "circuit-baku", "circuit-marina-bay", "circuit-las-vegas", "circuit-interlagos"];
const weatherCircuits = ["circuit-shanghai", "circuit-montreal", "circuit-silverstone", "circuit-spa-francorchamps", "circuit-mountain-park", "circuit-zandvoort", "circuit-marina-bay", "circuit-cota", "circuit-interlagos", "circuit-lusail"];
const incidentCircuits = ["circuit-silver-coast", "circuit-jeddah", "circuit-montreal", "circuit-monaco", "circuit-silverstone", "circuit-spa-francorchamps", "circuit-baku", "circuit-marina-bay", "circuit-cota", "circuit-interlagos"];
const weatherProfiles: WeatherProfile[] = ["DRY", "LIGHT_WET", "INTERMEDIATE", "HEAVY_WET", "DRYING", "MIXED_TRANSITION"];

export function seedFor(key: string, reserved: Set<number>): number {
  let salt = 0;
  for (;;) {
    const digest = createHash("sha256").update(`${NAMESPACE}\u001f${key}\u001f${salt}`).digest();
    const seed = digest.readUInt32LE(0);
    if (!reserved.has(seed)) { reserved.add(seed); return seed; }
    salt++;
  }
}

function eventForCircuit(key: string): number {
  const index = developmentContent.events.findIndex((e) => developmentContent.circuits.find((c) => c.id === e.circuitId)?.key === key);
  if (index < 0) throw new Error(`2026 circuit missing from content: ${key}`);
  return index;
}

function namedScenario(input: Omit<Scenario, "seed" | "circuitId" | "circuitName" | "eventIndex" | "progressionRevision"> & { circuitKey: string }, reserved: Set<number>, reuse?: Map<string, number>): Scenario {
  const { circuitKey, ...scenario } = input;
  const eventIndex = eventForCircuit(circuitKey);
  const event = developmentContent.events[eventIndex];
  const circuit = developmentContent.circuits.find((c) => c.id === event.circuitId)!;
  const seed = input.seedReuseGroup && reuse?.has(input.seedReuseGroup)
    ? reuse.get(input.seedReuseGroup)!
    : seedFor(input.seedReuseGroup ?? input.scenarioId, reserved);
  if (input.seedReuseGroup && reuse && !reuse.has(input.seedReuseGroup)) reuse.set(input.seedReuseGroup, seed);
  return { ...scenario, seed, circuitId: circuit.id, circuitName: circuit.name, eventIndex, progressionRevision: 4 };
}

export function buildPilotManifest(): Scenario[] {
  const reserved = new Set<number>();
  return Array.from({ length: 100 }, (_, n) => {
    const eventIndex = n % developmentContent.events.length;
    const event = developmentContent.events[eventIndex];
    const circuit = developmentContent.circuits.find((c) => c.id === event.circuitId)!;
    const sprint = sprintVenues.has(circuit.id) && n % 5 === 0;
    const scenarioId = `PILOT-${String(n + 1).padStart(3, "0")}-${circuit.key}-${sprint ? "SPRINT" : "GP"}`;
    return {
      scenarioId,
      seed: seedFor(`PILOT\u001f${scenarioId}`, reserved),
      circuitId: circuit.id,
      circuitName: circuit.name,
      eventIndex,
      sessionType: sprint ? "SPRINT" : "RACE",
      progressionRevision: 4,
      weatherProfile: "SEEDED_DEVELOPMENT",
      commandProfile: "AI_DEFAULT",
      scenarioCategory: "REMOTE_PILOT",
      gridProfile: "STANDARD",
    };
  });
}

export function buildPrimaryManifest(): Scenario[] {
  const scenarios: Scenario[] = [];
  const reserved = new Set<number>();
  const blocks = new Map<string, number>();
  const add = (s: Parameters<typeof namedScenario>[0]) => scenarios.push(namedScenario(s, reserved, blocks));
  const events = developmentContent.events;

  for (const event of events) {
    const circuit = developmentContent.circuits.find((c) => c.id === event.circuitId)!;
    for (let n = 1; n <= 500; n++) add({
      scenarioId: `GP-${circuit.key}-${String(n).padStart(3, "0")}`,
      circuitKey: circuit.key, sessionType: "RACE", weatherProfile: "SEEDED_DEVELOPMENT", commandProfile: "AI_DEFAULT",
      scenarioCategory: "GP_NATURAL", gridProfile: "STANDARD",
    });
  }
  for (const eventIndex of sprintEventIndices) {
    const circuit = developmentContent.circuits.find((c) => c.id === events[eventIndex].circuitId)!;
    for (let n = 1; n <= 500; n++) add({
      scenarioId: `SPRINT-${circuit.key}-${String(n).padStart(3, "0")}`,
      circuitKey: circuit.key, sessionType: "SPRINT", weatherProfile: "SEEDED_DEVELOPMENT", commandProfile: "AI_DEFAULT",
      scenarioCategory: "SPRINT_NATURAL", gridProfile: "STANDARD",
    });
  }
  for (const key of commandCircuits) for (let block = 1; block <= 20; block++) {
    const group = `COMMAND-${key}-BLOCK-${String(block).padStart(2, "0")}`;
    for (const pace of commandPaces) for (const fuel of commandFuels) for (const energy of commandEnergies) add({
      scenarioId: `${group}-${pace}-${fuel}-${energy}`,
      circuitKey: key, sessionType: "RACE", weatherProfile: "SEEDED_DEVELOPMENT", commandProfile: `${pace}/${fuel}/${energy}`,
      scenarioCategory: "COMMAND_FACTORIAL", seedReuseGroup: group, gridProfile: "STANDARD",
    });
  }
  for (const key of trafficCircuits) for (let n = 1; n <= 250; n++) add({
    scenarioId: `TRAFFIC-${key}-${String(n).padStart(3, "0")}`,
    circuitKey: key, sessionType: "RACE", weatherProfile: "SEEDED_DEVELOPMENT", commandProfile: "AI_DEFAULT_DENSE_GRID",
    scenarioCategory: "TRAFFIC_PASSING", gridProfile: "FAST_CARS_MIDFIELD",
  });
  for (const key of weatherCircuits) for (let n = 1; n <= 200; n++) add({
    scenarioId: `WEATHER-${key}-${String(n).padStart(3, "0")}`,
    circuitKey: key, sessionType: "RACE", weatherProfile: weatherProfiles[(n - 1) % weatherProfiles.length], commandProfile: "AI_DEFAULT",
    scenarioCategory: "WEATHER", gridProfile: "STANDARD",
  });
  for (const key of incidentCircuits) for (let n = 1; n <= 100; n++) add({
    scenarioId: `INCIDENT-${key}-${String(n).padStart(3, "0")}`,
    circuitKey: key, sessionType: "RACE", weatherProfile: weatherProfiles[(n - 1) % weatherProfiles.length], commandProfile: "AI_DEFAULT_AGGRESSIVE_RACECRAFT",
    scenarioCategory: "INCIDENT_STRESS", gridProfile: "FAST_CARS_MIDFIELD",
  });

  if (scenarios.length !== 30_000) throw new Error(`Primary manifest size ${scenarios.length}, expected 30000`);
  const ids = new Set(scenarios.map((s) => s.scenarioId));
  if (ids.size !== scenarios.length) throw new Error("Duplicate scenario IDs in primary manifest");
  const groups = new Map<string, Scenario[]>();
  for (const s of scenarios) if (s.seedReuseGroup) groups.set(s.seedReuseGroup, [...(groups.get(s.seedReuseGroup) ?? []), s]);
  for (const [group, members] of groups) {
    if (members.length !== 45 || new Set(members.map((m) => m.seed)).size !== 1) throw new Error(`Invalid paired seed block ${group}`);
  }
  const unexpected = scenarios.filter((s) => !s.seedReuseGroup).map((s) => s.seed);
  if (new Set(unexpected).size !== unexpected.length) throw new Error("Unexpected duplicate primary seeds");
  return scenarios;
}

export function manifestHash(scenarios: readonly Scenario[]): string {
  return createHash("sha256").update(JSON.stringify(scenarios)).digest("hex");
}

export function commandProfiles() {
  return { paces: commandPaces, fuels: commandFuels, energies: commandEnergies };
}

export function circuitKeyFromId(id: string): string {
  const circuit = developmentContent.circuits.find((c) => c.id === id);
  if (!circuit) throw new Error(`Unknown circuit ID ${id}`);
  return circuit.key;
}

export function isSprintVenue(id: string) { return sprintVenues.has(id); }
export function sprintRounds() { return [...sprintEventIndices]; }
export function manifestStats(scenarios: readonly Scenario[]) {
  const result: Record<string, number> = {};
  for (const scenario of scenarios) result[scenario.scenarioCategory] = (result[scenario.scenarioCategory] ?? 0) + 1;
  return result;
}

// Keep the accepted event order, sprint set and full circuit roster visible in the QA artifact.
export function contentLock() {
  return {
    circuitCount: developmentContent.circuits.length,
    eventCount: developmentContent.events.length,
    teamCount: developmentContent.teams.length,
    raceDriverCount: developmentContent.driverEntries.filter((d) => d.role === "RACE_DRIVER").length,
    sprintCircuitIds: sprintEventIndices.map((i) => developmentContent.events[i].circuitId),
    circuits: developmentContent.circuits.map(({ id, key, name }) => ({ id, key, name })),
    events: developmentContent.events.map(({ id, circuitId, round, weekendFormat }) => ({ id, circuitId, round, weekendFormat })),
  };
}

import { describe, expect, it } from "vitest";
import { developmentContent } from "../src/data/seed/content-development";
import { validateContentDataset, type ContentDataset } from "../src/game/domain/content-dataset";
import { circuitInteractionConfiguration, defaultInteractionConfiguration, type CircuitRaceProfile } from "../src/simulation/race/traffic/profiles";
import { passProbability } from "../src/simulation/race/traffic/model";
import { advanceRaceLap, advanceRace, createRace } from "../src/simulation/race/engine";
import { defaultAiStrategyConfiguration } from "../src/simulation/race/pits/ai-strategy";
import { startIncidentCareerRace } from "../src/features/race/service";
import { commandInput } from "./helpers/commands";
import { careerGrid, raceRepository } from "./helpers/grid";

const DIFFICULT: CircuitRaceProfile = { overtakingDifficulty: 85, dirtyAirSensitivityPermille: 1500, drsEffectivenessPermille: 350 };
const FRIENDLY: CircuitRaceProfile = { overtakingDifficulty: 15, dirtyAirSensitivityPermille: 900, drsEffectivenessPermille: 1350 };
const profileOf = (c: { overtakingDifficulty?: number | null; dirtyAirSensitivityPermille?: number | null; drsEffectivenessPermille?: number | null }) =>
  c.overtakingDifficulty == null ? null : { overtakingDifficulty: c.overtakingDifficulty, dirtyAirSensitivityPermille: c.dirtyAirSensitivityPermille!, drsEffectivenessPermille: c.drsEffectivenessPermille! };
/** Content as it was before the Race Dynamics pass: circuits carry no Race profile. */
function legacyContent(): ContentDataset {
  const c = structuredClone(developmentContent) as unknown as ContentDataset;
  return { ...c, circuits: c.circuits.map(row => { const rest = { ...row }; delete rest.overtakingDifficulty; delete rest.dirtyAirSensitivityPermille; delete rest.drsEffectivenessPermille; return rest; }) };
}

describe("circuit Race interaction profile — data", () => {
  it("every development circuit carries a complete, valid profile as plain data", () => {
    expect(() => validateContentDataset(developmentContent)).not.toThrow();
    for (const c of developmentContent.circuits) {
      const p = profileOf(c)!;
      expect(p, c.key).not.toBeNull();
      expect(p.overtakingDifficulty).toBeGreaterThanOrEqual(0); expect(p.overtakingDifficulty).toBeLessThanOrEqual(100);
    }
    // The profiles genuinely differ (identity, not one shared value).
    expect(new Set(developmentContent.circuits.map(c => c.overtakingDifficulty)).size).toBeGreaterThanOrEqual(6);
  });
  it("the validator rejects a partial or out-of-range profile and accepts none at all (legacy content)", () => {
    const base = structuredClone(developmentContent) as unknown as ContentDataset;
    const withCircuit = (patch: object) => ({ ...base, circuits: base.circuits.map((c, i) => i === 0 ? { ...c, ...patch } : c) });
    expect(() => validateContentDataset(withCircuit({ drsEffectivenessPermille: null }))).toThrow();
    expect(() => validateContentDataset(withCircuit({ overtakingDifficulty: 101 }))).toThrow();
    expect(() => validateContentDataset(withCircuit({ dirtyAirSensitivityPermille: 2001 }))).toThrow();
    expect(() => validateContentDataset(legacyContent())).not.toThrow();
  });
  it("no profile → exactly the neutral legacy interaction; a profile changes only its three values", () => {
    expect(circuitInteractionConfiguration(null)).toEqual(defaultInteractionConfiguration());
    expect(circuitInteractionConfiguration(undefined)).toEqual(defaultInteractionConfiguration());
    expect(circuitInteractionConfiguration(DIFFICULT)).toEqual({ ...defaultInteractionConfiguration(), ...DIFFICULT });
  });
});

describe("circuit Race interaction profile — Career snapshot and Race start", () => {
  it("a new Career snapshots each circuit's profile; its Race freezes that profile and the AI strategy", async () => {
    const g = await careerGrid("team-mclaren"), m = raceRepository(g);
    const circuit = g.world.circuits.find(c => c.id === g.progress.events[0].careerCircuitId)!;
    const source = developmentContent.circuits.find(c => c.id === circuit.sourceCircuitId)!;
    expect(profileOf(circuit)).toEqual(profileOf(source));
    await startIncidentCareerRace(m.repository, g.career.id, m.eventId, {}, 77);
    const s = m.get().state!;
    expect(s.simulationVersion).toBe(7);
    expect(s.input.interaction).toEqual(circuitInteractionConfiguration(profileOf(circuit)));
    expect(s.input.pits!.strategy).toEqual(defaultAiStrategyConfiguration());
    // AI dry starts never use the hard; the player's own choice is untouched (default medium).
    expect(s.input.entrants.filter(e => e.strategyController === "DEVELOPMENT_AI").every(e => e.startingTyre!.compound !== "HARD")).toBe(true);
    expect(s.input.entrants.filter(e => e.strategyController === "PLAYER").every(e => e.startingTyre!.compound === "MEDIUM")).toBe(true);
  });
  it("an older Career (no snapshotted profile) keeps the neutral interaction; live source data is never read", async () => {
    const g = await careerGrid("team-mclaren", legacyContent()), m = raceRepository(g);
    expect(g.world.circuits.every(c => profileOf(c) === null)).toBe(true);
    await startIncidentCareerRace(m.repository, g.career.id, m.eventId, {}, 77);
    expect(m.get().state!.input.interaction).toEqual(defaultInteractionConfiguration());
  });
  it("Qualifying grid preserved; each driver keeps their own performance with the new strategy and circuit inputs", async () => {
    const g = await careerGrid("team-cadillac"), order = [...g.roster].reverse().map(r => r.driverId), m = raceRepository(g, order);
    await startIncidentCareerRace(m.repository, g.career.id, m.eventId, {}, 99);
    const s = m.get().state!;
    for (const e of s.input.entrants) {
      const r = g.roster.find(x => x.driverId === e.driverId)!;
      expect(e.gridPosition).toBe(order.indexOf(e.driverId) + 1);
      expect([e.driver.pace, e.driver.consistency, e.car.performance]).toEqual([r.balance!.pace, r.balance!.consistency, r.balance!.carPerformance]);
    }
  });
  it("same Career snapshot and seed → identical Race on a difficult-passing and a passing-friendly circuit", async () => {
    for (const profile of [DIFFICULT, FRIENDLY]) {
      const run = async () => {
        const g = await careerGrid("team-mclaren"), m = raceRepository(g);
        await startIncidentCareerRace(m.repository, g.career.id, m.eventId, {}, 4242);
        const s = m.get().state!;
        return advanceRace({ ...s, input: { ...s.input, interaction: circuitInteractionConfiguration(profile) } }, 1000);
      };
      const [a, b] = [await run(), await run()];
      const summary = (r: typeof a) => r.entrants.map(e => [r.input.entrants.findIndex(x => x.entrantId === e.entrantId), e.position, e.elapsedTimeMs, e.pit!.stops.map(x => [x.lap, x.newCompound])]);
      expect(a.status).toBe("FINISHED");
      expect(summary(a)).toEqual(summary(b));
    }
  });
});

describe("circuit Race interaction profile — controlled effect", () => {
  it("identical attack: the difficult-passing profile gives a lower pass probability than the passing-friendly one", () => {
    const [hard, easy] = [DIFFICULT, FRIENDLY].map(circuitInteractionConfiguration);
    const a = { overtaking: 65, defending: 65 };
    for (const [pace, drs] of [[150, true], [400, true], [400, false], [800, true]] as const) {
      const ph = passProbability(pace, a, a, 0, drs, hard), pe = passProbability(pace, a, a, 0, drs, easy);
      expect(ph, `${pace}/${drs}`).toBeLessThan(pe);
    }
    // Modifies likelihood, never scripts it: a big pace advantage still passes at the hard circuit, and a small one
    // is not guaranteed at the easy one.
    expect(passProbability(900, a, a, 0, true, hard)).toBeGreaterThan(0);
    expect(passProbability(150, a, a, 0, true, easy)).toBeLessThan(950);
  });
  it("controlled two-car battles, all other inputs equal: fewer successful passes on the difficult profile", () => {
    const passes = (profile: CircuitRaceProfile) => {
      let n = 0;
      for (let seed = 0; seed < 300; seed++) {
        const i = commandInput(2);
        const input = { ...i, seed, parameters: { ...i.parameters, gridOffsetMs: 600 }, interaction: { ...circuitInteractionConfiguration(profile), drsActivationLap: 1, opportunityIntervalLaps: 1 },
          entrants: i.entrants.map((e, k) => k === 1 ? { ...e, car: { performance: Math.min(100, e.car.performance + 20) } } : e) };
        if (advanceRaceLap(createRace(input)).entrants.find(e => e.entrantId === i.entrants[1].entrantId)!.track!.passed) n++;
      }
      return n;
    };
    const hard = passes(DIFFICULT), easy = passes(FRIENDLY);
    expect(hard).toBeLessThan(easy);
    expect(hard).toBeGreaterThan(0);   // still possible
    expect(easy).toBeLessThan(300);    // not guaranteed
  });
  it("dirty air costs more on the dirty-air-sensitive profile; DRS is worth more on the passing-friendly one", async () => {
    const { followingEffects } = await import("../src/simulation/race/traffic/model");
    const hard = followingEffects(600, 10, circuitInteractionConfiguration(DIFFICULT)), easy = followingEffects(600, 10, circuitInteractionConfiguration(FRIENDLY));
    expect(hard.dirtyAirMs).toBeGreaterThan(easy.dirtyAirMs);
    expect(hard.drsBenefitMs).toBeLessThan(easy.drsBenefitMs);
  });
});

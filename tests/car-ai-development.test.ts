import { describe, expect, it } from "vitest";
import { developmentContent } from "../src/data/seed/content-development";
import { CAR_DEVELOPMENT_STYLES, planAiCarDesign, isNonWorseDesign } from "../src/game/domain/car-ai-development";
import { CAR_PART_TYPES, CAR_PERFORMANCE_DIMENSIONS, deriveSessionCarPerformance, deriveOverallCarPerformance, sourceCarStats, uniformCarStats } from "../src/game/domain/car-development";
import { DESIGN_FOCUSES, DESIGN_PROGRAMMES } from "../src/game/domain/car-design-project";
import { rosterBalance } from "../src/game/domain/race-repository";

const profiles = [
  [94,94,93,92,92], [93,94,92,91,90], [95,95,96,92,92], [91,92,94,92,91], [88,87,89,86,85],
  [85,85,83,84,83], [85,87,86,87,85], [84,85,86,85,85], [86,87,90,90,87], [88,87,86,84,85], [81,82,81,83,83],
];
const styles = ["BALANCED","FIX_WEAKNESS","BUILD_STRENGTH","BUILD_STRENGTH","FIX_WEAKNESS","FIX_WEAKNESS","BALANCED","BALANCED","BUILD_STRENGTH","FIX_WEAKNESS","BALANCED"];
describe("Phase 17D technical identity and precision", () => {
  it("matches all 11 exact content profiles, styles and previous baseline means", () => {
    expect(developmentContent.database.version).toBe("1.3.0");
    expect(developmentContent.database.schemaVersion).toBe(1);
    developmentContent.teamEntries.forEach((entry, index) => {
      const stats = sourceCarStats(entry);
      expect(CAR_PERFORMANCE_DIMENSIONS.map(dimension => stats[dimension])).toEqual(profiles[index]);
      expect(entry.developmentStyle).toBe(styles[index]);
      expect(new Set(Object.values(stats)).size).toBeGreaterThan(1);
      expect(deriveSessionCarPerformance(stats)).toBe(entry.carPerformance);
      expect(deriveOverallCarPerformance(stats)).toBe(entry.carPerformance);
    });
  });
  it.each([[uniformCarStats(93),93], [{...uniformCarStats(93),lowSpeed:94},93.2],
    [{lowSpeed:95,mediumSpeed:94,highSpeed:94,dragReduction:93,drsEfficiency:94},94]] as const)("uses explicit fifth-point session precision %#", (stats, expected) => {
    expect(deriveSessionCarPerformance(stats)).toBe(expected);
  });
  it("keeps rounded legacy inputs while fitted parts use fractional input", () => {
    const parts = CAR_PART_TYPES.map(partType => ({partType,version:1,...uniformCarStats(93)}));
    parts[0] = {...parts[0],lowSpeed:95};
    const common = {pace:90,consistency:90,teamEntry:{carPerformance:93,partDesigns:parts}};
    expect(rosterBalance(common)?.carPerformance).toBe(93);
    expect(rosterBalance({...common,fittedDesigns:parts})?.carPerformance).toBe(93.2);
  });
});
describe("deterministic AI design policy", () => {
  const initial = {lowSpeed:70,mediumSpeed:80,highSpeed:90,dragReduction:75,drsEfficiency:85};
  const designs = CAR_PART_TYPES.map(partType => ({partType,version:1,stats:initial}));
  it.each(CAR_DEVELOPMENT_STYLES)("uses valid existing mechanics for %s", style => {
    const input = {style,initial,current:initial,designs,activeParts:[],projectsStarted:0};
    const choice = planAiCarDesign(input)!;
    expect(choice).toEqual(planAiCarDesign(structuredClone(input)));
    expect(CAR_PART_TYPES).toContain(choice.partType);
    expect(DESIGN_FOCUSES).toContain(choice.focus);
    expect(DESIGN_PROGRAMMES).toContain(choice.programme);
    expect(planAiCarDesign({...input,activeParts:[choice.partType]})?.partType).not.toBe(choice.partType);
    expect(planAiCarDesign({...input,activeParts:["FRONT_WING","REAR_WING"]})).toBeNull();
    expect(planAiCarDesign({...input,designs:designs.map(design=>({...design,stats:uniformCarStats(100)}))})).toBeNull();
  });
  it("fixes weakness and keeps the original strength anchor after current strengths change", () => {
    expect(planAiCarDesign({style:"FIX_WEAKNESS",initial,current:initial,designs,activeParts:[],projectsStarted:0})?.focus).toBe("LOW_SPEED");
    expect(planAiCarDesign({style:"BUILD_STRENGTH",initial,current:{...initial,lowSpeed:99},designs,activeParts:[],projectsStarted:0})?.focus).toBe("HIGH_SPEED");
  });
  it("alternates Balanced programmes and handles weakly better fitment", () => {
    const input = {style:"BALANCED" as const,initial,current:initial,designs,activeParts:[],projectsStarted:0};
    expect(planAiCarDesign(input)?.programme).toBe("STANDARD");
    expect(planAiCarDesign({...input,projectsStarted:1})?.programme).toBe("EXTENSIVE");
    expect(isNonWorseDesign({...designs[0],version:2},designs[0])).toBe(true);
    expect(isNonWorseDesign({...designs[0],version:2,stats:{...initial,lowSpeed:69}},designs[0])).toBe(false);
  });
  it("produces several initial choices on the data-driven grid", () => {
    const choices = developmentContent.teamEntries.slice(1).map(entry => {
      const stats = sourceCarStats(entry);
      return planAiCarDesign({style:entry.developmentStyle,initial:stats,current:stats,
        designs:CAR_PART_TYPES.map(partType=>({partType,version:1,stats})),activeParts:[],projectsStarted:0});
    });
    expect(new Set(choices.map(choice=>JSON.stringify(choice))).size).toBeGreaterThanOrEqual(4);
  });
});

/** Management ratings only. Session simulators continue to consume one frozen 0–100 performance number. */
export interface CarPerformanceStats {
  readonly lowSpeed: number;
  readonly mediumSpeed: number;
  readonly highSpeed: number;
  readonly dragReduction: number;
  readonly drsEfficiency: number;
}
export const CAR_PERFORMANCE_DIMENSIONS = ["lowSpeed", "mediumSpeed", "highSpeed", "dragReduction", "drsEfficiency"] as const satisfies readonly (keyof CarPerformanceStats)[];
export const CAR_PART_TYPES = ["FRONT_WING", "REAR_WING", "UNDERFLOOR", "SIDEPODS", "CHASSIS", "SUSPENSION"] as const;
export type CarPartType = typeof CAR_PART_TYPES[number];
export interface CarPartDesign {
  readonly partType: CarPartType;
  readonly version: number;
  readonly stats: CarPerformanceStats;
}
export interface StoredCarPartDesign extends Omit<CarPartDesign, "stats">, CarPerformanceStats {}

/** Each column sums to 100. These simple management weights are not a CFD or circuit-pace model. */
export const PART_RELEVANCE: Readonly<Record<CarPartType, CarPerformanceStats>> = Object.freeze({
  FRONT_WING: Object.freeze({ lowSpeed: 30, mediumSpeed: 25, highSpeed: 10, dragReduction: 0, drsEfficiency: 0 }),
  REAR_WING: Object.freeze({ lowSpeed: 0, mediumSpeed: 10, highSpeed: 25, dragReduction: 35, drsEfficiency: 60 }),
  UNDERFLOOR: Object.freeze({ lowSpeed: 20, mediumSpeed: 30, highSpeed: 30, dragReduction: 25, drsEfficiency: 10 }),
  SIDEPODS: Object.freeze({ lowSpeed: 0, mediumSpeed: 10, highSpeed: 15, dragReduction: 25, drsEfficiency: 10 }),
  CHASSIS: Object.freeze({ lowSpeed: 20, mediumSpeed: 10, highSpeed: 10, dragReduction: 15, drsEfficiency: 20 }),
  SUSPENSION: Object.freeze({ lowSpeed: 30, mediumSpeed: 15, highSpeed: 10, dragReduction: 0, drsEfficiency: 0 }),
});
export function validateCarPerformanceStats(stats: CarPerformanceStats): void {
  for (const dimension of CAR_PERFORMANCE_DIMENSIONS) {
    const value = stats[dimension];
    if (!Number.isSafeInteger(value) || value < 0 || value > 100) throw new RangeError(`Invalid ${dimension} car performance`);
  }
}
export function validateCarPartDesign(design: CarPartDesign): void {
  if (!CAR_PART_TYPES.includes(design.partType) || !Number.isSafeInteger(design.version) || design.version < 1) throw new RangeError("Invalid car part design");
  validateCarPerformanceStats(design.stats);
}
export function aggregateCarPerformance(parts: readonly CarPartDesign[]): CarPerformanceStats {
  if (parts.length !== CAR_PART_TYPES.length) throw new RangeError("A car specification requires six parts");
  const byType = new Map<CarPartType, CarPartDesign>();
  for (const part of parts) {
    validateCarPartDesign(part);
    if (byType.has(part.partType)) throw new RangeError("Duplicate car part type");
    byType.set(part.partType, part);
  }
  if (byType.size !== CAR_PART_TYPES.length) throw new RangeError("Incomplete car specification");
  return Object.fromEntries(CAR_PERFORMANCE_DIMENSIONS.map(dimension => [dimension,
    Math.floor((CAR_PART_TYPES.reduce((sum, type) => sum + byType.get(type)!.stats[dimension] * PART_RELEVANCE[type][dimension], 0) + 50) / 100),
  ])) as unknown as CarPerformanceStats;
}
/** Round-to-nearest with integer arithmetic; five equal ratings X derive exactly X. */
export function deriveOverallCarPerformance(stats: CarPerformanceStats): number {
  validateCarPerformanceStats(stats);
  return Math.floor((CAR_PERFORMANCE_DIMENSIONS.reduce((sum, dimension) => sum + stats[dimension], 0) + 2) / 5);
}
/** Fixed fifth-point precision: integer management areas produce exact 0.2-point session increments.
 * Only physically fitted cars use this bridge; legacy team-level saves retain their rounded scalar. */
export function deriveSessionCarPerformance(stats: CarPerformanceStats): number {
  validateCarPerformanceStats(stats);
  const fifthPoints = CAR_PERFORMANCE_DIMENSIONS.reduce((sum, dimension) => sum + stats[dimension], 0);
  return fifthPoints / CAR_PERFORMANCE_DIMENSIONS.length;
}
/** Accepted pre-content Career fallback, shared by snapshots and the existing session builder. */
export function legacyCarPerformance(teamOrder: number): number {
  if (!Number.isSafeInteger(teamOrder) || teamOrder < 1) throw new RangeError("Invalid team order");
  return 92 - ((teamOrder - 1) % 8) * 2;
}
export function uniformCarStats(value: number): CarPerformanceStats {
  const stats = { lowSpeed: value, mediumSpeed: value, highSpeed: value, dragReduction: value, drsEfficiency: value };
  validateCarPerformanceStats(stats);
  return stats;
}
export function sourceCarStats(source: {
  readonly entryOrder: number;
  readonly carPerformance?: number | null;
  readonly lowSpeedPerformance?: number | null;
  readonly mediumSpeedPerformance?: number | null;
  readonly highSpeedPerformance?: number | null;
  readonly dragReductionPerformance?: number | null;
  readonly drsEfficiencyPerformance?: number | null;
}): CarPerformanceStats {
  const fallback = source.carPerformance ?? legacyCarPerformance(source.entryOrder);
  const stats = {
    lowSpeed: source.lowSpeedPerformance ?? fallback,
    mediumSpeed: source.mediumSpeedPerformance ?? fallback,
    highSpeed: source.highSpeedPerformance ?? fallback,
    dragReduction: source.dragReductionPerformance ?? fallback,
    drsEfficiency: source.drsEfficiencyPerformance ?? fallback,
  };
  validateCarPerformanceStats(stats);
  return stats;
}
export function storedPartDesign(part: StoredCarPartDesign): CarPartDesign {
  return { partType: part.partType, version: part.version, stats: {
    lowSpeed: part.lowSpeed, mediumSpeed: part.mediumSpeed, highSpeed: part.highSpeed,
    dragReduction: part.dragReduction, drsEfficiency: part.drsEfficiency,
  } };
}
export function currentCarPerformance(parts: readonly StoredCarPartDesign[]): { stats: CarPerformanceStats; overall: number } | null {
  if (!parts.length) return null;
  const stats = aggregateCarPerformance(parts.map(storedPartDesign));
  return { stats, overall: deriveOverallCarPerformance(stats) };
}

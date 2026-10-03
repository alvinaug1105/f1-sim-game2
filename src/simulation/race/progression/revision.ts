import type { ProgressionConfiguration } from './model';
/**
 * Race v8 progression revisions (all simulationVersion 8). Each is a frozen generation; a saved Race keeps its own:
 *
 * - 1 — v8A: authoritative track progression, lapping, local zones (historical tie order; legacy ERS controls).
 * - 2 — v8B: pit routing, Active Aero, Overtake Mode, Boost / Recharge / Balanced energy (time-based recovery).
 * - 3 — v8C: everything in revision 2, plus the snapshotted FIA dry-tyre regulation (AI compliance, warnings,
 *   classification sanction) and the corrected energy equilibrium (distance-based recovery, no recovery in BOOST).
 * - 4 — v8D: everything in revision 3 (same regulation, energy and classification), created with the v8D Race tuning
 *   bundle: wet-weather AI character, v8D tyre cliff profiles, late-Race attack window and circuit-derived pit timing.
 *   The tuning itself lives in the Race's own snapshotted configuration (tyres / pit / strategy / racecraft / incidents),
 *   never in a revision check inside the simulation.
 *
 * This is the single compatibility boundary: callers ask WHAT a Race's revision provides, never `version === n`.
 */
export type ProgressionRevision = ProgressionConfiguration['version'];
export const LATEST_PROGRESSION_REVISION = 4 as const;
/** v8B systems (assistance energy store, Active Aero, Overtake Mode, observed routes, authored pit anchors): revision ≥ 2. */
export function hasAssistance<T extends Pick<ProgressionConfiguration, 'version'>>(c: T | null | undefined): c is T { return !!c && c.version >= 2; }
/** Energy accounting model: v8B time-based recovery (revision 2) or v8C distance-based recovery (revisions 3 and 4). */
export function energyModelFor(c: Pick<ProgressionConfiguration, 'version'>): 'V8B' | 'V8C' { return c.version >= 3 ? 'V8C' : 'V8B'; }
/** The v8C sporting regulation and authoritative final classification: revision ≥ 3. */
export function hasRegulation(c: Pick<ProgressionConfiguration, 'version'> | null | undefined): boolean { return !!c && c.version >= 3; }
/** Created with the v8D Race tuning bundle: revision ≥ 4. */
export function hasV8dTuning(c: Pick<ProgressionConfiguration, 'version'> | null | undefined): boolean { return !!c && c.version >= 4; }
/** The Race's snapshotted sporting regulation (revision ≥ 3; null for historical revisions 1 and 2). */
export function regulationFor(c: Pick<ProgressionConfiguration, 'regulation'> | null | undefined) { return c?.regulation ?? null; }

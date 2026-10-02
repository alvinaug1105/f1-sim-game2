import type { RaceEntrantState } from '../types';
import type { ProgressionConfiguration } from './model';
/**
 * Versioned compatibility boundary for exact ties between cars (equal physical distance on track, or equal race
 * distance / time in the classification). This is the ONLY place a progression revision chooses its tie rule; the
 * engines and AI policies receive the rule from `tieOrderFor` and never branch on the revision themselves.
 */
export type TieOrder = (a: RaceEntrantState, b: RaceEntrantState) => number;
/**
 * Revision 2 onwards (v8B): Race-domain order — the car higher in the current classification. Positions are unique,
 * so this is a total order that never depends on generated entrant / driver / team ID text.
 */
export const domainTieOrder: TieOrder = (a, b) => a.position - b.position;
/**
 * FROZEN revision-1 (v8A) compatibility: entrant-ID text order, exactly as the accepted v8A engine resolved ties.
 * Kept only so that existing v8A saves continue as they were accepted (same IDs → same continuation). It makes the
 * outcome depend on generated UUID text, so it must never be selected for a new revision.
 */
export const revision1TieOrder: TieOrder = (a, b) => a.entrantId.localeCompare(b.entrantId);
/** The tie rule frozen into a Race by its progression configuration revision. */
export function tieOrderFor(config: Pick<ProgressionConfiguration, 'version'>): TieOrder {
    return config.version === 1 ? revision1TieOrder : domainTieOrder;
}

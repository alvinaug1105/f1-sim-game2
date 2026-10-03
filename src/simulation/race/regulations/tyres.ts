/**
 * Race v8C dry-tyre regulation (progression revision 3).
 *
 * Source: FIA 2026 Formula 1 Regulations — Section B [Sporting], Issue 09 (published 2026-10-01):
 * - B6.3.6: unless a driver used intermediate or wet-weather tyres during the Race, they must use at least two
 *   different dry-weather specifications, at least one of them a mandatory dry-weather Race specification (B6.1.2);
 *   in a normally completed Race a failure means disqualification from the Race results.
 * - B6.3.2: a tyre counts as used once the car has left its grid position, or has left the pit lane, with it fitted.
 * - B6.1.2: up to two mandatory dry-weather Race specifications are announced before each Competition.
 *
 * Game model: generic SOFT / MEDIUM / HARD dry specifications. The minimum-different-specifications rule, the wet
 * exemption and the disqualification are enforced. The mandatory Race specification is supported by the snapshot
 * (`mandatoryDrySpecifications`) but left EMPTY: there is no source-backed per-event dataset, and none is invented.
 * Not modelled: the suspended-and-not-restarted Race (a 30 s penalty instead of disqualification) — the game has no
 * Race suspension. The Sprint is not subject to B6.3.6.
 *
 * Everything here is pure, deterministic and draws no random numbers. Compliance is derived from the authoritative
 * stint history (actual tyres used), never from requests, plans or forecasts.
 */
import { TYRE_COMPOUNDS, type DryTyreCompound, type TyreCompound } from '../tyres/model';
import type { RaceEntrantState, RaceSimulationState } from '../types';
import type { CarProgression } from '../progression/model';

export type RegulatedSession = 'RACE' | 'SPRINT';
export interface DryTyreRule {
    /** FIA article this rule implements. */
    readonly article: 'B6.3.6';
    /** Minimum number of different dry-weather specifications a finisher must have used. */
    readonly minimumDistinctDrySpecifications: number;
    /** Actual intermediate / wet-weather use waives the dry requirement. */
    readonly wetTyreExemption: boolean;
    /** B6.1.2 mandatory dry Race specification(s): empty until source-backed event data exists (never invented). */
    readonly mandatoryDrySpecifications: readonly DryTyreCompound[];
    /** Normally completed Race. (The suspended-Race time penalty is unsupported: there is no Race suspension.) */
    readonly consequence: 'DISQUALIFICATION';
    /**
     * Game rule (not FIA): the last safe stop opportunity is this many checkpoints before the last lap on which a pit
     * request can still be made. The AI must comply by then; the player is warned (URGENT) from then on.
     */
    readonly latestSafeStopMarginLaps: number;
}
export interface RaceRegulationConfiguration {
    readonly version: 1;
    readonly source: { readonly document: 'FIA 2026 Formula 1 Regulations - Section B [Sporting]'; readonly issue: 9; readonly published: '2026-10-01' };
    readonly session: RegulatedSession;
    /** null: B6.3.6 does not apply to this session (the Sprint). */
    readonly dryTyres: DryTyreRule | null;
}
/** Snapshotted at Race creation from the session kind (never inferred from the circuit). */
export function raceRegulationForSession(session: RegulatedSession): RaceRegulationConfiguration {
    return {
        version: 1,
        source: { document: 'FIA 2026 Formula 1 Regulations - Section B [Sporting]', issue: 9, published: '2026-10-01' },
        session,
        dryTyres: session === 'SPRINT' ? null : {
            article: 'B6.3.6', minimumDistinctDrySpecifications: 2, wetTyreExemption: true, mandatoryDrySpecifications: [],
            consequence: 'DISQUALIFICATION', latestSafeStopMarginLaps: 3,
        },
    };
}
const isDry = (c: TyreCompound): c is DryTyreCompound => (TYRE_COMPOUNDS as readonly string[]).includes(c);
/** Rejects incomplete or contradictory regulation snapshots. `available` = the Race's tyre profiles. */
export function validateRegulationConfiguration(c: RaceRegulationConfiguration, available: readonly TyreCompound[]) {
    if (!c || c.version !== 1 || c.source?.issue !== 9 || c.source.published !== '2026-10-01' || !['RACE', 'SPRINT'].includes(c.session)) throw new RangeError('Invalid Race regulation snapshot');
    if (c.session === 'SPRINT') { if (c.dryTyres !== null) throw new RangeError('B6.3.6 does not apply to the Sprint'); return; }
    const r = c.dryTyres;
    if (!r || r.article !== 'B6.3.6' || r.consequence !== 'DISQUALIFICATION' || typeof r.wetTyreExemption !== 'boolean' || !Array.isArray(r.mandatoryDrySpecifications)) throw new RangeError('Invalid dry tyre rule');
    const dry = available.filter(isDry);
    if (!Number.isSafeInteger(r.minimumDistinctDrySpecifications) || r.minimumDistinctDrySpecifications < 2 || r.minimumDistinctDrySpecifications > dry.length) throw new RangeError('Unsatisfiable dry tyre rule');
    if (r.mandatoryDrySpecifications.length > 2 || new Set(r.mandatoryDrySpecifications).size !== r.mandatoryDrySpecifications.length || r.mandatoryDrySpecifications.some(m => !dry.includes(m))) throw new RangeError('Invalid mandatory dry specification');
    if (!Number.isSafeInteger(r.latestSafeStopMarginLaps) || r.latestSafeStopMarginLaps < 1 || r.latestSafeStopMarginLaps > 10) throw new RangeError('Invalid regulation deadline margin');
}

/**
 * Tyres ACTUALLY used, in stint order (B6.3.2): the starting tyre once the car has left its grid position; a tyre
 * fitted in the pit once the car has left the pit lane with it (the open stint of a car still on its pit EXIT route
 * does not count yet). Pending requests, committed-but-unserviced stops and plans never appear in the stint history.
 */
export function usedCompounds(e: RaceEntrantState, route: CarProgression['route'] | undefined): TyreCompound[] {
    const moved = e.completedLaps > 0 || (e.track?.progressMicrolaps ?? 0) > 0;
    return (e.pit?.stints ?? []).flatMap((s, i) => (i === 0 ? moved : !(s.endLap === null && route === 'EXIT')) ? [s.startingTyre.compound] : []);
}
export type TyreRuleStatus = 'NOT_APPLICABLE' | 'EXEMPT' | 'SATISFIED' | 'OUTSTANDING' | 'URGENT' | 'VIOLATED';
export interface TyreRuleAssessment {
    readonly status: TyreRuleStatus;
    /** Distinct dry specifications actually used (softest → hardest). */
    readonly usedDry: readonly DryTyreCompound[];
    /** An intermediate or wet-weather tyre was actually used. */
    readonly wetUsed: boolean;
    readonly required: number;
    readonly mandatory: readonly DryTyreCompound[];
    /** Last checkpoint at which complying is still comfortably possible (AI must have committed by then). */
    readonly deadlineLap: number | null;
    /** Last checkpoint at which any pit request can still be made. */
    readonly lastRequestLap: number | null;
    /** Tyre currently fitted (already being used; counts by the time any further tyre is fitted). */
    readonly current: TyreCompound | null;
}
/** One entrant's current obligation under the Race's frozen regulation. Pure; consumes no random numbers. */
export function assessTyreRule(state: RaceSimulationState, entrantId: string): TyreRuleAssessment {
    const rule = state.input.progression?.regulation?.dryTyres ?? null, e = state.entrants.find(x => x.entrantId === entrantId)!;
    const used = usedCompounds(e, state.progression?.cars[entrantId]?.route);
    const usedDry = TYRE_COMPOUNDS.filter(c => used.includes(c)), wetUsed = used.some(c => !isDry(c));
    const base = { usedDry, wetUsed, required: rule?.minimumDistinctDrySpecifications ?? 0, mandatory: rule?.mandatoryDrySpecifications ?? [], current: e.stint?.tyre.compound ?? null,
        deadlineLap: rule ? Math.max(0, state.input.totalLaps - 2 - rule.latestSafeStopMarginLaps) : null, lastRequestLap: rule ? state.input.totalLaps - 2 : null };
    if (!rule || e.incident?.status === 'RETIRED') return { ...base, status: 'NOT_APPLICABLE' };
    if (rule.wetTyreExemption && wetUsed) return { ...base, status: 'EXEMPT' };
    if (dryRequirementMet(usedDry, rule)) return { ...base, status: 'SATISFIED' };
    if (e.incident?.status === 'FINISHED' || state.status === 'FINISHED') return { ...base, status: 'VIOLATED' };
    return { ...base, status: state.lap >= base.deadlineLap! ? 'URGENT' : 'OUTSTANDING' };
}
function dryRequirementMet(usedDry: readonly DryTyreCompound[], rule: DryTyreRule) {
    return usedDry.length >= rule.minimumDistinctDrySpecifications && (!rule.mandatoryDrySpecifications.length || usedDry.some(c => rule.mandatoryDrySpecifications.includes(c)));
}
/**
 * Would fitting `compound` next (after the tyre currently fitted has been used) meet the requirement? Used to mark the
 * player's compound choices and to filter the AI's legal candidates. Wet-family tyres meet it through the exemption.
 */
export function compoundSatisfies(a: TyreRuleAssessment, compound: TyreCompound, rule: DryTyreRule) {
    if (!isDry(compound)) return rule.wetTyreExemption;
    const after = TYRE_COMPOUNDS.filter(c => a.usedDry.includes(c) || c === a.current || c === compound);
    return dryRequirementMet(after, rule);
}

export type ClassificationStatus = 'CLASSIFIED' | 'RETIRED' | 'DISQUALIFIED';
export interface ClassificationEntry {
    readonly entrantId: string;
    /** Order in which the car's Race ended on the road (finishers by distance and time, then retirements). */
    readonly roadPosition: number;
    /** Official position after enforcement; disqualified cars are listed after every other car. */
    readonly position: number;
    readonly status: ClassificationStatus;
    readonly reason: 'DRY_TYRE_SPECIFICATIONS' | null;
}
/** Authoritative final classification record (revision 3): persisted with the finished Race. */
export interface RaceClassificationRecord { readonly version: 1; readonly entries: readonly ClassificationEntry[] }
/**
 * Enforcement at the flag (B6.3.6): every finisher bound by the rule who did not meet it is disqualified. Compliant
 * cars behind are promoted (`reclassify` recomputes positions, gaps and intervals among the remaining cars) and the
 * disqualified cars follow every other car with no gap. Retirements stay retirements. Road order is kept in the record.
 */
export function enforceFinalClassification(state: RaceSimulationState, reclassify: (entrants: RaceEntrantState[]) => RaceEntrantState[]): { entrants: RaceEntrantState[]; record: RaceClassificationRecord } {
    const road = [...state.entrants].sort((a, b) => a.position - b.position);
    const dsq = new Set(road.filter(e => e.incident?.status === 'FINISHED' && assessTyreRule(state, e.entrantId).status === 'VIOLATED').map(e => e.entrantId));
    const kept = dsq.size ? reclassify(road.filter(e => !dsq.has(e.entrantId))) : road;
    const official = [...kept, ...road.filter(e => dsq.has(e.entrantId)).map((e, i) => ({ ...e, position: kept.length + i + 1, gapToLeaderMs: null, intervalToAheadMs: null }))];
    const roadOf = new Map(road.map(e => [e.entrantId, e.position]));
    return {
        entrants: official,
        record: { version: 1, entries: official.map(e => ({ entrantId: e.entrantId, roadPosition: roadOf.get(e.entrantId)!, position: e.position,
            status: dsq.has(e.entrantId) ? 'DISQUALIFIED' as const : e.incident?.status === 'RETIRED' ? 'RETIRED' as const : 'CLASSIFIED' as const,
            reason: dsq.has(e.entrantId) ? 'DRY_TYRE_SPECIFICATIONS' as const : null })) },
    };
}
/** Saved-state check: the record must be exactly what enforcement derives from the persisted tyre history. */
export function validateClassificationRecord(state: RaceSimulationState, record: RaceClassificationRecord) {
    if (!record || record.version !== 1 || !Array.isArray(record.entries) || record.entries.length !== state.entrants.length) throw new RangeError('Invalid final classification');
    const byId = new Map(record.entries.map(x => [x.entrantId, x]));
    const roads = new Set(record.entries.map(x => x.roadPosition));
    if (byId.size !== state.entrants.length || roads.size !== state.entrants.length || [...roads].some(r => !Number.isSafeInteger(r) || r < 1 || r > state.entrants.length)) throw new RangeError('Invalid road order');
    let lastKept = 0;
    for (const e of [...state.entrants].sort((a, b) => a.position - b.position)) {
        const x = byId.get(e.entrantId);
        if (!x || x.position !== e.position) throw new RangeError('Classification record contradicts positions');
        const violated = e.incident?.status === 'FINISHED' && assessTyreRule(state, e.entrantId).status === 'VIOLATED';
        if ((x.status === 'DISQUALIFIED') !== violated || (x.reason === 'DRY_TYRE_SPECIFICATIONS') !== violated) throw new RangeError('Classification record contradicts tyre use');
        if (x.status === 'RETIRED' ? e.incident?.status !== 'RETIRED' : x.status === 'CLASSIFIED' && e.incident?.status !== 'FINISHED') throw new RangeError('Classification status contradicts Race status');
        if (x.status !== 'DISQUALIFIED') { if (x.position !== ++lastKept) throw new RangeError('Disqualified cars must follow every other car'); }
    }
}

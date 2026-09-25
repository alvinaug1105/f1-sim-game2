/**
 * Qualifying classification. Within a phase: best valid lap of THAT phase, an identical time goes to the lap set
 * earlier, and drivers without a time follow in the previous phase's order (Q1: the fallback rank from Practice /
 * entry order). Earlier-phase times never count as later-phase times.
 */
import { QUALIFYING_PHASES, phaseIndex, type QualifyingPhase, type QualifyingState } from "./model";
type Entrants = QualifyingState["entrants"];
/** Whether the entrant took part in `phase` (not eliminated in an earlier phase). */
export function eligibleIn(e: Entrants[number], phase: QualifyingPhase) {
    return e.eliminatedIn === null || phaseIndex(e.eliminatedIn) >= phaseIndex(phase);
}
/** Entrant indices in classification order for one phase (eligible entrants only). */
export function phaseClassification(state: Pick<QualifyingState, "entrants" | "input">, phase: QualifyingPhase): number[] {
    const previous = phase === "Q1" ? null : phaseClassification(state, QUALIFYING_PHASES[phaseIndex(phase) - 1]);
    const prevRank = (i: number) => previous ? previous.indexOf(i) : state.input.entrants[i].fallbackRank;
    const eligible = state.entrants.map((e, i) => ({ e, i })).filter(({ e }) => eligibleIn(e, phase));
    return eligible.sort((a, b) => {
        const x = a.e.best[phase], y = b.e.best[phase];
        if (x && y) return x.ms - y.ms || x.setAtMs - y.setAtMs || prevRank(a.i) - prevRank(b.i) || a.i - b.i;
        if (x || y) return x ? -1 : 1;
        return prevRank(a.i) - prevRank(b.i) || a.i - b.i;
    }).map(({ i }) => i);
}
/**
 * Final order: P1–P10 (Q3 classification), then Q2 eliminations in Q2 order, then Q1 eliminations in Q1 order.
 * Works for any field size: with ≤10 cars nobody is eliminated and Q3 decides everything.
 */
export function finalClassification(state: Pick<QualifyingState, "entrants" | "input">): number[] {
    const q3 = phaseClassification(state, "Q3");
    const out = (phase: QualifyingPhase) => phaseClassification(state, phase).filter(i => state.entrants[i].eliminatedIn === phase);
    return [...q3, ...out("Q2"), ...out("Q1")];
}

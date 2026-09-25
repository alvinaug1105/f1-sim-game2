/**
 * The ONLY Qualifying data sent to the browser. Built server-side from authoritative state and deliberately lossy:
 * no seed / RNG, no weather timeline, no hidden setup target or setup-distance truth, no AI release plans, and no
 * traffic cost of a lap still being driven.
 */
import type { CareerQualifyingData } from "../../game/domain/qualifying-repository";
import type { SessionStatus } from "../../game/domain/progression";
import { phaseClassification, finalClassification } from "../../simulation/qualifying/classification";
import { trafficBand } from "../../simulation/qualifying/engine";
import { QUALIFYING_PHASES, maxPushLaps, phaseFormat, phaseIndex, type QualifyingLocation, type QualifyingPhase, type QualifyingState, type RunPlan } from "../../simulation/qualifying/model";
import type { Setup } from "../../simulation/practice/model";
import type { TyreCompound } from "../../simulation/race/tyres/model";
import type { WeatherState } from "../../simulation/race/weather/model";
export type DriverStatus = "SAFE" | "AT_RISK" | "DANGER" | "NO_TIME" | "ELIMINATED" | "ADVANCED" | "POLE" | "Q3";
export type GripBand = "LOW" | "IMPROVING" | "GOOD" | "HIGH";
export interface QualifyingOwnView {
    readonly commandRevision: number;
    readonly readyAtMs: number;
    readonly run: { readonly plan: RunPlan; readonly pushDone: number; readonly callIn: boolean } | null;
    readonly maxPushLaps: number;
    /** The player's own carried setup / learning (never the hidden target). */
    readonly preparation: { readonly setup: Setup; readonly confidence: number; readonly acclimatisation: number; readonly tyreKnowledge: Readonly<Record<TyreCompound, number>> };
}
export interface QualifyingEntrantView {
    readonly entrantId: string;
    readonly driverId: string;
    readonly teamId: string;
    readonly name: string;
    readonly abbreviation: string;
    readonly team: string;
    readonly color: string;
    readonly number: number | null;
    readonly player: boolean;
    readonly location: QualifyingLocation;
    readonly distance: number;
    readonly position: number;
    readonly eliminatedIn: QualifyingPhase | null;
    /** Best lap of the current phase (earlier phases never count). */
    readonly bestMs: number | null;
    readonly gapMs: number | null;
    /** Signed: inside the cutoff = margin over the first eliminated car (negative); outside = time to find (positive). */
    readonly cutoffDeltaMs: number | null;
    readonly lastLapMs: number | null;
    readonly lastLapTraffic: boolean;
    readonly attempts: number;
    readonly tyre: { readonly compound: TyreCompound; readonly ageLaps: number } | null;
    readonly times: Readonly<Record<QualifyingPhase, number | null>>;
    readonly finalPosition: number | null;
    readonly status: DriverStatus;
    readonly own: QualifyingOwnView | null;
}
export interface QualifyingView {
    readonly careerId: string;
    readonly eventId: string;
    readonly sessionId: string;
    readonly sessionStatus: SessionStatus;
    readonly eventName: string;
    readonly circuitName: string;
    readonly sourceCircuitId: string | null;
    /** LEGACY_COMPLETED: completed by the pre-Phase-14 placeholder (no results exist). */
    readonly status: "NOT_STARTED" | "RUNNING" | "FINISHED" | "LEGACY_COMPLETED";
    /** An IN_PROGRESS placeholder session without a simulation (opening it creates the real session). */
    readonly legacyInProgress: boolean;
    readonly phase: QualifyingPhase;
    readonly phaseComplete: boolean;
    readonly phaseElapsedMs: number;
    readonly phaseDurationMs: number;
    readonly sessionElapsedMs: number;
    readonly stepMs: number;
    readonly step: number;
    readonly autoPlayer: boolean;
    readonly format: readonly { readonly phase: QualifyingPhase; readonly durationMs: number; readonly eligible: number; readonly advancing: number }[];
    /** Number of cars that advance from the current phase when anyone can be eliminated; null otherwise (Q3, small fields). */
    readonly cutoff: number | null;
    readonly weather: WeatherState | null;
    readonly forecast: readonly { readonly fromMinute: number; readonly toMinute: number; readonly rainfallMin: number; readonly rainfallMax: number }[];
    readonly grip: GripBand | null;
    readonly traffic: "CLEAR" | "MODERATE" | "BUSY" | null;
    readonly entrants: readonly QualifyingEntrantView[];
    readonly sessions: readonly { readonly id: string; readonly type: string; readonly status: SessionStatus }[];
}
function colour(value: string | undefined) { return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#a0a6af"; }
/** Current grip from the current track only (never the future evolution curve). */
export function gripBand(s: QualifyingState): GripBand {
    if (s.weather.trackWater >= 100) return "LOW";
    if (s.evolution >= 850) return "HIGH";
    if (s.evolution >= 650) return "GOOD";
    return s.entrants.some(e => e.location !== "GARAGE") ? "IMPROVING" : "LOW";
}
/** Display order: the current phase's live classification, then frozen Q2 and Q1 eliminations (or the final result). */
function displayOrder(s: QualifyingState) {
    if (s.status === "FINISHED") return finalClassification(s);
    // Cars still in the session, in the current phase's order; then each phase's eliminations, latest phase first
    // (a just-completed phase's eliminations are listed once, below the cars that advanced).
    const out = (phase: QualifyingPhase) => phaseClassification(s, phase).filter(i => s.entrants[i].eliminatedIn === phase);
    const phases = QUALIFYING_PHASES.slice(0, phaseIndex(s.phase) + 1).reverse();
    return [...phaseClassification(s, s.phase).filter(i => s.entrants[i].eliminatedIn === null), ...phases.flatMap(out)];
}
function statusOf(s: QualifyingState, index: number, position: number): DriverStatus {
    const e = s.entrants[index], f = phaseFormat(s);
    if (e.eliminatedIn !== null) return "ELIMINATED";
    if (s.phase === "Q3") return position === 1 && e.best.Q3 ? "POLE" : "Q3";
    if (s.phaseStatus === "COMPLETE") return "ADVANCED";
    if (!e.best[s.phase]) return "NO_TIME";
    if (f.advancing >= f.eligible) return "SAFE";
    if (position <= f.advancing - Math.max(1, Math.round(f.eligible * .15))) return "SAFE";
    return position <= f.advancing ? "AT_RISK" : "DANGER";
}
export function qualifyingView(data: CareerQualifyingData): QualifyingView {
    const event = data.progress.events.find(e => e.id === data.eventId)!, weekend = event.weekend!;
    const session = weekend.sessions.find(s => s.id === data.sessionId)!, s = data.state, team = data.progress.career.playerTeamId;
    const base = {
        careerId: data.progress.career.id, eventId: data.eventId, sessionId: data.sessionId, sessionStatus: session.status,
        eventName: event.name, circuitName: event.circuitName, sourceCircuitId: data.circuit.sourceCircuitId,
        sessions: [...weekend.sessions].sort((a, b) => a.order - b.order).map(x => ({ id: x.id, type: x.type, status: x.status })),
    };
    if (!s) {
        const status = session.status === "COMPLETED" ? "LEGACY_COMPLETED" as const : "NOT_STARTED" as const;
        return { ...base, status, legacyInProgress: session.status === "IN_PROGRESS", phase: "Q1", phaseComplete: false, phaseElapsedMs: 0, phaseDurationMs: 0, sessionElapsedMs: 0, stepMs: 0, step: 0,
            autoPlayer: false, format: [], cutoff: null, weather: null, forecast: [], grip: null, traffic: null,
            entrants: data.roster.map((r, i) => ({ entrantId: r.driverId, driverId: r.driverId, teamId: r.teamId, name: r.driverName, abbreviation: r.abbreviation, team: r.teamName,
                color: colour(r.teamColor), number: r.carNumber, player: r.teamId === team, location: "GARAGE", distance: 0, position: i + 1, eliminatedIn: null, bestMs: null, gapMs: null,
                cutoffDeltaMs: null, lastLapMs: null, lastLapTraffic: false, attempts: 0, tyre: null, times: { Q1: null, Q2: null, Q3: null }, finalPosition: null, status: "NO_TIME", own: null })) };
    }
    const f = phaseFormat(s), order = displayOrder(s), cutoff = s.status === "RUNNING" && f.advancing < f.eligible ? f.advancing : null;
    const phaseOrder = phaseClassification(s, s.phase), timeAt = (position: number) => s.entrants[phaseOrder[position - 1]]?.best[s.phase]?.ms ?? null;
    const leader = timeAt(1), tick = s.weatherTick, minute = (t: number) => Math.max(0, Math.round(((t - 1) * s.input.weatherTickMs - s.sessionElapsedMs) / 60_000));
    return {
        ...base, status: s.status, legacyInProgress: false, phase: s.phase, phaseComplete: s.phaseStatus === "COMPLETE", phaseElapsedMs: s.phaseElapsedMs, phaseDurationMs: f.durationMs,
        sessionElapsedMs: s.sessionElapsedMs, stepMs: s.input.stepMs, step: Math.round(s.sessionElapsedMs / s.input.stepMs), autoPlayer: s.autoPlayer,
        format: s.input.format.phases, cutoff, weather: s.weather,
        // Approximate public windows only (never the truth timeline), in minutes from now.
        forecast: s.input.weather.forecast.slice(1).filter(w => w.arrivalMaxLap >= tick).map(w => ({ fromMinute: minute(w.arrivalMinLap), toMinute: minute(w.arrivalMaxLap), rainfallMin: w.rainfallMin, rainfallMax: w.rainfallMax })),
        grip: gripBand(s), traffic: s.status === "RUNNING" ? trafficBand(s) : null,
        entrants: order.map((i, rank) => {
            const e = s.entrants[i], source = s.input.entrants[i], roster = data.roster.find(r => r.driverId === source.driverId);
            const mine = source.controller === "PLAYER" && source.teamId === team, phasePosition = phaseOrder.indexOf(i) + 1, bestMs = e.eliminatedIn === null ? e.best[s.phase]?.ms ?? null : null;
            const position = s.status === "FINISHED" ? e.finalPosition ?? rank + 1 : rank + 1;
            let cutoffDeltaMs: number | null = null;
            if (cutoff !== null && bestMs !== null && phasePosition > 0) {
                const other = phasePosition <= cutoff ? timeAt(cutoff + 1) : timeAt(cutoff);
                cutoffDeltaMs = other === null ? null : bestMs - other;
            }
            const p = source.preparation;
            return {
                entrantId: e.entrantId, driverId: source.driverId, teamId: source.teamId, name: roster?.driverName ?? source.driverId, abbreviation: roster?.abbreviation ?? "???", team: roster?.teamName ?? "",
                color: colour(roster?.teamColor), number: roster?.carNumber ?? null, player: mine, location: e.location, distance: e.distance, position, eliminatedIn: e.eliminatedIn,
                bestMs, gapMs: bestMs !== null && leader !== null ? bestMs - leader : null, cutoffDeltaMs, lastLapMs: e.lastLapMs,
                // Revealed only for a completed lap.
                lastLapTraffic: e.lastLapMs !== null && e.lastLapTrafficMs >= 300, attempts: e.attempts,
                tyre: e.tyre ? { compound: e.tyre.compound, ageLaps: e.tyre.ageLaps } : null,
                times: { Q1: e.best.Q1?.ms ?? null, Q2: e.best.Q2?.ms ?? null, Q3: e.best.Q3?.ms ?? null }, finalPosition: e.finalPosition,
                status: statusOf(s, i, phasePosition),
                own: mine ? { commandRevision: e.commandRevision, readyAtMs: e.readyAtMs, run: e.run ? { plan: e.run.plan, pushDone: e.run.pushDone, callIn: e.run.callIn } : null,
                    maxPushLaps: s.status === "RUNNING" && s.phaseStatus === "RUNNING" ? maxPushLaps(s) : 0,
                    preparation: { setup: p.setup, confidence: p.confidence, acclimatisation: p.acclimatisation, tyreKnowledge: p.tyreKnowledge } } : null,
            };
        }),
    };
}

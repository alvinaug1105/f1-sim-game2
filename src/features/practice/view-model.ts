/**
 * The ONLY Practice data sent to the browser. Built server-side from authoritative state and deliberately lossy:
 * no hidden setup target, no weather timeline, no RNG state, and no AI setup / learning / run intentions.
 */
import type { CareerPracticeData } from "../../game/domain/practice-repository";
import { maxRunLaps } from "../../simulation/practice/model";
import type { PracticeLocation, PracticeRun, Preparation, RunPlan, SetupDimension, FeedbackLevel, Setup } from "../../simulation/practice/model";
import type { TyreCompound } from "../../simulation/race/tyres/model";
import type { WeatherState } from "../../simulation/race/weather/model";
import type { SessionStatus, SessionType } from "../../game/domain/progression";
export interface PracticeOwnView {
    readonly commandRevision: number;
    readonly readyAtMs: number;
    readonly run: { readonly number: number; readonly plan: RunPlan; readonly timedLaps: number; readonly bestLapMs: number | null; readonly callIn: boolean } | null;
    readonly runs: readonly PracticeRun[];
    readonly maxRunLaps: number;
    readonly preparation: {
        readonly setup: Setup; readonly setupRevision: number; readonly confidence: number; readonly acclimatisation: number;
        readonly tyreKnowledge: Readonly<Record<TyreCompound, number>>;
        readonly feedback: Readonly<Record<SetupDimension, FeedbackLevel>> | null;
        readonly feedbackReliability: number; readonly feedbackCurrent: boolean; readonly representativeLaps: number;
    };
}
export interface PracticeEntrantView {
    readonly entrantId: string;
    readonly driverId: string;
    readonly teamId: string;
    readonly name: string;
    readonly abbreviation: string;
    readonly team: string;
    readonly color: string;
    readonly number: number | null;
    readonly player: boolean;
    readonly location: PracticeLocation;
    readonly distance: number;
    readonly position: number;
    readonly gapToBestMs: number | null;
    readonly lapsCompleted: number;
    readonly timedLaps: number;
    readonly lastLapMs: number | null;
    readonly bestLapMs: number | null;
    readonly bestLapCompound: TyreCompound | null;
    readonly tyre: { readonly compound: TyreCompound; readonly ageLaps: number; readonly wearPermille: number } | null;
    /** Only for the player's own cars. */
    readonly own: PracticeOwnView | null;
}
export interface ForecastView { readonly fromMinute: number; readonly toMinute: number; readonly rainfallMin: number; readonly rainfallMax: number }
export interface PracticeView {
    readonly careerId: string;
    readonly eventId: string;
    readonly sessionId: string;
    readonly sessionType: SessionType;
    readonly sessionStatus: SessionStatus;
    readonly eventName: string;
    readonly circuitName: string;
    readonly sourceCircuitId: string | null;
    readonly status: "NOT_STARTED" | "RUNNING" | "FINISHED";
    readonly elapsedMs: number;
    readonly durationMs: number;
    readonly stepMs: number;
    readonly step: number;
    readonly autoPlayer: boolean;
    readonly weather: WeatherState | null;
    readonly forecast: readonly ForecastView[];
    readonly entrants: readonly PracticeEntrantView[];
    readonly sessions: readonly { readonly id: string; readonly type: SessionType; readonly status: SessionStatus }[];
}
function colour(value: string | undefined) { return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#a0a6af"; }
function ownPreparation(p: Preparation): PracticeOwnView["preparation"] {
    return { setup: p.setup, setupRevision: p.setupRevision, confidence: p.confidence, acclimatisation: p.acclimatisation, tyreKnowledge: p.tyreKnowledge, feedback: p.feedback, feedbackReliability: p.feedbackReliability, feedbackCurrent: p.feedback !== null && p.feedbackRevision === p.setupRevision, representativeLaps: p.representativeLaps };
}
export function practiceView(data: CareerPracticeData): PracticeView {
    const event = data.progress.events.find(e => e.id === data.eventId)!, weekend = event.weekend!;
    const session = weekend.sessions.find(s => s.id === data.sessionId)!, s = data.state, team = data.progress.career.playerTeamId;
    const base = {
        careerId: data.progress.career.id, eventId: data.eventId, sessionId: data.sessionId, sessionType: session.type, sessionStatus: session.status,
        eventName: event.name, circuitName: event.circuitName, sourceCircuitId: data.circuit.sourceCircuitId,
        sessions: [...weekend.sessions].sort((a, b) => a.order - b.order).map(x => ({ id: x.id, type: x.type, status: x.status })),
    };
    if (!s) {
        // Not started: only the roster identity is known; preparation carried in from earlier sessions stays server-side until running.
        return { ...base, status: "NOT_STARTED", elapsedMs: 0, durationMs: 0, stepMs: 0, step: 0, autoPlayer: false, weather: null, forecast: [],
            entrants: data.roster.map((r, i) => ({ entrantId: r.driverId, driverId: r.driverId, teamId: r.teamId, name: r.driverName, abbreviation: r.abbreviation, team: r.teamName, color: colour(r.teamColor), number: r.carNumber, player: r.teamId === team, location: "GARAGE", distance: 0, position: i + 1, gapToBestMs: null, lapsCompleted: 0, timedLaps: 0, lastLapMs: null, bestLapMs: null, bestLapCompound: null, tyre: null, own: null })) };
    }
    const fastest = Math.min(...s.entrants.map(e => e.bestLapMs ?? Infinity));
    const order = s.entrants.map((e, i) => ({ e, i })).sort((a, b) => (a.e.bestLapMs ?? Infinity) - (b.e.bestLapMs ?? Infinity) || b.e.lapsCompleted - a.e.lapsCompleted || a.i - b.i);
    const tick = s.weatherTick;
    const minute = (t: number) => Math.max(0, Math.round((t - 1) * s.input.weatherTickMs / 60_000));
    return {
        ...base, status: s.status, elapsedMs: s.elapsedMs, durationMs: s.input.durationMs, stepMs: s.input.stepMs, step: Math.round(s.elapsedMs / s.input.stepMs), autoPlayer: s.autoPlayer,
        weather: s.weather,
        // Approximate public windows only (never the truth timeline), expressed in session minutes, still ahead.
        forecast: s.input.weather.forecast.slice(1).filter(f => f.arrivalMaxLap >= tick).map(f => ({ fromMinute: minute(f.arrivalMinLap), toMinute: minute(f.arrivalMaxLap), rainfallMin: f.rainfallMin, rainfallMax: f.rainfallMax })),
        entrants: order.map(({ e, i }, position) => {
            const source = s.input.entrants[i], roster = data.roster.find(r => r.driverId === source.driverId);
            const mine = source.controller === "PLAYER" && source.teamId === team;
            return {
                entrantId: e.entrantId, driverId: source.driverId, teamId: source.teamId, name: roster?.driverName ?? source.driverId, abbreviation: roster?.abbreviation ?? "???", team: roster?.teamName ?? "",
                color: colour(roster?.teamColor), number: roster?.carNumber ?? null, player: mine, location: e.location, distance: e.distance, position: position + 1,
                gapToBestMs: e.bestLapMs === null || !Number.isFinite(fastest) ? null : e.bestLapMs - fastest,
                lapsCompleted: e.lapsCompleted, timedLaps: e.timedLaps, lastLapMs: e.lastLapMs, bestLapMs: e.bestLapMs, bestLapCompound: e.bestLapCompound,
                tyre: e.tyre ? { compound: e.tyre.compound, ageLaps: e.tyre.ageLaps, wearPermille: e.tyre.wearPermille } : null,
                own: mine ? { commandRevision: e.commandRevision, readyAtMs: e.readyAtMs, run: e.run ? { number: e.run.number, plan: e.run.plan, timedLaps: e.run.timedLaps, bestLapMs: e.run.bestLapMs, callIn: e.run.callIn } : null, runs: e.runs, maxRunLaps: maxRunLaps(s), preparation: ownPreparation(e.preparation) } : null,
            };
        }),
    };
}

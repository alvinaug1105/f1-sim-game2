import type { CareerRaceData } from "../../../game/domain/race-repository";
import type { RaceEntrantState, RaceSimulationState } from "../../../simulation/race/types";
export { wrapProgress, validLayout, pointAtProgress } from '../../../game/domain/circuit-geometry';
export function entrantProgress(e: RaceEntrantState, s: RaceSimulationState) { return e.track ? e.track.progressMicrolaps / 1e6 : e.completedLaps - (e.elapsedTimeMs - (s.entrants[0]?.elapsedTimeMs ?? 0)) / s.input.circuit.baseLapTimeMs; }
/** Absolute lap progress avoids backward jumps at start/finish. Never extrapolates beyond a checkpoint. */
export function interpolateProgress(previous: number, current: number, fraction: number, retired = false) { return retired ? current : previous + (current - previous) * Math.max(0, Math.min(1, fraction)); }
export function timingRows(data: CareerRaceData) {
    const s = data.state!;
    return s.entrants.map(e => {
        const source = s.input.entrants.find(x => x.entrantId === e.entrantId)!, label = data.labels.find(l => l.entrantId === e.entrantId);
        return { entrant: e, id: e.entrantId, name: label?.driverName ?? e.entrantId, abbreviation: label?.abbreviation ?? label?.driverName.split(' ').at(-1)?.slice(0, 3).toUpperCase() ?? String(e.position), team: label?.teamName ?? source.teamId, color: /^#[0-9a-f]{6}$/i.test(label?.teamColor ?? '') ? label!.teamColor! : '#a0a6af', player: source.teamId === data.progress.career.playerTeamId, status: e.incident?.status ?? (s.status === 'FINISHED' ? 'FINISHED' : 'RUNNING'), placesGained: source.gridPosition - e.position, progress: entrantProgress(e, s), gap: e.gapToLeaderMs, interval: e.intervalToAheadMs, pitting: e.pit?.stops.at(-1)?.lap === s.lap };
    });
}
export type StrategicReason = "FINISH" | "CONTROL" | "INCIDENT" | "RETIREMENT" | "PIT" | "WEATHER" | "LIMIT";
function weatherBand(s: RaceSimulationState) { return s.weather ? `${s.weather.rainfallIntensity === 0 ? 0 : s.weather.rainfallIntensity < 650 ? 1 : 2}:${s.weather.trackWater < 100 ? 0 : s.weather.trackWater < 350 ? 1 : 2}:${s.weather.drsState}` : ''; }
export function strategicEvent(before: RaceSimulationState, after: RaceSimulationState, playerTeamId: string): StrategicReason | null {
    if (after.status === 'FINISHED')
        return 'FINISH';
    if (before.incidents?.mode !== after.incidents?.mode)
        return 'CONTROL';
    const players = new Set(after.input.entrants.filter(e => e.teamId === playerTeamId).map(e => e.entrantId));
    const events = after.incidents?.events.slice(before.incidents?.events.length ?? 0) ?? [];
    if (events.some(e => e.type === 'RETIREMENT' && e.entrantIds.some(id => players.has(id))))
        return 'RETIREMENT';
    if (events.some(e => e.type === 'INCIDENT' && e.entrantIds.some(id => players.has(id))))
        return 'INCIDENT';
    if (after.entrants.some(e => players.has(e.entrantId) && (e.pit?.stops.length ?? 0) > (before.entrants.find(x => x.entrantId === e.entrantId)?.pit?.stops.length ?? 0)))
        return 'PIT';
    if (weatherBand(before) !== weatherBand(after))
        return 'WEATHER';
    return null;
}

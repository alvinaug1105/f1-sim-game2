/**
 * Qualifying playback adapter for the shared PlaybackController: one committed step per checkpoint, attention only
 * from public, already-happened changes (never from hidden future state). A completed phase is "finished" for the
 * controller of that phase; the screen mounts a fresh controller for the next phase after Continue.
 */
import { checkpointDuration } from "../race/viewer/motion";
import type { PlaybackAdapter } from "../race/viewer/playback";
import { waterBand } from "../../simulation/practice/model";
import type { QualifyingView } from "./view-model";
export type QualifyingAttentionReason = "LAP" | "ZONE_IN" | "ZONE_OUT" | "CUTOFF" | "FIVE_MIN" | "TWO_MIN" | "FLAG" | "WEATHER";
export interface QualifyingAttention { readonly reason: QualifyingAttentionReason; readonly entrantId: string | null; readonly lapMs?: number | null }
export interface QualifyingAttentionMemory {
    readonly lastLap: Readonly<Record<string, number | null>>;
    readonly danger: Readonly<Record<string, boolean>>;
    readonly cutoffMs: number | null;
    readonly remaining: number;
    readonly band: number;
}
/** Seek bound for Next Relevant Event: 40 committed steps (≈13 minutes of session time). */
export const QUALIFYING_SEEK_LIMIT = 40;
/** A cutoff move smaller than this is noise, not a strategic change. */
export const CUTOFF_CHANGE_MS = 300;
const own = (v: QualifyingView) => v.entrants.filter(e => e.own);
const cutoffTime = (v: QualifyingView) => v.cutoff === null ? null : v.entrants.find(e => e.position === v.cutoff && e.eliminatedIn === null)?.bestMs ?? null;
export function initialQualifyingAttention(v: QualifyingView): QualifyingAttentionMemory {
    return {
        lastLap: Object.fromEntries(own(v).map(e => [e.entrantId, e.lastLapMs])),
        danger: Object.fromEntries(own(v).map(e => [e.entrantId, e.status === "DANGER"])),
        cutoffMs: cutoffTime(v), remaining: v.phaseDurationMs - v.phaseElapsedMs, band: v.weather ? waterBand(v.weather) : 0,
    };
}
export function assessQualifyingCheckpoint(memory: QualifyingAttentionMemory, v: QualifyingView): { items: readonly QualifyingAttention[]; memory: QualifyingAttentionMemory } {
    const items: QualifyingAttention[] = [], remaining = v.phaseDurationMs - v.phaseElapsedMs;
    for (const e of own(v)) {
        if (e.lastLapMs !== null && e.lastLapMs !== memory.lastLap[e.entrantId]) items.push({ reason: "LAP", entrantId: e.entrantId, lapMs: e.lastLapMs });
        const danger = e.status === "DANGER";
        if (danger && !memory.danger[e.entrantId]) items.push({ reason: "ZONE_IN", entrantId: e.entrantId });
        if (!danger && memory.danger[e.entrantId] && e.eliminatedIn === null) items.push({ reason: "ZONE_OUT", entrantId: e.entrantId });
    }
    const cutoff = cutoffTime(v);
    // Only when a player car is fighting around the cutoff does its movement matter.
    if (cutoff !== null && memory.cutoffMs !== null && Math.abs(cutoff - memory.cutoffMs) >= CUTOFF_CHANGE_MS && own(v).some(e => e.status === "AT_RISK" || e.status === "DANGER"))
        items.push({ reason: "CUTOFF", entrantId: null });
    if (memory.remaining > 5 * 60_000 && remaining <= 5 * 60_000) items.push({ reason: "FIVE_MIN", entrantId: null });
    if (memory.remaining > 2 * 60_000 && remaining <= 2 * 60_000) items.push({ reason: "TWO_MIN", entrantId: null });
    if (memory.remaining > 0 && remaining <= 0) items.push({ reason: "FLAG", entrantId: null });
    const band = v.weather ? waterBand(v.weather) : 0;
    if (band !== memory.band) items.push({ reason: "WEATHER", entrantId: null });
    return { items, memory: { ...initialQualifyingAttention(v), cutoffMs: cutoff ?? memory.cutoffMs } };
}
export const qualifyingAdapter: PlaybackAdapter<QualifyingView, QualifyingAttentionMemory, QualifyingAttention> = {
    finished: v => v.status === "FINISHED" || v.phaseComplete,
    interval: (speed, _v, seeking) => checkpointDuration(speed, "GREEN", seeking),
    initialMemory: initialQualifyingAttention,
    assess: assessQualifyingCheckpoint,
    seekLimit: QUALIFYING_SEEK_LIMIT,
};
/** What a Qualifying command did, so the confirmation names the car it targeted. */
export interface QualifyingCommandInfo { readonly entrantId: string; readonly kind: "send" | "callIn" }

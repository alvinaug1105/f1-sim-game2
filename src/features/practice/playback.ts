/**
 * Practice playback adapter for the shared PlaybackController: one committed step (30 s of session time) per
 * checkpoint, and attention only from public, already-happened changes (never from the hidden timeline).
 */
import { checkpointDuration } from "../race/viewer/motion";
import type { PlaybackAdapter } from "../race/viewer/playback";
import { waterBand } from "../../simulation/practice/model";
import type { PracticeView } from "./view-model";
export type PracticeAttentionReason = "GARAGE" | "WEATHER" | "CLOCK";
export interface PracticeAttention { readonly reason: PracticeAttentionReason; readonly entrantId: string | null; readonly elapsedMs: number }
export interface PracticeAttentionMemory { readonly onTrack: readonly string[]; readonly band: number; readonly clockWarned: boolean }
/** Remaining session time at which playback stops once to warn about the end of the session. */
export const PRACTICE_CLOCK_WARNING_MS = 5 * 60_000;
/** Maximum committed steps (session time: 20 minutes) one Next Relevant Event run may advance. */
export const PRACTICE_SEEK_LIMIT = 40;
const ownOnTrack = (v: PracticeView) => v.entrants.filter(e => e.own && e.location !== "GARAGE").map(e => e.entrantId);
const band = (v: PracticeView) => v.weather ? waterBand(v.weather) : 0;
const late = (v: PracticeView) => v.durationMs - v.elapsedMs <= PRACTICE_CLOCK_WARNING_MS;
export function initialPracticeAttention(v: PracticeView): PracticeAttentionMemory {
    return { onTrack: ownOnTrack(v), band: band(v), clockWarned: late(v) };
}
/** Items in priority order: a player car back in the garage, a change of track-water band, the five-minute warning. */
export function assessPracticeCheckpoint(memory: PracticeAttentionMemory, v: PracticeView): { items: readonly PracticeAttention[]; memory: PracticeAttentionMemory } {
    const items: PracticeAttention[] = [];
    for (const e of v.entrants) if (e.own && e.location === "GARAGE" && memory.onTrack.includes(e.entrantId)) items.push({ reason: "GARAGE", entrantId: e.entrantId, elapsedMs: v.elapsedMs });
    const now = band(v);
    if (now !== memory.band) items.push({ reason: "WEATHER", entrantId: null, elapsedMs: v.elapsedMs });
    const warn = !memory.clockWarned && late(v) && v.status !== "FINISHED";
    if (warn) items.push({ reason: "CLOCK", entrantId: null, elapsedMs: v.elapsedMs });
    return { items, memory: { onTrack: ownOnTrack(v), band: now, clockWarned: memory.clockWarned || late(v) } };
}
export const practiceAdapter: PlaybackAdapter<PracticeView, PracticeAttentionMemory, PracticeAttention> = {
    finished: v => v.status === "FINISHED",
    interval: (speed, _v, seeking) => checkpointDuration(speed, "GREEN", seeking),
    initialMemory: initialPracticeAttention,
    assess: assessPracticeCheckpoint,
    seekLimit: PRACTICE_SEEK_LIMIT,
};
/** What a Practice command did, so the confirmation names the car it targeted. */
export interface PracticeCommandInfo { readonly entrantId: string; readonly kind: "send" | "callIn" | "setup" }

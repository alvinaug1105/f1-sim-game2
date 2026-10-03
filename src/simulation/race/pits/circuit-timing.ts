/**
 * Race v8D: per-circuit pit timing from the AUTHORITATIVE progression pit anchors (never SVG / map length).
 *
 * The pit lane bypasses the track from `entry` (before the line) to `exit` (after it). The track section the lane
 * replaces is that share of the circuit's base lap; the lane loss is a fixed multiple of it (speed limit and lane
 * geometry), bounded to a sane range. GAME TUNING — not official FIA / team pit-loss measurements.
 *
 * - `pitLaneLossMs` feeds `PitConfiguration.pitLaneLossMs` (green-flag loss EXCLUDING stationary time, which stays
 *   the separate service draw — nothing is double counted).
 * - `pitTrackSectionMs` feeds `IncidentConfiguration.pitTrackSectionMs`, so the SC/VSC reduced stop
 *   (`effectivePitLaneLoss`) uses the same circuit section.
 */
import { LAP_UNITS } from "../progression/model";

/** GAME TUNING: lane loss as a share (‰) of the bypassed track section, and its bounds (ms). */
export const PIT_LANE_LOSS_PER_SECTION_PERMILLE = 1600;
export const PIT_LANE_LOSS_MIN_MS = 12000;
export const PIT_LANE_LOSS_MAX_MS = 30000;
/** Upper bound accepted by the incident configuration validator (degenerate custom geometry only). */
const PIT_TRACK_SECTION_MAX_MS = 60000;

export interface CircuitPitTiming { readonly pitLaneLossMs: number; readonly pitTrackSectionMs: number }
export function circuitPitTiming(pit: { readonly entry: number; readonly exit: number }, baseLapTimeMs: number): CircuitPitTiming {
  if (!Number.isSafeInteger(pit.entry) || !Number.isSafeInteger(pit.exit) || pit.entry < 1 || pit.entry >= LAP_UNITS || pit.exit < 1 || pit.exit >= pit.entry
    || !Number.isSafeInteger(baseLapTimeMs) || baseLapTimeMs < 1) throw new RangeError("Invalid pit timing inputs");
  const bypassMicrolaps = (LAP_UNITS - pit.entry) + pit.exit;
  const pitTrackSectionMs = Math.min(PIT_TRACK_SECTION_MAX_MS, Math.round(baseLapTimeMs * bypassMicrolaps / LAP_UNITS));
  const pitLaneLossMs = Math.min(PIT_LANE_LOSS_MAX_MS, Math.max(PIT_LANE_LOSS_MIN_MS, Math.round(pitTrackSectionMs * PIT_LANE_LOSS_PER_SECTION_PERMILLE / 1000)));
  return { pitLaneLossMs, pitTrackSectionMs };
}

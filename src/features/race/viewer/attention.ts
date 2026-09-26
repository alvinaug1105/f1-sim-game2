/**
 * Strategic attention: pure, presentation-side detection of player-relevant changes between committed checkpoints.
 * Reads only the public Race view (current timing, current weather/track, Race Control, the player's own resources and
 * persisted events). Never reads the hidden weather timeline, AI internals or future state. Transition-based with a
 * small memory of what was last announced, so an unchanged warning never fires twice.
 */
import type { RacePublicEntrant, RacePublicState } from "../public-view";
import { controlMode, drsState, fuelShort, tyreCondition, BATTLE_GAP_MS, type DrsState, type WearLevel } from "./race-view";
/** A battle ends only once the nearest neighbour gap opens beyond this (hysteresis against re-entry spam). */
export const BATTLE_EXIT_MS = 1500;
export type AttentionKind =
    | "FINISH" | "SAFETY_CAR" | "VSC" | "RESTART" | "RETIREMENT" | "INCIDENT" | "PIT"
    | "RAIN_START" | "RAIN_STOP" | "RAIN_UP" | "RAIN_DOWN" | "TRACK_WET" | "TRACK_DRYING"
    | "DRS_ENABLED" | "DRS_DISABLED" | "TYRE_HIGH" | "TYRE_CRITICAL" | "FUEL" | "BATTLE_AHEAD" | "BATTLE_BEHIND";
/** Coarse category shown by playback (and used by Next Strategic Event). */
export type StrategicReason = "FINISH" | "CONTROL" | "INCIDENT" | "RETIREMENT" | "PIT" | "WEATHER" | "DRS" | "TYRE" | "FUEL" | "BATTLE" | "LIMIT" | "COMMAND";
export interface Attention { kind: AttentionKind; reason: StrategicReason; entrantId: string | null; lap: number }
/** Highest priority first; only the first item explains a stop, the rest are counted. */
const PRIORITY: readonly AttentionKind[] = ["FINISH", "SAFETY_CAR", "VSC", "RETIREMENT", "INCIDENT", "RESTART", "PIT", "RAIN_START", "RAIN_UP", "TRACK_WET", "RAIN_DOWN", "RAIN_STOP", "TRACK_DRYING", "DRS_DISABLED", "DRS_ENABLED", "TYRE_CRITICAL", "TYRE_HIGH", "FUEL", "BATTLE_AHEAD", "BATTLE_BEHIND"];
const REASON: Record<AttentionKind, StrategicReason> = {
    FINISH: "FINISH", SAFETY_CAR: "CONTROL", VSC: "CONTROL", RESTART: "CONTROL", RETIREMENT: "RETIREMENT", INCIDENT: "INCIDENT", PIT: "PIT",
    RAIN_START: "WEATHER", RAIN_STOP: "WEATHER", RAIN_UP: "WEATHER", RAIN_DOWN: "WEATHER", TRACK_WET: "WEATHER", TRACK_DRYING: "WEATHER",
    DRS_ENABLED: "DRS", DRS_DISABLED: "DRS", TYRE_HIGH: "TYRE", TYRE_CRITICAL: "TYRE", FUEL: "FUEL", BATTLE_AHEAD: "BATTLE", BATTLE_BEHIND: "BATTLE",
};
/** What has already been announced. Plain data: safe to keep across checkpoints and to compare in tests. */
export interface AttentionMemory {
    control: string; drs: DrsState; rain: number; water: number; events: number;
    stops: Readonly<Record<string, number>>;
    tyre: Readonly<Record<string, { stint: number; level: WearLevel }>>;
    fuelDeficit: Readonly<Record<string, boolean>>;
    battle: Readonly<Record<string, boolean>>;
}
const WEAR_RANK: Record<WearLevel, number> = { OK: 0, HIGH: 1, CRITICAL: 2 };
function rainBand(s: RacePublicState) { const r = s.weather?.rainfallIntensity ?? 0; return r === 0 ? 0 : r < 650 ? 1 : 2; }
function waterBand(s: RacePublicState) { const w = s.weather?.trackWater ?? 0; return w < 100 ? 0 : w < 350 ? 1 : 2; }
function players(s: RacePublicState, teamId: string) {
    const ids = new Set(s.input.entrants.filter(e => e.teamId === teamId).map(e => e.entrantId));
    return s.entrants.filter(e => ids.has(e.entrantId));
}
function running(e: RacePublicEntrant) { return (e.incident?.status ?? "RUNNING") === "RUNNING"; }
/** Authoritative neighbour gaps in classification order, skipping retired cars (no map distance involved). */
function neighbourGaps(s: RacePublicState, id: string) {
    const order = s.entrants.filter(e => e.incident?.status !== "RETIRED").sort((a, b) => a.position - b.position);
    const i = order.findIndex(e => e.entrantId === id), me = order[i];
    if (!me) return { ahead: null, behind: null };
    const ahead = order[i - 1] && me.position === order[i - 1].position + 1 ? me.intervalToAheadMs : null;
    const behind = order[i + 1] && order[i + 1].position === me.position + 1 ? order[i + 1].intervalToAheadMs : null;
    return { ahead, behind };
}
function fuelDeficit(s: RacePublicState, e: RacePublicEntrant) { return fuelShort(s, e); }
/** Snapshot of the current situation, announcing nothing: used for a freshly opened Race or a quiet re-baseline. */
export function initialAttention(s: RacePublicState, playerTeamId: string): AttentionMemory {
    const mine = players(s, playerTeamId);
    return {
        control: controlMode(s), drs: drsState(s), rain: rainBand(s), water: waterBand(s), events: s.incidents?.events.length ?? 0,
        stops: Object.fromEntries(mine.map(e => [e.entrantId, e.pit?.stops.length ?? 0])),
        tyre: Object.fromEntries(mine.flatMap(e => { const c = tyreCondition(s, e); return c && e.stint ? [[e.entrantId, { stint: e.stint.number, level: c.wear }]] : []; })),
        fuelDeficit: Object.fromEntries(mine.map(e => [e.entrantId, fuelDeficit(s, e)])),
        battle: Object.fromEntries(mine.map(e => { const g = neighbourGaps(s, e.entrantId), near = Math.min(g.ahead ?? Infinity, g.behind ?? Infinity); return [e.entrantId, near <= BATTLE_GAP_MS]; })),
    };
}
/** Compares one newly committed checkpoint with what was already announced. Returns items (priority order) and the next memory. */
export function assessCheckpoint(memory: AttentionMemory, s: RacePublicState, playerTeamId: string): { items: Attention[]; memory: AttentionMemory } {
    const items: Attention[] = [], lap = s.lap;
    const add = (kind: AttentionKind, entrantId: string | null = null) => items.push({ kind, reason: REASON[kind], entrantId, lap });
    const mine = players(s, playerTeamId), mineIds = new Set(mine.map(e => e.entrantId));
    if (s.status === "FINISHED") add("FINISH");
    // Race Control transitions.
    const control = controlMode(s);
    if (control !== memory.control) {
        if (control === "SAFETY_CAR") add("SAFETY_CAR"); else if (control === "VSC") add("VSC"); else add("RESTART");
    }
    // Persisted incident/retirement events involving a player car (AI-only incidents surface through Race Control).
    const events = s.incidents?.events ?? [];
    for (const event of events.slice(memory.events)) {
        const who = event.entrantIds.find(id => mineIds.has(id));
        if (!who) continue;
        if (event.type === "RETIREMENT") add("RETIREMENT", who);
        else if (event.type === "INCIDENT") add("INCIDENT", who);
    }
    // Completed player pit stops (a request alone never stops playback; the command already paused it).
    for (const e of mine) if ((e.pit?.stops.length ?? 0) > (memory.stops[e.entrantId] ?? 0)) add("PIT", e.entrantId);
    // Current, public weather bands only.
    const rain = rainBand(s), water = waterBand(s);
    if (rain !== memory.rain) add(memory.rain === 0 ? "RAIN_START" : rain === 0 ? "RAIN_STOP" : rain > memory.rain ? "RAIN_UP" : "RAIN_DOWN");
    if (water !== memory.water) add(water > memory.water ? "TRACK_WET" : "TRACK_DRYING");
    // DRS: suspension under VSC / Safety Car is explained by Race Control. Announce a wet disable, and re-enabling only
    // after a wet disable or a restart delay (a restart without delay is already announced as RESTART).
    const drs = drsState(s);
    if (drs !== memory.drs && s.status === "RUNNING") {
        if (drs === "ENABLED" && (memory.drs === "WET" || memory.drs === "RESTART")) add("DRS_ENABLED");
        else if (drs === "WET") add("DRS_DISABLED");
    }
    const neutral = control !== "GREEN" || memory.control !== "GREEN" || lap <= 1 || s.status !== "RUNNING";
    const tyre: Record<string, { stint: number; level: WearLevel }> = {}, fuel: Record<string, boolean> = {}, battle: Record<string, boolean> = {};
    for (const e of mine) {
        const id = e.entrantId, live = running(e) && s.status === "RUNNING";
        // Tyres: announce each escalation once per stint; a new stint re-baselines silently.
        const c = tyreCondition(s, e), last = memory.tyre[id];
        if (c && e.stint) {
            tyre[id] = { stint: e.stint.number, level: c.wear };
            if (live && last && last.stint === e.stint.number && WEAR_RANK[c.wear] > WEAR_RANK[last.level]) add(c.wear === "CRITICAL" ? "TYRE_CRITICAL" : "TYRE_HIGH", id);
        }
        // Fuel: announce when the projection at the flag first turns into a deficit.
        fuel[id] = fuelDeficit(s, e);
        if (live && fuel[id] && !memory.fuelDeficit[id]) add("FUEL", id);
        // Battles with hysteresis: enter at BATTLE_GAP_MS, leave only beyond BATTLE_EXIT_MS. Opening laps, neutralised
        // running and the restart lap re-baseline silently, because the field is bunched by rule rather than racing.
        const g = neighbourGaps(s, id), near = Math.min(g.ahead ?? Infinity, g.behind ?? Infinity), was = memory.battle[id] ?? false;
        battle[id] = !live ? false : was ? near <= BATTLE_EXIT_MS : near <= BATTLE_GAP_MS;
        if (battle[id] && !was && !neutral) add((g.ahead ?? Infinity) <= (g.behind ?? Infinity) ? "BATTLE_AHEAD" : "BATTLE_BEHIND", id);
    }
    items.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
    return {
        items,
        memory: { control, drs, rain, water, events: events.length, stops: Object.fromEntries(mine.map(e => [e.entrantId, e.pit?.stops.length ?? 0])), tyre, fuelDeficit: fuel, battle },
    };
}

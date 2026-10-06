/**
 * Strategic attention: pure, presentation-side detection of player-relevant changes between committed checkpoints.
 * Reads only the public Race view (current timing, current weather/track, Race Control, the player's own resources and
 * persisted events). Never reads the hidden weather timeline, AI internals or future state. Transition-based with a
 * small memory of what was last announced, so an unchanged warning never fires twice.
 */
import type { RacePublicEntrant, RacePublicState } from "../public-view";
import type { TyreCompound } from "../../../simulation/race/tyres/model";
import { tyreFamily, type TyreFamily } from "../../../simulation/race/tyres/family";
import { controlMode, drsState, fuelCritical, fuelShort, tyreCondition, BATTLE_GAP_MS, type DrsState, type WearLevel } from "./race-view";
/** A battle ends only once the nearest neighbour gap opens beyond this (hysteresis against re-entry spam). */
export const BATTLE_EXIT_MS = 1500;
export type AttentionKind =
    | "FINISH" | "SAFETY_CAR" | "VSC" | "RESTART" | "RETIREMENT" | "INCIDENT" | "PIT"
    | "RIVAL_TYRE_AHEAD" | "RIVAL_TYRE_BEHIND" | "RIVAL_PIT_AHEAD" | "RIVAL_PIT_BEHIND" | "TYRE_WAVE" | "TYRE_CROSSOVER"
    | "RAIN_START" | "RAIN_STOP" | "RAIN_UP" | "RAIN_DOWN" | "TRACK_WET" | "TRACK_DRYING"
    | "DRS_ENABLED" | "DRS_DISABLED" | "TYRE_HIGH" | "TYRE_CRITICAL" | "FUEL" | "FUEL_CRITICAL" | "FUEL_OUT" | "BATTLE_AHEAD" | "BATTLE_BEHIND"
    /** v8C: a player car reached its last safe stop opportunity with another dry compound still required. */
    | "TYRE_RULE_URGENT"
    /** v8E: a player car's tyre is within a few laps of its cliff (current pace estimate) — warned BEFORE crossing. */
    | "TYRE_CLIFF_SOON"
    /** v8E: a player car's tyre family has become POOR for the current conditions (escalation after a crossover). */
    | "TYRE_POOR";
/** Coarse category shown by playback (and used by Next Strategic Event). */
export type StrategicReason = "FINISH" | "CONTROL" | "INCIDENT" | "RETIREMENT" | "PIT" | "RIVAL" | "WAVE" | "CROSSOVER" | "WEATHER" | "DRS" | "TYRE" | "FUEL" | "BATTLE" | "LIMIT" | "COMMAND";
export interface Attention { kind: AttentionKind; reason: StrategicReason; entrantId: string | null; lap: number }
/** Highest priority first; only the first item explains a stop, the rest are counted. */
const PRIORITY: readonly AttentionKind[] = ["FINISH", "SAFETY_CAR", "VSC", "FUEL_OUT", "RETIREMENT", "FUEL_CRITICAL", "TYRE_RULE_URGENT", "INCIDENT", "RESTART", "PIT", "TYRE_POOR", "TYRE_CROSSOVER", "TYRE_CLIFF_SOON", "RIVAL_TYRE_AHEAD", "RIVAL_TYRE_BEHIND", "TYRE_WAVE", "RIVAL_PIT_AHEAD", "RIVAL_PIT_BEHIND", "RAIN_START", "RAIN_UP", "TRACK_WET", "RAIN_DOWN", "RAIN_STOP", "TRACK_DRYING", "DRS_DISABLED", "DRS_ENABLED", "TYRE_CRITICAL", "TYRE_HIGH", "FUEL", "BATTLE_AHEAD", "BATTLE_BEHIND"];
const REASON: Record<AttentionKind, StrategicReason> = {
    FINISH: "FINISH", SAFETY_CAR: "CONTROL", VSC: "CONTROL", RESTART: "CONTROL", RETIREMENT: "RETIREMENT", INCIDENT: "INCIDENT", PIT: "PIT",
    RIVAL_TYRE_AHEAD: "RIVAL", RIVAL_TYRE_BEHIND: "RIVAL", RIVAL_PIT_AHEAD: "RIVAL", RIVAL_PIT_BEHIND: "RIVAL", TYRE_WAVE: "WAVE", TYRE_CROSSOVER: "CROSSOVER",
    RAIN_START: "WEATHER", RAIN_STOP: "WEATHER", RAIN_UP: "WEATHER", RAIN_DOWN: "WEATHER", TRACK_WET: "WEATHER", TRACK_DRYING: "WEATHER",
    DRS_ENABLED: "DRS", DRS_DISABLED: "DRS", TYRE_HIGH: "TYRE", TYRE_CRITICAL: "TYRE", FUEL: "FUEL", FUEL_CRITICAL: "FUEL", FUEL_OUT: "FUEL", BATTLE_AHEAD: "BATTLE", BATTLE_BEHIND: "BATTLE",
    TYRE_RULE_URGENT: "TYRE", TYRE_CLIFF_SOON: "TYRE", TYRE_POOR: "CROSSOVER",
};
/** v8E: a tyre within this many laps of its cliff (the car's own current-pace estimate) is announced before crossing. */
export const CLIFF_WARNING_LAPS = 3;
/** What has already been announced. Plain data: safe to keep across checkpoints and to compare in tests. */
export interface AttentionMemory {
    control: string; drs: DrsState; rain: number; water: number; events: number;
    stops: Readonly<Record<string, number>>;
    tyre: Readonly<Record<string, { stint: number; level: WearLevel }>>;
    fuelDeficit: Readonly<Record<string, boolean>>;
    /** Player cars whose fuel shortfall is already announced as critical (runs out within a few laps). */
    fuelCritical?: Readonly<Record<string, boolean>>;
    battle: Readonly<Record<string, boolean>>;
    /** Public tyre facts of every car: stops completed and current tyre family. */
    stopsAll: Readonly<Record<string, number>>;
    family: Readonly<Record<string, TyreFamily>>;
    /** Checkpoint lap of each car's latest tyre-family switch (for the field-wave window). */
    switchLap: Readonly<Record<string, number>>;
    /** Cars directly ahead/behind each player car at the last checkpoint (a pitting rival drops out of that slot). */
    neighbours: Readonly<Record<string, Neighbours>>;
    /** Lap of the last announced field tyre wave (one pause per wave). */
    waveLap: number | null;
    /**
     * Crossover state per player car: its tyre family and whether a crossover alert is armed. Armed while the family
     * is SUITABLE; after an alert it re-arms only once that family is the fastest again (hysteresis on the real
     * performance crossover, from the server's current-condition tyre assessment).
     */
    fit: Readonly<Record<string, { family: TyreFamily; armed: boolean }>>;
    /** v8C: player cars whose URGENT dry-tyre obligation is already announced (from their own public status). */
    tyreRuleUrgent?: Readonly<Record<string, boolean>>;
    /** v8E: stint number whose approaching-cliff warning was already given, per player car. */
    cliffSoon?: Readonly<Record<string, number>>;
    /** v8E: player cars whose current tyre family is already announced as POOR. */
    poor?: Readonly<Record<string, boolean>>;
}
/** v8E: own-car insight says the tyre reaches its cliff within `CLIFF_WARNING_LAPS` laps at the current pace. */
function cliffSoon(s: RacePublicState, e: RacePublicEntrant) {
    const laps = e.insight?.pitEstimate?.lapsToCliff;
    return s.status === "RUNNING" && running(e) && laps !== undefined && laps !== null && laps <= CLIFF_WARNING_LAPS;
}
function familyPoor(s: RacePublicState, e: RacePublicEntrant) {
    const f = familyOf(e.stint?.tyre.compound);
    return !!f && !!s.tyreFit && s.tyreFit.levels[f] === "POOR";
}
export type { TyreFamily };
export interface Neighbours { readonly ahead: string | null; readonly behind: string | null }
const familyOf = (compound: TyreCompound | undefined): TyreFamily | null => compound === undefined ? null : tyreFamily(compound);
/** Share of RUNNING cars that must switch tyre family within the window for a field wave. */
export const WAVE_SHARE = 0.3;
export const WAVE_WINDOW_LAPS = 2;
/** Laps before another field wave can be announced. */
export const WAVE_COOLDOWN_LAPS = 6;
/** The rival cars directly ahead of and behind each running player car (a team-mate is not a rival). */
function neighboursOf(s: RacePublicState, playerIds: ReadonlySet<string>) {
    const order = s.entrants.filter(e => (e.incident?.status ?? "RUNNING") === "RUNNING").sort((a, b) => a.position - b.position);
    const rival = (x: RacePublicEntrant | undefined) => (x && !playerIds.has(x.entrantId) ? x.entrantId : null);
    const out: Record<string, Neighbours> = {};
    order.forEach((e, i) => { if (playerIds.has(e.entrantId)) out[e.entrantId] = { ahead: rival(order[i - 1]), behind: rival(order[i + 1]) }; });
    return out;
}
function tyreFacts(s: RacePublicState) {
    return {
        stopsAll: Object.fromEntries(s.entrants.map(e => [e.entrantId, e.pit?.stops.length ?? 0])),
        family: Object.fromEntries(s.entrants.flatMap(e => { const f = familyOf(e.stint?.tyre.compound); return f ? [[e.entrantId, f]] : []; })) as Record<string, TyreFamily>,
    };
}
const WEAR_RANK: Record<WearLevel, number> = { OK: 0, HIGH: 1, CRITICAL: 2 };
function rainBand(s: RacePublicState) { const r = s.weather?.rainfallIntensity ?? 0; return r === 0 ? 0 : r < 650 ? 1 : 2; }
function waterBand(s: RacePublicState) { const w = s.weather?.trackWater ?? 0; return w < 100 ? 0 : w < 350 ? 1 : 2; }
function playerIdSet(s: RacePublicState, teamId: string) { return new Set(s.input.entrants.filter(e => e.teamId === teamId).map(e => e.entrantId)); }
/** Next crossover state per player car from the public tyre assessment (see `AttentionMemory.fit`). */
function crossoverFit(s: RacePublicState, mine: readonly RacePublicEntrant[], previous: AttentionMemory["fit"]) {
    const out: Record<string, { family: TyreFamily; armed: boolean }> = {};
    for (const e of mine) {
        const family = familyOf(e.stint?.tyre.compound), level = family && s.tyreFit ? s.tyreFit.levels[family] : null;
        if (!family) continue;
        const was = previous[e.entrantId];
        if (!s.tyreFit || level === null) { out[e.entrantId] = { family, armed: false }; continue; }
        // A new family (a stop) re-baselines silently; otherwise disarm when it stops being suitable, re-arm at best.
        const armed = !was || was.family !== family ? level === "SUITABLE" : was.armed ? level === "SUITABLE" : s.tyreFit.best === family;
        out[e.entrantId] = { family, armed };
    }
    return out;
}
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
        fuelCritical: Object.fromEntries(mine.map(e => [e.entrantId, fuelCritical(s, e)])),
        battle: Object.fromEntries(mine.map(e => { const g = neighbourGaps(s, e.entrantId), near = Math.min(g.ahead ?? Infinity, g.behind ?? Infinity); return [e.entrantId, near <= BATTLE_GAP_MS]; })),
        ...tyreFacts(s), switchLap: {}, neighbours: neighboursOf(s, playerIdSet(s, playerTeamId)), waveLap: null,
        fit: crossoverFit(s, mine, {}),
        tyreRuleUrgent: Object.fromEntries(mine.map(e => [e.entrantId, ruleUrgent(s, e)])),
        cliffSoon: Object.fromEntries(mine.flatMap(e => cliffSoon(s, e) && e.stint ? [[e.entrantId, e.stint.number]] : [])),
        poor: Object.fromEntries(mine.map(e => [e.entrantId, familyPoor(s, e)])),
    };
}
/** Own car's dry-tyre obligation is at its last safe stop opportunity (server-derived public status; never a plan). */
function ruleUrgent(s: RacePublicState, e: RacePublicEntrant) { return s.status === "RUNNING" && running(e) && e.regulation?.status === "URGENT"; }
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
        // Running out of fuel is announced as such (the player's own car); other retirements as retirements.
        if (event.type === "RETIREMENT") add(event.kind === "FUEL_STARVATION" ? "FUEL_OUT" : "RETIREMENT", who);
        else if (event.type === "INCIDENT") add("INCIDENT", who);
    }
    // Completed player pit stops (a request alone never stops playback; the command already paused it).
    for (const e of mine) if ((e.pit?.stops.length ?? 0) > (memory.stops[e.entrantId] ?? 0)) add("PIT", e.entrantId);
    // Public tyre facts: rival stops and tyre-family switches, the field tyre wave and the suitability crossover.
    const facts = tyreFacts(s), switchLap: Record<string, number> = { ...memory.switchLap };
    for (const [id, f] of Object.entries(facts.family)) if (memory.family[id] && memory.family[id] !== f) switchLap[id] = lap;
    const playerIds = playerIdSet(s, playerTeamId), now = neighboursOf(s, playerIds);
    for (const e of mine) {
        if (!running(e) || s.status !== "RUNNING") continue;
        // The rival that was directly ahead/behind at the previous checkpoint (it rejoins elsewhere after a stop).
        const before = memory.neighbours[e.entrantId];
        for (const side of ["ahead", "behind"] as const) {
            const rivalId = before?.[side];
            if (!rivalId || (facts.stopsAll[rivalId] ?? 0) <= (memory.stopsAll[rivalId] ?? 0)) continue;
            const changed = memory.family[rivalId] !== undefined && facts.family[rivalId] !== memory.family[rivalId];
            add(changed ? (side === "ahead" ? "RIVAL_TYRE_AHEAD" : "RIVAL_TYRE_BEHIND") : (side === "ahead" ? "RIVAL_PIT_AHEAD" : "RIVAL_PIT_BEHIND"), e.entrantId);
        }
    }
    const runningCount = s.entrants.filter(running).length;
    const runningIds = new Set(s.entrants.filter(running).map(e => e.entrantId));
    const recent = Object.entries(switchLap).filter(([id, l]) => lap - l < WAVE_WINDOW_LAPS && runningIds.has(id)).length;
    let waveLap = memory.waveLap;
    if (s.status === "RUNNING" && runningCount > 0 && recent / runningCount >= WAVE_SHARE && (waveLap === null || lap - waveLap > WAVE_COOLDOWN_LAPS)) { add("TYRE_WAVE"); waveLap = lap; }
    // Suitability crossover: a player car's tyre family stops being suitable for current conditions (another family is
    // now clearly faster in the Race's own tyre model). One alert, re-armed once that family is the fastest again.
    const fit = crossoverFit(s, mine, memory.fit);
    if (s.status === "RUNNING")
        for (const e of mine) { const was = memory.fit[e.entrantId], now = fit[e.entrantId]; if (running(e) && was?.armed && now && now.family === was.family && !now.armed) add("TYRE_CROSSOVER", e.entrantId); }
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
    const soon: Record<string, number> = {}, poor: Record<string, boolean> = {}, neutralStart = lap <= 0;
    const tyre: Record<string, { stint: number; level: WearLevel }> = {}, fuel: Record<string, boolean> = {}, critical: Record<string, boolean> = {}, battle: Record<string, boolean> = {}, urgent: Record<string, boolean> = {};
    for (const e of mine) {
        const id = e.entrantId, live = running(e) && s.status === "RUNNING";
        // v8C dry-tyre rule: announce once, when the car first reaches its last safe stop opportunity.
        urgent[id] = ruleUrgent(s, e);
        if (urgent[id] && !memory.tyreRuleUrgent?.[id]) add("TYRE_RULE_URGENT", id);
        // v8E: approaching the cliff — once per stint, before it is crossed (the wear escalation follows separately).
        if (e.stint && cliffSoon(s, e)) { soon[id] = e.stint.number; if (memory.cliffSoon?.[id] !== e.stint.number) add("TYRE_CLIFF_SOON", id); }
        else if (memory.cliffSoon?.[id] !== undefined && e.stint && memory.cliffSoon[id] === e.stint.number) soon[id] = e.stint.number;
        // v8E: the current family has become POOR for the conditions (once until it recovers or the car changes tyre).
        poor[id] = live && familyPoor(s, e);
        if (poor[id] && !memory.poor?.[id] && !neutralStart) add("TYRE_POOR", id);
        // Tyres: announce each escalation once per stint; a new stint re-baselines silently.
        const c = tyreCondition(s, e), last = memory.tyre[id];
        if (c && e.stint) {
            tyre[id] = { stint: e.stint.number, level: c.wear };
            if (live && last && last.stint === e.stint.number && WEAR_RANK[c.wear] > WEAR_RANK[last.level]) add(c.wear === "CRITICAL" ? "TYRE_CRITICAL" : "TYRE_HIGH", id);
        }
        // Fuel: announce when the projection at the flag first turns into a deficit.
        // Escalation: the deficit becomes critical (fuel runs out within a few laps) — once per transition. A critical
        // warning subsumes a projected-short warning first seen at the same checkpoint (one stop, not two).
        fuel[id] = fuelDeficit(s, e);
        critical[id] = live && fuelCritical(s, e);
        if (critical[id] && !memory.fuelCritical?.[id]) add("FUEL_CRITICAL", id);
        else if (live && fuel[id] && !memory.fuelDeficit[id]) add("FUEL", id);
        // Battles with hysteresis: enter at BATTLE_GAP_MS, leave only beyond BATTLE_EXIT_MS. Opening laps, neutralised
        // running and the restart lap re-baseline silently, because the field is bunched by rule rather than racing.
        const g = neighbourGaps(s, id), near = Math.min(g.ahead ?? Infinity, g.behind ?? Infinity), was = memory.battle[id] ?? false;
        battle[id] = !live ? false : was ? near <= BATTLE_EXIT_MS : near <= BATTLE_GAP_MS;
        if (battle[id] && !was && !neutral) add((g.ahead ?? Infinity) <= (g.behind ?? Infinity) ? "BATTLE_AHEAD" : "BATTLE_BEHIND", id);
    }
    items.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
    return {
        items,
        memory: { control, drs, rain, water, events: events.length, stops: Object.fromEntries(mine.map(e => [e.entrantId, e.pit?.stops.length ?? 0])), tyre, fuelDeficit: fuel, fuelCritical: critical, battle, ...facts, switchLap, neighbours: now, waveLap, fit, tyreRuleUrgent: urgent, cliffSoon: soon, poor },
    };
}

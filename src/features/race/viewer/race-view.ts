/** Presentation-only derived views over authoritative Race state. Never mutates state or re-runs simulation rules. */
import type { RaceSimulationState, RaceEntrantState } from "../../../simulation/race/types";
import type { RaceEvent } from "../../../simulation/race/incidents/model";
import type { TyreCompound } from "../../../simulation/race/tyres/model";
import { projectedFuelGrams } from "../../../simulation/race/commands/model";
import type { timingRows } from "./model";
import { LABEL_TIER } from "./labels";
type Row = ReturnType<typeof timingRows>[number];
/** Presentation threshold for calling a nearby car a "battle". Informational only; not a simulation rule. */
export const BATTLE_GAP_MS = 1000;
export type ControlMode = "GREEN" | "VSC" | "SAFETY_CAR";
export function controlMode(s: RaceSimulationState): ControlMode { return s.incidents?.mode ?? "GREEN"; }
/** Global DRS state from existing engine flags only; map distance never decides eligibility. */
export type DrsState = "UNAVAILABLE" | "ENABLED" | "WET" | "CONTROL" | "RESTART" | "FINISHED";
export function drsState(s: RaceSimulationState): DrsState {
    if (!s.input.interaction) return "UNAVAILABLE";
    if (s.status === "FINISHED") return "FINISHED";
    if (controlMode(s) !== "GREEN") return "CONTROL";
    if ((s.incidents?.drsDelay ?? 0) > 0) return "RESTART";
    if (s.weather?.drsState === "DRS_DISABLED_WET") return "WET";
    return "ENABLED";
}
export interface BattleContext { ahead: Row | null; behind: Row | null; gapAheadMs: number | null; gapBehindMs: number | null; battleAhead: boolean; battleBehind: boolean }
/** Neighbours in authoritative classification order, skipping retired cars. */
export function battleContext(rows: readonly Row[], id: string, s: RaceSimulationState): BattleContext {
    const running = rows.filter(r => r.status !== "RETIRED").sort((a, b) => a.entrant.position - b.entrant.position);
    const index = running.findIndex(r => r.id === id), me = running[index];
    const none: BattleContext = { ahead: null, behind: null, gapAheadMs: null, gapBehindMs: null, battleAhead: false, battleBehind: false };
    if (!me) return none;
    const ahead = running[index - 1] ?? null, behind = running[index + 1] ?? null;
    const gapAheadMs = ahead && me.entrant.position === ahead.entrant.position + 1 ? me.interval : null;
    const gapBehindMs = behind && behind.entrant.position === me.entrant.position + 1 ? behind.interval : null;
    // Neutralised fields bunch up by rule; that is not racing, so no battle is shown under VSC/SC or after the flag.
    const live = s.status === "RUNNING" && controlMode(s) === "GREEN" && me.status === "RUNNING" && s.lap > 0;
    const close = (gap: number | null) => live && gap !== null && gap <= BATTLE_GAP_MS;
    return { ahead, behind, gapAheadMs, gapBehindMs, battleAhead: close(gapAheadMs), battleBehind: close(gapBehindMs) };
}
/** Map-label priority tier per entrant. Selected > other player car > selected's battle > leader > other player's battle > field. */
export function labelTiers(rows: readonly Row[], selected: string, s: RaceSimulationState) {
    const tiers = new Map<string, number>(rows.map(r => [r.id, LABEL_TIER.FIELD]));
    const raise = (id: string | undefined, tier: number) => { if (id && tiers.has(id)) tiers.set(id, Math.min(tiers.get(id)!, tier)); };
    const leader = rows.find(r => r.entrant.position === 1 && r.status !== "RETIRED");
    raise(leader?.id, LABEL_TIER.LEADER);
    for (const player of rows.filter(r => r.player && r.id !== selected)) {
        raise(player.id, LABEL_TIER.PLAYER);
        const b = battleContext(rows, player.id, s);
        if (b.battleAhead) raise(b.ahead?.id, LABEL_TIER.NEARBY);
        if (b.battleBehind) raise(b.behind?.id, LABEL_TIER.NEARBY);
    }
    const b = battleContext(rows, selected, s);
    if (b.battleAhead) raise(b.ahead?.id, LABEL_TIER.BATTLE);
    if (b.battleBehind) raise(b.behind?.id, LABEL_TIER.BATTLE);
    raise(selected, LABEL_TIER.SELECTED);
    return tiers;
}
export type WearLevel = "OK" | "HIGH" | "CRITICAL";
export type TemperatureLevel = "OK" | "COLD" | "HOT";
/** Warnings read the car's own compound profile thresholds; no new tyre rules. */
export function tyreCondition(s: RaceSimulationState, e: RaceEntrantState) {
    const tyre = e.stint?.tyre, profile = tyre ? s.input.tyres?.profiles[tyre.compound] : undefined;
    if (!tyre || !profile) return null;
    const wear: WearLevel = tyre.wearPermille >= profile.cliffWear ? "CRITICAL" : tyre.wearPermille >= profile.degradationStartWear ? "HIGH" : "OK";
    const temperature: TemperatureLevel = tyre.temperatureMilliC < profile.idealTemperatureMinMilliC ? "COLD" : tyre.temperatureMilliC > profile.idealTemperatureMaxMilliC ? "HOT" : "OK";
    return { wear, temperature };
}
/** Compact values used by the two-car comparison. Null means the Race version does not model that value. */
export function driverSnapshot(row: Row, s: RaceSimulationState) {
    const e = row.entrant, c = e.commands;
    return {
        position: e.position, gapMs: row.gap, intervalMs: row.interval, status: row.status,
        compound: (e.stint?.tyre.compound ?? null) as TyreCompound | null, tyreAge: e.stint?.tyre.ageLaps ?? null, wearPermille: e.stint?.tyre.wearPermille ?? null,
        fuelDeltaKg: c && s.input.commands ? Math.round(projectedFuelGrams(s, e) / 100) / 10 : null,
        ersRatio: c && s.input.commands ? c.ersCharge / s.input.commands.capacity : null,
        paceMode: c?.paceMode ?? null, stops: e.pit ? e.pit.stops.length : null,
    };
}
export type FeedCategory = "CONTROL" | "INCIDENT" | "RETIREMENT" | "PIT";
export interface FeedItem { key: string; lap: number; category: FeedCategory; important: boolean; player: boolean; entrantIds: readonly string[]; event?: RaceEvent; stop?: NonNullable<RaceEntrantState["pit"]>["stops"][number] }
const CATEGORY: Record<RaceEvent["type"], FeedCategory> = { INCIDENT: "INCIDENT", RETIREMENT: "RETIREMENT", VSC_START: "CONTROL", VSC_END: "CONTROL", SAFETY_CAR_START: "CONTROL", SAFETY_CAR_END: "CONTROL" };
/**
 * Structured feed from persisted Race records only (Race Control events plus pit-stop history), newest first.
 * Translation happens at render time; nothing here is prose.
 */
export function raceFeed(s: RaceSimulationState, playerTeamId: string): FeedItem[] {
    const players = new Set(s.input.entrants.filter(e => e.teamId === playerTeamId).map(e => e.entrantId));
    const items: (FeedItem & { order: number })[] = [];
    for (const event of s.incidents?.events ?? []) {
        const category = CATEGORY[event.type], player = event.entrantIds.some(id => players.has(id));
        const important = event.type === "SAFETY_CAR_START" || event.type === "VSC_START" || category === "RETIREMENT" || (player && category === "INCIDENT") || event.severity === "MAJOR";
        items.push({ key: `e${event.sequence}`, lap: event.lap, category, important, player, entrantIds: event.entrantIds, event, order: 0 });
    }
    for (const e of s.entrants) for (const stop of e.pit?.stops ?? []) {
        const player = players.has(e.entrantId);
        // A stop happens after its lap's events, so it sorts after them within the lap.
        items.push({ key: `p${e.entrantId}:${stop.number}`, lap: stop.lap, category: "PIT", important: player, player, entrantIds: [e.entrantId], stop, order: 1 });
    }
    return items.sort((a, b) => b.lap - a.lap || b.order - a.order || (b.event?.sequence ?? 0) - (a.event?.sequence ?? 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(item => { const { order, ...rest } = item; void order; return rest; });
}

/** Presentation-only derived views over the public Race view. Never mutates state or re-runs simulation rules. */
import type { RaceEvent } from "../../../simulation/race/incidents/model";
import type { TyreCompound } from "../../../simulation/race/tyres/model";
import type { ErsOutlook, RacePublicEntrant, RacePublicState } from "../public-view";
import type { timingRows } from "./model";
import { LABEL_TIER } from "./labels";
type Row = ReturnType<typeof timingRows>[number];
/** Presentation threshold for calling a nearby car a "battle". Informational only; not a simulation rule. */
export const BATTLE_GAP_MS = 1000;
export type ControlMode = "GREEN" | "VSC" | "SAFETY_CAR";
export function controlMode(s: RacePublicState): ControlMode { return s.incidents?.mode ?? "GREEN"; }
/** Global DRS state from existing engine flags only; map distance never decides eligibility. */
export type DrsState = "UNAVAILABLE" | "ENABLED" | "WET" | "CONTROL" | "RESTART" | "FINISHED";
export function drsState(s: RacePublicState): DrsState {
    if (!s.input.interaction) return "UNAVAILABLE";
    if (s.status === "FINISHED") return "FINISHED";
    if (controlMode(s) !== "GREEN") return "CONTROL";
    if ((s.incidents?.drsDelay ?? 0) > 0) return "RESTART";
    if (s.weather?.drsState === "DRS_DISABLED_WET") return "WET";
    return "ENABLED";
}
export interface BattleContext { ahead: Row | null; behind: Row | null; gapAheadMs: number | null; gapBehindMs: number | null; battleAhead: boolean; battleBehind: boolean }
/** Neighbours in authoritative classification order, skipping retired cars. */
export function battleContext(rows: readonly Row[], id: string, s: RacePublicState): BattleContext {
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
export function labelTiers(rows: readonly Row[], selected: string, s: RacePublicState) {
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
/** Warnings read the car's own compound profile thresholds; no new tyre rules. Rival wear is not public (null). */
export function tyreCondition(s: RacePublicState, e: RacePublicEntrant) {
    const tyre = e.stint?.tyre, profile = tyre ? s.input.tyres?.profiles[tyre.compound] : undefined;
    if (!tyre || !profile || tyre.wearPermille === null || tyre.temperatureMilliC === null) return null;
    const wear: WearLevel = tyre.wearPermille >= profile.cliffWear ? "CRITICAL" : tyre.wearPermille >= profile.degradationStartWear ? "HIGH" : "OK";
    const temperature: TemperatureLevel = tyre.temperatureMilliC < profile.idealTemperatureMinMilliC ? "COLD" : tyre.temperatureMilliC > profile.idealTemperatureMaxMilliC ? "HOT" : "OK";
    return { wear, temperature };
}
/** Compact values used by the two-car comparison. Null means the Race version does not model that value. */
export function driverSnapshot(row: Row, s: RacePublicState) {
    const e = row.entrant, c = e.commands;
    return {
        position: e.position, gapMs: row.gap, intervalMs: row.interval, status: row.status,
        compound: (e.stint?.tyre.compound ?? null) as TyreCompound | null, tyreAge: e.stint?.tyre.ageLaps ?? null, wearPermille: e.stint?.tyre.wearPermille ?? null,
        fuelDeltaKg: c && s.input.commands && e.insight?.projectedFuelGrams != null ? Math.round(e.insight.projectedFuelGrams / 100) / 10 : null,
        ersRatio: c && s.input.commands ? c.ersCharge / s.input.commands.capacity : null,
        paceMode: c?.paceMode ?? null, stops: e.pit ? e.pit.stops.length : null,
        lastLapMs: e.lastLapTimeMs, bestLapMs: e.bestLapTimeMs,
    };
}
export type { ErsOutlook };
export type FeedCategory = "CONTROL" | "INCIDENT" | "RETIREMENT" | "PIT";
export interface FeedItem { key: string; lap: number; category: FeedCategory; important: boolean; player: boolean; entrantIds: readonly string[]; event?: RaceEvent; stop?: NonNullable<RacePublicEntrant["pit"]>["stops"][number] }
const CATEGORY: Record<RaceEvent["type"], FeedCategory> = { INCIDENT: "INCIDENT", RETIREMENT: "RETIREMENT", VSC_START: "CONTROL", VSC_END: "CONTROL", SAFETY_CAR_START: "CONTROL", SAFETY_CAR_END: "CONTROL" };
/**
 * Structured feed from persisted Race records only (Race Control events plus pit-stop history), newest first.
 * Translation happens at render time; nothing here is prose.
 */
export function raceFeed(s: RacePublicState, playerTeamId: string): FeedItem[] {
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
/**
 * Qualitative tyre suitability for CURRENT public conditions (the same track-water bands the conditions strip shows).
 * Deliberately coarse: it never reveals the modelled crossover or reads future weather.
 */
export type Suitability = "SUITABLE" | "MARGINAL" | "POOR";
export type SuitabilityNote = "SLICK_WET" | "SLICK_DAMP" | "INTER_DRY" | "INTER_OK" | "INTER_FLOODED" | "WET_DRY" | "WET_DAMP" | "WET_OK" | "SLICK_OK";
export function tyreSuitability(compound: TyreCompound, weather: RacePublicState["weather"]): { level: Suitability; note: SuitabilityNote } | null {
    if (!weather) return null;
    const band = weather.trackWater < 100 ? 0 : weather.trackWater < 350 ? 1 : 2;
    if (compound === "INTERMEDIATE") return band === 0 ? { level: "POOR", note: "INTER_DRY" } : band === 1 ? { level: "SUITABLE", note: "INTER_OK" } : { level: "MARGINAL", note: "INTER_FLOODED" };
    if (compound === "WET") return band === 2 ? { level: "SUITABLE", note: "WET_OK" } : band === 1 ? { level: "MARGINAL", note: "WET_DAMP" } : { level: "POOR", note: "WET_DRY" };
    return band === 0 ? { level: "SUITABLE", note: "SLICK_OK" } : band === 1 ? { level: "MARGINAL", note: "SLICK_DAMP" } : { level: "POOR", note: "SLICK_WET" };
}
/** Management-level ERS outlook for the car's own current mode — computed on the server (it reads the ERS model). */
export function ersOutlook(e: RacePublicEntrant): ErsOutlook | null { return e.insight?.ers ?? null; }
/** Fuel projected short at the flag (server-derived for the player's own cars). */
export function fuelShort(s: RacePublicState, e: RacePublicEntrant) { return !!(e.commands && s.input.commands) && (e.insight?.projectedFuelGrams ?? 0) < 0; }
/** Compact, decision-relevant flags for a player car (for the non-selected car in particular). Reuses existing state. */
export type DriverFlag = "RETIRED" | "FINISHED" | "PIT" | "BOX" | "ATTENTION" | "TYRE_CRITICAL" | "TYRE_HIGH" | "FUEL" | "BATTLE";
export function driverFlags(row: Row, rows: readonly Row[], s: RacePublicState, attentionId: string | null = null): DriverFlag[] {
    if (row.status === "RETIRED") return ["RETIRED"];
    if (row.status === "FINISHED" || s.status === "FINISHED") return ["FINISHED"];
    const flags: DriverFlag[] = [], e = row.entrant, tyre = tyreCondition(s, e), battle = battleContext(rows, row.id, s);
    if (row.pitting) flags.push("PIT");
    if (e.pit?.pendingCompound) flags.push("BOX");
    if (attentionId === row.id) flags.push("ATTENTION");
    if (tyre?.wear === "CRITICAL") flags.push("TYRE_CRITICAL"); else if (tyre?.wear === "HIGH") flags.push("TYRE_HIGH");
    if (fuelShort(s, e)) flags.push("FUEL");
    if (battle.battleAhead || battle.battleBehind) flags.push("BATTLE");
    return flags;
}

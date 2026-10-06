/**
 * UIX-B strategic issues (UX-RACE-001): the player's CURRENT strategic problems and opportunities, derived from the
 * committed public Race view at every checkpoint. Unlike the transition-based attention line (attention.ts), an issue
 * stays listed for as long as its condition is true, so a tyre-cliff or fuel warning can no longer flash past at 8×
 * with auto-pause off. Presentation only: reads existing public state and helpers, never changes Race rules, timing or
 * auto-pause behaviour. The dry-tyre rule is listed only once it is URGENT (the panel explains it in full the rest of the
 * race), so the rail stays about decisions rather than standing reminders.
 */
import type { RacePublicState } from "../public-view";
import type { timingRows } from "./model";
import { CLIFF_WARNING_LAPS } from "./attention";
import { battleContext, controlMode, fuelCritical, fuelShort, tyreCondition } from "./race-view";
import { tyreFamily } from "../../../simulation/race/tyres/family";
type Row = ReturnType<typeof timingRows>[number];
export type IssueSeverity = "CRITICAL" | "WARNING" | "OPPORTUNITY" | "INFO";
export type IssueKind =
    | "FUEL_CRITICAL" | "TYRE_PAST_CLIFF" | "TYRE_RULE_URGENT" | "TYRE_POOR"
    | "TYRE_CLIFF_SOON" | "FUEL_SHORT" | "TYRE_HIGH" | "BATTLE_BEHIND"
    | "BATTLE_AHEAD" | "OVERTAKE_AVAILABLE"
    | "BOX_REQUESTED" | "NEUTRALISED";
export interface StrategicIssue {
    /** Stable identity of the condition (kind + car), used for "since lap" and acknowledgement. */
    readonly key: string;
    readonly kind: IssueKind;
    readonly severity: IssueSeverity;
    readonly entrantId: string | null;
    /** Kind-specific values for the translated text (laps, gap ms, deadline lap, compound…). */
    readonly values: Readonly<Record<string, number | string>>;
}
const SEVERITY_ORDER: Record<IssueSeverity, number> = { CRITICAL: 0, WARNING: 1, OPPORTUNITY: 2, INFO: 3 };
/** Player cars in entry order (stable). */
function playerRows(rows: readonly Row[], s: RacePublicState) {
    return s.input.entrants.map(e => rows.find(r => r.id === e.entrantId)).filter((r): r is Row => !!r && r.player);
}
export function strategicIssues(rows: readonly Row[], s: RacePublicState): StrategicIssue[] {
    if (s.status !== "RUNNING") return [];
    const out: StrategicIssue[] = [];
    const add = (kind: IssueKind, severity: IssueSeverity, entrantId: string | null, values: Record<string, number | string> = {}) =>
        out.push({ key: `${kind}:${entrantId ?? "race"}`, kind, severity, entrantId, values });
    const control = controlMode(s);
    if (control !== "GREEN") add("NEUTRALISED", "INFO", null, { mode: control });
    for (const row of playerRows(rows, s)) {
        if (row.status !== "RUNNING") continue;
        const e = row.entrant, tyre = tyreCondition(s, e), estimate = e.insight?.pitEstimate ?? null, rule = e.regulation;
        const family = e.stint ? tyreFamily(e.stint.tyre.compound) : null;
        if (fuelCritical(s, e)) add("FUEL_CRITICAL", "CRITICAL", row.id, { laps: e.insight!.fuelLapsRemaining! });
        else if (fuelShort(s, e)) add("FUEL_SHORT", "WARNING", row.id, { kg: Math.round((e.insight?.projectedFuelGrams ?? 0) / 100) / 10 });
        if (tyre?.wear === "CRITICAL") add("TYRE_PAST_CLIFF", "CRITICAL", row.id, { wear: e.stint!.tyre.wearPermille ?? 0 });
        else if (estimate && estimate.lapsToCliff <= CLIFF_WARNING_LAPS) add("TYRE_CLIFF_SOON", "WARNING", row.id, { laps: estimate.lapsToCliff });
        else if (tyre?.wear === "HIGH") add("TYRE_HIGH", "INFO", row.id, { wear: e.stint!.tyre.wearPermille ?? 0 });
        if (family && s.tyreFit && s.tyreFit.levels[family] === "POOR") add("TYRE_POOR", "CRITICAL", row.id, { best: s.tyreFit.best });
        if (rule?.status === "URGENT") add("TYRE_RULE_URGENT", "CRITICAL", row.id, { lap: rule.deadlineLap === null ? "" : rule.deadlineLap + 1 });
        if (e.pit?.pendingCompound) add("BOX_REQUESTED", "INFO", row.id, { compound: e.pit.pendingCompound });
        const battle = battleContext(rows, row.id, s);
        if (battle.battleBehind && battle.behind && battle.gapBehindMs !== null) add("BATTLE_BEHIND", "WARNING", row.id, { rival: battle.behind.abbreviation, ms: battle.gapBehindMs });
        if (battle.battleAhead && battle.ahead && battle.gapAheadMs !== null) add("BATTLE_AHEAD", "OPPORTUNITY", row.id, { rival: battle.ahead.abbreviation, ms: battle.gapAheadMs });
        if (e.assistance?.overtakeReason === "ELIGIBLE") add("OVERTAKE_AVAILABLE", "OPPORTUNITY", row.id);
    }
    return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
/** Highest severity per player car (for the driver switch and the timing tower). */
export function worstSeverity(issues: readonly StrategicIssue[], entrantId: string): IssueSeverity | null {
    return issues.filter(i => i.entrantId === entrantId).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0]?.severity ?? null;
}

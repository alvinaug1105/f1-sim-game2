import type { PaceMode, FuelMode, ErsMode } from "../../../simulation/race/commands/model";
import type { TyreCompound } from "../../../simulation/race/tyres/model";
export type ViewerIntent = {
    kind: "advance";
} | {
    kind: "paceMode";
    entrantId: string;
    revision: number;
    mode: PaceMode;
} | {
    kind: "fuelMode";
    entrantId: string;
    revision: number;
    mode: FuelMode;
} | {
    kind: "ersMode";
    entrantId: string;
    revision: number;
    mode: ErsMode;
} | {
    kind: "pit";
    entrantId: string;
    revision: number;
    compound: TyreCompound | null;
};
/** Confirmation identity for a player command: always the entrant the intent itself targets (never the current selection). */
export function commandInfo(intent: ViewerIntent) {
    switch (intent.kind) {
        case "pit": return { entrantId: intent.entrantId, kind: "pit" as const, value: intent.compound };
        case "paceMode": case "fuelMode": case "ersMode": return { entrantId: intent.entrantId, kind: intent.kind, value: intent.mode };
        default: return null;
    }
}

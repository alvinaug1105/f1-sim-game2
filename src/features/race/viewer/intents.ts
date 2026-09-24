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

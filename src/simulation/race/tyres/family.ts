/** Tyre families and qualitative suitability levels: plain types and a name mapping, safe to use in the browser. */
import type { TyreCompound } from "./model";
export const TYRE_FAMILIES = ["DRY", "INTERMEDIATE", "WET"] as const;
export type TyreFamily = (typeof TYRE_FAMILIES)[number];
export type Suitability = "SUITABLE" | "MARGINAL" | "POOR";
export interface TyreFamilyAssessment { readonly best: TyreFamily; readonly levels: Readonly<Record<TyreFamily, Suitability>> }
export function tyreFamily(compound: TyreCompound): TyreFamily { return compound === "INTERMEDIATE" ? "INTERMEDIATE" : compound === "WET" ? "WET" : "DRY"; }

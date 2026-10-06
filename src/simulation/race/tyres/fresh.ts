/**
 * Temperature at which a NEW tyre is fitted in a pit stop — the single source for the engine and for every strategy
 * planner that costs a fresh tyre.
 *
 * Revisions 1–4: the Race's frozen `pits.newTyreTemperatureMilliC` for every compound (accepted behaviour, unchanged).
 *
 * Revision 5 (v8E local fix, tyre warm-up): tyres come off blankets at least at the bottom of their compound's ideal
 * window (never above its top). The accepted model fitted every compound at 80 °C and warmed it by only 25 % of the gap
 * per lap, so a fresh soft spent ~3 laps below its window (≈ 0.3 s of cold penalty) — enough to cancel most of the
 * fresh-tyre advantage an early stop is meant to win. Physics only: no time is credited for stopping first; the new tyre
 * still has to be driven, still degrades, and the overcut keeps the old tyre's healthy pace, traffic and pit loss.
 *
 * Implemented as a revision capability (not a pit-profile field) because the pit profile is persisted in fixed database
 * columns: a new field there would not survive save / reload.
 */
import { hasV8eSemantics } from "../progression/revision";
import type { RaceSimulationInput } from "../types";
import type { TyreCompound } from "./model";

export function freshTyreTemperatureMilliC(input: Pick<RaceSimulationInput, "pits" | "tyres" | "progression">, compound: TyreCompound): number {
    const base = input.pits!.newTyreTemperatureMilliC;
    const profile = input.tyres?.profiles[compound];
    if (!hasV8eSemantics(input.progression) || !profile) return base;
    return Math.min(Math.max(base, profile.idealTemperatureMinMilliC), profile.idealTemperatureMaxMilliC);
}

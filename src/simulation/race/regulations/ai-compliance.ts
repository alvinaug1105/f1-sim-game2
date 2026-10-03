/**
 * Race v8C: AI compliance with the dry-tyre regulation (B6.3.6). Applies to every AI-managed car, including player cars
 * handed to auto-management (Simulate Race / Sprint / Remainder); PLAYER-controlled cars are never altered (the player
 * may deliberately violate the rule and accept the consequence).
 *
 * The AI uses only the same information as before (current tyre state and history, current public weather / forecast,
 * Race Control, its own stable preference) and complies through the SAME pit request → pit route → service → stint
 * machinery, pit loss and consequence as the player. No random draw is consumed.
 *
 * - Normal strategy stays primary: an AI stop it already wants is kept when legal; a same-specification choice that
 *   would leave the obligation outstanding is replaced by the planner's best LEGAL compound.
 * - From the last safe opportunity (`deadlineLap`) a car that still has no legal plan is called in: the regulation
 *   overrides a one-stop / no-stop plan. The deadline is conservative so lapped cars and SC/VSC still complete the
 *   stop and leave the pit lane (only then does the tyre count) before the flag.
 * - Exempt (actual intermediate / wet use) or satisfied cars are never forced to stop.
 *
 * Ownership: this module decides only WHAT IS LEGAL. The car's strategic character (`StrategyPreference`) is owned by
 * the pit strategy layer (pits/model.ts), which derives it and passes it in; it is never derived here.
 */
import { TYRE_COMPOUNDS, WEATHER_TYRE_COMPOUNDS, advanceTyre, tyreContributions, type TyreCompound, type TyreState } from '../tyres/model';
import { assessTyreFamilies, currentCompoundCostMs } from '../tyres/suitability';
import { tyreFamily } from '../tyres/family';
import { dryCompound, publicWeather, type StrategyPreference } from '../pits/ai-strategy';
import type { RaceEntrantState, RaceSimulationState } from '../types';
import { assessTyreRule, compoundSatisfies } from './tyres';

export function regulateAiStop(state: RaceSimulationState, e: RaceEntrantState, proposed: TyreCompound | null, greenPitLaneLossMs: number, preference: StrategyPreference | null): TyreCompound | null {
    const rule = state.input.progression?.regulation?.dryTyres;
    if (!rule) return proposed;
    const a = assessTyreRule(state, e.entrantId);
    if (a.status !== 'OUTSTANDING' && a.status !== 'URGENT') return proposed;
    // Already committed to a stop: the engine keeps that commitment; nothing new can be requested until it is served.
    if (state.progression?.cars[e.entrantId]?.compound) return proposed;
    const legal = (c: TyreCompound) => !!state.input.tyres?.profiles[c] && compoundSatisfies(a, c, rule);
    if (proposed) return legal(proposed) ? proposed : legalCompound(state, e, legal, greenPitLaneLossMs, preference);
    return state.lap >= a.deadlineLap! && state.lap <= a.lastRequestLap! ? legalCompound(state, e, legal, greenPitLaneLossMs, preference) : null;
}

/** The sensible legal compound from current public conditions, chosen by the existing strategy machinery. */
function legalCompound(state: RaceSimulationState, e: RaceEntrantState, legal: (c: TyreCompound) => boolean, greenPitLaneLossMs: number, preference: StrategyPreference | null): TyreCompound {
    const input = state.input, tyres = input.tyres!, w = state.weather, pub = input.weather ? publicWeather(input.weather) : null;
    // Current conditions favour the wet family: a wet-family tyre is the sensible choice (and exempts the car).
    if (w && pub) {
        const families = assessTyreFamilies(w, tyres, pub);
        if (families && families.best !== 'DRY') {
            const wet = WEATHER_TYRE_COMPOUNDS.filter(c => legal(c) && tyreFamily(c) !== 'DRY' && pub.waterProfiles[c])
                .sort((x, y) => currentCompoundCostMs(x, w, tyres, pub) - currentCompoundCostMs(y, w, tyres, pub) || WEATHER_TYRE_COMPOUNDS.indexOf(x) - WEATHER_TYRE_COMPOUNDS.indexOf(y));
            if (wet.length) return wet[0];
        }
    }
    const remaining = Math.max(1, input.totalLaps - state.lap - 1);
    const strategy = input.pits?.strategy;
    // The planner chooses among the legal candidates with the car's own character, supplied by the pit strategy layer.
    if (strategy && w && pub && preference)
        return dryCompound({ state, entrant: e, weather: w, publicWeather: pub, mode: state.incidents?.mode ?? 'GREEN', greenPitLaneLossMs },
            strategy, preference, tyres, remaining, legal);
    // Races without the snapshotted strategy: the cheapest legal dry compound over the remaining distance (tyre cost only).
    const fresh = (compound: TyreCompound): TyreState => ({ compound, ageLaps: 0, wearPermille: 0, temperatureMilliC: input.pits!.newTyreTemperatureMilliC });
    const cost = (start: TyreState) => { let t = start, total = 0; for (let n = 0; n < remaining; n++) { const x = tyreContributions(t, tyres.profiles[t.compound]!); total += x.tyreCompoundMs + x.tyreWearMs + x.tyreTemperatureMs; t = advanceTyre(t, tyres); } return total; };
    return TYRE_COMPOUNDS.filter(legal).map(c => ({ c, cost: cost(fresh(c)) })).sort((x, y) => x.cost - y.cost || TYRE_COMPOUNDS.indexOf(x.c) - TYRE_COMPOUNDS.indexOf(y.c))[0].c;
}

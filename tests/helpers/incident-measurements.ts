import { incidentInput, quietRace, neutralise } from "./incidents";
import { createRace, advanceRace, advanceRaceLap } from "../../src/simulation/race/engine";
import { constantWeather } from "./weather";
import type { PaceMode } from "../../src/simulation/race/commands/model";
import { effectivePitLaneLoss } from "../../src/simulation/race/incidents/model";
/** Controlled complete seeded races; severe outcomes/control are disabled to keep equal exposure. */
export function incidentMeasurements(seeds = 500) {
    const cases = [{ name: "highControl", control: 100 }, { name: "baseline", control: 85 }, { name: "lowControl", control: 20 }, { name: "conserve", pace: "CONSERVE" }, { name: "attack", pace: "ATTACK" }, { name: "dryTyreWet", wet: true }, { name: "wetTyreWet", wet: true, compound: "WET" }, { name: "healthy", mechanical: true, condition: 100 }, { name: "degraded", mechanical: true, condition: 30 }] as const;
    const rates: Record<string, {
        events: number;
        carLaps: number;
        per1000: number;
    }> = {};
    for (const sample of cases) {
        let events = 0;
        for (let seed = 1; seed <= seeds; seed++) {
            const i = incidentInput(1, seed, 58);
            i.incidents = { ...i.incidents, majorPermille: 0, moderatePermille: 0, vscMinorPermille: 0, mechanicalRetirementPermille: 0 };
            if ("mechanical" in sample) {
                i.incidents.baseErrorPpm = 0;
                i.incidents.controlDeficitPpm = 0;
                i.incidents.wearRiskPpm = 0;
                i.incidents.unsuitableRiskPpm = 0;
                i.incidents.battleRiskPpm = 0;
                const p = i.entrants[0].reliability;
                p.reliability = sample.condition;
                p.powerUnitCondition = sample.condition;
                p.gearboxCondition = sample.condition;
            }
            else {
                i.incidents.baseMechanicalPpm = 0;
                i.incidents.conditionDeficitPpm = 0;
                i.incidents.distanceRiskPpm = 0;
            }
            if ("control" in sample)
                i.entrants[0].reliability.control = sample.control;
            if ("wet" in sample)
                i.weather = constantWeather(1000, 800);
            if ("compound" in sample)
                i.entrants[0].startingTyre = { ...i.entrants[0].startingTyre!, compound: sample.compound };
            let state = createRace(i);
            if ("pace" in sample)
                state = { ...state, entrants: state.entrants.map(e => ({ ...e, commands: { ...e.commands!, paceMode: sample.pace as PaceMode } })) };
            state = advanceRace(state, 1000);
            events += state.incidents!.events.filter(e => e.type === "INCIDENT").length;
        }
        rates[sample.name] = { events, carLaps: seeds * 58, per1000: Math.round(events / (seeds * 58) * 1000000) / 1000 };
    }
    const s = quietRace(2), resources = Object.fromEntries((["GREEN", "VSC", "SAFETY_CAR"] as const).map(mode => { const start = mode === "GREEN" ? s : neutralise(s, mode), e = advanceRaceLap(start).entrants[0]; return [mode, { lapMs: e.lastLapTimeMs, fuelBurnKg: s.entrants[0].fuelMassKg - e.fuelMassKg, wear: e.stint!.tyre.wearPermille, temperatureMilliC: e.stint!.tyre.temperatureMilliC, ersCharge: e.commands!.ersCharge, pitLaneLossMs: effectivePitLaneLoss(start) }]; }));
    return { seeds, rates, resources };
}

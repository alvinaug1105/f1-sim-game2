import type { RaceSimulationState, RaceEntrantState } from "../types";
import { calculateLapTime } from "../engine";
import { createSeededRandom } from "../../core/random";
import { chooseAiCommands } from "../commands/policy";
import { commandLapEffects } from "../commands/model";
import { committedStops, completePitLap } from "../pits/model";
import { orderedClassification, resolveTraffic } from "../traffic/model";
import { getTyreProfile } from "../tyres/model";
import { advanceWeather, advanceWeatherTyre, waterPenaltyMs } from "../weather/model";
import type { RaceStint } from "../pits/types";
import type { TyreState } from "../tyres/model";
import { validateIncidentState, driverRiskPpm, mechanicalRiskPpm, effectivePitLaneLoss, type RaceEvent, type IncidentKind, type RaceControlMode } from "./model";
/** v7 only. Incident draws never enter the consistency/traffic/service stream. */
export function advanceIncidentLap(saved: RaceSimulationState): RaceSimulationState {
    validateIncidentState(saved);
    if (saved.status !== "RUNNING" || saved.lap >= saved.input.totalLaps)
        throw new RangeError("Race finished");
    const c = saved.input.incidents!, control = saved.incidents!, neutral = control.mode !== "GREEN", p = neutral ? c[control.mode as "VSC" | "SAFETY_CAR"] : null;
    const active = saved.entrants.filter(e => e.incident!.status === "RUNNING");
    let state: RaceSimulationState = { ...saved, input: { ...saved.input, entrants: saved.input.entrants.filter(e => active.some(a => a.entrantId === e.entrantId)), pits: { ...saved.input.pits!, pitLaneLossMs: effectivePitLaneLoss(saved) } }, entrants: active };
    state = neutral ? { ...state, entrants: state.entrants.map(e => state.input.entrants.find(s => s.entrantId === e.entrantId)!.strategyController === "PLAYER" ? e : { ...e, commands: { ...e.commands!, paceMode: "CONSERVE", fuelMode: "CONSERVE", ersMode: "HARVEST" } }) } : chooseAiCommands(state);
    const lap = state.lap + 1, weather = advanceWeather(state.weather!, state.input.weather!, lap), random = createSeededRandom(state.rngState), stops = committedStops(state);
    const input = { ...state.input, interaction: { ...state.input.interaction!, drsZoneCount: neutral || control.drsDelay > 0 || weather.drsState === "DRS_DISABLED_WET" ? 0 : state.input.interaction!.drsZoneCount } };
    const potential = [...state.input.entrants].sort((a, b) => a.gridPosition - b.gridPosition).map(source => {
        const old = state.entrants.find(e => e.entrantId === source.entrantId)!;
        const effect = commandLapEffects(old, state.input.fuelBurnPerLapKg * (p ? p.fuelMultiplierPermille / 1000 : 1), state.input.commands!, neutral || stops.has(source.entrantId));
        const pace = state.input.commands!.pace[old.commands!.paceMode], tyres = { ...state.input.tyres!, tyreWearMultiplierPermille: Math.round(state.input.tyres!.tyreWearMultiplierPermille * (p ? p.wearMultiplierPermille : pace.tyreWearMultiplierPermille) / 1000), tyreEnergyMultiplierPermille: Math.round(state.input.tyres!.tyreEnergyMultiplierPermille * (p ? p.energyMultiplierPermille : pace.tyreEnergyMultiplierPermille) / 1000) };
        const result = calculateLapTime({ ...source, circuit: input.circuit, parameters: input.parameters, fuelMassKg: old.fuelMassKg, tyre: { state: old.stint!.tyre, profile: getTyreProfile(input.tyres!, old.stint!.tyre.compound) } }, random);
        const time = p ? Math.round(input.circuit.baseLapTimeMs * p.lapMultiplierPermille / 1000) : Math.max(1, result.lapTimeMs + effect.deltaMs + old.incident!.mechanicalPenaltyMs + waterPenaltyMs(old.stint!.tyre.compound, weather.trackWater, input.weather!));
        return { ...old, commands: effect.commands, fuelMassKg: effect.fuelMassKg, stint: { ...old.stint!, tyre: advanceWeatherTyre(old.stint!.tyre, tyres, weather, p ? { ...input.weather!, waterProfiles: Object.fromEntries(Object.entries(input.weather!.waterProfiles).map(([key, value]) => [key, { ...value, dryTargetMilliC: Math.round(weather.trackTemperatureMilliC + (value.dryTargetMilliC - weather.trackTemperatureMilliC) * p.energyMultiplierPermille / 1000), wetTargetMilliC: Math.round(weather.trackTemperatureMilliC + (value.wetTargetMilliC - weather.trackTemperatureMilliC) * p.energyMultiplierPermille / 1000) }])) as NonNullable<typeof input.weather>["waterProfiles"] } : input.weather!) }, completedLaps: lap, elapsedTimeMs: old.elapsedTimeMs + time, lastLapTimeMs: time, bestLapTimeMs: Math.min(old.bestLapTimeMs ?? time, time) };
    });
    // Queue compression is applied before pit-route crossings; each interval shrinks gradually.
    if (neutral) {
        let previousOld: RaceEntrantState | undefined, previousNew: RaceEntrantState | undefined;
        for (const old of [...state.entrants].sort((a, b) => a.position - b.position)) {
            const index = potential.findIndex(e => e.entrantId === old.entrantId);
            let e = potential[index];
            if (control.mode === "SAFETY_CAR" && previousOld && previousNew) {
                const gap = old.elapsedTimeMs - previousOld.elapsedTimeMs;
                const shrink = Math.min(c.maxCompressionMs, Math.round(Math.max(0, gap - c.queueIntervalMs) * c.compressionPermille / 1000));
                const crossing = Math.max(old.elapsedTimeMs + 1, previousNew.elapsedTimeMs + gap - shrink);
                e = { ...e, elapsedTimeMs: crossing, lastLapTimeMs: crossing - old.elapsedTimeMs, bestLapTimeMs: Math.min(old.bestLapTimeMs ?? Infinity, crossing - old.elapsedTimeMs) };
            }
            e = { ...e, track: { ...e.track!, drsEligible: false, drsBenefitMs: 0, dirtyAirMs: 0, trafficLossMs: 0, attempted: false, passed: false, potentialLapTimeMs: e.lastLapTimeMs } };
            potential[index] = e;
            previousOld = old;
            previousNew = e;
        }
    }
    const previous = state.entrants.filter(e => !stops.has(e.entrantId)).map((e, i) => ({ ...e, position: i + 1 }));
    const onTrack = potential.filter(e => !stops.has(e.entrantId));
    let entries = completePitLap(state, potential, neutral ? orderedClassification(onTrack.sort((a, b) => a.elapsedTimeMs - b.elapsedTimeMs), input) : resolveTraffic(previous, onTrack, input, lap, random).entrants, stops, random);
    const events: RaceEvent[] = [...control.events], incidentRandom = createSeededRandom(control.rngState), affected = new Set<string>();
    const emit = (event: Omit<RaceEvent, "sequence" | "lap">) => events.push({ ...event, sequence: events.length + 1, lap });
    let trigger: RaceControlMode = "GREEN", duration = 0;
    const retire = (id: string, kind: IncidentKind) => { const i = entries.findIndex(e => e.entrantId === id); if (i < 0 || entries[i].incident!.status === "RETIRED")
        return; const e = entries[i]; emit({ type: "RETIREMENT", entrantIds: [id], kind, severity: "MAJOR", timeLossMs: 0 }); entries[i] = { ...e, incident: { ...e.incident!, status: "RETIRED", retiredLap: lap, retirementOrder: events.length }, pit: { ...e.pit!, pendingCompound: null, stints: closeRetiredStints(e.pit!.stints, lap, e.stint!.tyre) }, track: { ...e.track!, drsEligible: false, drsBenefitMs: 0, attempted: false, passed: false } }; };
    // Exactly six draws per ORIGINAL grid slot per world lap, including retired/suppressed slots.
    for (const source of [...saved.input.entrants].sort((a, b) => a.gridPosition - b.gridPosition)) {
        const [error, kindRoll, severityRoll, mechanical, outcome, durationRoll] = Array.from({ length: 6 }, () => incidentRandom.next());
        const old = state.entrants.find(e => e.entrantId === source.entrantId);
        if (neutral || !old || affected.has(source.entrantId))
            continue;
        let kind: IncidentKind | null = null, severity: RaceEvent["severity"] = "MINOR";
        const ahead = state.entrants.find(e => e.position === old.position - 1);
        if (error * 1e6 < driverRiskPpm({ ...state, weather }, old, source)) {
            kind = (["DRIVER_MISTAKE", "LOCK_UP", "SPIN", "CONTACT"] as const)[Math.floor(kindRoll * 4)];
            if (kind === "CONTACT" && (!ahead || old.intervalToAheadMs === null || old.intervalToAheadMs > 1000 || affected.has(ahead.entrantId)))
                kind = "DRIVER_MISTAKE";
            severity = severityRoll * 1000 < c.majorPermille ? "MAJOR" : severityRoll * 1000 < c.majorPermille + c.moderatePermille ? "MODERATE" : "MINOR";
        }
        else if (mechanical * 1e6 < mechanicalRiskPpm(state, source)) {
            kind = severityRoll * 1000 < c.mechanicalRetirementPermille ? "MECHANICAL_RETIREMENT" : "MECHANICAL_PROBLEM";
            severity = kind === "MECHANICAL_RETIREMENT" ? "MAJOR" : "MODERATE";
        }
        if (!kind)
            continue;
        const ids = kind === "CONTACT" ? [source.entrantId, ahead!.entrantId] : [source.entrantId];
        const range = c.losses[kind], loss = Math.round((range.minimumMs + kindRoll * (range.maximumMs - range.minimumMs)) * (severity === "MODERATE" ? 1.5 : 1));
        emit({ type: "INCIDENT", entrantIds: ids, kind, severity, timeLossMs: loss });
        for (const id of ids) {
            affected.add(id);
            const i = entries.findIndex(e => e.entrantId === id), e = entries[i];
            entries[i] = { ...e, elapsedTimeMs: e.elapsedTimeMs + loss, lastLapTimeMs: e.lastLapTimeMs! + loss, bestLapTimeMs: Math.min(state.entrants.find(x => x.entrantId === id)!.bestLapTimeMs ?? Infinity, e.lastLapTimeMs! + loss), incident: { ...e.incident!, mechanicalPenaltyMs: kind === "MECHANICAL_PROBLEM" ? Math.min(10000, e.incident!.mechanicalPenaltyMs + c.mechanicalPenaltyMs) : e.incident!.mechanicalPenaltyMs } };
        }
        if (severity === "MAJOR") {
            retire(source.entrantId, kind);
            if (kind === "CONTACT" && outcome * 1000 < c.doubleContactRetirementPermille)
                retire(ahead!.entrantId, kind);
        }
        const candidate: RaceControlMode = severity === "MAJOR" && kind !== "MECHANICAL_RETIREMENT" && outcome * 1000 < c.scMajorPermille ? "SAFETY_CAR" : outcome * 1000 < (severity === "MAJOR" ? c.vscRetirementPermille : c.vscMinorPermille) ? "VSC" : "GREEN";
        if (candidate !== "GREEN" && (trigger === "GREEN" || candidate === "SAFETY_CAR")) {
            trigger = candidate;
            const profile = c[candidate];
            duration = profile.minLaps + Math.floor(durationRoll * (profile.maxLaps - profile.minLaps + 1));
        }
    }
    let nextControl = { ...control, rngState: incidentRandom.getState(), events };
    if (neutral) {
        nextControl.remainingLaps--;
        if (nextControl.remainingLaps === 0) {
            emit({ type: control.mode === "VSC" ? "VSC_END" : "SAFETY_CAR_END", entrantIds: [], kind: null, severity: null, timeLossMs: 0 });
            nextControl = { ...nextControl, mode: "GREEN", startedLap: null, drsDelay: control.mode === "SAFETY_CAR" ? c.drsRestartLaps : control.drsDelay };
        }
    }
    else {
        nextControl.drsDelay = Math.max(0, control.drsDelay - 1);
        if (trigger !== "GREEN" && lap < saved.input.totalLaps) {
            nextControl = { ...nextControl, mode: trigger, startedLap: lap, remainingLaps: duration };
            emit({ type: trigger === "VSC" ? "VSC_START" : "SAFETY_CAR_START", entrantIds: [], kind: null, severity: null, timeLossMs: 0 });
        }
    }
    const finished = lap === saved.input.totalLaps;
    entries = entries.map(e => finished && e.incident!.status === "RUNNING" ? { ...e, incident: { ...e.incident!, status: "FINISHED" } } : e);
    const running = entries.filter(e => e.incident!.status !== "RETIRED").sort((a, b) => a.elapsedTimeMs - b.elapsedTimeMs);
    const retired = [...entries.filter(e => e.incident!.status === "RETIRED"), ...saved.entrants.filter(e => e.incident!.status === "RETIRED")].sort((a, b) => b.completedLaps - a.completedLaps || a.incident!.retirementOrder! - b.incident!.retirementOrder!);
    const classified = [...orderedClassification(running, saved.input), ...retired.map(e => ({ ...e, gapToLeaderMs: null, intervalToAheadMs: null }))].map((e, i) => ({ ...e, position: i + 1, ...(nextControl.mode !== "GREEN" || nextControl.drsDelay > 0 ? { track: { ...e.track!, drsEligible: false } } : {}) }));
    return { ...saved, lap, status: finished ? "FINISHED" : "RUNNING", weather, rngState: random.getState(), incidents: nextControl, entrants: classified };
}

/**
 * A retirement closes the open stint at the retirement lap. A stint only becomes a completed record once at least
 * one racing lap belongs to it: tyres fitted by a stop after this same lap (pit service + same-lap retirement) were
 * never raced, so that final stint stays terminal and unclosed instead of becoming a zero-length completed stint
 * (every completed stint keeps endLap > startLap). The stop itself is kept — its time was spent.
 */
export function closeRetiredStints(stints: readonly RaceStint[], lap: number, tyre: TyreState): RaceStint[] {
    return stints.map(s => s.endLap === null && s.startLap < lap ? { ...s, endLap: lap, endingTyre: tyre } : s);
}

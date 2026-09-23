import type { RaceSimulationState, RaceEntrant, RaceEntrantState } from "../types";
import type { PaceMode } from "../commands/model";
import { waterPenaltyMs } from "../weather/model";
export type RaceControlMode = "GREEN" | "VSC" | "SAFETY_CAR";
export type IncidentKind = "DRIVER_MISTAKE" | "SPIN" | "LOCK_UP" | "CONTACT" | "MECHANICAL_PROBLEM" | "MECHANICAL_RETIREMENT";
export interface ReliabilityProfile {
    reliability: number;
    powerUnitCondition: number;
    gearboxCondition: number;
    control: number;
}
export interface EntrantIncidentState {
    status: "RUNNING" | "FINISHED" | "RETIRED";
    mechanicalPenaltyMs: number;
    retiredLap: number | null;
    retirementOrder: number | null;
}
export interface RaceEvent {
    sequence: number;
    type: "INCIDENT" | "RETIREMENT" | "VSC_START" | "VSC_END" | "SAFETY_CAR_START" | "SAFETY_CAR_END";
    lap: number;
    entrantIds: readonly string[];
    kind: IncidentKind | null;
    severity: "MINOR" | "MODERATE" | "MAJOR" | null;
    timeLossMs: number;
}
export interface IncidentRaceState {
    rngState: number;
    mode: RaceControlMode;
    startedLap: number | null;
    remainingLaps: number;
    drsDelay: number;
    events: readonly RaceEvent[];
}
export interface NeutralProfile {
    lapMultiplierPermille: number;
    fuelMultiplierPermille: number;
    wearMultiplierPermille: number;
    energyMultiplierPermille: number;
    minLaps: number;
    maxLaps: number;
}
export interface IncidentConfiguration {
    version: 1;
    baseErrorPpm: number;
    controlDeficitPpm: number;
    wearRiskPpm: number;
    unsuitableRiskPpm: number;
    battleRiskPpm: number;
    maxErrorPpm: number;
    paceRisk: Record<PaceMode, number>;
    baseMechanicalPpm: number;
    conditionDeficitPpm: number;
    distanceRiskPpm: number;
    mechanicalRetirementPermille: number;
    moderatePermille: number;
    majorPermille: number;
    doubleContactRetirementPermille: number;
    losses: Record<IncidentKind, {
        minimumMs: number;
        maximumMs: number;
    }>;
    mechanicalPenaltyMs: number;
    vscMinorPermille: number;
    vscRetirementPermille: number;
    scMajorPermille: number;
    VSC: NeutralProfile;
    SAFETY_CAR: NeutralProfile;
    queueIntervalMs: number;
    compressionPermille: number;
    maxCompressionMs: number;
    drsRestartLaps: number;
    /** Green travel time through the circuit section bypassed by the pit route. */
    pitTrackSectionMs: number;
}
export const INCIDENT_STREAM_CONSTANT = 0x5a17c9e3;
export function defaultReliability(): ReliabilityProfile { return { reliability: 97, powerUnitCondition: 95, gearboxCondition: 95, control: 85 }; }
export function initialEntrantIncident(): EntrantIncidentState { return { status: "RUNNING", mechanicalPenaltyMs: 0, retiredLap: null, retirementOrder: null }; }
export function initialIncidentRace(seed: number): IncidentRaceState { return { rngState: (seed ^ INCIDENT_STREAM_CONSTANT) >>> 0, mode: "GREEN", startedLap: null, remainingLaps: 0, drsDelay: 0, events: [] }; }
export function defaultIncidentConfiguration(): IncidentConfiguration {
    return { version: 1, baseErrorPpm: 500, controlDeficitPpm: 25, wearRiskPpm: 1500, unsuitableRiskPpm: 3500, battleRiskPpm: 250, maxErrorPpm: 80000,
        paceRisk: { CONSERVE: 600, LIGHT: 800, STANDARD: 1000, PUSH: 1250, ATTACK: 1600 }, baseMechanicalPpm: 150, conditionDeficitPpm: 25, distanceRiskPpm: 150, mechanicalRetirementPermille: 350,
        moderatePermille: 150, majorPermille: 30, doubleContactRetirementPermille: 150,
        losses: { DRIVER_MISTAKE: { minimumMs: 800, maximumMs: 3000 }, SPIN: { minimumMs: 3000, maximumMs: 8000 }, LOCK_UP: { minimumMs: 500, maximumMs: 2000 }, CONTACT: { minimumMs: 1500, maximumMs: 4500 }, MECHANICAL_PROBLEM: { minimumMs: 1000, maximumMs: 3000 }, MECHANICAL_RETIREMENT: { minimumMs: 0, maximumMs: 0 } }, mechanicalPenaltyMs: 800,
        vscMinorPermille: 20, vscRetirementPermille: 650, scMajorPermille: 750,
        VSC: { lapMultiplierPermille: 1350, fuelMultiplierPermille: 750, wearMultiplierPermille: 600, energyMultiplierPermille: 400, minLaps: 1, maxLaps: 3 },
        SAFETY_CAR: { lapMultiplierPermille: 1650, fuelMultiplierPermille: 500, wearMultiplierPermille: 350, energyMultiplierPermille: 200, minLaps: 2, maxLaps: 5 },
        queueIntervalMs: 1000, compressionPermille: 400, maxCompressionMs: 5000, drsRestartLaps: 2, pitTrackSectionMs: 12000 };
}
function integer(n: number, min: number, max: number) { if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new RangeError("Invalid incident configuration/state"); }
export function validateReliability(p: ReliabilityProfile) { for (const v of Object.values(p))
    integer(v, 0, 100); for (const k of ["reliability", "powerUnitCondition", "gearboxCondition", "control"] as const)
    integer(p[k], 0, 100); }
export function validateIncidentConfiguration(c: IncidentConfiguration) {
    if (c.version !== 1)
        throw new RangeError("Unsupported incident configuration");
    for (const key of ["baseErrorPpm", "controlDeficitPpm", "wearRiskPpm", "unsuitableRiskPpm", "battleRiskPpm", "maxErrorPpm", "baseMechanicalPpm", "conditionDeficitPpm", "distanceRiskPpm"] as const)
        integer(c[key], 0, 1000000);
    for (const key of ["mechanicalRetirementPermille", "moderatePermille", "majorPermille", "doubleContactRetirementPermille", "vscMinorPermille", "vscRetirementPermille", "scMajorPermille"] as const)
        integer(c[key], 0, 1000);
    if (c.moderatePermille + c.majorPermille > 1000)
        throw new RangeError("Invalid severity distribution");
    for (const mode of ["CONSERVE", "LIGHT", "STANDARD", "PUSH", "ATTACK"] as const)
        integer(c.paceRisk[mode], 0, 3000);
    for (const mode of ["VSC", "SAFETY_CAR"] as const) {
        const p = c[mode];
        integer(p.lapMultiplierPermille, 1001, 2500);
        integer(p.fuelMultiplierPermille, 100, 1000);
        integer(p.wearMultiplierPermille, 100, 1000);
        integer(p.energyMultiplierPermille, 0, 1000);
        integer(p.minLaps, 1, 10);
        integer(p.maxLaps, p.minLaps, 10);
    }
    integer(c.mechanicalPenaltyMs, 0, 10000);
    integer(c.queueIntervalMs, 100, 5000);
    integer(c.compressionPermille, 1, 900);
    integer(c.maxCompressionMs, 1, 10000);
    integer(c.drsRestartLaps, 0, 10);
    integer(c.pitTrackSectionMs, 0, 60000);
    for (const k of ["DRIVER_MISTAKE", "SPIN", "LOCK_UP", "CONTACT", "MECHANICAL_PROBLEM", "MECHANICAL_RETIREMENT"] as const) {
        integer(c.losses[k].minimumMs, 0, 60000);
        integer(c.losses[k].maximumMs, c.losses[k].minimumMs, 60000);
    }
}
export function driverRiskPpm(state: RaceSimulationState, e: RaceEntrantState, source: RaceEntrant) {
    const c = state.input.incidents!, p = source.reliability!, water = state.weather!.trackWater;
    const unsuitable = Math.min(1, waterPenaltyMs(e.stint!.tyre.compound, water, state.input.weather!) / 28000);
    const battle = e.position > 1 && e.intervalToAheadMs !== null && e.intervalToAheadMs <= 1000;
    const risk = c.baseErrorPpm + (100 - p.control) * c.controlDeficitPpm + c.wearRiskPpm * (e.stint!.tyre.wearPermille / 1000) ** 2 + c.unsuitableRiskPpm * unsuitable + (battle ? c.battleRiskPpm : 0);
    return Math.min(c.maxErrorPpm, Math.round(risk * c.paceRisk[e.commands!.paceMode] / 1000));
}
export function mechanicalRiskPpm(state: RaceSimulationState, source: RaceEntrant) { const c = state.input.incidents!, p = source.reliability!; const deficit = (300 - p.reliability - p.powerUnitCondition - p.gearboxCondition) / 3; return Math.min(1000000, Math.round(c.baseMechanicalPpm + deficit * c.conditionDeficitPpm + c.distanceRiskPpm * state.lap / state.input.totalLaps)); }
export function effectivePitLaneLoss(state: RaceSimulationState) { const control = state.incidents!, c = state.input.incidents!; return control.mode === "GREEN" ? state.input.pits!.pitLaneLossMs : Math.max(1000, state.input.pits!.pitLaneLossMs - Math.round(c.pitTrackSectionMs * (c[control.mode].lapMultiplierPermille - 1000) / 1000)); }
export function validateIncidentState(state: RaceSimulationState) {
    const s = state.incidents!;
    if (!s)
        throw new RangeError("Missing incident state");
    integer(s.rngState, 0, 0xffffffff);
    if (!["GREEN", "VSC", "SAFETY_CAR"].includes(s.mode))
        throw new RangeError("Invalid Race Control");
    integer(s.remainingLaps, 0, 10);
    integer(s.drsDelay, 0, 10);
    if ((s.mode === "GREEN") !== (s.remainingLaps === 0))
        throw new RangeError("Invalid control duration");
    if (s.startedLap !== null)
        integer(s.startedLap, 0, state.lap);
    const ids = new Set(state.input.entrants.map(e => e.entrantId));
    if (state.entrants.length !== ids.size || new Set(state.entrants.map(e => e.entrantId)).size !== ids.size || state.entrants.some(e => !ids.has(e.entrantId)))
        throw new RangeError("Invalid incident entrant ownership");
    for (const e of state.entrants) {
        const x = e.incident!;
        if (!x || !["RUNNING", "FINISHED", "RETIRED"].includes(x.status))
            throw new RangeError("Invalid entrant status");
        integer(x.mechanicalPenaltyMs, 0, 10000);
        if (x.status === "RETIRED") {
            if (x.retiredLap === null || x.retirementOrder === null)
                throw new RangeError("Missing retirement metadata");
            integer(x.retiredLap, 1, state.lap);
            if (e.completedLaps !== x.retiredLap || e.pit?.pendingCompound)
                throw new RangeError("Invalid retired checkpoint");
            integer(x.retirementOrder, 1, 100000);
        }
        else if (e.completedLaps !== state.lap || x.status !== (state.status === "FINISHED" ? "FINISHED" : "RUNNING") || x.retiredLap !== null || x.retirementOrder !== null)
            throw new RangeError("Unexpected retirement metadata");
    }
    for (const [n, e] of s.events.entries()) {
        integer(e.sequence, n + 1, n + 1);
        integer(e.lap, 1, state.lap);
        integer(e.timeLossMs, 0, 300000);
        if (e.kind !== null && !Object.hasOwn(state.input.incidents!.losses, e.kind))
            throw new RangeError("Invalid incident kind");
        if (e.severity !== null && !["MINOR", "MODERATE", "MAJOR"].includes(e.severity))
            throw new RangeError("Invalid incident severity");
        if (new Set(e.entrantIds).size !== e.entrantIds.length)
            throw new RangeError("Duplicate event participant");
        if (!["INCIDENT", "RETIREMENT", "VSC_START", "VSC_END", "SAFETY_CAR_START", "SAFETY_CAR_END"].includes(e.type) || e.entrantIds.some(id => !ids.has(id)))
            throw new RangeError("Invalid event ownership/type");
    }
}

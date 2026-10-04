import { localProgress, segmentAt, LAP_UNITS, physicalAhead } from '../../simulation/race/progression/model';
import { tieOrderFor } from '../../simulation/race/progression/tie-order';
/**
 * Server-side projection: authoritative Race / Sprint state → the browser view (public-view.ts).
 *
 * Whitelist, never blacklist: every field of the public view is copied explicitly, so anything added to the
 * authoritative state later stays server-only until someone deliberately publishes it here. The projection reads
 * state; it never advances, mutates or re-runs the simulation.
 */
import type { CareerRaceData } from "../../game/domain/race-repository";
import type { RaceEntrantState, RaceSimulationState } from "../../simulation/race/types";
import type { TyreState } from "../../simulation/race/tyres/model";
import { WEATHER_TYRE_COMPOUNDS, type TyreCompound } from "../../simulation/race/tyres/model";
import { fuelBurnGrams, projectedFuelGrams } from "../../simulation/race/commands/model";
import { forecastAt } from "../../simulation/race/weather/model";
import { assessTyreFamilies } from "../../simulation/race/tyres/suitability";
import { v8eWeatherTyreConfiguration } from "../../simulation/race/tyres/profiles";
import { estimatePitWindow } from "./strategy-estimate";
import { aiStartingCompound, careerRaceWeather } from "./weather-scenarios";
import { scheduledLaps } from "./development-profiles";
import { hasAssistance } from "../../simulation/race/progression/revision";
import { assessTyreRule, compoundSatisfies } from "../../simulation/race/regulations/tyres";
import type {
  AeroReason,
  OvertakeReason,
  ErsOutlook,
  PlayerCarInsight,
  PublicTyre,
  PublicTyreThresholds,
  RacePreparationView,
  RacePublicEntrant,
  RacePublicState,
  RaceViewData,
} from "./public-view";
function publicTyre(t: TyreState, own: boolean): PublicTyre {
  return { compound: t.compound, ageLaps: t.ageLaps, wearPermille: own ? t.wearPermille : null, temperatureMilliC: own ? t.temperatureMilliC : null };
}
/** Management-level ERS outlook for the car's own current mode: laps of deployment left, or sustainable / recharging. */
function ersOutlook(s: RaceSimulationState, e: RaceEntrantState): ErsOutlook | null {
  const c = s.input.commands, m = e.commands;
  if (!c || !m) return null;
  const profile = c.ers[m.ersMode], net = profile.consumption - Math.round(c.baseRecovery * profile.recoveryPermille * c.ersHarvestFactorPermille / 1000000);
  if (net < 0) return { kind: "CHARGING" };
  if (net === 0) return { kind: "SUSTAINABLE" };
  return { kind: "LAPS", laps: Math.floor(m.ersCharge / net) };
}
function insight(s: RaceSimulationState, e: RaceEntrantState): PlayerCarInsight {
  const est = e.pit && e.stint && s.input.pits && s.input.tyres ? estimatePitWindow(s, e) : null;
  return {
    projectedFuelGrams: e.commands && s.input.commands ? projectedFuelGrams(s, e) : null,
    fuelLapsRemaining: e.commands && s.input.commands ? Math.floor(Math.round(e.fuelMassKg * 1000) / Math.max(1, fuelBurnGrams(s.input.fuelBurnPerLapKg, e.commands.fuelMode, s.input.commands))) : null,
    ers: hasAssistance(s.input.progression)?null:ersOutlook(s, e),
    pitEstimate: est ? { lapsToCliff: est.lapsToCliff, minimumLossMs: est.minimumLossMs, maximumLossMs: est.maximumLossMs, lapsToCliffMin: est.lapsToCliffMin, lapsToCliffMax: est.lapsToCliffMax, paceMode: est.paceMode, rejoin: est.rejoin } : null,
  };
}
/**
 * Player cars only: WHY Overtake Mode / Active Aero are in their current state, from the car's own assistance state and
 * public facts (Race Control, current track water, the car physically ahead and its gap). Never reveals rival data.
 */
function assistanceReasons(s: RaceSimulationState, e: RaceEntrantState): { overtakeReason: OvertakeReason; gapAheadMs: number | null; overtakeThresholdMs: number; aeroReason: AeroReason; aeroStraightDeltaMs: number } {
  const config = s.input.progression!, a = config.assistance!, car = s.progression!.cars[e.entrantId], mine = car.assistance!;
  const mode = s.incidents?.mode ?? "GREEN", running = e.incident?.status === "RUNNING";
  const near = running && car.route === "TRACK" ? physicalAhead(s.entrants, e, s.progression!.cars, tieOrderFor(config)) : null;
  const gapAheadMs = near ? Math.round(near.distance * s.input.circuit.baseLapTimeMs / LAP_UNITS) : null;
  const restriction: "NOT_RUNNING" | "PIT_LANE" | "SAFETY_CAR" | "VSC" | "WET" | null = !running ? "NOT_RUNNING" : car.route !== "TRACK" ? "PIT_LANE" : mode === "SAFETY_CAR" ? "SAFETY_CAR" : mode === "VSC" ? "VSC" : (s.weather?.trackWater ?? 0) > a.maxWater ? "WET" : null;
  const overtakeReason: OvertakeReason = mine.overtake === "ACTIVE" ? "ACTIVE" : mine.overtake === "AVAILABLE" ? (mine.energy > 0 ? "ELIGIBLE" : "ELIGIBLE_NO_ENERGY")
    : restriction ?? (!near ? "NO_CAR_AHEAD" : Math.abs(near.entrant.track!.progressMicrolaps - e.track!.progressMicrolaps) >= LAP_UNITS / 2 ? "LAPPING" : gapAheadMs! > a.thresholdMs ? "GAP" : "AWAITING_DETECTION");
  const aeroReason: AeroReason = mine.aero === "SAFE" ? restriction ?? "WET" : mine.aero;
  return { overtakeReason, gapAheadMs, overtakeThresholdMs: a.thresholdMs, aeroReason, aeroStraightDeltaMs: a.straightDeltaMs };
}
function entrant(s: RaceSimulationState, e: RaceEntrantState, own: boolean): RacePublicEntrant {
  return {
    entrantId: e.entrantId,
    completedLaps: e.completedLaps,
    elapsedTimeMs: e.elapsedTimeMs,
    lastLapTimeMs: e.lastLapTimeMs,
    bestLapTimeMs: e.bestLapTimeMs,
    position: e.position,
    gapToLeaderMs: e.gapToLeaderMs,
    intervalToAheadMs: e.intervalToAheadMs,
    fuelMassKg: own ? e.fuelMassKg : null,
    ...(e.incident ? { incident: { status: e.incident.status, retiredLap: e.incident.retiredLap, retirementOrder: e.incident.retirementOrder } } : {}),
    ...(e.stint ? { stint: { number: e.stint.number, startedAtLap: e.stint.startedAtLap, tyre: publicTyre(e.stint.tyre, own) } } : {}),
    ...(e.pit
      ? {
          pit: {
            ...(own && s.simulationVersion === 8 ? { committed: Boolean(s.progression!.cars[e.entrantId].compound) } : {}),
            pendingCompound: own ? e.pit.pendingCompound : null,
            commandRevision: own ? e.pit.commandRevision : null,
            stints: e.pit.stints.map((x) => ({ number: x.number, startLap: x.startLap, endLap: x.endLap, startingTyre: publicTyre(x.startingTyre, own), endingTyre: x.endingTyre ? publicTyre(x.endingTyre, own) : null })),
            stops: e.pit.stops.map((x) => ({ number: x.number, lap: x.lap, oldCompound: x.oldCompound, newCompound: x.newCompound, pitLaneLossMs: x.pitLaneLossMs, stationaryTimeMs: x.stationaryTimeMs, totalLossMs: x.totalLossMs })),
          },
        }
      : {}),
    ...(e.track ? { track: { progressMicrolaps: e.track.progressMicrolaps,...(hasAssistance(s.input.progression)?{routeHistory:s.progression!.cars[e.entrantId].observations!.map(o=>({atMs:o.atMs,total:o.total,route:o.route}))}:{}), drsEligible: e.track.drsEligible, overtakesCompleted: e.track.overtakesCompleted, ...(s.simulationVersion === 8 ? { local: { progressMicrolaps: localProgress(e.track.progressMicrolaps), segmentId: segmentAt(s.input.progression!,e.track.progressMicrolaps,s.progression!.cars[e.entrantId].route).id, route: s.progression!.cars[e.entrantId].route, lapsDown: Math.max(0,Math.floor(((s.entrants.find(x=>x.incident?.status!=='RETIRED')?.track?.progressMicrolaps??0)-e.track.progressMicrolaps)/LAP_UNITS)) } } : {}) } } : {}),
    ...(own && e.commands ? { commands: { paceMode: e.commands.paceMode, fuelMode: e.commands.fuelMode, ersMode: e.commands.ersMode, ersCharge: e.commands.ersCharge, commandRevision: e.commands.commandRevision } } : {}),
    ...(own && s.input.progression?.regulation?.dryTyres ? { regulation: regulationStatus(s, e.entrantId) } : {}),
    ...(own && hasAssistance(s.input.progression)?{assistance:{energy:s.progression!.cars[e.entrantId].assistance!.energy,capacity:s.input.progression.assistance!.capacity,policy:s.progression!.cars[e.entrantId].assistance!.policy,aero:s.progression!.cars[e.entrantId].assistance!.aero,overtake:s.progression!.cars[e.entrantId].assistance!.overtake,...assistanceReasons(s,e)}}:{}),
    ...(own ? { insight: insight(s, e) } : {}),
  };
}
/** Own car's dry-tyre obligation from actual tyre use (never a plan, request or forecast). */
function regulationStatus(s: RaceSimulationState, id: string) {
  const rule = s.input.progression!.regulation!.dryTyres!, a = assessTyreRule(s, id);
  return { status: a.status, usedDry: a.usedDry, wetUsed: a.wetUsed, required: a.required, deadlineLap: a.deadlineLap, lastRequestLap: a.lastRequestLap,
    satisfyingCompounds: a.status === "OUTSTANDING" || a.status === "URGENT" ? WEATHER_TYRE_COMPOUNDS.filter((c) => s.input.tyres?.profiles[c] && compoundSatisfies(a, c, rule)) : [] };
}
/** Authoritative state → public view for one player team. */
export function projectRaceState(s: RaceSimulationState, playerTeamId: string): RacePublicState {
  const own = new Set(s.input.entrants.filter((e) => e.teamId === playerTeamId).map((e) => e.entrantId));
  const tyres = s.input.tyres;
  const thresholds: Partial<Record<TyreCompound, PublicTyreThresholds>> = {};
  if (tyres)
    for (const compound of WEATHER_TYRE_COMPOUNDS) {
      const p = tyres.profiles[compound];
      if (p) thresholds[compound] = { degradationStartWear: p.degradationStartWear, cliffWear: p.cliffWear, idealTemperatureMinMilliC: p.idealTemperatureMinMilliC, idealTemperatureMaxMilliC: p.idealTemperatureMaxMilliC };
    }
  const control = s.incidents;
  return {
    visibility: "PUBLIC",
    simulationVersion: s.simulationVersion,
    lap: s.lap,
    status: s.status,
    input: {
      totalLaps: s.input.totalLaps,
      ...(s.input.progression?{modelRevision:s.input.progression.version}:{}),
      ...(s.input.progression?.regulation ? { regulation: { session: s.input.progression.regulation.session, dryTyres: s.input.progression.regulation.dryTyres
        ? { article: s.input.progression.regulation.dryTyres.article, minimumDistinctDrySpecifications: s.input.progression.regulation.dryTyres.minimumDistinctDrySpecifications, wetTyreExemption: s.input.progression.regulation.dryTyres.wetTyreExemption, mandatoryDrySpecifications: s.input.progression.regulation.dryTyres.mandatoryDrySpecifications, consequence: s.input.progression.regulation.dryTyres.consequence } : null } } : {}),
      ...(hasAssistance(s.input.progression)?{pitAnchors:{entry:s.input.progression.pit.entry,service:s.input.progression.pit.service,exit:s.input.progression.pit.exit}}:{}),
      circuit: { baseLapTimeMs: s.input.circuit.baseLapTimeMs },
      entrants: s.input.entrants.map((e) => ({ entrantId: e.entrantId, driverId: e.driverId, teamId: e.teamId, gridPosition: e.gridPosition })),
      commands: s.input.commands ? { capacity: s.input.commands.capacity } : null,
      tyres: tyres ? { profiles: thresholds } : null,
      pits: Boolean(s.input.pits),
      interaction: Boolean(s.input.interaction),
    },
    ...(s.weather
      ? { weather: { rainfallIntensity: s.weather.rainfallIntensity, airTemperatureMilliC: s.weather.airTemperatureMilliC, trackTemperatureMilliC: s.weather.trackTemperatureMilliC, trackWater: s.weather.trackWater, drsState: s.weather.drsState } }
      : {}),
    // The approximate forecast windows still ahead — the same public forecast the AI weather policy reads; the
    // truth timeline and its generator never leave the server.
    forecast: s.input.weather && s.status === "RUNNING" ? forecastAt(s.input.weather, s.lap + 1) : s.input.weather ? [] : null,
    // Current-condition tyre suitability (one shared source of truth for the badge and crossover alerts).
    ...(s.weather && s.input.weather && s.input.tyres ? { tyreFit: assessTyreFamilies(s.weather, s.input.tyres, s.input.weather) } : {}),
    ...(control
      ? {
          incidents: {
            mode: control.mode,
            drsDelay: control.drsDelay,
            endingThisLap: control.mode !== "GREEN" && control.remainingLaps === 1,
            // A rival's fuel retirement is public as "stopped on track" — its fuel state stays private.
            events: control.events.map((e) => ({ sequence: e.sequence, type: e.type, lap: e.lap, entrantIds: [...e.entrantIds], kind: e.kind === "FUEL_STARVATION" && !e.entrantIds.some((id) => own.has(id)) ? "STOPPED" : e.kind, severity: e.severity, timeLossMs: e.timeLossMs, ...(e.cause ? { cause: e.cause } : {}) })),
          },
        }
      : {}),
    entrants: s.entrants.map((e) => entrant(s, e, own.has(e.entrantId))),
    ...(s.progression?.classification ? { classification: s.progression.classification.entries.map((x) => ({ entrantId: x.entrantId, roadPosition: x.roadPosition, position: x.position, status: x.status, reason: x.reason })) } : {}),
  };
}
function preparation(data: CareerRaceData): RacePreparationView {
  const laps = scheduledLaps(data), kind = data.kind ?? "RACE";
  const weather = careerRaceWeather(data.progress.career.id, data.eventId, data.circuit.sourceCircuitId ?? "custom", laps, kind, data.circuit.climateProfile);
  const playerTeamId = data.progress.career.playerTeamId;
  return {
    laps,
    conditions: { ...weather.initial },
    // Window 0 describes the grid itself; the rest is the approximate public forecast.
    forecast: forecastAt(weather, 1).slice(1),
    defaultCompound: aiStartingCompound(weather.initial),
    compounds: [...WEATHER_TYRE_COMPOUNDS],
    mine: data.roster.filter((r) => r.teamId === playerTeamId).map((r) => ({ driverId: r.driverId, driverName: r.driverName })),
    rivals: data.roster.filter((r) => r.teamId !== playerTeamId).map((r) => ({ driverId: r.driverId, driverName: r.driverName, teamName: r.teamName })),
    // v8E: current grid conditions only, assessed with the tyres a new (revision-5) Race freezes.
    gridTyreFit: assessTyreFamilies(weather.initial, v8eWeatherTyreConfiguration(), weather),
  };
}
/** Page / server-action payload: everything a Race or Sprint screen renders, and nothing else. */
export function projectRaceView(data: CareerRaceData): RaceViewData {
  return {
    visibility: "PUBLIC",
    progress: data.progress,
    eventId: data.eventId,
    kind: data.kind ?? "RACE",
    sessionId: data.sessionId,
    labels: data.labels.map((l) => ({ entrantId: l.entrantId, driverName: l.driverName, teamName: l.teamName, abbreviation: l.abbreviation, teamColor: l.teamColor, carNumber: l.carNumber })),
    circuit: { sourceCircuitId: data.circuit.sourceCircuitId ?? null, lengthMeters: data.circuit.lengthMeters },
    state: data.state ? projectRaceState(data.state, data.progress.career.playerTeamId) : null,
    preparation: data.state ? null : preparation(data),
  };
}

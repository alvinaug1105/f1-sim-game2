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
import { projectedFuelGrams } from "../../simulation/race/commands/model";
import { forecastAt } from "../../simulation/race/weather/model";
import { estimatePitWindow } from "./strategy-estimate";
import { aiStartingCompound, careerRaceWeather } from "./weather-scenarios";
import { scheduledLaps } from "./development-profiles";
import type {
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
    ers: ersOutlook(s, e),
    pitEstimate: est ? { lapsToCliff: est.lapsToCliff, minimumLossMs: est.minimumLossMs, maximumLossMs: est.maximumLossMs } : null,
  };
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
            pendingCompound: own ? e.pit.pendingCompound : null,
            commandRevision: own ? e.pit.commandRevision : null,
            stints: e.pit.stints.map((x) => ({ number: x.number, startLap: x.startLap, endLap: x.endLap, startingTyre: publicTyre(x.startingTyre, own), endingTyre: x.endingTyre ? publicTyre(x.endingTyre, own) : null })),
            stops: e.pit.stops.map((x) => ({ number: x.number, lap: x.lap, oldCompound: x.oldCompound, newCompound: x.newCompound, pitLaneLossMs: x.pitLaneLossMs, stationaryTimeMs: x.stationaryTimeMs, totalLossMs: x.totalLossMs })),
          },
        }
      : {}),
    ...(e.track ? { track: { progressMicrolaps: e.track.progressMicrolaps, drsEligible: e.track.drsEligible, overtakesCompleted: e.track.overtakesCompleted } } : {}),
    ...(own && e.commands ? { commands: { paceMode: e.commands.paceMode, fuelMode: e.commands.fuelMode, ersMode: e.commands.ersMode, ersCharge: e.commands.ersCharge, commandRevision: e.commands.commandRevision } } : {}),
    ...(own ? { insight: insight(s, e) } : {}),
  };
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
    ...(control
      ? {
          incidents: {
            mode: control.mode,
            drsDelay: control.drsDelay,
            endingThisLap: control.mode !== "GREEN" && control.remainingLaps === 1,
            events: control.events.map((e) => ({ sequence: e.sequence, type: e.type, lap: e.lap, entrantIds: [...e.entrantIds], kind: e.kind, severity: e.severity, timeLossMs: e.timeLossMs })),
          },
        }
      : {}),
    entrants: s.entrants.map((e) => entrant(s, e, own.has(e.entrantId))),
  };
}
function preparation(data: CareerRaceData): RacePreparationView {
  const laps = scheduledLaps(data), kind = data.kind ?? "RACE";
  const weather = careerRaceWeather(data.progress.career.id, data.eventId, data.circuit.sourceCircuitId ?? "custom", laps, kind);
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

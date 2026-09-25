import { weatherPitChoice } from "../weather/policy";
import type {
  RaceSimulationState,
  RaceSimulationInput,
  RaceEntrantState,
} from "../types";
import type { RandomSource } from "../../core/random";
import {
  isTyreCompound,
  type TyreCompound,
  type TyreState,
} from "../tyres/model";
import type { PitState } from "./types";
import { developmentPitChoice } from "./strategy-policy";
import { assessAiStop, publicWeather, strategyPreference } from "./ai-strategy";
import { orderedClassification } from "../traffic/model";
export function initialPitState(tyre: TyreState): PitState {
  return {
    pendingCompound: null,
    commandRevision: 0,
    stops: [],
    stints: [
      {
        number: 1,
        startLap: 0,
        endLap: null,
        startingTyre: structuredClone(tyre),
        endingTyre: null,
      },
    ],
  };
}
export function requestPitStop(
  state: RaceSimulationState,
  entrantId: string,
  compound: TyreCompound | null,
): RaceSimulationState {
  if (
    ![4, 5, 6, 7].includes(state.simulationVersion) ||
    !state.input.pits ||
    state.status !== "RUNNING" ||
    state.lap >= state.input.totalLaps - 1
  )
    throw new RangeError("Pit request unavailable");
  if (compound !== null && !isTyreCompound(compound))
    throw new RangeError("Invalid pit compound");
  if (compound && !state.input.tyres?.profiles[compound]) throw new RangeError("Compound unavailable for this race");
  const e = state.entrants.find((e) => e.entrantId === entrantId);
  if (!e?.pit || e.incident?.status === "RETIRED") throw new RangeError("Unknown pit entrant");
  if (e.pit.pendingCompound === compound) return state;
  return {
    ...state,
    entrants: state.entrants.map((e) =>
      e.entrantId !== entrantId
        ? e
        : {
            ...e,
            pit: {
              ...e.pit!,
              pendingCompound: compound,
              commandRevision: e.pit!.commandRevision + 1,
            },
          },
    ),
  };
}
/** Decisions happen before this lap. Commitment is atomic with the ensuing lap advance. */
export function committedStops(
  state: RaceSimulationState,
): ReadonlyMap<string, TyreCompound> {
  const result = new Map<string, TyreCompound>();
  for (const source of [...state.input.entrants].sort(
    (a, b) => a.gridPosition - b.gridPosition,
  )) {
    const e = state.entrants.find((e) => e.entrantId === source.entrantId)!;
    if (!e.pit) throw new RangeError("Missing v4 pit state");
    if (state.lap >= state.input.totalLaps - 1) {
      if (e.pit.pendingCompound)
        throw new RangeError("Pit request on final lap");
      continue;
    }
    const compound =
      e.pit.pendingCompound ??
      (source.strategyController === "DEVELOPMENT_AI"
        ? state.input.weather ? state.input.pits!.strategy ? chooseStrategicPit(state, e) : chooseWeatherPit(state, e) : developmentPitChoice(e, state.input, state.lap)
        : null);
    if (compound) result.set(e.entrantId, compound);
  }
  return result;
}
/** Stops finish within one checkpoint; no partially saved PITTING state.
 * One service draw per stop, in original grid order, AFTER on-track interaction draws.
 */
export function completePitLap(
  previous: RaceSimulationState,
  potential: readonly RaceEntrantState[],
  onTrack: readonly RaceEntrantState[],
  committed: ReadonlyMap<string, TyreCompound>,
  random: RandomSource,
): RaceEntrantState[] {
  const input = previous.input,
    c = input.pits!,
    lap = previous.lap + 1;
  const old = new Map(previous.entrants.map((e) => [e.entrantId, e]));
  const raw = new Map(potential.map((e) => [e.entrantId, e]));
  const stopped: RaceEntrantState[] = [];
  for (const source of [...input.entrants].sort(
    (a, b) => a.gridPosition - b.gridPosition,
  )) {
    const compound = committed.get(source.entrantId);
    if (!compound) continue;
    const e = raw.get(source.entrantId)!,
      before = old.get(e.entrantId)!;
    const draw = random.next();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1)
      throw new RangeError("Invalid pit RNG");
    const stationaryTimeMs =
      c.stationaryBaseMs + Math.round((2 * draw - 1) * c.stationaryVariationMs);
    const totalLossMs = c.pitLaneLossMs + stationaryTimeMs;
    const newTyre: TyreState = {
      compound,
      ageLaps: 0,
      wearPermille: 0,
      temperatureMilliC: c.newTyreTemperatureMilliC,
    };
    const nextNumber = e.stint!.number + 1;
    stopped.push({
      ...e,
      elapsedTimeMs: e.elapsedTimeMs + totalLossMs,
      stint: { number: nextNumber, startedAtLap: lap, tyre: newTyre },
      track: {
        ...e.track!,
        drsEligible: false,
        dirtyAirMs: 0,
        drsBenefitMs: 0,
        trafficLossMs: 0,
        attempted: false,
        passed: false,
        potentialLapTimeMs: e.lastLapTimeMs!,
      },
      pit: {
        pendingCompound: null,
        commandRevision: before.pit!.commandRevision + 1,
        stops: [
          ...before.pit!.stops,
          {
            number: before.pit!.stops.length + 1,
            lap,
            oldCompound: e.stint!.tyre.compound,
            newCompound: compound,
            pitLaneLossMs: c.pitLaneLossMs,
            stationaryTimeMs,
            totalLossMs,
          },
        ],
        stints: [
          ...before.pit!.stints.map((s) =>
            s.endLap === null
              ? {
                  ...s,
                  endLap: lap,
                  endingTyre: structuredClone(e.stint!.tyre),
                }
              : s,
          ),
          {
            number: nextNumber,
            startLap: lap,
            endLap: null,
            startingTyre: structuredClone(newTyre),
            endingTyre: null,
          },
        ],
      },
    });
  }
  // Non-pitting order already has constrained crossing times. Sorting the merge cannot
  // bypass on-track overtaking; only cars on the separate pit route are reinserted.
  const grid = new Map(
    input.entrants.map((e) => [e.entrantId, e.gridPosition]),
  );
  const merged = [...onTrack, ...stopped].sort(
    (a, b) =>
      a.elapsedTimeMs - b.elapsedTimeMs ||
      grid.get(a.entrantId)! - grid.get(b.entrantId)!,
  );
  const resolved: RaceEntrantState[] = [];
  for (const e of merged) {
    const before = old.get(e.entrantId)!;
    const elapsedTimeMs = Math.max(
      e.elapsedTimeMs,
      resolved.length
        ? resolved[resolved.length - 1].elapsedTimeMs +
            input.interaction!.minimumGapMs
        : 0,
    );
    const actual = elapsedTimeMs - before.elapsedTimeMs;
    const pit =
      lap === input.totalLaps
        ? {
            ...e.pit!,
            stints: e.pit!.stints.map((s) =>
              s.endLap === null
                ? {
                    ...s,
                    endLap: lap,
                    endingTyre: structuredClone(e.stint!.tyre),
                  }
                : s,
            ),
          }
        : e.pit;
    resolved.push({
      ...e,
      pit,
      elapsedTimeMs,
      lastLapTimeMs: actual,
      bestLapTimeMs: Math.min(before.bestLapTimeMs ?? actual, actual),
      track: {
        ...e.track!,
        trafficLossMs:
          e.track!.trafficLossMs + (elapsedTimeMs - e.elapsedTimeMs),
      },
    });
  }
  return orderedClassification(resolved, input);
}
/** Snapshot completeness is checked at create/load; helpers never read global tuning. */
export function validatePitControllers(input: RaceSimulationInput) {
  for (const e of input.entrants)
    if (!["PLAYER", "DEVELOPMENT_AI"].includes(e.strategyController ?? ""))
      throw new RangeError("Missing strategy controller");
}

function chooseWeatherPit(state: RaceSimulationState, entrant: RaceEntrantState) {
 const {weather, ...input}=state.input;
 const {timeline: _timeline, initial: _initial, ...publicWeather}=weather!;
 void _timeline; void _initial;
 return weatherPitChoice(entrant,input,state.weather!,publicWeather,state.lap);
}

/** Green-flag pit-lane loss. Under SC/VSC the v7 engine hands the policy the reduced loss; this undoes that reduction. */
export function greenPitLaneLoss(state: RaceSimulationState) {
 const control = state.incidents, c = state.input.incidents;
 if (!control || !c || control.mode === "GREEN") return state.input.pits!.pitLaneLossMs;
 return state.input.pits!.pitLaneLossMs + Math.round(c.pitTrackSectionMs * (c[control.mode].lapMultiplierPermille - 1000) / 1000);
}
function chooseStrategicPit(state: RaceSimulationState, entrant: RaceEntrantState) {
 return assessAiStop({ state, entrant, weather: state.weather!, publicWeather: publicWeather(state.input.weather!), mode: state.incidents?.mode ?? "GREEN", greenPitLaneLossMs: greenPitLaneLoss(state) },
  state.input.pits!.strategy!, strategyPreference(state.input.seed, state.input.entrants.find(e => e.entrantId === entrant.entrantId)!.gridPosition)).compound;
}

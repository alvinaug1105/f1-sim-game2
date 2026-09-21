export interface SimulationState {
  readonly tick: number;
}
/** Pure demonstration clock; no racing calculations or wall-clock dependency. */
export function advanceSimulation(state: SimulationState): SimulationState {
  if (
    !Number.isSafeInteger(state.tick) ||
    state.tick < 0 ||
    state.tick === Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError(
      "Simulation tick must be a non-negative safe integer that can be incremented.",
    );
  }
  return { ...state, tick: state.tick + 1 };
}

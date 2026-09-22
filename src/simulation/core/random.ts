/** Produces a value in [0, 1). Not intended for cryptographic use. */
export interface RandomSource {
  next(): number;
}
/** Version 1: seeded 32-bit LCG. Each instance owns its sequence. */
export interface StatefulRandomSource extends RandomSource {
  getState(): number;
}
export function createSeededRandom(seed: number): StatefulRandomSource {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError("Seed must be an unsigned 32-bit integer.");
  let state = seed >>> 0;
  return {
    getState: () => state,
    next() {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    },
  };
}

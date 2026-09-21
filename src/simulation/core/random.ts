/** Produces a value in [0, 1). Not intended for cryptographic use. */
export interface RandomSource {
  next(): number;
}
/** Version 1: seeded 32-bit LCG. Each instance owns its sequence. */
export function createSeededRandom(seed: number): RandomSource {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError("Seed must be an unsigned 32-bit integer.");
  let state = seed >>> 0;
  return {
    next() {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    },
  };
}

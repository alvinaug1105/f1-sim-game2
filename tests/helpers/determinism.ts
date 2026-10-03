import { createSeededRandom } from "../../src/simulation/core/random";
import type { RaceSimulationState } from "../../src/simulation/race/types";
/**
 * Semantically identical copies of an authoritative Race state for determinism checks: every entrant / driver / team ID
 * remapped to a fresh UUID-shaped value (deterministic, no Math.random), and every object rebuilt with its properties
 * inserted in a different order. Arrays keep their order — they are domain-ordered data.
 */
export type KeyOrder = "JSONB" | "REVERSE" | "HASHED" | "ORIGINAL";
/** PostgreSQL JSONB stores object keys shorter-first, then bytewise. */
export const jsonbKeyOrder = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
function comparator(order: KeyOrder, salt: number) {
    if (order === "JSONB") return jsonbKeyOrder;
    if (order === "REVERSE") return (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
    const h = (x: string) => [...x].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0, (2166136261 ^ salt) >>> 0);
    return (a: string, b: string) => h(a) - h(b) || (a < b ? -1 : 1);
}
export function reorderKeys(value: unknown, order: KeyOrder, salt = 0): unknown {
    if (order === "ORIGINAL") return structuredClone(value);
    const cmp = comparator(order, salt);
    const walk = (v: unknown): unknown => Array.isArray(v) ? v.map(walk)
        : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort(cmp).map(k => [k, walk((v as Record<string, unknown>)[k])])) : v;
    return walk(value);
}
function uuid(random: ReturnType<typeof createSeededRandom>) {
    const hex = Array.from({ length: 32 }, () => Math.floor(random.next() * 16).toString(16)).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
/** Remap every entrant, driver and team ID (deterministically from `seed`); `restore` maps a later state back. */
export function remapIds(state: RaceSimulationState, seed: number) {
    const random = createSeededRandom(seed >>> 0), map = new Map<string, string>();
    for (const e of state.input.entrants) for (const id of [e.entrantId, e.driverId, e.teamId]) if (!map.has(id)) map.set(id, uuid(random));
    const swap = (text: string, pairs: Iterable<[string, string]>) => { for (const [from, to] of pairs) text = text.split(from).join(to); return text; };
    const back = [...map].map(([a, b]) => [b, a] as [string, string]);
    return {
        state: JSON.parse(swap(JSON.stringify(state), map)) as RaceSimulationState,
        restore: (s: RaceSimulationState) => JSON.parse(swap(JSON.stringify(s), back)) as RaceSimulationState,
    };
}
/** Canonical serialisation (sorted keys) for exact comparison, independent of property insertion order. */
export function canonical(value: unknown) { return JSON.stringify(reorderKeys(value, "REVERSE")); }

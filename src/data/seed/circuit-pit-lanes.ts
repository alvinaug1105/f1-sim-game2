import { buildPitLane, type PitKnot, type PitLaneShape, type PitRouteGeometry } from '../../game/domain/pit-geometry';
import { circuitLayouts } from './circuit-layouts';
/**
 * Authored pit lanes for the 24 production circuits (Race v8B).
 *
 * Primary reference for every circuit: the FIA Formula 1 "Competition/Event Notes – Circuit Map, Pit Lane Drawing …"
 * document of the latest event at the venue (2026, or 2025 where the 2026 event had not yet run; layouts confirmed
 * unchanged — see docs/circuit-geometry-sources.md). The references were used only to read factual topology (where the
 * lane leaves and rejoins, its side, the garage run, the exit route). Nothing was traced or copied: each lane is our own
 * knot description relative to our own racing line, drawn wider than true scale for legibility.
 *
 * Progress values are Race progress in microlaps (after any lap-line shift; see circuit-race-metadata.ts):
 * - entry / laneStart / service / exit are AUTHORITATIVE (frozen into each new Race; the engine requires
 *   entry < laneStart < service < 1,000,000 and exit < entry, i.e. the lane crosses the lap line);
 * - garage and route are PRESENTATION only (never read by the simulation, never used for pit-loss timing).
 */
export interface CircuitPitLane extends PitLaneShape {
    readonly laneStart: number;
    readonly service: number;
    readonly reference: { readonly document: string; readonly year: number };
}
type Knot = readonly [progress: number, offset: number, chord?: 'chord'];
const knots = (list: readonly Knot[]): PitKnot[] => list.map(([progress, offset, chord]) => ({ progress, offset, ...(chord ? { chord: true as const } : {}) }));
const FIA = (event: string, year: number) => ({ document: `FIA ${year} ${event} – Circuit Map and Pit Lane Drawing`, year });
const lane = (l: Omit<CircuitPitLane, 'route'> & { route: readonly Knot[] }): CircuitPitLane => ({ ...l, route: knots(l.route) });
const C = 'chord' as const;

export const circuitPitLanes: Readonly<Record<string, CircuitPitLane>> = {
    // Albert Park: leaves between T13 and T14 and cuts inside T14; right of the main straight; garages around the control line; rejoins before T1.
    '00000000-0000-4000-8000-000000000300': lane({ reference: FIA('Australian Grand Prix', 2026), side: 'RIGHT', entry: 885000, laneStart: 905000, service: 975000, exit: 30000, garage: 975000,
        route: [[885000, 0, C], [905000, 1], [1015000, 1], [1030000, 0]] }),
    // Suzuka: leaves after the T16–T18 chicane; right (outside) of the main straight; garages after the control line; rejoins before T1.
    '00000000-0000-4000-8000-000000000301': lane({ reference: FIA('Japanese Grand Prix', 2026), side: 'RIGHT', entry: 915000, laneStart: 935000, service: 990000, exit: 60000, garage: 1008000,
        route: [[915000, 0], [935000, 1], [1045000, 1], [1060000, 0]] }),
    // Shanghai: leaves just before T16 and runs round its outside; right of the main straight; rejoins before T1.
    '00000000-0000-4000-8000-000000000302': lane({ reference: FIA('Chinese Grand Prix', 2026), side: 'RIGHT', entry: 872000, laneStart: 890000, service: 955000, exit: 18000, garage: 955000,
        route: [[872000, 0], [884000, 1.5], [900000, 1.1], [1004000, 1], [1018000, 0]] }),
    // Bahrain (Sakhir; the 2026 "Bahrain" document is the Sepang event, so 2025 is used): leaves after T15; right/inside of the main straight; garages after the control line; merge lane rejoins before T1.
    '00000000-0000-4000-8000-000000000303': lane({ reference: FIA('Bahrain Grand Prix (Sakhir)', 2025), side: 'RIGHT', entry: 918000, laneStart: 935000, service: 990000, exit: 60000, garage: 1008000,
        route: [[918000, 0], [935000, 1], [1045000, 1], [1060000, 0]] }),
    // Monaco: leaves at Rascasse, inside; along the harbour side of Boulevard Albert Ier; rejoins at Sainte Dévote. Narrow offset: the Tabac–Piscine section runs alongside.
    '00000000-0000-4000-8000-000000000304': lane({ reference: FIA('Monaco Grand Prix', 2026), side: 'RIGHT', entry: 906000, laneStart: 925000, service: 985000, exit: 66000, garage: 1000000,
        route: [[906000, 0, C], [930000, .9], [1048000, .9, C], [1066000, 0]] }),
    // Silverstone: leaves before Vale and runs directly to the Hamilton Straight pits (right/inside); rejoins at Farm (T2) after Abbey.
    '00000000-0000-4000-8000-000000000305': lane({ reference: FIA('British Grand Prix', 2026), side: 'RIGHT', entry: 919000, laneStart: 940000, service: 990000, exit: 89000, garage: 1015000,
        route: [[919000, 0, C], [985000, 1], [1068000, 1, C], [1089000, 0]] }),
    // Spa-Francorchamps: leaves before the Bus Stop; right of the straight; exit road runs inside La Source and rejoins on the descent to Eau Rouge.
    '00000000-0000-4000-8000-000000000306': lane({ reference: FIA('Belgian Grand Prix', 2026), side: 'RIGHT', entry: 944000, laneStart: 960000, service: 990000, exit: 57000, garage: 1010000,
        route: [[944000, 0], [958000, 1], [1022000, 1, C], [1057000, 0]] }),
    // Marina Bay: leaves between T17 and T18 and runs inside T18/T19; left of the main straight; garages after the pole position; rejoins at T1.
    '00000000-0000-4000-8000-000000000307': lane({ reference: FIA('Singapore Grand Prix', 2025), side: 'LEFT', entry: 904000, laneStart: 930000, service: 990000, exit: 72000, garage: 1015000,
        route: [[904000, 0, C], [935000, 1], [1050000, 1, C], [1072000, 0]] }),
    // Jeddah: leaves just after T27, inside; left of the main straight; garages after the control line; rejoins before the T1 chicane.
    '00000000-0000-4000-8000-000000000308': lane({ reference: FIA('Saudi Arabian Grand Prix', 2025), side: 'LEFT', entry: 912000, laneStart: 930000, service: 990000, exit: 50000, garage: 1020000,
        route: [[912000, 0, C], [930000, 1], [1035000, 1], [1050000, 0]] }),
    // Miami: leaves after T18 and cuts inside T19; right of the main straight; the lane ends before T1 turns in and the exit road runs straight through the inside of T1, rejoining after T2.
    '00000000-0000-4000-8000-000000000309': lane({ reference: FIA('Miami Grand Prix', 2026), side: 'RIGHT', entry: 915000, laneStart: 945000, service: 990000, exit: 68000, garage: 990000,
        route: [[915000, 0, C], [945000, 1], [1030000, 1, C], [1068000, 0]] }),
    // Montréal: leaves before the final chicane (T13/T14); left of the straight; exit lane continues past T1 and rejoins after the T2 hairpin.
    '00000000-0000-4000-8000-000000000310': lane({ reference: FIA('Canadian Grand Prix', 2026), side: 'LEFT', entry: 938000, laneStart: 955000, service: 985000, exit: 136000, garage: 1000000,
        route: [[938000, 0], [955000, 1], [1095000, 1, C], [1136000, 0]] }),
    // Barcelona-Catalunya: leaves in the final corner (T14), inside; right of the main straight; garages after the control line; long merge before T1.
    '00000000-0000-4000-8000-000000000311': lane({ reference: FIA('Barcelona-Catalunya Grand Prix', 2026), side: 'RIGHT', entry: 912000, laneStart: 935000, service: 990000, exit: 75000, garage: 1020000,
        route: [[912000, 0, C], [935000, 1], [1060000, 1], [1075000, 0]] }),
    // Red Bull Ring: leaves on the T9–T10 descent, inside T10; right of the main straight; garages after the control line; rejoins after T1.
    '00000000-0000-4000-8000-000000000312': lane({ reference: FIA('Austrian Grand Prix', 2026), side: 'RIGHT', entry: 880000, laneStart: 905000, service: 987000, exit: 80000, garage: 987000,
        route: [[880000, 0, C], [905000, 1], [1055000, 1, C], [1080000, 0]] }),
    // Hungaroring: leaves inside the T14 hairpin; right of the main straight; garages after the control line; rejoins before T1.
    '00000000-0000-4000-8000-000000000313': lane({ reference: FIA('Hungarian Grand Prix', 2026), side: 'RIGHT', entry: 862000, laneStart: 895000, service: 980000, exit: 45000, garage: 980000,
        route: [[862000, 0, C], [895000, 1], [1030000, 1], [1045000, 0]] }),
    // Zandvoort: leaves part-way down the main straight; right side; garages after the control line; exit road runs inside Tarzan (T1) and rejoins on its exit.
    '00000000-0000-4000-8000-000000000314': lane({ reference: FIA('Dutch Grand Prix', 2026), side: 'RIGHT', entry: 990000, laneStart: 994000, service: 997000, exit: 120000, garage: 1048000,
        route: [[990000, 0], [1004000, 1], [1088000, 1, C], [1120000, 0]] }),
    // Monza: leaves after Parabolica; right of the main straight; rejoins well before the Rettifilo chicane.
    '00000000-0000-4000-8000-000000000315': lane({ reference: FIA('Italian Grand Prix', 2026), side: 'RIGHT', entry: 905000, laneStart: 920000, service: 985000, exit: 35000, garage: 985000,
        route: [[905000, 0], [920000, 1], [1020000, 1], [1035000, 0]] }),
    // Madring: leaves before T22, inside; right of the main straight (two garage blocks); exit runs straight on past T1/T2 and rejoins at T3.
    '00000000-0000-4000-8000-000000000316': lane({ reference: FIA('Spanish Grand Prix (Madrid)', 2026), side: 'RIGHT', entry: 965000, laneStart: 978000, service: 990000, exit: 85000, garage: 1019000,
        route: [[965000, 0, C], [980000, 1], [1040000, 1, C], [1085000, 0]] }),
    // Baku: leaves part-way down the main straight; left side; garages between the control line and T1; rejoins on the inside after T1.
    '00000000-0000-4000-8000-000000000317': lane({ reference: FIA('Azerbaijan Grand Prix', 2026), side: 'LEFT', entry: 955000, laneStart: 965000, service: 990000, exit: 22000, garage: 992000,
        route: [[955000, 0], [967000, 1], [1008000, 1, C], [1022000, 0]] }),
    // Circuit of the Americas: leaves before T20 and cuts inside it; left of the main straight; garages after the control line; rejoins before T1.
    '00000000-0000-4000-8000-000000000318': lane({ reference: FIA('United States Grand Prix', 2025), side: 'LEFT', entry: 915000, laneStart: 935000, service: 990000, exit: 55000, garage: 994000,
        route: [[915000, 0, C], [935000, 1], [1042000, 1], [1055000, 0]] }),
    // Mexico City: leaves in the final stadium curve, inside; right of the main straight; long merge lane down the straight.
    '00000000-0000-4000-8000-000000000319': lane({ reference: FIA('Mexico City Grand Prix', 2025), side: 'RIGHT', entry: 928000, laneStart: 950000, service: 990000, exit: 115000, garage: 990000,
        route: [[928000, 0, C], [950000, 1], [1085000, 1], [1115000, 0]] }),
    // Interlagos: leaves between T14 and T15 (Junção); left of the main straight; exit road runs through the infield inside the Senna S (T1–T3) and rejoins on the Reta Oposta after T3.
    '00000000-0000-4000-8000-000000000320': lane({ reference: FIA('São Paulo Grand Prix', 2025), side: 'LEFT', entry: 917000, laneStart: 935000, service: 993000, exit: 200000, garage: 1010000,
        route: [[917000, 0], [935000, 1], [1065000, 1], [1100000, 1.4], [1175000, 1.4], [1200000, 0]] }),
    // Las Vegas: leaves on the approach to T17 and cuts inside it; left of the main straight; rejoins inside T1/T2.
    '00000000-0000-4000-8000-000000000321': lane({ reference: FIA('Las Vegas Grand Prix', 2025), side: 'LEFT', entry: 947000, laneStart: 958000, service: 990000, exit: 30000, garage: 1000000,
        route: [[947000, 0, C], [958000, 1], [1012000, 1, C], [1030000, 0]] }),
    // Lusail: leaves after T16; right of the main straight; merges before the speed trap ahead of T1.
    '00000000-0000-4000-8000-000000000322': lane({ reference: FIA('Qatar Grand Prix', 2025), side: 'RIGHT', entry: 888000, laneStart: 905000, service: 970000, exit: 57000, garage: 970000,
        route: [[888000, 0], [905000, 1], [1042000, 1], [1057000, 0]] }),
    // Yas Marina: leaves at T16, inside; right of the main straight; exit runs round the outside of T1 and rejoins between T2 and T3.
    '00000000-0000-4000-8000-000000000323': lane({ reference: FIA('Abu Dhabi Grand Prix', 2025), side: 'RIGHT', entry: 935000, laneStart: 950000, service: 990000, exit: 105000, garage: 992000,
        route: [[935000, 0, C], [950000, 1], [1040000, 1.2], [1088000, 1.2], [1105000, 0]] }),
};
export const pitLaneForCircuit = (sourceCircuitId?: string | null): CircuitPitLane | null => (sourceCircuitId && circuitPitLanes[sourceCircuitId]) || null;
const drawn = new Map<string, PitRouteGeometry>();
/** The drawn lane of a production circuit in its layout frame (presentation only; built once per circuit). */
export function drawnPitLane(sourceCircuitId?: string | null): PitRouteGeometry | null {
    const shape = pitLaneForCircuit(sourceCircuitId);
    if (!shape || !sourceCircuitId) return null;
    let lane = drawn.get(sourceCircuitId);
    if (!lane) { lane = buildPitLane(circuitLayouts[sourceCircuitId], shape); drawn.set(sourceCircuitId, lane); }
    return lane;
}

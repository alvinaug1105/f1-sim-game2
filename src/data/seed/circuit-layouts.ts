import type { CircuitMapLayout } from "../../game/domain/circuit-layout";
// Original schematics, never traced from real-world circuits. Source identity survives renames.
export const circuitLayouts: Readonly<Record<string, CircuitMapLayout>> = {
    "00000000-0000-4000-8000-000000000300": { id: "coastal-schematic", startFinishProgress: 0, direction: "CLOCKWISE", points: [{ x: .22, y: .8 }, { x: .13, y: .69 }, { x: .1, y: .4 }, { x: .22, y: .19 }, { x: .43, y: .14 }, { x: .57, y: .24 }, { x: .73, y: .18 }, { x: .9, y: .3 }, { x: .87, y: .46 }, { x: .68, y: .5 }, { x: .74, y: .69 }, { x: .62, y: .84 }, { x: .42, y: .7 }, { x: .36, y: .83 }] },
    "00000000-0000-4000-8000-000000000301": { id: "highland-schematic", startFinishProgress: 0, direction: "CLOCKWISE", points: [{ x: .18, y: .76 }, { x: .08, y: .52 }, { x: .16, y: .2 }, { x: .34, y: .13 }, { x: .47, y: .29 }, { x: .4, y: .46 }, { x: .58, y: .53 }, { x: .69, y: .26 }, { x: .87, y: .18 }, { x: .94, y: .4 }, { x: .83, y: .72 }, { x: .62, y: .84 }, { x: .46, y: .65 }, { x: .32, y: .83 }] },
};
export const fallbackLayout: CircuitMapLayout = { id: "generic-schematic", startFinishProgress: 0, direction: "CLOCKWISE", points: [{ x: .2, y: .75 }, { x: .1, y: .5 }, { x: .2, y: .25 }, { x: .8, y: .25 }, { x: .9, y: .5 }, { x: .8, y: .75 }] };
export function layoutForCircuit(sourceCircuitId?: string | null) { return sourceCircuitId ? circuitLayouts[sourceCircuitId] ?? fallbackLayout : fallbackLayout; }

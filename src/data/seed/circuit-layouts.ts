import type { CircuitMapLayout } from '../../game/domain/circuit-layout';
import { normalizeCircuitPoints, projectCoordinates } from '../../game/domain/circuit-geometry';
import albertPark from './geometry/albert-park.json';
import suzuka from './geometry/suzuka.json';
const revision = '394d8fbe70ef2c0b0c8d23ff7bee61fa09606055';
function realLayout(id: string, file: string, coordinates: number[][], rotationDegrees: number, direction: CircuitMapLayout['direction']): CircuitMapLayout {
    return { id, closed: true, startFinishProgress: 0, direction,
        points: normalizeCircuitPoints(projectCoordinates(coordinates), rotationDegrees),
        metadata: { source: `https://github.com/bacinger/f1-circuits/blob/${revision}/circuits/${file}`, revision, rotationDegrees, realGeometry: true } };
}
/** Stable source IDs survive display-name and historical content-key changes. */
export const circuitLayouts: Readonly<Record<string, CircuitMapLayout>> = {
    '00000000-0000-4000-8000-000000000300': realLayout('albert-park', 'au-1953.geojson', albertPark.features[0].geometry.coordinates, 90, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000301': realLayout('suzuka', 'jp-1962.geojson', suzuka.features[0].geometry.coordinates, 0, 'FIGURE_EIGHT'),
};
export const fallbackLayout: CircuitMapLayout = { id: 'generic-schematic', closed: true, startFinishProgress: 0, direction: 'CLOCKWISE', points: [{ x: .2, y: .75 }, { x: .1, y: .5 }, { x: .2, y: .25 }, { x: .8, y: .25 }, { x: .9, y: .5 }, { x: .8, y: .75 }] };
export function layoutForCircuit(sourceCircuitId?: string | null) { return sourceCircuitId ? circuitLayouts[sourceCircuitId] ?? fallbackLayout : fallbackLayout; }

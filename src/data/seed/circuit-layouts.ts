import type { CircuitMapLayout } from '../../game/domain/circuit-layout';
import { normalizeCircuitPoints, projectCoordinates } from '../../game/domain/circuit-geometry';
import albertPark from './geometry/albert-park.json';
import suzuka from './geometry/suzuka.json';
import shanghai from './geometry/shanghai.json';
import bahrain from './geometry/bahrain.json';
import monaco from './geometry/monaco.json';
import silverstone from './geometry/silverstone.json';
import spaFrancorchamps from './geometry/spa-francorchamps.json';
import marinaBay from './geometry/marina-bay.json';
import circuit308 from './geometry/jeddah.json';
import circuit309 from './geometry/miami.json';
import circuit310 from './geometry/montreal.json';
import circuit311 from './geometry/barcelona.json';
import circuit312 from './geometry/red-bull-ring.json';
import circuit313 from './geometry/hungaroring.json';
import circuit314 from './geometry/zandvoort.json';
import circuit315 from './geometry/monza.json';
import circuit316 from './geometry/madrid.json';
import circuit317 from './geometry/baku.json';
import circuit318 from './geometry/cota.json';
import circuit319 from './geometry/mexico-city.json';
import circuit320 from './geometry/interlagos.json';
import circuit321 from './geometry/las-vegas.json';
import circuit322 from './geometry/lusail.json';
import circuit323 from './geometry/yas-marina.json';
/** Every geometry file is an unmodified copy of bacinger/f1-circuits (MIT, see geometry/LICENSE.txt) at this revision. */
const revision = '394d8fbe70ef2c0b0c8d23ff7bee61fa09606055';
/**
 * `reverse`: the source LineString is ordered against the racing direction; the stored start point is kept and the
 * rest of the ring is reversed so cars move in the real direction (checked against the circuit's first corner).
 */
function realLayout(id: string, file: string, coordinates: number[][], rotationDegrees: number, direction: CircuitMapLayout['direction'], reverse = false): CircuitMapLayout {
    const closed = coordinates.length > 1 && coordinates[0][0] === coordinates.at(-1)![0] && coordinates[0][1] === coordinates.at(-1)![1];
    const ring = closed ? coordinates.slice(0, -1) : coordinates;
    const ordered = reverse ? [ring[0], ...ring.slice(1).reverse()] : coordinates;
    return { id, closed: true, startFinishProgress: 0, direction,
        points: normalizeCircuitPoints(projectCoordinates(ordered), rotationDegrees),
        metadata: { source: `https://github.com/bacinger/f1-circuits/blob/${revision}/circuits/${file}`, revision, rotationDegrees, realGeometry: true } };
}
const geometry = (collection: { features: readonly { geometry: { coordinates: number[][] } }[] }) => collection.features[0].geometry.coordinates;
/**
 * Stable source IDs survive display-name and historical content-key changes. Rotations fit each circuit to the
 * landscape map; the two original layouts keep their accepted rotations.
 */
export const circuitLayouts: Readonly<Record<string, CircuitMapLayout>> = {
    '00000000-0000-4000-8000-000000000300': realLayout('albert-park', 'au-1953.geojson', geometry(albertPark), 90, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000301': realLayout('suzuka', 'jp-1962.geojson', geometry(suzuka), 0, 'FIGURE_EIGHT'),
    '00000000-0000-4000-8000-000000000302': realLayout('shanghai', 'cn-2004.geojson', geometry(shanghai), 120, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000303': realLayout('bahrain', 'bh-2002.geojson', geometry(bahrain), 90, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000304': realLayout('monaco', 'mc-1929.geojson', geometry(monaco), 45, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000305': realLayout('silverstone', 'gb-1948.geojson', geometry(silverstone), 75, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000306': realLayout('spa-francorchamps', 'be-1925.geojson', geometry(spaFrancorchamps), 105, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000307': realLayout('marina-bay', 'sg-2008.geojson', geometry(marinaBay), 15, 'COUNTER_CLOCKWISE', true),
    '00000000-0000-4000-8000-000000000308': realLayout('jeddah', 'sa-2021.geojson', geometry(circuit308), -84, 'COUNTER_CLOCKWISE'),
    '00000000-0000-4000-8000-000000000309': realLayout('miami', 'us-2022.geojson', geometry(circuit309), 4, 'COUNTER_CLOCKWISE'),
    '00000000-0000-4000-8000-000000000310': realLayout('montreal', 'ca-1978.geojson', geometry(circuit310), -80, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000311': realLayout('barcelona', 'es-1991.geojson', geometry(circuit311), 57, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000312': realLayout('red-bull-ring', 'at-1969.geojson', geometry(circuit312), -21, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000313': realLayout('hungaroring', 'hu-1986.geojson', geometry(circuit313), 79, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000314': realLayout('zandvoort', 'nl-1948.geojson', geometry(circuit314), 7, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000315': realLayout('monza', 'it-1922.geojson', geometry(circuit315), 66, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000316': realLayout('madrid', 'es-2026.geojson', geometry(circuit316), -63, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000317': realLayout('baku', 'az-2016.geojson', geometry(circuit317), 31, 'COUNTER_CLOCKWISE'),
    '00000000-0000-4000-8000-000000000318': realLayout('cota', 'us-2012.geojson', geometry(circuit318), 21, 'COUNTER_CLOCKWISE'),
    '00000000-0000-4000-8000-000000000319': realLayout('mexico-city', 'mx-1962.geojson', geometry(circuit319), -25, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000320': realLayout('interlagos', 'br-1940.geojson', geometry(circuit320), -89, 'COUNTER_CLOCKWISE'),
    '00000000-0000-4000-8000-000000000321': realLayout('las-vegas', 'us-2023.geojson', geometry(circuit321), 90, 'COUNTER_CLOCKWISE'),
    '00000000-0000-4000-8000-000000000322': realLayout('lusail', 'qa-2004.geojson', geometry(circuit322), -61, 'CLOCKWISE'),
    '00000000-0000-4000-8000-000000000323': realLayout('yas-marina', 'ae-2009.geojson', geometry(circuit323), -82, 'COUNTER_CLOCKWISE'),
};
export const fallbackLayout: CircuitMapLayout = { id: 'generic-schematic', closed: true, startFinishProgress: 0, direction: 'CLOCKWISE', points: [{ x: .2, y: .75 }, { x: .1, y: .5 }, { x: .2, y: .25 }, { x: .8, y: .25 }, { x: .9, y: .5 }, { x: .8, y: .75 }] };
export function layoutForCircuit(sourceCircuitId?: string | null) { return sourceCircuitId ? circuitLayouts[sourceCircuitId] ?? fallbackLayout : fallbackLayout; }

import { memo } from 'react';
import type { MapPoint } from '../../../game/domain/circuit-layout';
import suzuka from '../../../data/seed/geometry/suzuka.json';
import monaco from '../../../data/seed/geometry/monaco.json';
import silverstone from '../../../data/seed/geometry/silverstone.json';
import spa from '../../../data/seed/geometry/spa-francorchamps.json';
import data from './environment-data.json';
import { geographicTrackFrame, type EnvironmentDetail } from './environment-geometry';
import { svgNumber, svgPath } from './race-map-style';

export type EnvironmentKind = 'PIT_COMPLEX' | 'BUILDING' | 'GRANDSTAND' | 'WHEEL' | 'WATER' | 'FOREST';
export interface EnvironmentFeature { id: string; kind: EnvironmentKind; name: string; detail: EnvironmentDetail; points: readonly MapPoint[] }
export interface TrackEnvironment { layoutId: string; features: readonly EnvironmentFeature[] }
const sources = { suzuka: [suzuka, 0], monaco: [monaco, 45], silverstone: [silverstone, 75], 'spa-francorchamps': [spa, 105] } as const;
/** Static cache: transforms once, uses the same raw track frame as circuit-layouts.ts. No runtime network calls. */
export const trackEnvironments: Readonly<Record<string, TrackEnvironment>> = Object.fromEntries(data.profiles.map(profile => {
    const [source, rotation] = sources[profile.layoutId as keyof typeof sources];
    const transform = geographicTrackFrame(source.features[0].geometry.coordinates, rotation);
    return [profile.layoutId, { layoutId: profile.layoutId, features: profile.features.map(f => ({ id: f.id, kind: f.kind as EnvironmentKind, name: f.name, detail: f.detail as EnvironmentDetail, points: f.coordinates.map(transform) })) }];
}));
export function orientEnvironment(environment: TrackEnvironment | undefined, transform: (points: readonly MapPoint[]) => MapPoint[]) {
    return environment && { ...environment, features: environment.features.map(f => ({ ...f, points: transform(f.points) })) };
}
const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
/** Every decorative shape stays beneath track/cars and outside the accessibility tree. */
export const TrackEnvironmentLayer = memo(function TrackEnvironmentLayer({ environment, detail, project }: { environment?: TrackEnvironment; detail: EnvironmentDetail; project: (p: MapPoint) => MapPoint }) {
    if (!environment) return null;
    return <g className="track-environment" aria-hidden="true" pointerEvents="none" data-detail={detail}>
        {[...environment.features].sort((a, b) => Number(a.kind !== 'WATER' && a.kind !== 'FOREST') - Number(b.kind !== 'WATER' && b.kind !== 'FOREST')).filter(f => rank[f.detail] <= rank[detail]).map(f => {
            const pts = f.points.map(project), d = svgPath(pts, true);
            const building = f.kind === 'PIT_COMPLEX' || f.kind === 'BUILDING' || f.kind === 'GRANDSTAND';
            if (f.kind === 'WHEEL') {
                const x = pts.reduce((sum, p) => sum + p.x, 0) / pts.length, y = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
                const r = Math.max(8, Math.min(18, Math.max(...pts.map(p => Math.hypot(p.x - x, p.y - y)))));
                return <g key={f.id} data-feature={f.id} className="env-wheel" transform={`translate(${svgNumber(x)} ${svgNumber(y)})`}>
                    <path d={`M${svgNumber(-r * .55)},${svgNumber(r * 1.15)} L0,0 L${svgNumber(r * .55)},${svgNumber(r * 1.15)}`} fill="none"/>
                    <circle r={svgNumber(r)} fill="none"/>{Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return <path key={i} d={`M0,0 L${svgNumber(Math.cos(a) * r)},${svgNumber(Math.sin(a) * r)}`} fill="none"/>; })}
                    <circle r="2"/>
                </g>;
            }
            return <g key={f.id} data-feature={f.id} className={`env-feature env-${f.kind.toLowerCase()}`}>
                {building && <path d={d} transform="translate(2 4)" className="env-ground-shadow"/>}
                <path d={d}/>
                {building && detail !== 'LOW' && <path d={d} transform="translate(-1 -2)" className="env-roof"/>}
                {f.kind === 'GRANDSTAND' && detail === 'HIGH' && <path d={d} className="env-seats"/>}
            </g>;
        })}
    </g>;
});

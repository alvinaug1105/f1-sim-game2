import * as THREE from 'three';
import { environmentDetail, type EnvironmentDetail } from '../viewer/environment-geometry';
import { prepareCircuitPath } from '../../../game/domain/circuit-geometry';
import { type SceneGeometry, worldPoint, crossingHeight, roadStrip, woodlandTrees } from './model';
import type { MapRow } from '../viewer/track-map';
import type { MapPoint } from '../../../game/domain/circuit-layout';

export function buildSuzukaScene(geometry: SceneGeometry, rows: readonly MapRow[]) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#101e25');
    const environment = new THREE.Group(); environment.name = 'sourced-environment'; scene.add(environment);
    const materials: THREE.Material[] = [], geometries: THREE.BufferGeometry[] = [];
    const material = (color: string, roughness = .9) => { const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: .05, side: THREE.DoubleSide }); materials.push(m); return m; };
    const remember = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
    let disposed = false;
    const dispose = () => {
        if (disposed) return; disposed = true;
        scene.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); if (o instanceof THREE.DirectionalLight) o.shadow.dispose(); });
        geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); scene.clear();
    };
    try {
    const asphalt = material('#303b42'), edge = material('#a7b3b2'), shoulder = material('#58655d'), grass = material('#223d35'), forest = material('#172e27'), roof = material('#8799a4'), wall = material('#586e78'), seating = material('#52676d'), amber = material('#f5b34d');
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = scene) => { const obj = new THREE.Mesh(remember(g), m); obj.receiveShadow = true; parent.add(obj); return obj; };
    const ground = mesh(new THREE.PlaneGeometry(1800, 1600), grass); ground.rotation.x = -Math.PI / 2; ground.position.y = -.2;
    const poly = (points: readonly MapPoint[], height: number, m: THREE.Material, parent = environment) => {
        const shape = new THREE.Shape(points.map(p => new THREE.Vector2((p.x - .5) * 1000, -(p.y - .5) * 1000)));
        const obj = mesh(new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 }), m, parent); obj.rotation.x = -Math.PI / 2; obj.castShadow = height > 1; return obj;
    };
    const height = crossingHeight(geometry.layout), path = prepareCircuitPath(geometry.layout);
    // Linear subdivisions add vertical deck detail along the exact original segments.
    // The source path/order/start offset stay untouched; no smoothing or shortcuts.
    const surfacePoints = geometry.layout.points.flatMap((p, i) => { const q = geometry.layout.points[(i + 1) % geometry.layout.points.length], count = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / .004)); return Array.from({ length: count }, (_, j) => ({ x: p.x + (q.x - p.x) * j / count, y: p.y + (q.y - p.y) * j / count })); });
    const cumulative = [0]; surfacePoints.forEach((p, i) => { const q = surfacePoints[(i + 1) % surfacePoints.length]; cumulative.push(cumulative.at(-1)! + Math.hypot(q.x - p.x, q.y - p.y)); });
    const road = (points: readonly MapPoint[], width: number, lift: number, m: THREE.Material, closed = true) => {
        const strip = roadStrip(points, width, i => lift + (closed ? height(cumulative[i] / path.totalLength - geometry.layout.startFinishProgress) : .7), closed);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(strip.vertices, 3)); g.setIndex(strip.indices); g.computeVertexNormals(); return mesh(g, m);
    };
    road(surfacePoints, 16, -.3, shoulder); road(surfacePoints, 10, 0, edge); road(surfacePoints, 8, .06, asphalt);
    road(geometry.pit.points, 5, .15, edge, false); road(geometry.pit.points, 3.5, .2, material('#3f6976'), false);
    // Chequered control line, exactly at the existing source offset.
    const start = path.sample(0), w = worldPoint(start, 1); const finish = new THREE.Group(); finish.position.set(w.x, w.y, w.z); finish.rotation.y = -Math.atan2(start.tangentY, start.tangentX); scene.add(finish);
    const white = material('#dfe6e5'), black = material('#132128');
    const square = remember(new THREE.BoxGeometry(1.1, .1, 1.1));
    for (let x = 0; x < 2; x++) for (let z = 0; z < 8; z++) { const tile = new THREE.Mesh(square, (x + z) % 2 ? black : white); tile.position.set((x - .5) * 1.1, .1, (z - 3.5) * 1.1); finish.add(tile); }
    const treePoints = woodlandTrees(geometry, 260), trunkG = remember(new THREE.CylinderGeometry(.35, .55, 3, 5)), crownG = remember(new THREE.ConeGeometry(3, 9, 7));
    const trunks = new THREE.InstancedMesh(trunkG, material('#534e3d'), treePoints.length), crowns = new THREE.InstancedMesh(crownG, material('#ffffff'), treePoints.length), temp = new THREE.Object3D();
    treePoints.forEach((p, i) => { const t = worldPoint(p); temp.position.set(t.x, 1.5, t.z); temp.scale.setScalar(.8 + i % 7 * .055); temp.updateMatrix(); trunks.setMatrixAt(i, temp.matrix); temp.position.y = 6; temp.updateMatrix(); crowns.setMatrixAt(i, temp.matrix); crowns.setColorAt(i, new THREE.Color(i % 3 ? '#315847' : '#254536')); });
    crowns.castShadow = true; environment.add(trunks, crowns);
    const detailGroups: THREE.Object3D[] = [trunks, crowns];
    const features: { object: THREE.Object3D; detail: EnvironmentDetail }[] = [];
    for (const feature of geometry.environment.features) {
        if (feature.kind === 'FOREST') { const object = poly(feature.points, .15, forest); object.name = feature.id; features.push({ object, detail: feature.detail }); continue; }
        if (feature.kind === 'WHEEL') {
            const centre = feature.points.reduce((p, a) => ({ x: p.x + a.x / feature.points.length, y: p.y + a.y / feature.points.length }), { x: 0, y: 0 });
            const p = worldPoint(centre), group = new THREE.Group(); group.name = feature.id; group.position.set(p.x, 0, p.z); environment.add(group); features.push({ object: group, detail: feature.detail });
            // Stylized dimensions, not surveyed. Footprint centre remains exact.
            const rim = mesh(new THREE.TorusGeometry(12, .65, 6, 32), roof, group); rim.position.y = 15; rim.castShadow = true;
            const cylinder = remember(new THREE.CylinderGeometry(.35, .35, 24, 5));
            const bar = (a: THREE.Vector3, b: THREE.Vector3, m = wall) => { const obj = new THREE.Mesh(cylinder, m), direction = b.clone().sub(a); obj.position.copy(a).add(b).multiplyScalar(.5); obj.scale.y = direction.length() / 24; obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); group.add(obj); };
            for (const sign of [-1, 1]) bar(new THREE.Vector3(sign * 7, 0, -2), new THREE.Vector3(0, 15, 0));
            const cabin = remember(new THREE.BoxGeometry(2, 2.2, 1.7));
            for (let i = 0; i < 12; i++) { const angle = i * Math.PI / 6, end = new THREE.Vector3(Math.cos(angle) * 12, 15 + Math.sin(angle) * 12, 0); bar(new THREE.Vector3(0, 15, 0), end, roof); const car = new THREE.Mesh(cabin, i % 3 ? wall : amber); car.position.copy(end); group.add(car); }
            continue;
        }
        const building = new THREE.Group(); building.name = feature.id; environment.add(building); features.push({ object: building, detail: feature.detail });
        const middle = feature.points.reduce((p, a) => ({ x: p.x + a.x / feature.points.length, y: p.y + a.y / feature.points.length }), { x: 0, y: 0 });
        const scale = (amount: number) => feature.points.map(p => ({ x: middle.x + (p.x - middle.x) * amount, y: middle.y + (p.y - middle.y) * amount }));
        if (feature.kind === 'GRANDSTAND') {
            for (let level = 0; level < 5; level++) { const step = poly(scale(1 - level * .09), 1, level % 2 ? roof : seating, building); step.position.y = level; }
            const canopy = poly(scale(1.02), .7, roof, building); canopy.position.y = 8; canopy.castShadow = true;
            feature.points.slice(0, -1).forEach(p => { const a = worldPoint(p); const post = mesh(new THREE.CylinderGeometry(.4, .4, 8, 5), wall, building); post.position.set(a.x, 4, a.z); });
        } else {
            poly(feature.points, 5, wall, building); const top = poly(scale(1.02), .7, roof, building); top.position.y = 5;
            // Generic roof panel divisions; no garage reconstruction or unsupported named feature.
            const a = feature.points[0], b = feature.points[1], c = feature.points[2];
            for (let i = 1; i < 10; i++) { const f = i / 10, p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, q = { x: p.x + (c.x - b.x) * .9, y: p.y + (c.y - b.y) * .9 }; const segment = roadStrip([p, q], .35, () => 5.8, false), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(segment.vertices, 3)); g.setIndex(segment.indices); g.computeVertexNormals(); mesh(g, wall, building); }
        }
    }
    scene.add(new THREE.HemisphereLight('#dae6f0', '#284a32', 2.3));
    const light = new THREE.DirectionalLight('#fff0d7', 2.7); light.position.set(-350, 900, -250); light.castShadow = true; light.shadow.mapSize.set(1024, 1024); light.shadow.camera.left = -650; light.shadow.camera.right = 650; light.shadow.camera.top = 650; light.shadow.camera.bottom = -650; light.shadow.camera.far = 1800; light.shadow.bias = -.0008; light.shadow.normalBias = .5; scene.add(light);
    const markers = new Map<string, THREE.Group>(), tokenG = remember(new THREE.CylinderGeometry(1, 1, 1.2, 12)), ringG = remember(new THREE.TorusGeometry(1, .08, 4, 32)), noseG = remember(new THREE.ConeGeometry(.35, .8, 3));
    for (const row of rows) {
        const group = new THREE.Group(); group.name = row.id; scene.add(group); markers.set(row.id, group);
        const token = new THREE.Mesh(tokenG, material(row.color, .6)); group.add(token);
        const ring = new THREE.Mesh(ringG, material('#e5f0f1')); ring.rotation.x = -Math.PI / 2; ring.position.y = 1; group.add(ring);
        const select = new THREE.Mesh(ringG, amber); select.rotation.x = -Math.PI / 2; select.position.y = 1.1; select.scale.setScalar(1.3); group.add(select);
        const nose = new THREE.Mesh(noseG, white); nose.rotation.z = -Math.PI / 2; nose.position.x = .7; nose.position.y = 1; group.add(nose);
        group.userData = { token, ring, select, nose };
    }
    const bounds = [...geometry.layout.points, ...geometry.pit.points, ...geometry.environment.features.filter(f => f.kind !== 'FOREST').flatMap(f => f.points)];
    return { scene, environment, markers, bounds, detailGroups, features, light, resources: { geometries, materials }, dispose,
        setDetail(width: number, height: number) {
            const detail = environmentDetail(width, height), rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
            features.forEach(f => { f.object.visible = rank[f.detail] <= rank[detail]; });
            // Individual trees are a high-detail decoration; footprints share SVG's LOD tiers.
            detailGroups.forEach(o => { o.visible = detail === 'HIGH'; });
            return detail;
        },
    };
    } catch (error) { dispose(); throw error; }
}

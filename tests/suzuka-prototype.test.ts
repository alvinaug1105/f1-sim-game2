import { describe, expect, it, vi } from 'vitest';
import { circuitLayouts } from '../src/data/seed/circuit-layouts';
import { drawnPitLane } from '../src/data/seed/circuit-pit-lanes';
import { prepareCircuitPath, orientLayout } from '../src/game/domain/circuit-geometry';
import { racePitRoute, samplePitRoute } from '../src/game/domain/pit-geometry';
import { trackEnvironments, orientEnvironment } from '../src/features/race/viewer/track-environment';
import { buildSuzukaScene } from '../src/features/race/prototype/scene';
import { cappedPixelRatio, crossing, crossingHeight, insidePolygon, distanceToRoute, prototypeEnabled, roadStrip, sampleCar, woodlandTrees, worldPoint, type PrototypeReplay, type SceneGeometry } from '../src/features/race/prototype/model';
import replayJSON from '../src/features/race/prototype/replay.json';

const replay = replayJSON as PrototypeReplay, layout = circuitLayouts['00000000-0000-4000-8000-000000000301'];
const geometry: SceneGeometry = { layout, pit: racePitRoute(drawnPitLane('00000000-0000-4000-8000-000000000301')!, replay.pitAnchors), environment: trackEnvironments.suzuka };

describe('isolated Suzuka public replay and geographic contract', () => {
    it.each([['development','1',true],['development',undefined,false],['production','1',false],['test','1',false],['development','true',false]])('gate %s / %s -> %s', (environment,flag,expected) => {
        expect(prototypeEnabled(environment,flag as string | undefined)).toBe(expected);
    });
    it('uniformly maps source coordinates and samples every route without changing inputs', () => {
        const before = JSON.stringify(geometry), path = prepareCircuitPath(layout);
        expect(worldPoint({x:.25,y:.75},3)).toEqual({x:-250,y:3,z:250});
        for (let i = 0; i <= 100; i++) {
            const progress = i / 100, expected = worldPoint(path.sample(progress)), sample = sampleCar(geometry,progress);
            expect(sample.x).toBeCloseTo(expected.x,10); expect(sample.z).toBeCloseTo(expected.z,10);
        }
        for (const route of ['ENTRY','SERVICE','EXIT'] as const) {
            const progress = replay.pitAnchors.service / 1e6, expected = worldPoint(samplePitRoute(geometry.pit,progress * 1e6),1);
            expect(sampleCar(geometry,16 + progress,route)).toMatchObject({x:expect.closeTo(expected.x,8),y:1,z:expect.closeTo(expected.z,8)});
        }
        expect(JSON.stringify(geometry)).toBe(before);
    });
    it('rotates pit and environment with the same companion transform', () => {
        const oriented = orientLayout(layout,35), changed = { layout:oriented.layout, pit:{...geometry.pit,points:oriented.transform(geometry.pit.points)}, environment:orientEnvironment(geometry.environment,oriented.transform)! };
        const sample = sampleCar(changed,.35), expected = worldPoint(prepareCircuitPath(changed.layout).sample(.35));
        expect(sample.x).toBeCloseTo(expected.x,10);expect(sample.z).toBeCloseTo(expected.z,10);
        expect(changed.environment.features[0].points).toEqual(oriented.transform(geometry.environment.features[0].points));
    });
    it('finds the real figure-eight and raises only the return segment at its shared x/z', () => {
        const hit = crossing(layout.points)!; expect(hit).not.toBeNull();
        const path = prepareCircuitPath(layout), height = crossingHeight(layout);
        const at = (index:number,t:number) => {
            let distance = 0;for(let i=0;i<index;i++) distance += Math.hypot(layout.points[i+1].x-layout.points[i].x,layout.points[i+1].y-layout.points[i].y);
            const a=layout.points[index],b=layout.points[(index+1)%layout.points.length];
            return (distance+Math.hypot(b.x-a.x,b.y-a.y)*t)/path.totalLength-layout.startFinishProgress;
        };
        const lower=at(hit.i,hit.t),upper=at(hit.j,hit.u);
        expect(path.sample(lower)).toMatchObject({x:expect.closeTo(hit.point.x,10),y:expect.closeTo(hit.point.y,10)});
        expect(path.sample(upper)).toMatchObject({x:expect.closeTo(hit.point.x,10),y:expect.closeTo(hit.point.y,10)});
        expect(height(upper)-height(lower)).toBeCloseTo(6,8);
    });
    it('keeps both road edges centred on each original vertex including the closing seam', () => {
        const strip=roadStrip(layout.points,8,()=>.7);
        for(let i=0;i<=layout.points.length;i++) {
            const p=worldPoint(layout.points[i%layout.points.length],.7),v=strip.vertices.slice(i*6,i*6+6);
            expect((v[0]+v[3])/2).toBeCloseTo(p.x,10);expect((v[2]+v[5])/2).toBeCloseTo(p.z,10);
        }
    });
    it('generates bounded deterministic vegetation only in sourced woodland away from roads', () => {
        const trees=woodlandTrees(geometry,55);expect(trees.length).toBeGreaterThan(0);expect(trees.length).toBeLessThanOrEqual(55);
        expect(trees).toEqual(woodlandTrees(geometry,55));
        for(const tree of trees) { expect(geometry.environment.features.some(f=>f.kind==='FOREST'&&insidePolygon(tree,f.points))).toBe(true);expect(distanceToRoute(tree,layout.points)).toBeGreaterThan(.017);expect(distanceToRoute(tree,geometry.pit.points)).toBeGreaterThan(.014); }
    });
    it('exports only whitelisted public map fields, with real monotonically advancing checkpoints', () => {
        expect(replay.visibility).toBe('PUBLIC');expect(replay.frames).toHaveLength(12);
        const keys=['id','progress','status','name','team','player','color','abbreviation','pitting','lapsDown','entrant','route','routeHistory'];
        for(const frame of [...replay.frames,...Object.values(replay.cases)]) {
            expect(frame.rows).toHaveLength(22);expect(frame.rows.filter(r=>r.player)).toHaveLength(2);
            for(const row of frame.rows) { expect(Object.keys(row).every(k=>keys.includes(k))).toBe(true);expect(Object.keys(row.entrant)).toEqual(['position']);for(const observation of row.routeHistory??[]) expect(Object.keys(observation).every(k=>['atMs','total','route'].includes(k))).toBe(true); }
        }
        for(let i=1;i<replay.frames.length;i++) { expect(replay.frames[i].lap).toBe(replay.frames[i-1].lap+1);replay.frames[i].rows.forEach(row=>expect(row.progress).toBeGreaterThanOrEqual(replay.frames[i-1].rows.find(r=>r.id===row.id)!.progress)); }
        expect(JSON.stringify(replay)).not.toMatch(/rngState|simulationInput|strategyPlan|aiWeather|randomSeed|reliability/);
        expect(replay.cases.pit.rows.some(r=>r.route==='SERVICE'&&r.player)).toBe(true);
    });
    it('caps GPU pixel cost on narrow and large high-DPI screens',()=>{expect(cappedPixelRatio(3,390)).toBe(1.25);expect(cappedPixelRatio(3,1920)).toBe(1.5);expect(cappedPixelRatio(0,1920)).toBe(1);});
});

describe('original scene resources and sourced detail',()=>{
    it('builds shared tactical markers and the six sourced landmarks without mutating inputs',()=>{
        const before=JSON.stringify(geometry),world=buildSuzukaScene(geometry,replay.frames[0].rows);
        expect(world.markers.size).toBe(22);expect(world.features.map(f=>f.object.name)).toEqual(geometry.environment.features.map(f=>f.id));
        const tokens=[...world.markers.values()].map(m=>m.userData.token.geometry);expect(new Set(tokens).size).toBe(1);
        expect(world.setDetail(390,470)).toBe('LOW');expect(world.features.filter(f=>f.object.visible).map(f=>f.detail)).toEqual(['LOW']);
        expect(world.setDetail(1000,650)).toBe('HIGH');expect(world.features.every(f=>f.object.visible)).toBe(true);
        expect(JSON.stringify(geometry)).toBe(before);world.dispose();
    });
    it('disposes every owned geometry/material once and empties the scene on repeated cleanup',()=>{
        const world=buildSuzukaScene(geometry,replay.frames[0].rows),geometries=world.resources.geometries.map(g=>vi.spyOn(g,'dispose')),materials=world.resources.materials.map(m=>vi.spyOn(m,'dispose'));
        world.dispose();world.dispose();expect(world.scene.children).toHaveLength(0);
        for(const spy of [...geometries,...materials]) expect(spy).toHaveBeenCalledTimes(1);
    });
});

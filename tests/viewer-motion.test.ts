import { describe, it, expect, vi, afterEach } from 'vitest';
import { circuitLayouts, fallbackLayout, layoutForCircuit } from '../src/data/seed/circuit-layouts';
import { normalizeCircuitPoints, projectCoordinates, prepareCircuitPath, circuitProjection, pointAtProgress } from '../src/game/domain/circuit-geometry';
import { RaceMotion, checkpointDuration } from '../src/features/race/viewer/motion';
import { PlaybackController } from '../src/features/race/viewer/playback';
import { quietRace, neutralise } from './helpers/incidents';
import { advanceRaceLap } from '../src/simulation/race/engine';
const target = (progress: number, retired = false) => [{ id: 'a', progress, retired }];
function frames(m: RaceMotion, start: number, end: number) { for (let t = start; t <= end; t += 10) m.frame(t); }
afterEach(() => vi.useRealTimers());
describe('real circuit geometry', () => {
    it('resolves real circuits only through stable source identity, with custom fallback', () => {
        expect(layoutForCircuit('00000000-0000-4000-8000-000000000300').id).toBe('albert-park');
        expect(layoutForCircuit('00000000-0000-4000-8000-000000000301').id).toBe('suzuka');
        expect(layoutForCircuit('Renamed Suzuka')).toBe(fallbackLayout);
        expect(layoutForCircuit('unknown')).toBe(fallbackLayout);
    });
    it.each(Object.values(circuitLayouts))('$id has a finite, detailed, closed path with constant-distance samples', layout => {
        expect(layout.closed).toBe(true); expect(layout.points.length).toBeGreaterThan(100);
        const path = prepareCircuitPath(layout); expect(path.totalLength).toBeGreaterThan(2);
        expect(path.sample(0)).toEqual(path.sample(1));
        for (const progress of [0, .5, .999, 1.001, 20.4, -.25]) { const p = path.sample(progress); expect(Object.values(p).every(Number.isFinite)).toBe(true); }
        expect(pointAtProgress(layout, -.25)).toEqual(pointAtProgress(layout, 10.75));
        const original = structuredClone(layout.points), normalized = normalizeCircuitPoints(layout.points);
        normalized.forEach((p, i) => { expect(p.x).toBeCloseTo(layout.points[i].x, 12); expect(p.y).toBeCloseTo(layout.points[i].y, 12); });
        const projection = circuitProjection(layout.points), a = layout.points[0], b = layout.points[1], c = layout.points[20], d = layout.points[21];
        const distance = (p: typeof a, q: typeof a) => Math.hypot(q.x - p.x, q.y - p.y);
        expect(distance(projection(a), projection(b)) / distance(a, b)).toBeCloseTo(distance(projection(c), projection(d)) / distance(c, d), 8);
        expect(layout.points).toEqual(original);
    });
    it('projects longitude with latitude correction, flips north into SVG up, rotates without reflection', () => {
        const p = projectCoordinates([[0, 45], [1, 45], [0, 46]]);
        expect(p[1].x).toBeCloseTo(Math.cos((45 + 1 / 3) * Math.PI / 180)); expect(p[2].y).toBeLessThan(p[0].y);
        const raw = [{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:0,y:0}], n = normalizeCircuitPoints(raw);
        expect(n).toEqual([{x:0,y:.25},{x:1,y:.25},{x:1,y:.75}]);
        const rotated = normalizeCircuitPoints(raw, 90); expect(rotated[1].y).toBeGreaterThan(rotated[0].y);
    });
    it('preserves the Suzuka crossover and keeps Albert Park a simple racing loop', () => {
        const crossings = (points: readonly {x:number;y:number}[]) => {
            let count = 0;
            const cross = (a: typeof points[number], b: typeof a, c: typeof a) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
            for(let i=0;i<points.length;i++) for(let j=i+2;j<points.length;j++) {
                const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
                if(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) count++;
            } return count;
        };
        expect(crossings(Object.values(circuitLayouts)[0].points)).toBe(0);
        expect(crossings(Object.values(circuitLayouts)[1].points)).toBe(1);
    });
    it('rejects invalid and degenerate source data', () => {
        expect(() => normalizeCircuitPoints([{x:0,y:0},{x:0,y:0},{x:0,y:0}])).toThrow();
        expect(() => projectCoordinates([[NaN,1],[0,1],[1,1]])).toThrow();
    });
});
describe('shared unwrapped visual timeline', () => {
    it('starts paused at saved progress and crosses start/finish forwards', () => {
        const m = new RaceMotion(target(.98)); m.reconcile(target(1.03),1); frames(m,0,1000); expect(m.progress('a')).toBe(.98);
        m.configure('playing',1000); frames(m,2000,2500); expect(m.progress('a')).toBeCloseTo(1.005); frames(m,2510,3000); expect(m.progress('a')).toBe(1.03); expect(m.pending).toBe(false);
    });
    it('reconciles from the actual visual position when another checkpoint arrives', () => {
        const m = new RaceMotion(target(0)); m.configure('playing',1000); m.reconcile(target(1),1); frames(m,0,500); expect(m.progress('a')).toBe(.5);
        m.reconcile(target(2),2); expect(m.progress('a')).toBe(.5); frames(m,500,1000); expect(m.progress('a')).toBeCloseTo(1.25); frames(m,1010,1500); expect(m.progress('a')).toBe(2);
    });
    it('pause freezes even with in-flight commits, long waits, speed and reduced-motion changes; resume is continuous', () => {
        const m = new RaceMotion(target(0)); m.configure('playing',1000); m.reconcile(target(1),1); frames(m,0,400);
        m.configure('paused',1000); m.reconcile(target(2),2); m.configure('paused',125,true); frames(m,10000,11000); expect(m.progress('a')).toBe(.4);
        m.configure('playing',1000); m.frame(12000); expect(m.progress('a')).toBe(.4); frames(m,12010,13000); expect(m.progress('a')).toBe(2);
    });
    it('rapid 1x/4x/8x changes preserve the current position and shorten remaining time', () => {
        const m = new RaceMotion(target(0)); m.reconcile(target(1),1); m.configure('playing',2400); frames(m,0,600); expect(m.progress('a')).toBe(.25);
        m.configure('playing',600); m.frame(600); expect(m.progress('a')).toBe(.25); frames(m,610,700); expect(m.progress('a')).toBeCloseTo(5/12);
        m.configure('playing',300); m.frame(700); expect(m.progress('a')).toBeCloseTo(5/12); frames(m,710,1000); expect(m.progress('a')).toBe(1);
    });
    it('ignores stale checkpoints, reversed timestamps and regressive targets', () => {
        const m = new RaceMotion(target(2),2); m.configure('playing',1000); m.reconcile(target(3),3); frames(m,0,500); m.reconcile(target(1),1); m.frame(200); expect(m.progress('a')).toBe(2.5);
        m.reconcile(target(2),4); frames(m,510,1500); expect(m.progress('a')).toBe(2.5);
    });
    it('caps a background-tab time jump instead of teleporting', () => {
        const m = new RaceMotion(target(0)); m.configure('playing',1000); m.reconcile(target(1),1); m.frame(0); m.frame(60000); expect(m.progress('a')).toBe(.05);
    });
    it('freezes retirement at the last drawn position through later checkpoints', () => {
        const m = new RaceMotion(target(0)); m.configure('playing',1000); m.reconcile(target(1),1); frames(m,0,500); m.reconcile(target(1,true),2); frames(m,510,1500); m.reconcile(target(5,true),3); frames(m,1510,2500); expect(m.progress('a')).toBe(.5); expect(m.pending).toBe(false);
    });
    it('one retirement freezes only that car; the running car keeps moving', () => {
        const pair = (a: number, b: number, retiredA = false) => [{ id: 'a', progress: a, retired: retiredA }, { id: 'b', progress: b, retired: false }];
        const m = new RaceMotion(pair(0, 0)); m.configure('playing', 1000); m.reconcile(pair(1, 1), 1); frames(m, 0, 500);
        m.reconcile(pair(1, 1, true), 2); frames(m, 510, 1520); expect(m.progress('a')).toBe(.5); expect(m.progress('b')).toBe(1);
        m.reconcile(pair(5, 2, true), 3); frames(m, 1530, 2540);
        expect(m.progress('a')).toBe(.5); expect(m.progress('b')).toBe(2); expect(m.pending).toBe(false);
    });
    it('reduced motion updates to checkpoints only when unpaused', () => {
        const m = new RaceMotion(target(0)); m.reconcile(target(1),1); m.configure('playing',1000,true); m.frame(0); expect(m.progress('a')).toBe(1); expect(m.pending).toBe(false);
    });
    it('single-step and finish settle at the authoritative target then stop', () => {
        const m = new RaceMotion(target(57)); m.reconcile(target(58),58); m.configure('settle',1000); frames(m,0,1000); expect(m.progress('a')).toBe(58); expect(m.pending).toBe(false);
    });
    it('SC/VSC slow the presentation clock without changing relative checkpoint gaps', () => {
        expect(checkpointDuration(1,'SAFETY_CAR')).toBe(4320); expect(checkpointDuration(1,'VSC')).toBe(3360); expect(checkpointDuration(1,'GREEN',true)).toBe(300);
        const m = new RaceMotion([{id:'a',progress:1,retired:false},{id:'b',progress:.8,retired:false}]); m.configure('playing',1000);
        m.reconcile([{id:'a',progress:2,retired:false},{id:'b',progress:1.8,retired:false}],1); frames(m,0,500); expect(m.progress('a')-m.progress('b')).toBeCloseTo(.2);
        m.reconcile([{id:'a',progress:3,retired:false},{id:'b',progress:2.95,retired:false}],2); frames(m,500,1000); expect(m.progress('a')-m.progress('b')).toBeCloseTo(.125);
    });
    it('visual preferences and sampling cannot mutate a frozen simulation checkpoint', () => {
        const s = quietRace(20), before = structuredClone(s); const targets=s.entrants.map(e=>({id:e.entrantId,progress:e.track!.progressMicrolaps/1e6,retired:false}));
        const m=new RaceMotion(targets); m.reconcile(targets.map(e=>({...e,progress:e.progress+1})),1); m.configure('playing',300); frames(m,0,400); m.configure('paused',1000,true); expect(s).toEqual(before);
    });
    it('automatic strategic pause freezes motion; explicit step can settle; a late response cannot resume manual pause', async () => {
        vi.useFakeTimers(); const s=quietRace(); const c=new PlaybackController(s,s.input.entrants[0].teamId,async state=>neutralise(advanceRaceLap(state),'VSC'));
        c.skip(); await vi.runAllTimersAsync(); expect(c.getSnapshot().motion).toBe('paused'); expect(c.getSnapshot().reason).toBe('CONTROL');
        const step=new PlaybackController(s,s.input.entrants[0].teamId,async state=>advanceRaceLap(state)); await step.step(); expect(step.getSnapshot().motion).toBe('settle');
        let finish!:(state: typeof s)=>void; const late=new PlaybackController(s,s.input.entrants[0].teamId,()=>new Promise(resolve=>finish=resolve)); const task=late.step(); late.pause(); finish(advanceRaceLap(s)); await task; expect(late.getSnapshot().motion).toBe('paused');
    });
});

it('measures persistence latency for presentation without extra requests or altered results', async () => {
    vi.useFakeTimers(); const s=quietRace(); const advance=vi.fn(async()=>{ await new Promise(resolve=>setTimeout(resolve,180)); return advanceRaceLap(s); });
    const c=new PlaybackController(s,s.input.entrants[0].teamId,advance); c.play(); await vi.advanceTimersByTimeAsync(2580);
    expect(c.getSnapshot().latencyMs).toBe(180); expect(advance).toHaveBeenCalledTimes(1); expect(c.getState()).toEqual(advanceRaceLap(s)); c.pause();
});

it('starts a checkpoint after idle without consuming the old frame timestamp', () => {
    const m=new RaceMotion(target(0)); m.configure('playing',1000); m.reconcile(target(1),1); frames(m,0,1000);
    m.reconcile(target(2),2); m.frame(10000); expect(m.progress('a')).toBe(1); m.frame(10010); expect(m.progress('a')).toBe(1.01);
});

import type { VisualTimeMap } from './speed-profile';
/** Presentation only: no engine, persistence, RNG, locale or React dependencies. */
export type MotionMode = 'paused' | 'playing' | 'settle';
export interface RouteFrame {atMs:number;total:number;route:'TRACK'|'ENTRY'|'LANE'|'SERVICE'|'EXIT'}
export interface MotionTarget { id: string; progress: number; retired: boolean; observations?:readonly RouteFrame[]; route?:RouteFrame['route'] }
interface CarMotion { current: number; from: number; target: number; retired: boolean; observations?:readonly RouteFrame[];observedTime?:number;route?:RouteFrame['route'];targetRoute?:RouteFrame['route'] }
export function checkpointDuration(speed: number, control = 'GREEN', skipping = false) {
    return 2400 / (skipping ? 8 : Math.max(1, speed)) * (control === 'SAFETY_CAR' ? 1.8 : control === 'VSC' ? 1.4 : 1);
}
/** Unwrapped progress throughout; only geometry sampling wraps it. Never extrapolates. */
export class RaceMotion {
    private cars = new Map<string, CarMotion>();
    private revision = -1;
    private elapsed = 0;
    private duration = 2400;
    private mode: MotionMode = 'paused';
    private reduced = false;
    private lastTime: number | null = null;
    private launch = false;
    private profile?: VisualTimeMap;
    constructor(targets: readonly MotionTarget[], revision = 0, private profiles?: { green: VisualTimeMap; neutral: VisualTimeMap }) {
        this.revision = revision;
        for (const t of targets) this.cars.set(t.id, { current: t.progress, from: t.progress, target: t.progress, retired: t.retired,route:t.route,targetRoute:t.route,observations:t.observations,observedTime:t.observations?.at(-1)?.atMs });
    }
    reconcile(targets: readonly MotionTarget[], revision: number, control = 'GREEN') {
        if (revision <= this.revision) return; // Stale snapshots and preference/command renders cannot restart motion.
        this.launch = !!this.profiles && [...this.cars.values()].every(c => c.current <= 0) && targets.some(t => t.progress > 0);
        // One shared strictly increasing map preserves unchanged longitudinal order. Freeze the map per checkpoint.
        this.profile = control === 'GREEN' ? this.profiles?.green : this.profiles?.neutral;
        this.revision = revision;
        this.elapsed = 0;
        this.lastTime = null; // A fresh target starts at the current drawn frame, not an old idle timestamp.
        for (const t of targets) {
            const car = this.cars.get(t.id);
            if (!Number.isFinite(t.progress)) continue;
            if (!car) { this.cars.set(t.id, { current: t.progress, from: t.progress, target: t.progress, retired: t.retired,route:t.route,targetRoute:t.route,observations:t.observations,observedTime:t.observations?.at(-1)?.atMs }); continue; }
            const trace=t.observations,oldTrace=car.observations;
            // A new committed checkpoint may arrive before the previous replay has settled. Retain its observed
            // remaining route (including service) and start at the last drawn frame instead of jumping to its target.
            car.observations=trace&&oldTrace&&car.observedTime!==undefined&&car.current<trace[0].total/1e6
                ?[{atMs:car.observedTime,total:car.current*1e6,route:car.route??'TRACK'},...oldTrace.filter(o=>o.atMs>car.observedTime!&&o.atMs<trace[0].atMs),...trace]:trace;
            car.targetRoute=t.route;
            car.from = car.current; // The last DRAWN frame, never the previous target.
            car.retired ||= t.retired;
            // Retirement freezes the last visual position; stale/regressive targets never reverse it.
            car.target = car.retired ? car.current : Math.max(car.current, t.progress);
        }
    }
    configure(mode: MotionMode, duration: number, reduced = false) {
        if (duration !== this.duration) {
            this.elapsed *= duration / this.duration;
            this.duration = Math.max(1, duration);
        }
        if (mode !== this.mode) this.lastTime = null; // No wall-clock catch-up after pause/resume.
        this.mode = mode; this.reduced = reduced;
    }
    frame(now: number) {
        if (this.mode === 'paused') { this.lastTime = null; return; }
        // A suspended/background tab must not jump across laps on its first visible frame.
        const delta = this.lastTime === null ? 0 : Math.max(0, Math.min(50, now - this.lastTime));
        this.lastTime = Math.max(this.lastTime ?? now, now);
        this.elapsed = Math.min(this.duration, this.elapsed + delta);
        let f = this.reduced ? 1 : this.elapsed / this.duration;
        // A one-off launch ramp, not per-lap easing. Ends at exactly one; speed never drops at interval end.
        if (this.launch && !this.reduced) f = f < .12 ? f * f / (.24 * .94) : (f - .06) / .94;
        for (const car of this.cars.values()) if (!car.retired) {
            const a = this.profile?.time(car.from) ?? car.from, b = this.profile?.time(car.target) ?? car.target;
            let next = this.profile?.progress(a + (b - a) * f) ?? (a + (b - a) * f);
            const trace=car.observations;
            if(trace&&trace.length>1) {
                const time=trace[0].atMs+(trace.at(-1)!.atMs-trace[0].atMs)*f;let i=0;while(i<trace.length-2&&trace[i+1].atMs<=time)i++;
                car.observedTime=time;
                const before=trace[i],after=trace[i+1],portion=after.atMs===before.atMs?1:Math.max(0,Math.min(1,(time-before.atMs)/(after.atMs-before.atMs)));
                next=(before.total+(after.total-before.total)*portion)/1e6;car.route=portion>=1?after.route:before.route;
            }
            if(f>=1&&car.targetRoute)car.route=car.targetRoute;
            car.current = f >= 1 ? car.target : Math.max(car.current, Math.min(car.target, next));
        }
    }
    route(id:string) { return this.cars.get(id)?.route??'TRACK'; }
    progress(id: string) { return this.cars.get(id)?.current ?? 0; }
    get pending() { return this.mode !== 'paused' && [...this.cars.values()].some(c => !c.retired && c.current < c.target - 1e-10); }
}

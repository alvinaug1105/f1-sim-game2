/** Presentation only: no engine, persistence, RNG, locale or React dependencies. */
export type MotionMode = 'paused' | 'playing' | 'settle';
export interface MotionTarget { id: string; progress: number; retired: boolean }
interface CarMotion { current: number; from: number; target: number; retired: boolean }
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
    constructor(targets: readonly MotionTarget[], revision = 0) {
        this.revision = revision;
        for (const t of targets) this.cars.set(t.id, { current: t.progress, from: t.progress, target: t.progress, retired: t.retired });
    }
    reconcile(targets: readonly MotionTarget[], revision: number) {
        if (revision <= this.revision) return; // Stale snapshots and preference/command renders cannot restart motion.
        this.revision = revision;
        this.elapsed = 0;
        this.lastTime = null; // A fresh target starts at the current drawn frame, not an old idle timestamp.
        for (const t of targets) {
            const car = this.cars.get(t.id);
            if (!Number.isFinite(t.progress)) continue;
            if (!car) { this.cars.set(t.id, { current: t.progress, from: t.progress, target: t.progress, retired: t.retired }); continue; }
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
        const f = this.reduced ? 1 : this.elapsed / this.duration;
        for (const car of this.cars.values()) if (!car.retired) car.current = car.from + (car.target - car.from) * f;
    }
    progress(id: string) { return this.cars.get(id)?.current ?? 0; }
    get pending() { return this.mode !== 'paused' && [...this.cars.values()].some(c => !c.retired && c.current < c.target - 1e-10); }
}

import type { prepareCircuitPath } from '../../../game/domain/circuit-geometry';
export interface VisualTimeMap { time(progress: number): number; progress(time: number): number }
/** Uniform distance samples, never source vertex density. Periodic smoothing bounds visual contrast to 2.2:1. */
export function prepareVisualSpeed(path: ReturnType<typeof prepareCircuitPath>, contrast = 1) {
    const count = 512, window = 4;
    const points = Array.from({ length: count }, (_, i) => path.sample(i / count));
    const bend = points.map((p, i) => {
        const a = points[(i - window + count) % count], b = points[(i + window) % count];
        const u = Math.atan2(p.y - a.y, p.x - a.x), v = Math.atan2(b.y - p.y, b.x - p.x);
        return Math.abs(Math.atan2(Math.sin(v - u), Math.cos(v - u)));
    });
    const velocities = bend.map((_, i) => {
        let sum = 0, weight = 0;
        for (let j = -8; j <= 8; j++) { const w = 9 - Math.abs(j); sum += bend[(i + j + count) % count] * w; weight += w; }
        return 1 / (1 + Math.min(1.2, sum / weight * 2.5) * contrast);
    });
    const cumulative = [0];
    for (const v of velocities) cumulative.push(cumulative.at(-1)! + 1 / v / count);
    const total = cumulative[count];
    for (let i = 0; i <= count; i++) cumulative[i] /= total;
    return { velocities, cumulative,
        time(p: number) {
            const lap = Math.floor(p), x = (p - lap) * count, i = Math.min(count - 1, Math.floor(x));
            return lap + cumulative[i] + (cumulative[i + 1] - cumulative[i]) * (x - i);
        },
        progress(t: number) {
            const lap = Math.floor(t), f = t - lap;
            let lo = 0, hi = count - 1;
            while (lo < hi) { const mid = (lo + hi) >>> 1; if (cumulative[mid + 1] <= f) lo = mid + 1; else hi = mid; }
            return lap + (lo + (f - cumulative[lo]) / (cumulative[lo + 1] - cumulative[lo])) / count;
        },
    };
}

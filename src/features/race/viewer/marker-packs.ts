/** Ephemeral presentation layout. Progress is read-only; all displacement is along the local normal. */
export const BADGE = { w: 44, h: 24, gap: 4 };
export interface PackCar { id: string; progress: number; x: number; y: number; nx: number; ny: number; tier: number; retired?: boolean }
interface Memory { offset: number; target: number; quiet: number; x: number; y: number }
export function trackClose(a: number, b: number, lapLength: number) {
    const d = Math.abs(a - b) % 1;
    return Math.min(d, 1 - d) * lapLength < Math.min(lapLength * .025, Math.hypot(BADGE.w, BADGE.h) * 1.5);
}
export class MarkerPacks {
    private memory = new Map<string, Memory>();
    get pending() { return [...this.memory.values()].some(m => Math.abs(m.offset - m.target) > .1 || (m.target !== 0 && m.quiet > 0 && m.quiet < 350)); }
    frame(cars: readonly PackCar[], lapLength: number, deltaMs: number, settle = false, scale = 1, reserved: readonly {x:number;y:number;w:number;h:number}[] = []) {
        const width = BADGE.w * scale, height = BADGE.h * scale, gap = BADGE.gap * scale;
        const collides = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.abs(a.x-b.x)<width+gap && Math.abs(a.y-b.y)<height+gap;
        const result = new Map<string, Memory>(), sorted = [...cars].sort((a,b) => a.tier - b.tier || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const group = new Map(cars.map(c => [c.id, c.id]));
        const root = (id: string): string => { while(group.get(id)!==id) id=group.get(id)!; return id; };
        for(let i=0;i<cars.length;i++) for(let j=i+1;j<cars.length;j++) if(trackClose(cars[i].progress,cars[j].progress,lapLength)) group.set(root(cars[j].id),root(cars[i].id));
        for (const car of sorted) {
            const old = this.memory.get(car.id);
            if (car.retired && old) { result.set(car.id, { ...old, target: old.offset, quiet: 0 }); continue; }
            const neighbours = cars.filter(c => c.id !== car.id && root(car.id) === root(c.id) && Math.min(Math.abs(car.progress-c.progress)%1, 1-Math.abs(car.progress-c.progress)%1) < .05);
            const crowded = neighbours.some(c => collides(car,c));
            const quiet = crowded ? 0 : (old?.quiet ?? 0) + deltaMs;
            // Spacing is the support of the upright badge along this normal, with breathing room.
            const spacing = width * Math.abs(car.nx) + height * Math.abs(car.ny) + gap;
            const candidates = [old?.target ?? 0, 0];
            for (let lane = 1; lane <= cars.length; lane++) candidates.push(lane * spacing, -lane * spacing);
            const at = (offset: number) => ({ x: car.x + car.nx * offset, y: car.y + car.ny * offset });
            const free = (offset: number) => {
                const p = at(offset);
                if (p.x < width/2+4 || p.x > 996-width/2 || p.y < height/2+4 || p.y > 646-height/2) return false;
                if (reserved.some(r => p.x+width/2>r.x && p.x-width/2<r.x+r.w && p.y+height/2>r.y && p.y-height/2<r.y+r.h)) return false;
                return neighbours.every(n => { const placed = result.get(n.id); return !placed || !collides(p, {x:n.x+n.nx*placed.target,y:n.y+n.ny*placed.target}); });
            };
            // Prefer nearby lanes, with a two-lane hysteresis penalty for changing a valid remembered lane.
            candidates.sort((a,b) => (Math.abs(a)+(a===old?.target?0:spacing*2))-(Math.abs(b)+(b===old?.target?0:spacing*2)));
            const target = !crowded && quiet >= 350 && free(0) ? 0 : candidates.find(free) ?? old?.target ?? 0;
            // New markers settle once (readable paused grid); subsequent changes transition in the shared RAF.
            const offset = !old || settle ? target : old.offset + (target-old.offset) * (1-Math.exp(-Math.min(50,deltaMs)/45));
            const value = { offset: Math.abs(offset-target) < .1 ? target : offset, target, quiet, ...at(offset) };
            result.set(car.id,value);
        }
        this.memory = result;
        return result;
    }
}
/** Choose the higher WCAG contrast of near-black and white against the team fill. */
export function badgeText(color: string) {
    const channels = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
    const l = channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
    return (l+.05)/.055 > 1.05/(l+.05) ? '#101010' : '#ffffff';
}

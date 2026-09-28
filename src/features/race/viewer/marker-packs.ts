/** Ephemeral presentation layout. Progress is read-only; displacement is strictly along the local normal. */
export const BADGE = { w: 44, h: 24, gap: 4 };
export const MAX_LATERAL_OFFSET = 38;
export type DensityMode = 'NORMAL' | 'COMPACT' | 'DENSE';
export interface PackCar { id: string; progress: number; x: number; y: number; nx: number; ny: number; tier: number; retired?: boolean }
interface Memory { offset: number; target: number; quiet: number; x: number; y: number; footprint: number; density: DensityMode }
const clamp = (n: number) => Math.max(-MAX_LATERAL_OFFSET, Math.min(MAX_LATERAL_OFFSET, n));
const lapGap = (a: number, b: number) => { const d = Math.abs(a-b)%1; return Math.min(d,1-d); };
export function trackClose(a: number, b: number, lapLength: number) {
    return lapGap(a,b)*lapLength < Math.min(lapLength*.025,Math.hypot(BADGE.w,BADGE.h)*1.5);
}
/** Narrow maps must keep text legible without letting badges grow into an unmanageable grid. */
export function responsiveBadgeScale(width: number) { return Math.max(1,Math.min(1.08,750/Math.max(1,width))); }
export function densityMode(localCount: number): DensityMode { return localCount >= 11 ? 'DENSE' : localCount >= 5 ? 'COMPACT' : 'NORMAL'; }
export function badgeFootprint(mode: DensityMode, tier: number) {
    if (tier === 0) return 1;              // selected driver
    if (tier === 1) return .96;             // other player driver
    if (tier === 2) return mode === 'DENSE' ? .94 : 1; // direct battle
    return mode === 'DENSE' ? .74 : mode === 'COMPACT' ? .88 : 1;
}
function intersection(a: {x:number;y:number;w:number;h:number}, b: {x:number;y:number;w:number;h:number}) {
    return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)) * Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
}
export class MarkerPacks {
    private memory = new Map<string, Memory>();
    get pending() { return [...this.memory.values()].some(m => Math.abs(m.offset-m.target)>.1 || (m.target!==0 && m.quiet>0 && m.quiet<350)); }
    frame(cars: readonly PackCar[], lapLength: number, deltaMs: number, settle = false, scale = 1,
        reserved: readonly {x:number;y:number;w:number;h:number}[] = [], otherTrack?: (x:number,y:number,progress:number)=>boolean) {
        const result = new Map<string,Memory>();
        const ordered = [...cars].sort((a,b)=>a.tier-b.tier || (a.id<b.id?-1:a.id>b.id?1:0));
        const group = new Map(cars.map(c=>[c.id,c.id]));
        const root = (id:string):string => { while(group.get(id)!==id) id=group.get(id)!; return id; };
        for(let i=0;i<cars.length;i++) for(let j=i+1;j<cars.length;j++) if(trackClose(cars[i].progress,cars[j].progress,lapLength)) group.set(root(cars[j].id),root(cars[i].id));
        const byId = new Map(cars.map(c=>[c.id,c]));
        for(const car of ordered) {
            const old=this.memory.get(car.id);
            const neighbours=cars.filter(c=>c.id!==car.id && root(c.id)===root(car.id) && lapGap(c.progress,car.progress)<.05);
            const localCount=1+neighbours.filter(c=>trackClose(c.progress,car.progress,lapLength) && Math.hypot(c.x-car.x,c.y-car.y)<90).length;
            const density=densityMode(localCount), footprint=badgeFootprint(density,car.tier);
            const w=BADGE.w*scale*footprint,h=BADGE.h*scale*footprint;
            const at=(offset:number)=>({x:car.x+car.nx*offset,y:car.y+car.ny*offset});
            if(car.retired && old) {
                const offset=clamp(old.offset),p=offset===old.offset?{x:old.x,y:old.y}:at(offset);
                result.set(car.id,{...old,offset,target:offset,quiet:0,...p,footprint,density});
                continue;
            }
            const crowded=neighbours.some(c=>Math.abs(c.x-car.x)<BADGE.w*scale+BADGE.gap && Math.abs(c.y-car.y)<BADGE.h*scale+BADGE.gap);
            const quiet=crowded?0:(old?.quiet??0)+deltaMs;
            // A small fixed envelope: three compact choices per side plus centre. Density may cause controlled overlap.
            const candidates=[0, -12, 12, -24, 24, -38, 38, clamp(old?.target??0)];
            const previous=clamp(old?.target??0);
            const scored=candidates.map(target=>{
                const p=at(target),box={x:p.x-w/2,y:p.y-h/2,w,h};
                let score=Math.abs(target)*.24+(target===previous?-5:0);
                // Bounds are hard whenever a candidate can be kept on-screen.
                const overflow=Math.max(0,4-box.x)+Math.max(0,box.x+box.w-996)+Math.max(0,4-box.y)+Math.max(0,box.y+box.h-646);
                score+=overflow*20;
                for(const n of neighbours){
                    const placed=result.get(n.id);if(!placed)continue;
                    const peer=byId.get(n.id)!,pw=BADGE.w*scale*placed.footprint,ph=BADGE.h*scale*placed.footprint;
                    const centre=atPeer(peer,placed.target), overlap=intersection(box,{x:centre.x-pw/2,y:centre.y-ph/2,w:pw,h:ph});
                    const priority=peer.tier===0?6:peer.tier===1?4:peer.tier===2?2:1;
                    score+=overlap/Math.max(1,Math.min(w* h,pw*ph))*30*priority;
                }
                // The line label can be crowded at a standing start; track association wins over its readability.
                for(const r of reserved) score+=intersection(box,r)/Math.max(1,w*h)*6;
                if(target!==0 && otherTrack?.(p.x,p.y,car.progress)) score+=12;
                return {target,score};
            }).sort((a,b)=>a.score-b.score || Math.abs(a.target)-Math.abs(b.target) || a.target-b.target);
            const target=quiet>=350 && scored.some(c=>c.target===0 && c.score<15) ? 0 : scored[0].target;
            const start=clamp(old?.offset??target);
            const offset=clamp(!old || settle ? target : start+(target-start)*(1-Math.exp(-Math.min(50,deltaMs)/45)));
            result.set(car.id,{offset:Math.abs(offset-target)<.1?target:offset,target,quiet,...at(offset),footprint,density});
        }
        this.memory=result;
        return result;
    }
}
function atPeer(car:PackCar,offset:number){return {x:car.x+car.nx*offset,y:car.y+car.ny*offset};}
/** Choose the higher WCAG contrast of near-black and white against the team fill. */
export function badgeText(color: string) {
    const channels = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
    const l = channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
    return (l+.05)/.055 > 1.05/(l+.05) ? '#101010' : '#ffffff';
}

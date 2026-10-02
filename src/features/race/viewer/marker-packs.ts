/** Ephemeral track-local presentation; authoritative progress is always read-only. */
export const BADGE = { w: 38, h: 24 };
export const RACE_BADGE = { w: 30, h: 16 };
export const MAX_LATERAL_OFFSET = 10;
export interface PackCar { id: string; progress: number; x: number; y: number; nx: number; ny: number; tier: number; retired?: boolean }
interface Memory { offset: number; target: number; x: number; y: number }
const lapGap = (a: number, b: number) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
export function trackClose(a: number, b: number, lapLength: number) {
    return lapGap(a, b) * lapLength < Math.min(lapLength * .025, 50);
}
/** Only nearly coincident cars are staggered. After the three tiny positions fill, overlap is intentional. */
export class MarkerPacks {
    private memory = new Map<string, Memory>();
    get pending() { return [...this.memory.values()].some(m => Math.abs(m.offset - m.target) > .1); }
    frame(cars: readonly PackCar[], lapLength: number, deltaMs: number, settle = false) {
        const ordered = [...cars].sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
        const result = new Map<string, Memory>();
        for (let i = 0; i < ordered.length; i++) {
            const car = ordered[i], old = this.memory.get(car.id);
            if (car.retired && old) { result.set(car.id, { ...old, target: old.offset }); continue; }
            const close = ordered.slice(0, i).filter(peer => trackClose(car.progress, peer.progress, lapLength)
                && Math.hypot(car.x - peer.x, car.y - peer.y) < (old?.target ? 14 : 10)).length;
            const target = close ? (close % 2 ? -MAX_LATERAL_OFFSET : MAX_LATERAL_OFFSET) : 0;
            const offset = !old || settle ? target : old.offset + (target - old.offset) * (1 - Math.exp(-Math.min(50, deltaMs) / 45));
            const fixed = Math.abs(offset - target) < .1 ? target : offset;
            result.set(car.id, { offset: fixed, target, x: car.x + car.nx * fixed, y: car.y + car.ny * fixed });
        }
        this.memory = result;
        return result;
    }
}
/** Compact Race badges stay beside their real track anchor. Five bounded lanes
 * spread a train without moving cars longitudinally or mixing crossing branches. */
export class RaceMarkerPacks {
    constructor(private scale=1) {}
    private memory = new Map<string, Memory>();
    get pending() { return [...this.memory.values()].some(m => Math.abs(m.offset - m.target) > .1); }
    frame(cars: readonly PackCar[], lapLength: number, deltaMs: number, settle = false) {
        const ordered = [...cars].sort((a,b) => a.tier-b.tier || a.id.localeCompare(b.id));
        const result = new Map<string, Memory>();
        for (let i=0;i<ordered.length;i++) {
            const car=ordered[i],old=this.memory.get(car.id);
            const peers=ordered.slice(0,i).filter(peer=>trackClose(car.progress,peer.progress,lapLength));
            const choices=[0,-18,18,-36,36].map(n=>n*this.scale);
            const score=(offset:number)=>{
                const x=car.x+car.nx*offset,y=car.y+car.ny*offset;
                const overlap=peers.reduce((sum,peer)=>{
                    const p=result.get(peer.id)!;
                    return sum+Math.max(0,RACE_BADGE.w*this.scale+2-Math.abs(x-p.x))*Math.max(0,RACE_BADGE.h*this.scale+2-Math.abs(y-p.y));
                },0);
                return overlap*100+Math.abs(offset)+(old ? Math.abs(offset-old.target)*.5 : 0);
            };
            const target=choices.reduce((best,offset)=>score(offset)<score(best)?offset:best,0);
            const offset=!old||settle?target:old.offset+(target-old.offset)*(1-Math.exp(-Math.min(50,deltaMs)/45));
            const fixed=Math.abs(offset-target)<.1?target:offset;
            result.set(car.id,{offset:fixed,target,x:car.x+car.nx*fixed,y:car.y+car.ny*fixed});
        }
        this.memory=result;
        return result;
    }
}
/** Choose the higher WCAG contrast of near-black and white against the team fill. */
export function badgeText(color: string) {
    const channels = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
    const l = channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
    return (l+.05)/.055 > 1.05/(l+.05) ? '#101010' : '#ffffff';
}

/** SVG content grows inversely on narrow maps; identity glyphs retain screen-pixel floors. Race only. */
export function responsiveBadgeScale(svgScale:number,tier:'FIELD'|'PLAYER'|'SELECTED') {
    const scale=Number.isFinite(svgScale)&&svgScale>0?svgScale:1;
    const minimum=tier==='SELECTED'?11:tier==='PLAYER'?10:9;
    return Math.max(1,minimum/(11*scale));
}
export function clampBadgeCenter(x:number,y:number,width:number,height:number,scale:number) {
    const pad=24*scale;return {x:Math.max(pad,Math.min(width-pad,x)),y:Math.max(pad,Math.min(height-pad,y))};
}

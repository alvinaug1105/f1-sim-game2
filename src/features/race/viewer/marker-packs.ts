/** Ephemeral track-local presentation; authoritative progress is always read-only. */
export const BADGE = { w: 38, h: 24 };
/**
 * Race viewer marker: a compact circular team-colour bubble with the abbreviation inside (live-timing map style).
 * `r` is the radius in SVG units at scale 1; the rendered size is held in screen pixels by `raceBubbleScale`.
 */
export const RACE_BUBBLE = { r: 12 };
/** Effective on-screen bubble diameter (CSS px): wide desktop maps, compact (tablet-width) and small (phone-width) maps. */
export const RACE_BUBBLE_PX = { desktop: 26, compact: 23, compactBelowPx: 600, small: 22, smallBelowPx: 420 };
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
/** Race bubbles stay beside their real track anchor. Five bounded lateral lanes (within ~1.5 bubble diameters) spread a
 * dense pack without moving any car longitudinally or mixing crossing branches; partial overlap is accepted rather
 * than pushing cars far from the track. Priority (selected, player, battle) decides who keeps the centre lane. */
export class RaceMarkerPacks {
    constructor(private scale=1) {}
    private memory = new Map<string, Memory>();
    get pending() { return [...this.memory.values()].some(m => Math.abs(m.offset - m.target) > .1); }
    /** Bubble diameter in SVG units at the current scale. */
    get diameter() { return 2*RACE_BUBBLE.r*this.scale; }
    frame(cars: readonly PackCar[], lapLength: number, deltaMs: number, settle = false) {
        const ordered = [...cars].sort((a,b) => a.tier-b.tier || a.id.localeCompare(b.id));
        const result = new Map<string, Memory>(), d = this.diameter, clear = d*.8;
        const choices=[0,-.8,.8,-1.5,1.5].map(n=>n*d);
        for (let i=0;i<ordered.length;i++) {
            const car=ordered[i],old=this.memory.get(car.id);
            const peers=ordered.slice(0,i).filter(peer=>trackClose(car.progress,peer.progress,lapLength));
            const score=(offset:number)=>{
                const x=car.x+car.nx*offset,y=car.y+car.ny*offset;
                const overlap=peers.reduce((sum,peer)=>{ const p=result.get(peer.id)!; return sum+Math.max(0,clear-Math.hypot(x-p.x,y-p.y))**2; },0);
                return overlap*10+Math.abs(offset)+(old ? Math.abs(offset-old.target)*.5 : 0);
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

/**
 * Scale for the Race bubble so it keeps a stable on-screen diameter whatever the rendered map width: `svgScale` is
 * rendered pixels per SVG unit and `mapUnits` the SVG canvas width. Narrow (phone-width) maps use the compact size.
 */
export function raceBubbleScale(svgScale:number,mapUnits=1000) {
    const scale=Number.isFinite(svgScale)&&svgScale>0?svgScale:1;
    const width=scale*mapUnits;
    const px=width<RACE_BUBBLE_PX.smallBelowPx?RACE_BUBBLE_PX.small:width<RACE_BUBBLE_PX.compactBelowPx?RACE_BUBBLE_PX.compact:RACE_BUBBLE_PX.desktop;
    return px/(2*RACE_BUBBLE.r*scale);
}
/** Keep a whole bubble (and its selection ring) inside the canvas. */
export function clampBadgeCenter(x:number,y:number,width:number,height:number,scale:number) {
    const pad=(RACE_BUBBLE.r+5)*scale;return {x:Math.max(pad,Math.min(width-pad,x)),y:Math.max(pad,Math.min(height-pad,y))};
}

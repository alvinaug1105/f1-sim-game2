import type { MapPoint } from './circuit-layout';
export interface PitRoutePoint extends MapPoint { readonly progress: number }
/** Unwrapped microlap anchors from entry through start/finish to exit; coordinates are presentation content. */
export interface PitRouteGeometry { readonly points: readonly PitRoutePoint[]; readonly service: number }
export function validatePitGeometry(g:PitRouteGeometry,entry:number,service:number,exit:number) {
    if(!g||!Array.isArray(g.points)||g.points.length<5||g.points[0].progress!==entry||g.points.at(-1)!.progress!==1000000+exit||g.service!==service||!g.points.some(p=>p.progress===service)) throw new RangeError('Invalid pit geometry bounds');
    for(const [i,p] of g.points.entries()) if(!Number.isSafeInteger(p.progress)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>2||Math.abs(p.y)>2||(i>0&&p.progress<=g.points[i-1].progress)) throw new RangeError('Invalid pit geometry point');
}
export function samplePitRoute(g:PitRouteGeometry,progress:number) {
    const points=g.points, p=progress<points[0].progress?progress+1000000:progress;
    let i=0;while(i<points.length-2&&points[i+1].progress<p)i++;
    const a=points[i],b=points[i+1],f=Math.max(0,Math.min(1,(p-a.progress)/(b.progress-a.progress))),length=Math.hypot(b.x-a.x,b.y-a.y);
    return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,tangentX:length?(b.x-a.x)/length:1,tangentY:length?(b.y-a.y)/length:0};
}

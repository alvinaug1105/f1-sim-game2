import { describe, expect, it, vi } from 'vitest';
import { WebGLRenderer } from 'three';
import { createRenderer } from '../src/features/race/prototype/webgl';
vi.mock('three',()=>({WebGLRenderer:vi.fn(function(){return {kind:'renderer'};})}));
function surface(context:unknown){return {getContext:vi.fn(()=>context)} as unknown as HTMLCanvasElement;}
function context(){return {VERTEX_SHADER:1,FRAGMENT_SHADER:2,HIGH_FLOAT:3,isContextLost:()=>false,getShaderPrecisionFormat:()=>({precision:23}),getExtension:vi.fn(()=>({loseContext:vi.fn()}))};}
describe('WebGL2 preflight and fallback',()=>{
    it('returns fallback when WebGL2 is unavailable',()=>{expect(createRenderer(surface(null))).toBeNull();});
    it('returns fallback for an already lost context',()=>{expect(createRenderer(surface({...context(),isContextLost:()=>true}))).toBeNull();});
    it('releases a partial context with missing shader precision instead of bypassing checks',()=>{
        const loseContext=vi.fn(),gl={...context(),getShaderPrecisionFormat:()=>null,getExtension:()=>({loseContext})};
        expect(createRenderer(surface(gl))).toBeNull();expect(loseContext).toHaveBeenCalledTimes(1);
    });
    it('passes the valid low-power context to Three.js',()=>{
        const gl=context(),canvas=surface(gl);expect(createRenderer(canvas)).not.toBeNull();
        expect(canvas.getContext).toHaveBeenCalledWith('webgl2',expect.objectContaining({powerPreference:'low-power'}));
        expect(WebGLRenderer).toHaveBeenCalledWith({canvas,context:gl,antialias:true,preserveDrawingBuffer:true});
    });
    it('releases the allocated context if renderer construction fails',()=>{
        const loseContext=vi.fn(),gl={...context(),getExtension:()=>({loseContext})};
        vi.mocked(WebGLRenderer).mockImplementationOnce(function(){throw Error('GPU initialization');});
        expect(createRenderer(surface(gl))).toBeNull();expect(loseContext).toHaveBeenCalledTimes(1);
    });
});

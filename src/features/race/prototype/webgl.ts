import { WebGLRenderer } from 'three';

/** This canvas belongs to one effect only. Never reuse a deliberately lost context. */
export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer | null {
    let context: WebGL2RenderingContext | null = null;
    try {
        context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
        if (!context || context.isContextLost()) return null;
        // A missing precision descriptor is an unusable/partially initialized context,
        // not an invitation to bypass GPU capability checks with reduced precision.
        if (!context.getShaderPrecisionFormat(context.VERTEX_SHADER, context.HIGH_FLOAT)
            || !context.getShaderPrecisionFormat(context.FRAGMENT_SHADER, context.HIGH_FLOAT)) {
            context.getExtension('WEBGL_lose_context')?.loseContext(); return null;
        }
        return new WebGLRenderer({ canvas, context, antialias: true, preserveDrawingBuffer: true });
    } catch {
        context?.getExtension('WEBGL_lose_context')?.loseContext(); return null;
    }
}

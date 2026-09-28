/** Lap-zero presentation only. The Race's saved grid and entrant progress are never modified. */
export const GRID_STEP = 14; // SVG distance between successive starting positions
export const GRID_SIDE = 9;
export const GRID_LAUNCH_LAPS = .3;
export interface GridSlot { progress: number; lateral: number; sourceProgress: number }
export function gridSlot(gridPosition: number, sourceProgress: number, lapLength: number): GridSlot {
    const index = Math.max(0, Math.floor(gridPosition) - 1);
    return {
        progress: Math.min(sourceProgress, -index * GRID_STEP / lapLength),
        lateral: index % 2 ? -GRID_SIDE : GRID_SIDE,
        sourceProgress,
    };
}
/** Converges monotonically from the drawn grid to live track progress during the first launch. */
export function gridDisplay(slot: GridSlot, liveProgress: number, checkpoint: number) {
    const moved = checkpoint === 0 ? 0 : Math.max(0, liveProgress - slot.sourceProgress);
    const blend = 1 - Math.min(1, moved / GRID_LAUNCH_LAPS);
    return { progress: liveProgress + (slot.progress - slot.sourceProgress) * blend, lateral: blend ? slot.lateral * blend : 0 };
}

export interface MapPoint {
    readonly x: number;
    readonly y: number;
}
export interface CircuitMapLayout {
    readonly id: string;
    readonly points: readonly MapPoint[];
    readonly startFinishProgress: number;
    readonly direction: "CLOCKWISE" | "COUNTER_CLOCKWISE";
}

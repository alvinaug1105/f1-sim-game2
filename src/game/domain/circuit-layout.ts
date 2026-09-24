export interface MapPoint { readonly x: number; readonly y: number }
/** Points use one uniform unit on BOTH axes. Stored order is racing direction. */
export interface CircuitMapLayout {
    readonly id: string;
    readonly points: readonly MapPoint[];
    readonly startFinishProgress: number;
    readonly direction: "CLOCKWISE" | "COUNTER_CLOCKWISE" | "FIGURE_EIGHT";
    readonly closed?: true;
    readonly metadata?: {
        readonly source: string;
        readonly revision: string;
        readonly rotationDegrees: number;
        readonly realGeometry: boolean;
    };
}

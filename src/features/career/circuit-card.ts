import { layoutForCircuit, fallbackLayout } from "../../data/seed/circuit-layouts";
import { circuitProjection, pointAtProgress } from "../../game/domain/circuit-geometry";
import { sprintLapCount } from "../race/development-profiles";
import type { CareerCircuit } from "../../game/domain/career";
import type { WeekendFormat } from "../../game/domain/content";
import { OUTLINE_VIEWBOX } from "./circuit-geometry-box";
/**
 * Circuit facts card (UIX-A REDO) — computed on the server so the page ships an SVG path string, not geometry data.
 * Only real data: the Career circuit's length, scheduled laps and location, and the real track outline (bacinger
 * geometry, MIT) when one exists. A circuit without real geometry gets no outline rather than a schematic stand-in.
 */
export interface CircuitCard {
  readonly name: string;
  readonly city: string | null;
  readonly countryCode: string;
  readonly lengthMeters: number;
  readonly laps: number;
  /** Sprint distance in laps on a Sprint weekend (the same rule the Sprint itself uses); null otherwise. */
  readonly sprintLaps: number | null;
  /** Scheduled Grand Prix distance in metres (length × laps). */
  readonly distanceMeters: number;
  readonly direction: "CLOCKWISE" | "COUNTER_CLOCKWISE" | "FIGURE_EIGHT" | null;
  /** SVG path in a 240 × 160 view box, with the start/finish point; null without real geometry. */
  readonly outline: { readonly path: string; readonly start: { readonly x: number; readonly y: number } } | null;
}
const round1 = (n: number) => Math.round(n * 10) / 10;
export function circuitCard(circuit: CareerCircuit, format: WeekendFormat): CircuitCard {
  const layout = layoutForCircuit(circuit.sourceCircuitId);
  const real = layout !== fallbackLayout && Boolean(layout.metadata?.realGeometry);
  let outline: CircuitCard["outline"] = null;
  if (real) {
    const project = circuitProjection(layout.points, OUTLINE_VIEWBOX.width, OUTLINE_VIEWBOX.height, 12);
    const points = layout.points.map(project);
    const path = `M${points.map((p) => `${round1(p.x)} ${round1(p.y)}`).join("L")}Z`;
    const s = project(pointAtProgress(layout, 0));
    outline = { path, start: { x: round1(s.x), y: round1(s.y) } };
  }
  return {
    name: circuit.name,
    city: circuit.city,
    countryCode: circuit.countryCode,
    lengthMeters: circuit.lengthMeters,
    laps: circuit.defaultLapCount,
    sprintLaps: format === "SPRINT" ? sprintLapCount(circuit.lengthMeters) : null,
    distanceMeters: circuit.lengthMeters * circuit.defaultLapCount,
    direction: real ? layout.direction : null,
    outline,
  };
}

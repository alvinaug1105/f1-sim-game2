/**
 * UIX-A REDO icon set: original 24×24 stroke glyphs (no third-party icon font or brand marks). Decorative by default —
 * every icon sits beside visible text, so it is hidden from assistive technology unless a `label` is given.
 */
const paths = {
  hq: "M4 20V10l8-6 8 6v10M9 20v-6h6v6",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  wrench: "M14.5 6.5a4 4 0 0 0 5 5L14 17l-4 4-3-3 4-4 5.5-5.5M14.5 6.5 17 4l3 3-2.5 2.5",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 20h8M9.5 17h5",
  saves: "M4 6h6l2 2h8v11H4V6ZM4 10h16",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5 10 17 19 7",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13v-9Z",
  current: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  chevron: "M9 6l6 6-6 6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 6l-6 6 6 6",
  play: "M8 5.5v13l10-6.5-10-6.5Z",
  simulate: "M4 6v12l7-6-7-6ZM12 6v12l7-6-7-6Z",
  alert: "M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5v.01",
  info: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 11v5.5M12 7.5v.01",
  calendar: "M4 6.5h16V20H4V6.5ZM4 10.5h16M8 4v4M16 4v4",
  circuit: "M6 18c-2 0-3-1.5-2.5-3.5L6 7c.6-2 3-2.4 4.2-.8l1.6 2.2c.8 1 2.3 1 3-.1l.7-1C16.6 5.5 19 6 19.5 8l.9 5.6c.4 2.3-1.3 4.4-3.6 4.4H6Z",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  pause: "M8 5v14M16 5v14",
  step: "M6 5.5v13l8-6.5-8-6.5ZM18 5v14",
  drop: "M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10Z",
  waves: "M3 9c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 15c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0",
  thermo: "M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0ZM12 10v7",
  cloud: "M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.5 4.25 4.25 0 0 0 7 18Z",
  fuel: "M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M3.5 20h12M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M7.5 8h4",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z",
  tyre: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  aero: "M3 9h13a3 3 0 0 0 0-6M3 15h17a3 3 0 0 1 0 6M3 12h9",
  gauge: "M4.5 17a8.5 8.5 0 1 1 15 0M12 13l4-5",
  battle: "M5 5l14 14M19 5 5 19M5 15v4h4M19 15v4h-4",
  ban: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM6 6l12 12",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7.5V12l3 2",
  garage: "M3.5 20V9L12 4l8.5 5v11M7 20v-7h10v7M7 16h10",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 18, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "current" ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={paths[name]} fill={name === "current" ? "currentColor" : undefined} fillRule={name === "current" ? "evenodd" : undefined} />
    </svg>
  );
}

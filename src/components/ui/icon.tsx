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

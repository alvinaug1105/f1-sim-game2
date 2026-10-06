/**
 * Code-drawn interface icons (24-unit grid, stroked). Decorative by default (`aria-hidden`); every place that uses an
 * icon to convey state also renders the state as text.
 */
const paths = {
  home: "M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  car: "M3 15.5h18M5 15.5l1.6-5h10.8l1.6 5M6.5 18.5a1.5 1.5 0 1 0 0-.01M17.5 18.5a1.5 1.5 0 1 0 0-.01M9 10.5 10 7h4l1 3.5",
  trophy: "M8 4h8v4a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3M12 12v4m-4 4h8m-6-4h4v4h-4z",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  check: "M5 12.5 10 17.5 19 7",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13v9h-13z",
  play: "M8 5.5v13l10.5-6.5z",
  dot: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7.5V12l3 2",
  calendar: "M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4",
  arrowRight: "M5 12h13m-5-5 5 5-5 5",
  arrowLeft: "M19 12H6m5-5-5 5 5 5",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  alert: "M12 4 21 19.5H3L12 4ZM12 10v4.5M12 17h.01",
  info: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 11v5M12 8h.01",
  swap: "M7 7h12l-3-3M17 17H5l3 3",
  pin: "M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  gauge: "M4 16a8 8 0 1 1 16 0M12 16l4-5",
  skip: "M6 6l6 6-6 6M13 6l6 6-6 6",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, label, className = "" }: { name: IconName; label?: string; className?: string }) {
  return (
    <svg
      className={`ui-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: false })}
    >
      <path d={paths[name]} />
    </svg>
  );
}

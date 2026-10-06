import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";
/**
 * UIX-A shared presentation primitives. Stateless and data-agnostic: callers pass already-translated text, so the
 * same primitives serve both locales and every future screen (Race Command Centre, standings, management).
 */
export type Tone = "signal" | "positive" | "warning" | "critical" | "info" | "neutral" | "muted";
/** A status chip: icon + text, colour only reinforces the meaning. */
export function StatusBadge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`ui-badge${tone === "neutral" ? "" : ` ui-badge--${tone}`}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}
type ButtonVariant = "primary" | "secondary" | "ghost";
export function buttonClass(variant: ButtonVariant = "primary", large = false) {
  return `ui-button ui-button--${variant}${large ? " ui-button--large" : ""}`;
}
/** Navigation to an existing page, styled as an action. */
export function ButtonLink({ href, variant = "primary", large = false, icon, children }: { href: string; variant?: ButtonVariant; large?: boolean; icon?: IconName; children: ReactNode }) {
  return (
    <Link className={buttonClass(variant, large)} href={href}>
      {children}
      {icon && <Icon name={icon} />}
    </Link>
  );
}
/** One labelled figure inside a `<dl>`. */
export function Stat({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="ui-stat">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
export function Alert({ tone = "info", title, children, role }: { tone?: "info" | "warning" | "critical"; title?: ReactNode; children: ReactNode; role?: "alert" | "status" }) {
  return (
    <div className={`ui-alert${tone === "info" ? "" : ` ui-alert--${tone}`}`} role={role}>
      <Icon name={tone === "info" ? "info" : "alert"} />
      <div>
        {title && <strong>{title}</strong>}
        {title ? <p>{children}</p> : children}
      </div>
    </div>
  );
}
export function Skeleton({ height = 16, width = "100%" }: { height?: number | string; width?: number | string }) {
  return <span className="ui-skeleton" style={{ height, width }} aria-hidden="true" />;
}
/** A segmented progress meter; the textual value must be rendered beside it by the caller. */
export function Meter({ segments }: { segments: readonly ("done" | "current" | "upcoming")[] }) {
  return (
    <span className="ui-meter" aria-hidden="true">
      {segments.map((state, i) => <span key={i} data-state={state} />)}
    </span>
  );
}

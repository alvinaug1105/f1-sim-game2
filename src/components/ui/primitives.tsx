"use client";
import type { ReactNode } from "react";
import { useI18n } from "../../i18n/provider";
import type { SessionStatus } from "../../game/domain/progression";
import { Icon, type IconName } from "./icon";
/** UIX-A REDO shared primitives. State is always icon + text; colour only reinforces it. */
export type Tone = "done" | "current" | "upcoming" | "locked" | "info" | "warn";
export function Module({ title, action, children, className = "", labelledBy }: { title: string; action?: ReactNode; children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section className={`ui-module ${className}`.trim()} aria-labelledby={labelledBy}>
      <header className="ui-module-head">
        <h2 id={labelledBy}>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
const toneIcon: Record<Tone, IconName> = { done: "check", current: "current", upcoming: "calendar", locked: "lock", info: "info", warn: "alert" };
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="ui-status" data-tone={tone}>
      <Icon name={toneIcon[tone]} size={12} />
      {children}
    </span>
  );
}
export function sessionTone(status: SessionStatus): Tone {
  return status === "COMPLETED" ? "done" : status === "AVAILABLE" || status === "IN_PROGRESS" ? "current" : status === "LOCKED" ? "locked" : "upcoming";
}
export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const { t } = useI18n();
  return <StatusBadge tone={sessionTone(status)}>{t(`progression.${status}`)}</StatusBadge>;
}
export function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="ui-stat">
      <dt>{label}</dt>
      <dd>
        {value}
        {unit && <small>{unit}</small>}
      </dd>
    </div>
  );
}
export function Alert({ tone = "info", title, children, role }: { tone?: "info" | "bad"; title?: string; children?: ReactNode; role?: "alert" | "status" }) {
  return (
    <div className="ui-alert" data-tone={tone} role={role}>
      <Icon name={tone === "bad" ? "alert" : "info"} />
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}
export function Skeleton({ height = 16, width = "100%" }: { height?: number | string; width?: number | string }) {
  return <span className="ui-skeleton" style={{ height, width }} aria-hidden="true" />;
}

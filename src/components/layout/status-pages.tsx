"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import { Icon } from "../ui/icon";
import { buttonClass, Skeleton } from "../ui/primitives";
/** Error boundary content (the shell, when present, comes from the surrounding layout). */
export function ErrorContent({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error("Page load failed", error);
  }, [error]);
  return (
    <section role="alert" className="ui-status-page ui-surface">
      <LocalizedPageTitle titleKey="metadata.error" />
      <span className="ui-status-page-mark ui-status-page-mark--critical" aria-hidden="true"><Icon name="alert" /></span>
      <h1>{t("errors.heading")}</h1>
      <p>{t("errors.body")}</p>
      {error.digest && <p className="ui-meta">{t("errors.reference", { reference: error.digest })}</p>}
      <div className="ui-status-page-actions">
        <button type="button" onClick={reset}>{t("errors.retry")}</button>
        <Link className={buttonClass("secondary")} href="/careers">{t("career.back")}</Link>
      </div>
    </section>
  );
}
export function NotFoundContent() {
  const { t } = useI18n();
  return (
    <section className="ui-status-page ui-surface">
      <LocalizedPageTitle titleKey="metadata.notFound" />
      <p className="ui-label">{t("errors.notFoundLabel")}</p>
      <h1>{t("errors.notFoundHeading")}</h1>
      <p>{t("errors.notFoundBody")}</p>
      <div className="ui-status-page-actions">
        <Link className={buttonClass("primary")} href="/">{t("errors.return")}</Link>
      </div>
    </section>
  );
}
/** Neutral skeleton while a Career page loads: the shell stays in place, only the content area waits. */
export function PageSkeleton() {
  const { t } = useI18n();
  return (
    <div className="ui-page-skeleton" role="status" aria-live="polite">
      <span className="sr-only">{t("shell.loading")}</span>
      <Skeleton height={14} width="22%" />
      <Skeleton height={36} width="48%" />
      <Skeleton height={180} />
      <div className="ui-page-skeleton-row">
        <Skeleton height={140} />
        <Skeleton height={140} />
        <Skeleton height={140} />
      </div>
    </div>
  );
}

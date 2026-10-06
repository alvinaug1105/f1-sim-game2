"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import { Icon } from "../ui/icon";
/** UIX-A REDO status states. Content only — the route boundary decides whether the global shell surrounds them. */
export function ErrorContent({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error("Page load failed", error);
  }, [error]);
  return (
    <section role="alert" className="ui-module status-page" data-tone="bad">
      <LocalizedPageTitle titleKey="metadata.error" />
      <Icon name="alert" size={28} className="status-page-icon" />
      <h1>{t("errors.heading")}</h1>
      <p>{t("errors.body")}</p>
      {error.digest && <p className="ui-meta">{t("errors.reference", { reference: error.digest })}</p>}
      <div className="status-page-actions">
        <button type="button" className="ui-btn ui-btn-primary" onClick={reset}>{t("errors.retry")}</button>
        <Link className="ui-btn ui-btn-outline" href="/careers">{t("navigation.careers")}</Link>
      </div>
    </section>
  );
}
export function NotFoundContent() {
  const { t } = useI18n();
  return (
    <section className="ui-module status-page">
      <LocalizedPageTitle titleKey="metadata.notFound" />
      <p className="ui-label">{t("errors.notFoundLabel")}</p>
      <h1>{t("errors.notFoundHeading")}</h1>
      <p>{t("errors.notFoundBody")}</p>
      <div className="status-page-actions">
        <Link className="ui-btn ui-btn-primary" href="/">{t("errors.return")}</Link>
      </div>
    </section>
  );
}

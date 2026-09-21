"use client";
import { useI18n, LocalizedPageTitle } from "@/i18n/provider";
import { useEffect } from "react";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard load failed", error);
  }, [error]);
  const { t } = useI18n();
  return (
    <section role="alert" className="panel error-panel">
      <LocalizedPageTitle titleKey="metadata.error" />
      <h1>{t("errors.heading")}</h1>
      <p>{t("errors.body")}</p>
      {error.digest && (
        <p>{t("errors.reference", { reference: error.digest })}</p>
      )}
      <button onClick={reset}>{t("errors.retry")}</button>
    </section>
  );
}

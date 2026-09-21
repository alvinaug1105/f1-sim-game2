"use client";
import { useI18n, LocalizedPageTitle } from "@/i18n/provider";
import Link from "next/link";
export default function NotFound() {
  const { t } = useI18n();
  return (
    <section className="panel error-panel">
      <p className="eyebrow">{t("errors.notFoundLabel")}</p>
      <LocalizedPageTitle titleKey="metadata.notFound" />
      <h1>{t("errors.notFoundHeading")}</h1>
      <p>{t("errors.notFoundBody")}</p>
      <Link href="/">{t("errors.return")}</Link>
    </section>
  );
}

"use client";
import { useI18n, LanguageSelector } from "@/i18n/provider";
import Link from "next/link";
import type { ReactNode } from "react";
import { APP_CONFIG } from "@/lib/config";
const plannedSections = [
  "navigation.team",
  "navigation.drivers",
  "navigation.car",
  "navigation.calendar",
  "navigation.standings",
] as const;
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t("common.skip")}
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">F/</span>
          <span>
            {t("common.brand")}
            <small>{t("common.brandSub")}</small>
          </span>
        </Link>
        <div className="workspace-label eyebrow">
          {t("navigation.workspace")}
        </div>
        <nav aria-label={t("navigation.primary")}>
          <Link href="/" className="nav-item active">
            <span aria-hidden="true">▦</span> {t("navigation.dashboard")}
          </Link>
          {plannedSections.map((name, i) => (
            <span
              key={name}
              className="nav-item unavailable"
              aria-disabled="true"
            >
              <span className="nav-number" aria-hidden="true">
                0{i + 2}
              </span>
              {t(name)}
              <span className="planned">{t("navigation.planned")}</span>
            </span>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> {t("shell.foundation")}
          <p>{t("shell.tagline")}</p>
          <span className="eyebrow">
            {t("shell.version", { version: APP_CONFIG.version })}
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            {t("shell.workspace")} <span className="slash">/</span>{" "}
            <strong>{t("shell.overview")}</strong>
          </span>
          <span className="environment">
            <span className="status-dot" /> {t("shell.environment")}
          </span>
          <LanguageSelector />
        </header>
        <main id="main">{children}</main>
        <footer className="page-footer">
          <span>{t("common.appName")}</span>
          <span>{t("shell.footer")}</span>
        </footer>
      </div>
    </div>
  );
}

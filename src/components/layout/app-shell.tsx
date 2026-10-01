"use client";
import { useI18n, LanguageSelector } from "../../i18n/provider";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const careerPath = pathname.startsWith("/career/")
    ? pathname.split("/").slice(0, 3).join("/") : null;
  const links = [
    { href: careerPath ?? "/", label: "navigation.dashboard" as const, active: pathname === (careerPath ?? "/") },
    { href: "/careers", label: "navigation.careers" as const, active: pathname.startsWith("/careers") },
    ...(careerPath ? [
      { href: `${careerPath}/car`, label: "navigation.car" as const, active: pathname === `${careerPath}/car` },
      { href: `${careerPath}/standings`, label: "navigation.standings" as const, active: pathname === `${careerPath}/standings` },
    ] : []),
  ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">{t("common.skip")}</a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">F/</span>
          <span>{t("common.brand")}<small>{t("common.brandSub")}</small></span>
        </Link>
        <div className="workspace-label eyebrow">{t("navigation.workspace")}</div>
        <nav aria-label={t("navigation.primary")}>
          {links.map(link => <Link key={link.href} href={link.href}
            className={`nav-item${link.active ? " active" : ""}`} aria-current={link.active ? "page" : undefined}>
            {t(link.label)}
          </Link>)}
        </nav>
        <div className="sidebar-footer"><p>{t("shell.tagline")}</p></div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <strong>{t("common.appName")}</strong>
          <LanguageSelector />
        </header>
        <main id="main">{children}</main>
        <footer className="page-footer"><span>{t("common.appName")}</span><span>{t("shell.tagline")}</span></footer>
      </div>
    </div>
  );
}

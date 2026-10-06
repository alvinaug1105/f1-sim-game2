"use client";
import { useI18n, LanguageSelector } from "../../i18n/provider";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { TranslationKey } from "../../i18n/catalog";
import type { CareerShellContext } from "../../features/career/shell-context";
import { Icon, type IconName } from "../ui/icon";
import { Meter } from "../ui/primitives";
interface NavLink {
  readonly href: string;
  readonly label: TranslationKey;
  readonly icon: IconName;
  readonly active: boolean;
}
/**
 * Global application shell (UIX-A). A persistent left rail (identity + navigation) and a slim top bar (where you are,
 * season context, language). Inside a Career the server layout supplies `career` context; without it (e.g. a Career
 * whose data could not be read) navigation still works from the URL alone. Only real, playable destinations are linked.
 */
export function AppShell({ children, career = null }: { children: ReactNode; career?: CareerShellContext | null }) {
  const { t, format } = useI18n();
  const pathname = usePathname();
  // The compact menu belongs to the page it was opened on: navigating elsewhere closes it; so does Escape.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const setMenuOpen = (open: boolean) => setMenuPath(open ? pathname : null);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuPath(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  const careerPath = pathname.startsWith("/career/") ? pathname.split("/").slice(0, 3).join("/") : null;
  const weekendPath = career?.activeEvent && careerPath ? `${careerPath}/events/${career.activeEvent.id}` : null;
  const section = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const links: NavLink[] = careerPath
    ? [
        { href: careerPath, label: "navigation.commandCentre", icon: "home", active: pathname === careerPath },
        ...(weekendPath ? [{ href: weekendPath, label: "navigation.raceWeekend" as const, icon: "flag" as const, active: section(weekendPath) }] : []),
        { href: `${careerPath}/car`, label: "navigation.car", icon: "car", active: section(`${careerPath}/car`) },
        { href: `${careerPath}/standings`, label: "navigation.standings", icon: "trophy", active: section(`${careerPath}/standings`) },
      ]
    : [{ href: "/", label: "navigation.home", icon: "home", active: pathname === "/" }];
  const gameLinks: NavLink[] = [{ href: "/careers", label: "navigation.careers", icon: "list", active: pathname.startsWith("/careers") }];
  const current = [...links, ...gameLinks].find((link) => link.active);
  const style = career?.team.color ? ({ "--team-accent": career.team.color } as CSSProperties) : undefined;
  const navItem = (link: NavLink) => (
    <Link key={link.href} href={link.href} className={`nav-item${link.active ? " active" : ""}`} aria-current={link.active ? "page" : undefined}>
      <Icon name={link.icon} />
      <span>{t(link.label)}</span>
    </Link>
  );
  return (
    <div className="shell" style={style} data-menu-open={menuOpen ? "true" : undefined}>
      <a className="skip-link" href="#main">{t("common.skip")}</a>
      <aside className="shell-rail" id="shell-rail" aria-label={t("shell.railLabel")}>
        <Link href="/" className="shell-brand">
          <span className="shell-brand-mark" aria-hidden="true">F/</span>
          <span className="shell-brand-text">{t("common.brand")}<small>{t("common.brandSub")}</small></span>
        </Link>
        {career && (
          <div className="shell-team">
            <span className="shell-team-mark" aria-hidden="true">{career.team.shortName.slice(0, 3).toUpperCase()}</span>
            <span className="shell-team-text">
              <span className="ui-label">{t("shell.yourTeam")}</span>
              <strong>{career.team.name}</strong>
              <span className="shell-team-career">{career.careerName}</span>
            </span>
          </div>
        )}
        <nav aria-label={t("navigation.primary")} className="shell-nav">
          <p className="shell-nav-group ui-label">{t(careerPath ? "navigation.workspace" : "navigation.game")}</p>
          {links.map(navItem)}
          <p className="shell-nav-group ui-label">{t("navigation.game")}</p>
          {gameLinks.map(navItem)}
        </nav>
        <p className="shell-rail-foot">{t("shell.tagline")}</p>
      </aside>
      <button type="button" className="shell-scrim" aria-hidden="true" tabIndex={-1} onClick={() => setMenuOpen(false)} />
      <div className="shell-main">
        <header className="shell-topbar">
          <button type="button" className="shell-menu-button" aria-expanded={menuOpen} aria-controls="shell-rail" onClick={() => setMenuOpen(!menuOpen)}>
            <Icon name={menuOpen ? "close" : "menu"} />
            <span className="sr-only">{t(menuOpen ? "shell.closeMenu" : "shell.openMenu")}</span>
          </button>
          <div className="shell-location">
            <span className="shell-location-root">{career ? career.careerName : t("common.appName")}</span>
            {current && (
              <>
                <Icon name="arrowRight" className="shell-location-sep" />
                <span className="shell-location-section">{t(current.label)}</span>
              </>
            )}
          </div>
          {career && (
            <div className="shell-season">
              <span className="shell-season-text">
                <span className="ui-label">{career.seasonName}</span>
                <span className="ui-meta num">
                  {t("shell.roundsComplete", { completed: format.number(career.completedRounds), total: format.number(career.totalRounds) })}
                </span>
              </span>
              <Meter segments={Array.from({ length: Math.min(career.totalRounds, 30) }, (_, i) => i < career.completedRounds ? "done" : career.activeEvent && i === career.completedRounds ? "current" : "upcoming")} />
              <span className="shell-date ui-meta num">
                <Icon name="calendar" />
                {format.date(new Date(career.currentDate), { dateStyle: "medium" })}
              </span>
            </div>
          )}
          <LanguageSelector />
        </header>
        <main id="main" className="shell-content">{children}</main>
        <footer className="page-footer">
          <span>{t("common.appName")}</span>
          <span>{t("shell.tagline")}</span>
        </footer>
      </div>
    </div>
  );
}

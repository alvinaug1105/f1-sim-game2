"use client";
import { useI18n, LanguageSelector } from "../../i18n/provider";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { TranslationKey } from "../../i18n/catalog";
import type { ShellCareer } from "../../features/career/shell-context";
import { Icon, type IconName } from "../ui/icon";
import { teamStyle } from "../ui/team-color";
interface NavLink {
  readonly href: string;
  readonly label: TranslationKey;
  readonly icon: IconName;
  readonly active: boolean;
  readonly live?: boolean;
}
interface NavGroup {
  readonly label: TranslationKey;
  readonly links: readonly NavLink[];
}
const sessionSegments: Record<string, TranslationKey> = {
  qualifying: "progression.QUALIFYING",
  "sprint-qualifying": "progression.SPRINT_QUALIFYING",
  sprint: "progression.SPRINT",
  race: "progression.RACE",
  results: "championship.weekendResults",
};
/**
 * Global shell (UIX-A REDO): a grouped navigation rail (Headquarters / Engineering / Championship / Game) with the
 * player's team identity, and a context bar (breadcrumb, season, round position, date, language). Career links come
 * from the URL so the shell always works; the optional Career context adds identity and the live Race Weekend link.
 */
export function AppShell({ children, career = null }: { children: ReactNode; career?: ShellCareer | null }) {
  const { t, format } = useI18n();
  const pathname = usePathname();
  const careerPath = pathname.startsWith("/career/") ? pathname.split("/").slice(0, 3).join("/") : null;
  const context = career && careerPath === `/career/${career.id}` ? career : null;
  const weekendPath = context?.activeEvent && careerPath ? `${careerPath}/events/${context.activeEvent.id}` : null;
  const groups: NavGroup[] = careerPath
    ? [
        {
          label: "shell.group.headquarters",
          links: [
            { href: careerPath, label: "navigation.commandCentre", icon: "hq", active: pathname === careerPath },
            ...(weekendPath
              ? [{ href: weekendPath, label: "navigation.raceWeekend" as const, icon: "flag" as const, active: pathname.startsWith(weekendPath), live: true }]
              : []),
          ],
        },
        { label: "shell.group.engineering", links: [{ href: `${careerPath}/car`, label: "navigation.car", icon: "wrench", active: pathname === `${careerPath}/car` }] },
        { label: "shell.group.championship", links: [{ href: `${careerPath}/standings`, label: "navigation.standings", icon: "trophy", active: pathname === `${careerPath}/standings` }] },
        { label: "shell.group.game", links: [{ href: "/careers", label: "navigation.careers", icon: "saves", active: false }] },
      ]
    : [
        { label: "shell.group.headquarters", links: [{ href: "/", label: "navigation.home", icon: "hq", active: pathname === "/" }] },
        { label: "shell.group.game", links: [{ href: "/careers", label: "navigation.careers", icon: "saves", active: pathname.startsWith("/careers") }] },
      ];
  const crumbs = breadcrumb(pathname, careerPath, context, t);
  // The drawer belongs to the page it was opened on: navigating closes it without an effect.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === pathname;
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) closeButton.current?.focus();
    else if (wasOpen.current) menuButton.current?.focus();
    wasOpen.current = open;
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuPath(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const style = context ? (teamStyle(context.teamColor) as CSSProperties) : undefined;
  return (
    <div className="app-shell" data-menu={open ? "open" : "closed"} style={style}>
      <a className="skip-link" href="#main">{t("common.skip")}</a>
      <div className="shell-scrim" aria-hidden="true" onClick={() => setMenuPath(null)} />
      <aside className="sidebar shell-rail" id="shell-rail" aria-label={t("shell.rail")}>
        <div className="shell-brand-row">
          <Link href="/" className="brand shell-brand">
            <span className="shell-brand-mark" aria-hidden="true">F/O</span>
            <span className="shell-brand-text"><strong>{t("common.brand")}</strong><small>{t("common.brandSub")}</small></span>
          </Link>
          <button ref={closeButton} type="button" className="shell-close" aria-label={t("shell.closeMenu")} onClick={() => setMenuPath(null)}>
            <Icon name="close" />
          </button>
        </div>
        {context && (
          <div className="shell-team">
            <span className="shell-team-mark" aria-hidden="true">{context.teamShortName}</span>
            <div className="shell-team-text">
              <strong>{context.teamName}</strong>
              <span>{context.name}</span>
            </div>
          </div>
        )}
        <nav className="shell-nav" aria-label={t("navigation.primary")}>
          {groups.map((group) => (
            <div key={group.label}>
              <p className="shell-nav-label" id={`nav-${group.label}`}>{t(group.label)}</p>
              <ul className="shell-nav-group" aria-labelledby={`nav-${group.label}`}>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={`nav-item${link.active ? " active" : ""}`} aria-current={link.active ? "page" : undefined}>
                      <Icon name={link.icon} />
                      <span>{t(link.label)}</span>
                      {link.live && <span className="shell-nav-live">{t("shell.live")}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {context && (
          <div className="shell-rail-foot">
            <span>{t("shell.season")}</span>
            <strong>{context.seasonName}</strong>
          </div>
        )}
      </aside>
      <div className="shell-workspace">
        <header className="shell-bar">
          <button ref={menuButton} type="button" className="shell-menu-btn" aria-label={t("shell.openMenu")} aria-expanded={open}
            aria-controls="shell-rail" onClick={() => setMenuPath(pathname)}>
            <Icon name="menu" />
          </button>
          <nav className="shell-crumbs" aria-label={t("shell.breadcrumb")}>
            <ol>
              {crumbs.map((crumb, i) => (
                <li key={`${i}-${crumb.label}`}>
                  {i === crumbs.length - 1 ? <span aria-current="page">{crumb.label}</span> : <Link href={crumb.href!}>{crumb.label}</Link>}
                </li>
              ))}
            </ol>
          </nav>
          {context && (
            <div className="shell-context">
              <div className="shell-context-item shell-context-season">
                <span className="ui-label">{t("shell.season")}</span>
                <strong>{context.seasonName}</strong>
              </div>
              {context.round !== null && (
                <div className="shell-context-item">
                  <span className="ui-label">{t("shell.round")}</span>
                  <strong>{t("shell.roundOf", { round: format.number(context.round), total: format.number(context.totalRounds) })}</strong>
                  <span className="shell-round-strip" aria-hidden="true">
                    {context.rounds.map((state, i) => <i key={i} data-state={state} />)}
                  </span>
                </div>
              )}
              <div className="shell-context-item shell-context-date">
                <span className="ui-label">{t("shell.date")}</span>
                <strong>{format.date(new Date(context.currentDate), { dateStyle: "medium" })}</strong>
              </div>
            </div>
          )}
          <LanguageSelector />
        </header>
        <main id="main" className="shell-main">{children}</main>
      </div>
    </div>
  );
}
type Crumb = { readonly label: string; readonly href?: string };
function breadcrumb(
  pathname: string,
  careerPath: string | null,
  context: ShellCareer | null,
  t: (key: TranslationKey) => string,
): Crumb[] {
  if (!careerPath) {
    if (pathname === "/careers/new") return [{ label: t("navigation.careers"), href: "/careers" }, { label: t("career.new") }];
    if (pathname.startsWith("/careers")) return [{ label: t("navigation.careers") }];
    return [{ label: t("navigation.home") }];
  }
  const root: Crumb = { label: context?.name ?? t("navigation.commandCentre"), href: careerPath };
  const rest = pathname.slice(careerPath.length).split("/").filter(Boolean);
  if (rest.length === 0) return context ? [root, { label: t("navigation.commandCentre") }] : [{ label: t("navigation.commandCentre") }];
  if (rest[0] === "car") return [root, { label: t("navigation.car") }];
  if (rest[0] === "standings") return [root, { label: t("navigation.standings") }];
  if (rest[0] === "events" && rest[1]) {
    const hub = `${careerPath}/events/${rest[1]}`;
    const name = context?.activeEvent?.id === rest[1] ? context.activeEvent.name : t("navigation.raceWeekend");
    if (rest.length === 2) return [root, { label: name }];
    const sessionType = rest[2] === "practice" && rest[3] ? context?.activeEvent?.sessions[rest[3]] : undefined;
    const sub = sessionType ? t(`progression.${sessionType}`) : sessionSegments[rest[2]] ? t(sessionSegments[rest[2]]) : rest[2] === "practice" ? t("practice.title") : null;
    return sub ? [root, { label: name, href: hub }, { label: sub }] : [root, { label: name }];
  }
  return [root];
}

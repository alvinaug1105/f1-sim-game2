"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import { Icon } from "../../components/ui/icon";
import { ButtonLink, Meter, Stat, StatusBadge } from "../../components/ui/primitives";
import { TransitionControl } from "./progression-views";
import { CircuitFacts, dateRange, Finishes, sessionIcon, type I18n } from "./presentation";
import type { CalendarRound, CommandCentreModel, Mission } from "./command-centre";
/**
 * Career Command Centre (UIX-A): the team headquarters overview. Hierarchy — 1. the current mission (live weekend or
 * next event, with the one action that moves the Career forward), 2. championship situation and drivers, 3. season
 * context and recent form. Every action is an existing link or progression control.
 */
export function CommandCentreView({ model }: { model: CommandCentreModel }) {
  const i18n = useI18n();
  const { t } = i18n;
  const style = model.team.color ? ({ "--team-accent": model.team.color } as CSSProperties) : undefined;
  return (
    <div className="cc" style={style}>
      <LocalizedPageTitle titleKey="metadata.career" />
      <header className="cc-header ui-enter">
        <div className="cc-identity">
          <p className="ui-label">{t("commandCentre.eyebrow")}</p>
          <h1>{model.team.name}</h1>
          <p className="ui-meta">{model.careerName} · {model.seasonName}</p>
        </div>
        <div className="cc-header-actions">
          <ButtonLink href={`/career/${model.careerId}/car`} variant="secondary" icon="car">{t("car.heading")}</ButtonLink>
        </div>
      </header>
      <MissionPanel model={model} i18n={i18n} />
      <div className="cc-grid">
        <ChampionshipPanel model={model} i18n={i18n} />
        <DriversPanel model={model} i18n={i18n} />
        <SeasonPanel model={model} i18n={i18n} />
        <RecentPanel model={model} i18n={i18n} />
        <CalendarPanel model={model} i18n={i18n} />
      </div>
    </div>
  );
}
function MissionPanel({ model, i18n }: { model: CommandCentreModel; i18n: I18n }) {
  const { t, format } = i18n;
  const mission: Mission = model.mission;
  if (mission.kind === "COMPLETE")
    return (
      <section className="cc-mission ui-surface ui-surface--raised ui-surface--cut ui-enter" aria-labelledby="cc-mission-title">
        <div className="cc-mission-main">
          <StatusBadge tone="positive" icon="check">{t("championship.seasonComplete")}</StatusBadge>
          <h2 id="cc-mission-title" className="cc-mission-title">{t("progression.calendarComplete")}</h2>
          <p className="cc-mission-meta">{t("progression.calendarBody")}</p>
          <div className="cc-mission-actions">
            <ButtonLink href={`/career/${model.careerId}/standings`} large icon="arrowRight">{t("championship.open")}</ButtonLink>
          </div>
        </div>
      </section>
    );
  const { event } = mission;
  const live = mission.kind === "ACTIVE";
  return (
    <section className="cc-mission ui-surface ui-surface--raised ui-surface--cut ui-enter" aria-labelledby="cc-mission-title">
      <div className="cc-mission-main">
        <div className="cc-mission-tags">
          {live
            ? <StatusBadge tone="signal" icon="play">{t("commandCentre.liveWeekend")}</StatusBadge>
            : <StatusBadge tone="info" icon="flag">{t("commandCentre.nextEvent")}</StatusBadge>}
          <StatusBadge>{t(`progression.format.${event.format}`)}</StatusBadge>
        </div>
        <p className="ui-label cc-mission-round">{t("career.round", { round: format.number(event.round) })} · {dateRange(i18n, event.startDate, event.endDate)}</p>
        <h2 id="cc-mission-title" className="cc-mission-title">{event.name}</h2>
        <p className="cc-mission-meta"><Icon name="pin" /> {event.circuitName}</p>
        {mission.kind === "ACTIVE" && mission.sessions.length > 0 && (
          <ol className="cc-steps" aria-label={t("progression.sessions")}>
            {mission.sessions.map((s) => (
              <li key={s.id} className="cc-step" data-status={s.status} aria-current={mission.current?.id === s.id ? "step" : undefined}>
                <Icon name={sessionIcon(s.status)} />
                <span>{t(`progression.${s.type}`)}</span>
                <span className="sr-only"> — {t(`progression.${s.status}`)}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="cc-mission-actions">
          {mission.kind === "ACTIVE" ? (
            <>
              <ButtonLink href={`/career/${model.careerId}/events/${event.id}`} large icon="arrowRight">{t("progression.open")}</ButtonLink>
              <p className="ui-meta">
                {mission.current
                  ? t("commandCentre.nextSessionValue", { session: t(`progression.${mission.current.type}`), status: t(`progression.${mission.current.status}`) })
                  : t("commandCentre.weekendDone")}
              </p>
            </>
          ) : (
            <>
              <TransitionControl careerId={model.careerId} eventId={event.id} intent="advance" />
              <p className="ui-meta">{t("commandCentre.advanceHint")}</p>
            </>
          )}
        </div>
      </div>
      {event.circuit && (
        <aside className="cc-mission-side" aria-label={t("commandCentre.circuit")}>
          <p className="ui-label">{t("commandCentre.circuit")}</p>
          <CircuitFacts circuit={event.circuit} />
        </aside>
      )}
    </section>
  );
}
function points(i18n: I18n, units: number) {
  return i18n.t("championship.pointsValue", { points: i18n.format.number(units / 2, { maximumFractionDigits: 1 }) });
}
function ChampionshipPanel({ model, i18n }: { model: CommandCentreModel; i18n: I18n }) {
  const { t, format } = i18n;
  const c = model.championship;
  const standings = `/career/${model.careerId}/standings`;
  const leader = c?.constructorLeaders[0];
  return (
    <section className="cc-panel cc-championship ui-surface" aria-labelledby="cc-championship-title">
      <div className="ui-section-head">
        <h2 id="cc-championship-title">{t("dashboard.championship")}</h2>
        {c?.seasonComplete && <StatusBadge tone="positive" icon="check">{t("championship.seasonComplete")}</StatusBadge>}
      </div>
      {!c ? (
        <p className="ui-empty">{t("commandCentre.championshipUnavailable")}</p>
      ) : !c.through || !c.playerTeam ? (
        <div className="ui-empty">
          <strong>{t("championship.noResults")}</strong>
          <span>{t("championship.noResultsBody")}</span>
        </div>
      ) : (
        <>
          <p className="ui-meta">
            {t(c.through.stage === "SPRINT" ? "championship.afterSprint" : "championship.afterRound", { round: format.number(c.through.round), event: c.through.eventName })}
          </p>
          <div className="cc-standing">
            <p className="cc-standing-figure">
              <span className="ui-label">{t("commandCentre.constructorsPosition")}</span>
              <span className="ui-figure">
                {t("championship.positionValue", { position: format.number(c.playerTeam.position) })}
                {c.playerTeam.tied && <span className="sr-only"> ({t("championship.tied")})</span>}
              </span>
            </p>
            <dl className="cc-standing-facts">
              <Stat label={t("championship.points")}>{points(i18n, c.playerTeam.units)}</Stat>
              <Stat label={t("commandCentre.gap")}>
                {leader && leader.team.id === c.playerTeam.team.id
                  ? <StatusBadge tone="signal" icon="trophy">{t("commandCentre.leading")}</StatusBadge>
                  : leader
                    ? t("commandCentre.pointsBehind", { points: format.number((leader.units - c.playerTeam.units) / 2, { maximumFractionDigits: 1 }) })
                    : "—"}
              </Stat>
            </dl>
          </div>
          {c.driverLeaders.length > 0 && (
            <p className="ui-meta">
              {t(c.seasonComplete ? "championship.driversChampion" : "commandCentre.driversLeader")}: {c.driverLeaders.map((l) => `${l.driver.name} · ${points(i18n, l.units)}`).join(" / ")}
            </p>
          )}
        </>
      )}
      <Link className="ui-button ui-button--ghost cc-panel-link" href={standings}>{t("championship.open")} <Icon name="arrowRight" /></Link>
    </section>
  );
}
function DriversPanel({ model, i18n }: { model: CommandCentreModel; i18n: I18n }) {
  const { t, format } = i18n;
  const drivers = model.championship?.playerDrivers ?? [];
  const scored = !!model.championship?.through;
  return (
    <section className="cc-panel cc-drivers ui-surface" aria-labelledby="cc-drivers-title">
      <div className="ui-section-head"><h2 id="cc-drivers-title">{t("championship.playerDrivers")}</h2></div>
      {drivers.length === 0 ? (
        <p className="ui-empty">{t("commandCentre.championshipUnavailable")}</p>
      ) : (
        <ul className="cc-driver-list">
          {drivers.map((d) => (
            <li key={d.driver.id} className="cc-driver">
              <span className="cc-driver-number num" aria-hidden="true">{d.driver.carNumber ?? "—"}</span>
              <span className="cc-driver-text">
                <strong>{d.driver.name}</strong>
                <span className="ui-meta">
                  {d.driver.abbreviation}
                  {d.driver.carNumber !== null && <span className="sr-only"> · {t("commandCentre.carNumber", { number: format.number(d.driver.carNumber) })}</span>}
                </span>
              </span>
              <span className="cc-driver-standing">
                <strong className="num">{scored ? t("championship.positionValue", { position: format.number(d.position) }) : "—"}{d.tied && <span className="sr-only"> ({t("championship.tied")})</span>}</strong>
                <span className="ui-meta num">{points(i18n, d.units)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function SeasonPanel({ model, i18n }: { model: CommandCentreModel; i18n: I18n }) {
  const { t, format } = i18n;
  const live = model.mission.kind === "ACTIVE";
  return (
    <section className="cc-panel cc-season ui-surface" aria-labelledby="cc-season-title">
      <div className="ui-section-head"><h2 id="cc-season-title">{t("progression.progress")}</h2></div>
      <p className="cc-season-count"><span className="ui-figure num">{format.number(model.completedRounds)}</span><span className="ui-meta"> / {format.number(model.totalRounds)}</span></p>
      <p className="ui-meta">{t("progression.count", { completed: format.number(model.completedRounds), total: format.number(model.totalRounds) })}</p>
      <Meter segments={Array.from({ length: model.totalRounds }, (_, i) => i < model.completedRounds ? "done" : live && i === model.completedRounds ? "current" : "upcoming")} />
      <dl className="cc-facts">
        <Stat label={t("career.currentSeason")}>{model.seasonName}</Stat>
        <Stat label={t("career.currentDate")}>{format.date(new Date(model.currentDate), { dateStyle: "long" })}</Stat>
      </dl>
    </section>
  );
}
function RecentPanel({ model, i18n }: { model: CommandCentreModel; i18n: I18n }) {
  const { t, format } = i18n;
  return (
    <section className="cc-panel cc-recent ui-surface" aria-labelledby="cc-recent-title">
      <div className="ui-section-head"><h2 id="cc-recent-title">{t("commandCentre.recent")}</h2></div>
      {!model.championship ? (
        <p className="ui-empty">{t("commandCentre.championshipUnavailable")}</p>
      ) : model.recent.length === 0 ? (
        <p className="ui-empty">{t("commandCentre.noRecent")}</p>
      ) : (
        <ul className="cc-results">
          {model.recent.map((r) => (
            <li key={r.eventId} className="cc-result">
              <Link href={`/career/${model.careerId}/events/${r.eventId}/results`} className="cc-result-event">
                <span className="ui-label num">{t("championship.roundShort", { round: format.number(r.round) })}</span>
                <strong>{r.name}</strong>
              </Link>
              <div className="cc-result-rows">
                {r.sprint && (
                  <p className="cc-result-row"><span className="ui-meta">{t("championship.sprint")}</span><Finishes finishes={r.sprint} /></p>
                )}
                {r.race && (
                  <p className="cc-result-row"><span className="ui-meta">{t("championship.grandPrix")}</span><Finishes finishes={r.race} /></p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function roundIcon(status: CalendarRound["status"]) {
  return status === "COMPLETED" ? "check" : status === "CURRENT" ? "flag" : "calendar";
}
function CalendarPanel({ model, i18n }: { model: CommandCentreModel; i18n: I18n }) {
  const { t, format } = i18n;
  const nextId = model.mission.kind === "NEXT" ? model.mission.event.id : null;
  return (
    <section className="cc-panel cc-calendar ui-surface" aria-labelledby="cc-calendar-title">
      <div className="ui-section-head"><h2 id="cc-calendar-title">{t("commandCentre.calendar")}</h2></div>
      {model.calendar.length === 0 ? (
        <div className="ui-empty"><strong>{t("career.noEvent")}</strong><span>{t("career.noEventBody")}</span></div>
      ) : (
        <ol className="cc-calendar-list">
          {model.calendar.map((r) => {
            const state = r.status === "CURRENT" || r.id === nextId ? "focus" : r.status === "COMPLETED" ? "done" : "upcoming";
            return (
              <li key={r.id} className="cc-round" data-state={state} aria-current={r.status === "CURRENT" ? "true" : undefined}>
                <span className="cc-round-number num">{t("championship.roundShort", { round: format.number(r.round) })}</span>
                <span className="cc-round-text">
                  <strong>{r.name}</strong>
                  <span className="ui-meta">{format.date(new Date(r.startDate), { day: "numeric", month: "short" })}{r.format === "SPRINT" ? ` · ${t("championship.sprint")}` : ""}</span>
                </span>
                <span className="cc-round-status">
                  <Icon name={roundIcon(r.status)} />
                  <span className={r.status === "UPCOMING" ? "sr-only" : undefined}>{t(`commandCentre.event.${r.status}`)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

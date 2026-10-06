"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import { Icon, type IconName } from "../../components/ui/icon";
import { Alert, Module, Stat } from "../../components/ui/primitives";
import { teamStyle, safeTeamColor } from "../../components/ui/team-color";
import { TransitionControl } from "./progression-views";
import { CircuitFacts } from "./circuit-facts";
import { finishText, points, position } from "./presentation";
import type { CommandCentreModel, Finish, MissionEvent, SeasonRound } from "./command-centre";
const finishTone = (f: Finish | null) => (!f ? "none" : f.disqualified || f.retired ? "out" : f.position === 1 ? "win" : f.position <= 3 ? "podium" : f.position <= 10 ? "points" : "none");
const sessionIcon: Record<string, IconName> = { COMPLETED: "check", AVAILABLE: "current", IN_PROGRESS: "current", LOCKED: "lock", SKIPPED: "chevron", UPCOMING: "calendar" };
const roundIcon: Record<SeasonRound["state"], IconName | null> = { done: "check", current: "current", next: "arrow", upcoming: null };
/** Career Command Centre (UIX-A REDO): the Career's mission, championship position, drivers, form and season. */
export function CommandCentreView({ model }: { model: CommandCentreModel }) {
  const { t, format } = useI18n();
  return (
    <div className="cc" style={teamStyle(model.team.color) as CSSProperties}>
      <LocalizedPageTitle titleKey="metadata.career" />
      <header className="ui-page-head cc-head">
        <div>
          <p className="ui-label">{t("navigation.commandCentre")}</p>
          <h1>{model.careerName}</h1>
        </div>
        <p className="cc-head-progress">
          {t("progression.count", { completed: format.number(model.progress.completed), total: format.number(model.progress.total) })}
        </p>
      </header>
      <div className="cc-grid">
        <MissionHero model={model} />
        <ChampionshipModule model={model} />
        <DriversModule model={model} />
        <FormModule model={model} />
        <SeasonModule model={model} />
      </div>
    </div>
  );
}
function DateRange({ event }: { event: MissionEvent }) {
  const { t, format } = useI18n();
  const d = (iso: string) => format.date(new Date(iso), { dateStyle: "medium" });
  return <>{event.startDate === event.endDate ? d(event.startDate) : t("commandCentre.dateRange", { start: d(event.startDate), end: d(event.endDate) })}</>;
}
function MissionHero({ model }: { model: CommandCentreModel }) {
  const { t, format } = useI18n();
  const { mission } = model;
  if (mission.kind === "COMPLETE")
    return (
      <section className="cc-hero cc-area-hero" aria-labelledby="cc-mission">
        <span className="ui-tag"><Icon name="trophy" size={14} />{t("commandCentre.seasonOver")}</span>
        <h2 id="cc-mission" className="ui-display cc-hero-title">{t("progression.calendarComplete")}</h2>
        <p className="cc-hero-meta">{t("progression.calendarBody")}</p>
        <div className="cc-hero-actions">
          <Link className="ui-btn ui-btn-primary" href={`/career/${model.careerId}/standings`}>
            {t("championship.open")} <Icon name="arrow" />
          </Link>
        </div>
      </section>
    );
  const { event } = mission;
  const live = mission.kind === "ACTIVE";
  const circuit = model.focus?.eventId === event.id ? model.focus.circuit : null;
  return (
    <section className="cc-hero cc-area-hero" aria-labelledby="cc-mission" data-live={live} data-circuit={Boolean(circuit)}>
      {!circuit?.outline && <span className="cc-hero-ghost" aria-hidden="true">{String(event.round).padStart(2, "0")}</span>}
      <div className="cc-hero-main">
      <div className="cc-hero-top">
        <span className="ui-tag">{live ? <Icon name="current" size={12} /> : <Icon name="flag" size={14} />}{t(live ? "commandCentre.live" : "commandCentre.nextUp")}</span>
        <span className="ui-format" data-format={event.format}>{t(`progression.format.${event.format}`)}</span>
      </div>
      <p className="cc-hero-round">{t("commandCentre.roundOf", { round: format.number(event.round), total: format.number(model.progress.total) })}</p>
      <h2 id="cc-mission" className="ui-display cc-hero-title">{event.name}</h2>
      <p className="cc-hero-meta">
        <span><Icon name="circuit" size={16} />{event.circuitName}</span>
        <span><Icon name="calendar" size={16} /><DateRange event={event} /></span>
      </p>
      <ol className="cc-sessions" aria-label={t("commandCentre.sessions")}>
        {event.sessions.map((s, i) => (
          <li key={`${s.type}-${i}`} data-status={s.status}>
            <Icon name={sessionIcon[s.status]} size={14} />
            <span>{t(`progression.${s.type}`)}</span>
            <span className="visually-hidden">: {s.status === "UPCOMING" ? t("commandCentre.state.upcoming") : t(`progression.${s.status}`)}</span>
          </li>
        ))}
      </ol>
      <div className="cc-hero-actions">
        {live ? (
          <>
            <Link className="ui-btn ui-btn-primary" href={`/career/${model.careerId}/events/${event.id}`}>
              {t("progression.open")} <Icon name="arrow" />
            </Link>
            {mission.current && (
              <p className="cc-hero-next">
                {t("commandCentre.currentSession", { session: t(`progression.${mission.current.type}`), status: t(`progression.${mission.current.status}`) })}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="cc-advance">
              <TransitionControl careerId={model.careerId} eventId={event.id} intent="advance" />
            </div>
            <p className="cc-hero-next">{t("commandCentre.advanceHint")}</p>
          </>
        )}
      </div>
      </div>
      {circuit && (
        <div className="cc-hero-circuit">
          <CircuitFacts circuit={circuit} compact />
        </div>
      )}
    </section>
  );
}
function ChampionshipModule({ model }: { model: CommandCentreModel }) {
  const { t, format } = useI18n();
  const c = model.championship;
  const standings = `/career/${model.careerId}/standings`;
  const action = <Link className="ui-link" href={standings}>{t("championship.open")} <Icon name="chevron" size={14} /></Link>;
  return (
    <Module title={t("championship.constructors")} action={action} className="cc-area-champ" labelledBy="cc-champ">
      <div className="ui-module-body">
        {!c ? (
          <Alert title={t("commandCentre.unavailable")}>{t("commandCentre.unavailableBody")}</Alert>
        ) : !c.started || !c.player ? (
          <div className="ui-empty">
            <strong>{t("championship.noResults")}</strong>
            {t("championship.noResultsBody")}
          </div>
        ) : (
          <>
            <div className="cc-champ-figure">
              <span className="ui-figure">{position(t, c.player.position, c.player.tied)}</span>
              <dl className="cc-champ-facts">
                <div>
                  <dt>{t("championship.points")}</dt>
                  <dd>{points(format, c.player.units)}</dd>
                </div>
                <div>
                  <dt>{t("commandCentre.gapLabel")}</dt>
                  <dd>{c.player.gapUnits === 0 ? t("commandCentre.leader") : t("commandCentre.gap", { points: points(format, c.player.gapUnits) })}</dd>
                </div>
              </dl>
            </div>
            {c.through && (
              <p className="ui-meta cc-through">
                {t(c.through.stage === "SPRINT" ? "championship.afterSprint" : "championship.afterRound", { round: format.number(c.through.round), event: c.through.eventName })}
              </p>
            )}
            <table className="ui-table cc-table">
              <caption className="visually-hidden">{t("championship.constructors")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("championship.pos")}</th>
                  <th scope="col">{t("championship.team")}</th>
                  <th scope="col" className="num">{t("championship.points")}</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r, i) => (
                  <ConstructorRowView key={r.name} row={r} gapBefore={c.gap && i === c.rows.length - 1} />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Module>
  );
}
function ConstructorRowView({ row, gapBefore }: { row: NonNullable<CommandCentreModel["championship"]>["rows"][number]; gapBefore: boolean }) {
  const { t, format } = useI18n();
  return (
    <>
      {gapBefore && (
        <tr className="ui-table-gap" aria-hidden="true">
          <td colSpan={3}>⋯</td>
        </tr>
      )}
      <tr data-player={row.player}>
        <td className="num cc-pos">{position(t, row.position, row.tied)}</td>
        <td>
          <span className="ui-swatch" style={{ "--swatch": safeTeamColor(row.color) } as CSSProperties} aria-hidden="true" />
          {row.name}
          {row.player && <span className="cc-you">{t("commandCentre.you")}</span>}
        </td>
        <td className="num">{points(format, row.units)}</td>
      </tr>
    </>
  );
}
function DriversModule({ model }: { model: CommandCentreModel }) {
  const { t, format } = useI18n();
  return (
    <Module title={t("championship.playerDrivers")} className="cc-area-drivers" labelledBy="cc-drivers">
      <div className="ui-module-body">
        {!model.drivers ? (
          <Alert title={t("commandCentre.unavailable")}>{t("commandCentre.unavailableBody")}</Alert>
        ) : (
          <div className="cc-drivers">
            {model.drivers.map((d) => (
              <article key={d.id} className="cc-driver" aria-labelledby={`driver-${d.id}`}>
                <div className="cc-driver-number" aria-hidden="true">{d.carNumber ?? d.abbreviation}</div>
                <div className="cc-driver-body">
                  <p className="ui-label">
                    {d.abbreviation}
                    {d.carNumber !== null && <span className="visually-hidden"> · {t("commandCentre.carNumber", { number: d.carNumber })}</span>}
                  </p>
                  <h3 id={`driver-${d.id}`} className="ui-display cc-driver-name">{d.name}</h3>
                  <dl className="ui-stats cc-driver-stats">
                    <Stat label={t("commandCentre.driverPosition")} value={position(t, d.position, d.tied)} />
                    <Stat label={t("championship.points")} value={points(format, d.units)} />
                    <Stat label={t("championship.wins")} value={format.number(d.wins)} />
                    <Stat label={t("commandCentre.lastRace")} value={finishText(t, d.lastRace)} />
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Module>
  );
}
function FinishChip({ finish, sprint }: { finish: Finish | null; sprint?: boolean }) {
  const { t } = useI18n();
  if (!finish) return null;
  return (
    <span className="cc-finish" data-tone={finishTone(finish)} data-kind={sprint ? "sprint" : "race"}>
      {sprint && <abbr title={t("progression.SPRINT")}>{t("commandCentre.sprintAbbr")}</abbr>}
      {finishText(t, finish)}
    </span>
  );
}
function FormModule({ model }: { model: CommandCentreModel }) {
  const { t, format } = useI18n();
  const drivers = model.drivers ?? [];
  return (
    <Module title={t("commandCentre.form")} className="cc-area-form" labelledBy="cc-form">
      <div className="ui-module-body">
        {!model.form ? (
          <Alert title={t("commandCentre.unavailable")}>{t("commandCentre.unavailableBody")}</Alert>
        ) : model.form.length === 0 ? (
          <div className="ui-empty">
            <strong>{t("championship.noResults")}</strong>
            {t("championship.noResultsBody")}
          </div>
        ) : (
          <div className="cc-table-scroll">
            <table className="ui-table cc-form-table">
              <caption className="visually-hidden">{t("commandCentre.form")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("championship.round")}</th>
                  <th scope="col">{t("commandCentre.event")}</th>
                  {drivers.map((d) => <th key={d.id} scope="col">{d.abbreviation}</th>)}
                </tr>
              </thead>
              <tbody>
                {model.form.map((row) => (
                  <tr key={row.eventId}>
                    <td className="num cc-pos">{t("championship.roundShort", { round: format.number(row.round) })}</td>
                    <td className="cc-form-event">
                      <Link className="cc-form-link" href={`/career/${model.careerId}/events/${row.eventId}/results`}>{row.name}</Link>
                    </td>
                    {row.results.map((r) => (
                      <td key={r.driverId} className="cc-form-cell">
                        <FinishChip finish={r.race} />
                        <FinishChip finish={r.sprint} sprint />
                        {!r.race && !r.sprint && "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Module>
  );
}
function SeasonModule({ model }: { model: CommandCentreModel }) {
  const { t, format } = useI18n();
  const stateLabel = (s: SeasonRound["state"]) => t(`commandCentre.state.${s}`);
  return (
    <Module title={t("commandCentre.season")} className="cc-area-season" labelledBy="cc-season"
      action={<span className="ui-meta">{model.seasonName}</span>}>
      <div className="ui-module-body">
        <ol className="cc-season">
          {model.season.map((r) => {
            const icon = roundIcon[r.state];
            return (
              <li key={r.eventId} data-state={r.state} title={`${t("career.round", { round: format.number(r.round) })} · ${r.name}`}>
                <span className="cc-season-num">{format.number(r.round)}</span>
                <span className="cc-season-mark" aria-hidden="true">{icon ? <Icon name={icon} size={12} /> : null}</span>
                {r.format === "SPRINT" && <span className="cc-season-sprint" aria-hidden="true">{t("commandCentre.sprintMark")}</span>}
                <span className="visually-hidden">
                  {" "}{r.name} · {stateLabel(r.state)}{r.format === "SPRINT" ? ` · ${t("progression.format.SPRINT")}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
        <ul className="cc-legend" aria-label={t("commandCentre.legend")}>
          <li data-state="done"><Icon name="check" size={12} />{stateLabel("done")}</li>
          <li data-state="current"><Icon name="current" size={12} />{stateLabel("current")}</li>
          <li data-state="next"><Icon name="arrow" size={12} />{stateLabel("next")}</li>
          <li data-state="upcoming"><span className="cc-legend-box" aria-hidden="true" />{stateLabel("upcoming")}</li>
          <li><span className="cc-season-sprint" aria-hidden="true">{t("commandCentre.sprintMark")}</span>{t("progression.format.SPRINT")}</li>
        </ul>
      </div>
    </Module>
  );
}

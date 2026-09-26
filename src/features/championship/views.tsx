"use client";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import { formatRaceGap, formatRaceTime } from "../../i18n/race-time";
import { Panel, EmptyState } from "../../components/ui/panel";
import type { Movement, RoundResult } from "../../game/domain/championship";
import type {
  ChampionshipSummary,
  DriverLabel,
  DriverStandingView,
  SessionResultView,
  StandingsPage,
  TeamLabel,
  TeamStandingView,
  WeekendResultsPage,
} from "./model";
type T = ReturnType<typeof useI18n>["t"];
type F = ReturnType<typeof useI18n>["format"];
/** Points travel as exact half-point units. */
function usePoints() {
  const { format } = useI18n();
  return (units: number) => format.number(units / 2, { maximumFractionDigits: 1 });
}
function Position({ position, tied }: { position: number; tied: boolean }) {
  const { t, format } = useI18n();
  return (
    <>
      {format.number(position)}
      {tied && (
        <>
          <span aria-hidden="true">=</span>
          <span className="sr-only"> ({t("championship.tied")})</span>
        </>
      )}
    </>
  );
}
/** Shape + text, never colour alone. The first scored round has no previous position, so it shows nothing. */
export function MovementMark({ movement, previous }: { movement: Movement | null; previous: number | null }) {
  const { t, format } = useI18n();
  if (!movement) return null;
  const glyph = movement === "UP" ? "↑" : movement === "DOWN" ? "↓" : "—";
  const label = t(movement === "UP" ? "championship.gained" : movement === "DOWN" ? "championship.lost" : "championship.noChange");
  return (
    <span className={`movement movement-${movement.toLowerCase()}`} title={label}>
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">
        {label}
        {previous !== null && movement !== "SAME" ? `, ${t("championship.previously", { position: format.number(previous) })}` : ""}
      </span>
    </span>
  );
}
function PlayerMark({ player }: { player: boolean }) {
  const { t } = useI18n();
  if (!player) return null;
  return (
    <>
      <span className="player-diamond" aria-hidden="true">◆ </span>
      <span className="sr-only">{t("championship.player")}: </span>
    </>
  );
}
function DriverName({ driver }: { driver: DriverLabel }) {
  return (
    <span className="standings-driver">
      <PlayerMark player={driver.player} />
      <strong className="standings-abbr" style={{ borderColor: driver.color }}>{driver.abbreviation}</strong>{" "}
      <span>{driver.name}</span>
    </span>
  );
}
function TeamName({ team }: { team: TeamLabel }) {
  return (
    <span className="standings-driver">
      <PlayerMark player={team.player} />
      <span className="team-swatch" style={{ background: team.color }} aria-hidden="true" />
      <strong>{team.name}</strong>
    </span>
  );
}
function RoundBreakdown({ rounds }: { rounds: readonly RoundResult[] }) {
  const { t, format } = useI18n();
  const pts = usePoints();
  if (rounds.length === 0) return <span className="ops-muted">—</span>;
  return (
    <details className="round-breakdown">
      <summary>{t("championship.byRound")}</summary>
      <ol aria-label={t("championship.roundBreakdown")}>
        {rounds.map((r) => (
          <li key={r.eventId}>
            <strong>{t("championship.roundShort", { round: format.number(r.round) })}</strong>
            {r.sprint && (
              <span>
                {t("championship.sprintMark")} {t("championship.positionValue", { position: format.number(r.sprint.position) })} {t("championship.plusPoints", { points: pts(r.sprint.units) })}
              </span>
            )}
            {r.race && (
              <span>
                {t("championship.positionValue", { position: format.number(r.race.position) })} {t("championship.plusPoints", { points: pts(r.race.units) })}
              </span>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
function throughText(t: T, f: F, through: StandingsPage["through"]) {
  if (!through) return "";
  const values = { round: f.number(through.round), event: through.eventName };
  return t(through.stage === "SPRINT" ? "championship.afterSprint" : "championship.afterRound", values);
}
function DriversTable({ rows, caption }: { rows: readonly DriverStandingView[]; caption: string }) {
  const { t, format } = useI18n();
  const pts = usePoints();
  return (
    <div className="standings-scroll">
      <table className="standings-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t("championship.pos")}</th>
            <th scope="col"><span className="sr-only">{t("championship.movement")}</span></th>
            <th scope="col">{t("race.driver")}</th>
            <th scope="col">{t("championship.team")}</th>
            <th scope="col" className="num">{t("championship.wins")}</th>
            <th scope="col" className="num">{t("championship.points")}</th>
            <th scope="col">{t("championship.roundBreakdown")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.driver.id} className={r.driver.player ? "player-row" : undefined} style={{ ["--team" as string]: r.driver.color }}>
              <td className="pos"><Position position={r.position} tied={r.tied} /></td>
              <td className="move"><MovementMark movement={r.movement} previous={r.previousPosition} /></td>
              <th scope="row"><DriverName driver={r.driver} /></th>
              <td className="team-cell">{r.driver.teamName}</td>
              <td className="num">{format.number(r.wins)}</td>
              <td className="num points">{pts(r.units)}</td>
              <td><RoundBreakdown rounds={r.rounds} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ConstructorsTable({ rows, caption }: { rows: readonly TeamStandingView[]; caption: string }) {
  const { t, format } = useI18n();
  const pts = usePoints();
  return (
    <div className="standings-scroll">
      <table className="standings-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t("championship.pos")}</th>
            <th scope="col"><span className="sr-only">{t("championship.movement")}</span></th>
            <th scope="col">{t("championship.team")}</th>
            <th scope="col" className="num">{t("championship.wins")}</th>
            <th scope="col" className="num">{t("championship.points")}</th>
            <th scope="col">{t("championship.roundBreakdown")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team.id} className={r.team.player ? "player-row" : undefined} style={{ ["--team" as string]: r.team.color }}>
              <td className="pos"><Position position={r.position} tied={r.tied} /></td>
              <td className="move"><MovementMark movement={r.movement} previous={r.previousPosition} /></td>
              <th scope="row"><TeamName team={r.team} /></th>
              <td className="num">{format.number(r.wins)}</td>
              <td className="num points">{pts(r.units)}</td>
              <td><RoundBreakdown rounds={r.rounds} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
/** WAI-ARIA tabs: roving tabindex, ←/→/Home/End move between tabs, Enter/Space not needed (selection follows focus). */
export function Tabs({ label, tabs, initial = 0 }: { label: string; tabs: readonly { id: string; title: string; panel: ReactNode }[]; initial?: number }) {
  const [active, setActive] = useState(initial);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = tabs.length - 1;
    const next = event.key === "ArrowRight" ? (active === last ? 0 : active + 1)
      : event.key === "ArrowLeft" ? (active === 0 ? last : active - 1)
        : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };
  return (
    <div className="championship-tabs">
      <div role="tablist" aria-label={label} className="tab-list">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={i === active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={i === active ? 0 : -1}
            className={i === active ? "tab active" : "tab"}
            ref={(el) => { refs.current[i] = el; }}
            onClick={() => setActive(i)}
            onKeyDown={move}
          >
            {tab.title}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={i !== active} tabIndex={0} className="tab-panel">
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
function Champions({ page }: { page: StandingsPage }) {
  const { t } = useI18n();
  if (!page.champions) return null;
  return (
    <section className="season-complete" aria-labelledby="season-complete-title">
      <h2 id="season-complete-title"><span aria-hidden="true">🏆 </span>{t("championship.seasonComplete")}</h2>
      <p>{t("championship.seasonCompleteBody")}</p>
      <dl>
        <div>
          <dt>{t("championship.driversChampion")}</dt>
          <dd>{page.champions.drivers.map((d) => <DriverName key={d.id} driver={d} />)}{page.champions.drivers.length > 1 && <em> ({t("championship.tied")})</em>}</dd>
        </div>
        <div>
          <dt>{t("championship.constructorsChampion")}</dt>
          <dd>{page.champions.constructors.map((c) => <TeamName key={c.id} team={c} />)}{page.champions.constructors.length > 1 && <em> ({t("championship.tied")})</em>}</dd>
        </div>
      </dl>
    </section>
  );
}
function History({ page }: { page: StandingsPage }) {
  const { t, format } = useI18n();
  return (
    <Panel title={t("championship.history")}>
      <div className="career-content">
        {page.history.length === 0 ? (
          <p>{t("championship.historyEmpty")}</p>
        ) : (
          <ol className="season-history">
            {page.history.map((h) => (
              <li key={h.eventId}>
                <p className="eyebrow">{t("career.round", { round: format.number(h.round) })}</p>
                <h3>{h.eventName}</h3>
                <dl>
                  {h.sprintWinner && (
                    <div><dt>{t("championship.sprintWinner")}</dt><dd><DriverName driver={h.sprintWinner} /></dd></div>
                  )}
                  {h.raceWinner && (
                    <div><dt>{t("championship.raceWinner")}</dt><dd><DriverName driver={h.raceWinner} /></dd></div>
                  )}
                  <div>
                    <dt>{t("championship.leaderAfter")}</dt>
                    <dd>
                      {h.driverLeaders.map((d) => <DriverName key={d.id} driver={d} />)}
                      {" · "}
                      {h.constructorLeaders.map((c) => <TeamName key={c.id} team={c} />)}
                    </dd>
                  </div>
                </dl>
                <Link className="text-link" href={`/career/${page.careerId}/events/${h.eventId}/results`}>{t("championship.weekendResults")} →</Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}
export function StandingsView({ page, initialTab = "drivers" }: { page: StandingsPage; initialTab?: "drivers" | "constructors" }) {
  const { t, format } = useI18n();
  const through = throughText(t, format, page.through);
  return (
    <>
      <LocalizedPageTitle titleKey="championship.standings" />
      <div className="page-header">
        <div>
          <p className="eyebrow accent">{t("championship.title")} · {page.seasonName}</p>
          <h1>{t("championship.standings")}</h1>
          {through && <p role="status">{through}</p>}
        </div>
        <Link className="text-link" href={`/career/${page.careerId}`}>{t("championship.back")}</Link>
      </div>
      <Champions page={page} />
      {page.cutoffs.length > 0 && (
        <form method="get" className="cutoff-form">
          <label htmlFor="standings-cutoff">{t("championship.cutoff")}</label>
          <select id="standings-cutoff" name="after" defaultValue={page.selected ?? ""}>
            <option value="">{t("championship.latest")}</option>
            {page.cutoffs.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.stage === "SPRINT" ? "championship.afterSprint" : "championship.afterRound", { round: format.number(c.round), event: c.eventName })}
              </option>
            ))}
          </select>
          <button type="submit">{t("championship.show")}</button>
        </form>
      )}
      <div className="results-stack">
        {!page.through ? (
          <Panel title={t("championship.standings")}>
            <EmptyState title={t("championship.noResults")}>{t("championship.noResultsBody")}</EmptyState>
          </Panel>
        ) : (
          <Panel title={t("championship.standings")} label={t("championship.rules", { version: page.scoringRulesVersion })}>
            <div className="career-content">
              <Tabs
                label={t("championship.standings")}
                initial={initialTab === "constructors" ? 1 : 0}
                tabs={[
                  { id: "drivers", title: t("championship.drivers"), panel: <DriversTable rows={page.drivers} caption={`${t("championship.drivers")} — ${through}`} /> },
                  { id: "constructors", title: t("championship.constructors"), panel: <ConstructorsTable rows={page.constructors} caption={`${t("championship.constructors")} — ${through}`} /> },
                ]}
              />
              <p className="ops-muted standings-note">{t("championship.tiedLegend")}</p>
              <p className="ops-muted standings-note">{t("championship.rulesNote")}</p>
            </div>
          </Panel>
        )}
        <History page={page} />
      </div>
    </>
  );
}
function SessionTable({ title, session, id }: { title: string; session: SessionResultView | null; id: string }) {
  const { t, format, locale } = useI18n();
  const pts = usePoints();
  return (
    <Panel title={title}>
      <div className="career-content">
        {!session ? (
          <p>{t("championship.notCompleted")}</p>
        ) : (
          <>
            <p className="ops-muted">
              {t(session.leaderLaps < session.scheduledLaps ? "championship.shortened" : "championship.distance", { laps: format.number(session.leaderLaps), scheduled: format.number(session.scheduledLaps) })}
            </p>
            <div className="standings-scroll">
              <table className="standings-table" id={id}>
                <caption>{title}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("championship.pos")}</th>
                    <th scope="col">{t("race.driver")}</th>
                    <th scope="col">{t("championship.team")}</th>
                    <th scope="col" className="num">{t("championship.grid")}</th>
                    <th scope="col" className="num">{t("championship.laps")}</th>
                    <th scope="col" className="num">{t("championship.time")}</th>
                    <th scope="col">{t("championship.status")}</th>
                    <th scope="col" className="num">{t("championship.stops")}</th>
                    <th scope="col" className="num">{t("championship.points")}</th>
                  </tr>
                </thead>
                <tbody>
                  {session.rows.map((r) => (
                    <tr key={r.driver.id} className={r.driver.player ? "player-row" : undefined} style={{ ["--team" as string]: r.driver.color }}>
                      <td className="pos">{format.number(r.position)}</td>
                      <th scope="row"><DriverName driver={r.driver} /></th>
                      <td className="team-cell">{r.driver.teamName}</td>
                      <td className="num">{r.gridPosition === null ? "—" : format.number(r.gridPosition)}</td>
                      <td className="num">{format.number(r.completedLaps)}</td>
                      <td className="num">
                        {r.retired ? "—"
                          : r.position === 1 ? formatRaceTime(r.elapsedTimeMs, locale)
                            : r.lapsDown > 0 ? t("sprint.lapsDown", { count: format.number(r.lapsDown) })
                              : r.gapMs === null ? "—" : formatRaceGap(r.gapMs, locale)}
                      </td>
                      <td>{t(r.retired ? "incident.RETIRED" : "incident.FINISHED")}</td>
                      <td className="num">{r.stops === null ? "—" : format.number(r.stops)}</td>
                      <td className="num points">{r.units > 0 ? t("championship.plusPoints", { points: pts(r.units) }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
export function WeekendResultsView({ page }: { page: WeekendResultsPage }) {
  const { t, format } = useI18n();
  const pts = usePoints();
  const after = page.through === "SPRINT" ? t("championship.afterEventSprint") : t("championship.afterEvent");
  return (
    <>
      <LocalizedPageTitle titleKey="championship.weekendResults" />
      <div className="page-header">
        <div>
          <p className="eyebrow accent">
            {t("championship.weekendResults")} · {t("career.round", { round: format.number(page.round) })} · <strong className="weekend-format">{t(`progression.format.${page.format}`)}</strong>
          </p>
          <h1>{page.name}</h1>
          <p>{page.circuitName}</p>
        </div>
        <div className="header-links">
          <Link className="text-link" href={`/career/${page.careerId}/events/${page.eventId}`}>{t("championship.backToWeekend")}</Link>
          <Link className="text-link" href={`/career/${page.careerId}/standings`}>{t("championship.viewChampionship")}</Link>
        </div>
      </div>
      <div className="results-stack">
        {page.format === "SPRINT" && <SessionTable id="sprint-result" title={t("championship.sprint")} session={page.sprint} />}
        <SessionTable id="race-result" title={t("championship.grandPrix")} session={page.race} />
        {page.through && (
          <Panel title={after}>
            <div className="career-content">
              <div className="standings-scroll">
                <table className="standings-table">
                  <caption>{`${t("championship.weekendPoints")} — ${after}`}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("championship.position")}</th>
                      <th scope="col"><span className="sr-only">{t("championship.movement")}</span></th>
                      <th scope="col">{t("race.driver")}</th>
                      {page.format === "SPRINT" && <th scope="col" className="num">{t("championship.sprintPoints")}</th>}
                      <th scope="col" className="num">{t("championship.racePoints")}</th>
                      <th scope="col" className="num">{t("championship.weekendPoints")}</th>
                      <th scope="col" className="num">{t("championship.points")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.weekend.map((r) => (
                      <tr key={r.driver.id} className={r.driver.player ? "player-row" : undefined} style={{ ["--team" as string]: r.driver.color }}>
                        <td className="pos">{r.championship ? <Position position={r.championship.position} tied={r.championship.tied} /> : "—"}</td>
                        <td className="move">{r.championship && <MovementMark movement={r.championship.movement} previous={null} />}</td>
                        <th scope="row"><DriverName driver={r.driver} /></th>
                        {page.format === "SPRINT" && <td className="num">{r.sprint === null ? "—" : t("championship.plusPoints", { points: pts(r.sprint) })}</td>}
                        <td className="num">{r.race === null ? "—" : t("championship.plusPoints", { points: pts(r.race) })}</td>
                        <td className="num points">{t("championship.plusPoints", { points: pts(r.total) })}</td>
                        <td className="num">{r.championship ? pts(r.championship.units) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="standings-scroll">
                <table className="standings-table">
                  <caption>{`${t("championship.constructors")} — ${after}`}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("championship.position")}</th>
                      <th scope="col"><span className="sr-only">{t("championship.movement")}</span></th>
                      <th scope="col">{t("championship.team")}</th>
                      <th scope="col" className="num">{t("championship.weekendPoints")}</th>
                      <th scope="col" className="num">{t("championship.points")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.constructors.map((r) => (
                      <tr key={r.team.id} className={r.team.player ? "player-row" : undefined} style={{ ["--team" as string]: r.team.color }}>
                        <td className="pos"><Position position={r.championship.position} tied={r.championship.tied} /></td>
                        <td className="move"><MovementMark movement={r.championship.movement} previous={null} /></td>
                        <th scope="row"><TeamName team={r.team} /></th>
                        <td className="num points">{t("championship.plusPoints", { points: pts(r.total) })}</td>
                        <td className="num">{pts(r.championship.units)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
/** Compact Career-dashboard panel: leaders, the player's drivers and team, and the way to the full standings. */
export function ChampionshipSummaryPanel({ summary }: { summary: ChampionshipSummary }) {
  const { t, format } = useI18n();
  const pts = usePoints();
  const pos = (position: number, tied: boolean) => `${t("championship.positionValue", { position: format.number(position) })}${tied ? ` (${t("championship.tied")})` : ""}`;
  return (
    <Panel title={t("dashboard.championship")} label={summary.seasonComplete ? t("championship.seasonComplete") : undefined}>
      <div className="career-content championship-summary">
        {!summary.through ? (
          <EmptyState title={t("championship.noResults")}>{t("championship.noResultsBody")}</EmptyState>
        ) : (
          <>
            <p className="eyebrow">{throughText(t, format, summary.through)}</p>
            <dl className="career-facts">
              <div>
                <dt>{t(summary.seasonComplete ? "championship.driversChampion" : "championship.leader")}</dt>
                <dd>{summary.driverLeaders.map((l) => <span key={l.driver.id} className="summary-line"><DriverName driver={l.driver} /> · {t("championship.pointsValue", { points: pts(l.units) })}</span>)}</dd>
              </div>
              <div>
                <dt>{t("championship.playerDrivers")}</dt>
                <dd>{summary.playerDrivers.map((d) => <span key={d.driver.id} className="summary-line">{pos(d.position, d.tied)} · <DriverName driver={{ ...d.driver, player: false }} /> · {t("championship.pointsValue", { points: pts(d.units) })}</span>)}</dd>
              </div>
              <div>
                <dt>{t(summary.seasonComplete ? "championship.constructorsChampion" : "championship.constructors")}</dt>
                <dd>{summary.constructorLeaders.map((l) => <span key={l.team.id} className="summary-line"><TeamName team={l.team} /> · {t("championship.pointsValue", { points: pts(l.units) })}</span>)}</dd>
              </div>
              {summary.playerTeam && (
                <div>
                  <dt>{t("championship.playerTeam")}</dt>
                  <dd><span className="summary-line">{pos(summary.playerTeam.position, summary.playerTeam.tied)} · {summary.playerTeam.team.name} · {t("championship.pointsValue", { points: pts(summary.playerTeam.units) })}</span></dd>
                </div>
              )}
            </dl>
          </>
        )}
        <Link className="text-link" href={`/career/${summary.careerId}/standings`}>{t("championship.open")} →</Link>
      </div>
    </Panel>
  );
}

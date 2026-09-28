"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { CAR_PART_TYPES, CAR_PERFORMANCE_DIMENSIONS, type CarPartType } from "../../game/domain/car-development";
import { DESIGN_FOCUSES, DESIGN_PROGRAMMES, MAX_ACTIVE_DESIGN_PROJECTS, projectProgress, type DesignFocus, type DesignProgramme } from "../../game/domain/car-design-project";
import type { CarDevelopmentOverview, CarDesignErrorCode } from "../../game/domain/car-design-repository";
import { carDesignAction, type CarDesignActionState } from "./car-design-actions";
import { useI18n, LocalizedPageTitle } from "../../i18n/provider";
import type { TranslationKey } from "../../i18n/catalog";
import { Panel, EmptyState } from "../../components/ui/panel";

const names: Record<CarPartType, TranslationKey> = {
  FRONT_WING: "car.part.frontWing", REAR_WING: "car.part.rearWing", UNDERFLOOR: "car.part.underfloor",
  SIDEPODS: "car.part.sidepods", CHASSIS: "car.part.chassis", SUSPENSION: "car.part.suspension",
};
const dimensions: Record<typeof CAR_PERFORMANCE_DIMENSIONS[number], TranslationKey> = {
  lowSpeed: "car.lowSpeed", mediumSpeed: "car.mediumSpeed", highSpeed: "car.highSpeed",
  dragReduction: "car.dragReduction", drsEfficiency: "car.drsEfficiency",
};
const focuses: Record<DesignFocus, TranslationKey> = {
  BALANCED: "car.focus.BALANCED", LOW_SPEED: "car.focus.LOW_SPEED", MEDIUM_SPEED: "car.focus.MEDIUM_SPEED",
  HIGH_SPEED: "car.focus.HIGH_SPEED", DRAG_REDUCTION: "car.focus.DRAG_REDUCTION", DRS_EFFICIENCY: "car.focus.DRS_EFFICIENCY",
};
const programmes: Record<DesignProgramme, TranslationKey> = { STANDARD: "car.programme.STANDARD", EXTENSIVE: "car.programme.EXTENSIVE" };
const errors: Record<CarDesignErrorCode, TranslationKey> = {
  NOT_FOUND: "car.error.NOT_FOUND", UNAVAILABLE: "car.error.UNAVAILABLE", LEGACY: "car.error.LEGACY",
  CAPACITY: "car.error.CAPACITY", PART_ACTIVE: "car.error.PART_ACTIVE", INVALID_CHOICE: "car.error.INVALID_CHOICE",
  STALE_PREVIEW: "car.error.STALE_PREVIEW",
  PERSISTENCE_FAILED: "car.error.PERSISTENCE_FAILED",
};
const displayDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
function DesignForm({ overview }: { overview: CarDevelopmentOverview }) {
  const { t, format } = useI18n();
  const [partType, setPartType] = useState<CarPartType>("FRONT_WING");
  const [focus, setFocus] = useState<DesignFocus>("BALANCED");
  const [programme, setProgramme] = useState<DesignProgramme>("STANDARD");
  const [state, action, pending] = useActionState(carDesignAction, { error: null, preview: null, startedId: null } as CarDesignActionState);
  const active = overview.projects.filter(project => project.status === "ACTIVE");
  const disabled = overview.car.parts.length === 0 || overview.careerStatus !== "ACTIVE" || active.length >= MAX_ACTIVE_DESIGN_PROJECTS;
  const preview = state.preview?.base.partType === partType && state.preview.focus === focus && state.preview.programme === programme && state.preview.startedAtCareerDate === overview.careerDate ? state.preview : null;
  return <Panel title={t("car.startDesign")}><div className="career-content">
    <p>{t("car.projectCapacity", { active: format.number(active.length), capacity: format.number(MAX_ACTIVE_DESIGN_PROJECTS) })}</p>
    {overview.car.parts.length === 0 ? <p>{t("car.legacyDesign")}</p> : <>
    <form action={action} className="transition-form" key={state.preview ? `${state.preview.base.partType}-${state.preview.focus}-${state.preview.programme}-${state.preview.startedAtCareerDate}` : state.startedId ?? "initial"}>
      <input type="hidden" name="careerId" value={overview.car.careerId} />
      <label htmlFor="design-part">{t("car.partType")}</label>
      <select id="design-part" name="partType" value={partType} disabled={disabled} onChange={event => setPartType(event.target.value as CarPartType)}>{CAR_PART_TYPES.map(type => <option value={type} key={type}>{t(names[type])}</option>)}</select>
      <label htmlFor="design-focus">{t("car.developmentFocus")}</label>
      <select id="design-focus" name="focus" value={focus} disabled={disabled} onChange={event => setFocus(event.target.value as DesignFocus)}>{DESIGN_FOCUSES.map(value => <option value={value} key={value}>{t(focuses[value])}</option>)}</select>
      <label htmlFor="design-programme">{t("car.developmentProgramme")}</label>
      <select id="design-programme" name="programme" value={programme} disabled={disabled} onChange={event => setProgramme(event.target.value as DesignProgramme)}>{DESIGN_PROGRAMMES.map(value => <option value={value} key={value}>{t(programmes[value])}</option>)}</select>
      <button type="submit" name="intent" value="preview" disabled={pending || disabled}>{t("car.preview")}</button>
    </form>
      {preview && <div aria-live="polite">
        <h3>{t("car.previewHeading")}</h3>
        <p>{t(focuses[preview.focus])} · {t(programmes[preview.programme])}</p>
        <p>{t("car.baseDesign")}: {t(names[preview.base.partType])} {t("car.version", { version: format.number(preview.base.version) })}</p>
        <p>{t("car.plannedDesign")}: {t(names[preview.planned.partType])} {t("car.version", { version: format.number(preview.planned.version) })}</p>
        <p>{t("car.duration", { days: format.number(preview.durationDays) })}</p>
        <p>{t("car.completes")}: {format.date(displayDate(preview.completesAtCareerDate))}</p>
        <dl className="career-facts">{CAR_PERFORMANCE_DIMENSIONS.map(dimension => <div key={dimension}><dt>{t(dimensions[dimension])}</dt><dd>{format.number(preview.base.stats[dimension])} → {format.number(preview.planned.stats[dimension])} (+{format.number(preview.deltas[dimension])})</dd></div>)}</dl>
        <form action={action} className="transition-form">
          <input type="hidden" name="careerId" value={overview.car.careerId} />
          <input type="hidden" name="partType" value={preview.base.partType} />
          <input type="hidden" name="focus" value={preview.focus} />
          <input type="hidden" name="programme" value={preview.programme} />
          <button type="submit" name="intent" value="start" disabled={pending || disabled}>{t("car.confirmStart")}</button>
        </form>
      </div>}
      {state.error && <p role="alert">{t(errors[state.error])}</p>}
      {state.startedId && <p role="status">{t("car.projectStarted")}</p>}
    </>}
    {overview.careerStatus !== "ACTIVE" && <p>{t("car.actionUnavailable")}</p>}
  </div></Panel>;
}
export function CarDevelopmentView({ overview }: { overview: CarDevelopmentOverview }) {
  const { t, format } = useI18n();
  const { car } = overview;
  const stats = car.stats;
  return <>
    <LocalizedPageTitle titleKey="metadata.car" />
    <div className="page-header">
      <div><p className="eyebrow accent">{t("car.heading")}</p><h1>{car.teamName}</h1><p>{t("car.currentNote")}</p></div>
      <Link className="text-link" href={`/career/${car.careerId}`}>{t("car.back")}</Link>
    </div>
    <div className="dashboard-grid">
      <Panel title={t("car.current")}>
        <div className="career-content">
          <dl className="career-facts"><div><dt>{t("car.overall")}</dt><dd>{format.number(car.overallPerformance)}</dd></div></dl>
        </div>
      </Panel>
      <Panel title={t("car.areas")}>
        {stats ? <div className="career-content"><dl className="career-facts">
          <div><dt>{t("car.lowSpeed")}</dt><dd>{format.number(stats.lowSpeed)}</dd></div>
          <div><dt>{t("car.mediumSpeed")}</dt><dd>{format.number(stats.mediumSpeed)}</dd></div>
          <div><dt>{t("car.highSpeed")}</dt><dd>{format.number(stats.highSpeed)}</dd></div>
          <div><dt>{t("car.dragReduction")}</dt><dd>{format.number(stats.dragReduction)}</dd></div>
          <div><dt>{t("car.drsEfficiency")}</dt><dd>{format.number(stats.drsEfficiency)}</dd></div>
        </dl></div> : <EmptyState title={t("car.legacy")}>{t("car.legacyBody")}</EmptyState>}
      </Panel>
    </div>
    <Panel title={t("car.parts")}>
      {car.parts.length ? <div className="career-list">
        {CAR_PART_TYPES.map(type => {
          const part = car.parts.find(p => p.partType === type);
          if (!part) return null;
          return <div className="career-content" key={type}>
            <h3>{t(names[type])} {t("car.version", { version: format.number(part.version) })}</h3>
            <p>{t("car.partSummary", {
              low: format.number(part.stats.lowSpeed), mid: format.number(part.stats.mediumSpeed),
              high: format.number(part.stats.highSpeed), drag: format.number(part.stats.dragReduction), drs: format.number(part.stats.drsEfficiency),
            })}</p>
          </div>;
        })}
      </div> : <EmptyState title={t("car.legacy")}>{t("car.legacyBody")}</EmptyState>}
    </Panel>
    <div className="dashboard-grid">
      <Panel title={t("car.activeProjects")}>
        {overview.projects.some(project => project.status === "ACTIVE") ? <div className="career-list">{overview.projects.filter(project => project.status === "ACTIVE").map(project => {
          const progress = projectProgress(project.startedAtCareerDate, project.completesAtCareerDate, overview.careerDate);
          return <div className="career-content" key={project.id}>
            <h3>{t(names[project.partType])} {t("car.version", { version: format.number(project.newVersion) })}</h3>
            <p>{t(focuses[project.focus])} · {t(programmes[project.programme])}</p>
            <p>{t("car.started")}: {format.date(displayDate(project.startedAtCareerDate))}</p>
            <p>{t("car.completes")}: {format.date(displayDate(project.completesAtCareerDate))}</p>
            <label htmlFor={`project-${project.id}`}>{t("car.daysRemaining", { days: format.number(progress.daysRemaining) })} · {format.number(progress.percent)}%</label>
            <progress id={`project-${project.id}`} max={progress.daysTotal} value={progress.daysElapsed} />
          </div>;
        })}</div> : <EmptyState title={t("car.noActiveProjects")}>{t("car.noActiveProjectsBody")}</EmptyState>}
      </Panel>
      <DesignForm overview={overview} />
    </div>
    <Panel title={t("car.availableDesigns")}>
      {overview.availableDesigns.length ? <div className="career-list">{overview.availableDesigns.map(part => <div className="career-content" key={`${part.partType}-${part.version}`}>
        <h3>{t(names[part.partType])} {t("car.version", { version: format.number(part.version) })}</h3>
        <p>{t("car.designComplete")} · {t("car.notFitted")}</p>
        <p>{t("car.partSummary", { low: format.number(part.stats.lowSpeed), mid: format.number(part.stats.mediumSpeed), high: format.number(part.stats.highSpeed), drag: format.number(part.stats.dragReduction), drs: format.number(part.stats.drsEfficiency) })}</p>
      </div>)}</div> : <EmptyState title={t("car.noAvailableDesigns")}>{t("car.noAvailableDesignsBody")}</EmptyState>}
    </Panel>
  </>;
}

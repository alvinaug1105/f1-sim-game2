"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CAR_PART_TYPES, CAR_PERFORMANCE_DIMENSIONS, type CarPartType } from "../../game/domain/car-development";
import { MAX_ACTIVE_MANUFACTURING_ORDERS, type CarSlot } from "../../game/domain/car-manufacturing";
import { projectProgress } from "../../game/domain/car-design-project";
import type { CarPhysicalErrorCode, PlayerPhysicalOverview } from "../../game/domain/car-physical-repository";
import { carPhysicalAction, type CarPhysicalActionState } from "./car-physical-actions";
import { Panel, EmptyState } from "../../components/ui/panel";
import { useI18n } from "../../i18n/provider";
import type { TranslationKey } from "../../i18n/catalog";

const names: Record<CarPartType, TranslationKey> = {
  FRONT_WING: "car.part.frontWing", REAR_WING: "car.part.rearWing", UNDERFLOOR: "car.part.underfloor",
  SIDEPODS: "car.part.sidepods", CHASSIS: "car.part.chassis", SUSPENSION: "car.part.suspension",
};
const dimensions: Record<typeof CAR_PERFORMANCE_DIMENSIONS[number], TranslationKey> = {
  lowSpeed: "car.lowSpeed", mediumSpeed: "car.mediumSpeed", highSpeed: "car.highSpeed",
  dragReduction: "car.dragReduction", drsEfficiency: "car.drsEfficiency",
};
const slots: Record<CarSlot, TranslationKey> = { CAR_1: "car.physical.car1", CAR_2: "car.physical.car2" };
const errors: Record<CarPhysicalErrorCode, TranslationKey> = {
  NOT_FOUND: "car.physical.error.NOT_FOUND", UNAVAILABLE: "car.physical.error.UNAVAILABLE", LEGACY: "car.physical.error.LEGACY",
  INVALID_CHOICE: "car.physical.error.INVALID_CHOICE", CAPACITY: "car.physical.error.CAPACITY",
  DESIGN_ACTIVE: "car.physical.error.DESIGN_ACTIVE", NO_UNIT: "car.physical.error.NO_UNIT",
  SESSION_IN_PROGRESS: "car.physical.error.SESSION_IN_PROGRESS", STALE_PREVIEW: "car.physical.error.STALE_PREVIEW",
  PERSISTENCE_FAILED: "car.physical.error.PERSISTENCE_FAILED",
};
const displayDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const initial: CarPhysicalActionState = { error: null, success: null };
function ActionStatus({ state }: { state: CarPhysicalActionState }) {
  const { t } = useI18n();
  return <>{state.error && <p role="alert">{t(errors[state.error])}</p>}{state.success && <p role="status">{t(state.success === "fitted" ? "car.physical.fittedSuccess" : "car.physical.manufacturingStarted")}</p>}</>;
}
function Manufacturing({ physical, careerId, careerDate, active }: { physical: PlayerPhysicalOverview; careerId: string; careerDate: string; active: boolean }) {
  const { t, format } = useI18n();
  const router = useRouter();
  const [state, action, pending] = useActionState(carPhysicalAction, initial);
  const [designId, setDesignId] = useState(physical.designs[0]?.id ?? "");
  const [quantity, setQuantity] = useState<1 | 2>(1);
  useEffect(() => { if (state.success) router.refresh(); }, [state.success, router]);
  const design = physical.designs.find(row => row.id === designId) ?? physical.designs[0];
  const plan = design?.plans.find(row => row.quantity === quantity);
  const activeOrders = physical.orders.filter(order => order.status === "ACTIVE");
  const disabled = !active || pending || activeOrders.length >= MAX_ACTIVE_MANUFACTURING_ORDERS || !!activeOrders.find(order => order.partType === design?.design.partType && order.version === design?.design.version);
  return <Panel title={t("car.physical.manufacturing")}><div className="career-content">
    <p>{t("car.physical.capacity", { active: format.number(activeOrders.length), capacity: format.number(MAX_ACTIVE_MANUFACTURING_ORDERS) })}</p>
    <form action={action} className="transition-form">
      <input type="hidden" name="careerId" value={careerId} />
      <input type="hidden" name="intent" value="manufacture" />
      <input type="hidden" name="expectedCompletionDate" value={plan?.completesAtCareerDate ?? ""} />
      <label htmlFor="manufacture-design">{t("car.physical.availableDesign")}</label>
      <select id="manufacture-design" name="designId" value={design?.id ?? ""} onChange={event => setDesignId(event.target.value)} disabled={!active || pending}>
        {physical.designs.map(row => <option key={row.id} value={row.id}>{t(names[row.design.partType])} {t("car.version", { version: format.number(row.design.version) })}</option>)}
      </select>
      <label htmlFor="manufacture-quantity">{t("car.physical.quantity")}</label>
      <select id="manufacture-quantity" name="quantity" value={quantity} onChange={event => setQuantity(Number(event.target.value) as 1 | 2)} disabled={!active || pending}>
        <option value="1">{format.number(1)}</option><option value="2">{format.number(2)}</option>
      </select>
      {design && plan && <div aria-live="polite">
        <p>{t("car.physical.manufacturingTime", { days: format.number(plan.durationDays) })}</p>
        <p>{t("car.physical.completionDate")}: {format.date(displayDate(plan.completesAtCareerDate))}</p>
        <p>{t("car.physical.currentInventory", { count: format.number(design.availableUnits) })}</p>
      </div>}
      <button type="submit" disabled={disabled}>{t("car.physical.manufacture")}</button>
    </form>
    <ActionStatus state={state} />
    <p className="muted">{t("car.physical.careerDate")}: {format.date(displayDate(careerDate))}</p>
  </div></Panel>;
}
function FitOptions({ physical, careerId, slot, active }: { physical: PlayerPhysicalOverview; careerId: string; slot: CarSlot; active: boolean }) {
  const { t, format } = useI18n();
  const router = useRouter();
  const [state, action, pending] = useActionState(carPhysicalAction, initial);
  useEffect(() => { if (state.success) router.refresh(); }, [state.success, router]);
  const options = physical.fitImpacts.filter(row => row.slot === slot);
  return <div className="career-content"><h3>{t("car.physical.fit")}</h3>
    {options.length ? <div className="career-list">{options.map(impact => <div className="career-content" key={`${slot}-${impact.designId}`}>
      <p>{t(names[impact.partType])} {t("car.version", { version: format.number(impact.version) })}</p>
      <p>{t("car.overall")}: {format.number(impact.beforeOverall)} → {format.number(impact.afterOverall)}</p>
      <dl className="career-facts">{CAR_PERFORMANCE_DIMENSIONS.map(dimension => <div key={dimension}><dt>{t(dimensions[dimension])}</dt><dd>{format.number(impact.before[dimension])} → {format.number(impact.after[dimension])}</dd></div>)}</dl>
      <form action={action} className="transition-form">
        <input type="hidden" name="careerId" value={careerId} /><input type="hidden" name="intent" value="fit" />
        <input type="hidden" name="slot" value={slot} /><input type="hidden" name="designId" value={impact.designId} />
        <input type="hidden" name="impact" value={JSON.stringify(impact)} />
        <button type="submit" disabled={!active || pending}>{t("car.physical.fitDesign", { part: t(names[impact.partType]), version: format.number(impact.version), car: t(slots[slot]) })}</button>
      </form>
    </div>)}</div> : <p>{t("car.physical.noUnitsAvailable")}</p>}
    <ActionStatus state={state} />
  </div>;
}
export function CarPhysicalView({ physical, careerId, careerDate, active }: { physical: PlayerPhysicalOverview; careerId: string; careerDate: string; active: boolean }) {
  const { t, format } = useI18n();
  return <>
    <div className="dashboard-grid">{physical.cars.map(car => <Panel key={car.slot} title={t(slots[car.slot])}><div className="career-content">
      <p>{t("car.physical.assignedDriver")}: {car.driverName}</p>
      <dl className="career-facts"><div><dt>{t("car.overall")}</dt><dd>{format.number(car.overall)}</dd></div>
        {CAR_PERFORMANCE_DIMENSIONS.map(dimension => <div key={dimension}><dt>{t(dimensions[dimension])}</dt><dd>{format.number(car.stats[dimension])}</dd></div>)}</dl>
      <h3>{t("car.physical.currentlyFitted")}</h3>
      <ul>{CAR_PART_TYPES.map(type => { const part = car.parts.find(row => row.partType === type);
        return <li key={type}>{t(names[type])}: {part ? t("car.physical.fittedUnit", { version: format.number(part.version), unit: format.number(part.unitNumber) }) : t("car.physical.noUnitsAvailable")}</li>; })}</ul>
    </div><FitOptions physical={physical} careerId={careerId} slot={car.slot} active={active} /></Panel>)}</div>
    <div className="dashboard-grid">
      <Panel title={t("car.physical.inventory")}>
        {physical.designs.some(row => row.availableUnits) ? <div className="career-list">{physical.designs.filter(row => row.availableUnits).map(row => <div className="career-content" key={row.id}>
          <h3>{t(names[row.design.partType])} {t("car.version", { version: format.number(row.design.version) })}</h3>
          <p>{t("car.physical.availableUnits", { count: format.number(row.availableUnits) })}</p>
        </div>)}</div> : <EmptyState title={t("car.physical.noInventory")}>{t("car.physical.noInventoryBody")}</EmptyState>}
      </Panel>
      <Manufacturing physical={physical} careerId={careerId} careerDate={careerDate} active={active} />
    </div>
    <Panel title={t("car.physical.orders")}>
      {physical.orders.length ? <div className="career-list">{physical.orders.map(order => {
        const progress = projectProgress(order.startedAtCareerDate, order.completesAtCareerDate, careerDate);
        return <div className="career-content" key={order.id}>
          <h3>{t(names[order.partType])} {t("car.version", { version: format.number(order.version) })} ×{format.number(order.quantity)}</h3>
          <p>{t(order.status === "ACTIVE" ? "car.physical.activeManufacturing" : "car.physical.completedManufacturing")}</p>
          <p>{t("car.physical.startDate")}: {format.date(displayDate(order.startedAtCareerDate))}</p>
          <p>{t("car.physical.completionDate")}: {format.date(displayDate(order.completesAtCareerDate))}</p>
          {order.status === "ACTIVE" && <><label htmlFor={`manufacturing-${order.id}`}>{t("car.daysRemaining", { days: format.number(progress.daysRemaining) })} · {format.number(progress.percent)}%</label>
            <progress id={`manufacturing-${order.id}`} max={progress.daysTotal} value={progress.daysElapsed} /></>}
        </div>; })}</div> : <EmptyState title={t("car.physical.noOrders")}>{t("car.physical.noOrdersBody")}</EmptyState>}
    </Panel>
  </>;
}

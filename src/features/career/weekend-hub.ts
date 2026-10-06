import type { ChampionshipSession, ChampionshipSource } from "../../game/domain/championship-repository";
import { standingsPage } from "../championship/model";
import type { CircuitCard } from "./circuit-card";
import type { Finish } from "./command-centre";
/**
 * Race Weekend Hub extras (UIX-A REDO): the player's drivers with their championship standing and this weekend's
 * classified results, plus the circuit card when the event is the Career's current/next one. Pure projection of the
 * existing Championship read model; the hub renders without it.
 */
export interface WeekendDriver {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly carNumber: number | null;
  /** Null until a Sprint or Grand Prix is classified. */
  readonly position: number | null;
  readonly tied: boolean;
  readonly units: number;
  /** Grand Prix Qualifying position (the Grand Prix grid) once Qualifying is classified. */
  readonly qualifying: number | null;
  readonly sprint: Finish | null;
  readonly race: Finish | null;
}
export interface WeekendExtras {
  readonly teamColor?: string | null;
  readonly circuit?: CircuitCard | null;
  readonly drivers?: readonly WeekendDriver[] | null;
}
const finish = (session: ChampionshipSession | null, driverId: string): Finish | null => {
  const row = session?.entrants.find((e) => e.driverId === driverId);
  return row ? { position: row.position, retired: row.retired, disqualified: row.disqualified } : null;
};
export function weekendDrivers(source: ChampionshipSource, eventId: string): WeekendDriver[] | null {
  const event = source.events.find((e) => e.id === eventId);
  if (!event) return null;
  const order = (id: string) => source.roster.findIndex((r) => r.driverId === id);
  const page = standingsPage(source, null);
  return page.drivers
    .filter((d) => d.driver.player)
    .sort((a, b) => order(a.driver.id) - order(b.driver.id))
    .map((d) => ({
      id: d.driver.id,
      name: d.driver.name,
      abbreviation: d.driver.abbreviation,
      carNumber: d.driver.carNumber,
      position: page.through ? d.position : null,
      tied: d.tied,
      units: d.units,
      qualifying: event.qualifying?.find((q) => q.driverId === d.driver.id)?.position ?? null,
      sprint: finish(event.sprint, d.driver.id),
      race: finish(event.race, d.driver.id),
    }));
}

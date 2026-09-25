import type { EntityId, TeamIdentity, DriverIdentity } from "./identity";
/** Source content only. ISO date-only strings are distinct from translated display text. */
export type IsoDate = string;
export interface AuditedContent {
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface ScopedContent {
  readonly id: EntityId;
  readonly gameDatabaseId: EntityId;
  readonly key: string;
}
export interface GameDatabase extends AuditedContent {
  readonly id: EntityId;
  readonly key: string;
  readonly name: string;
  readonly version: string;
  readonly schemaVersion: number;
  readonly description: string | null;
  readonly isBuiltIn: boolean;
}
export interface Team extends TeamIdentity, ScopedContent, AuditedContent {
  readonly color: string;
  readonly secondaryColor: string | null;
  readonly countryCode: string;
  readonly foundedYear: number | null;
}
export interface Driver extends DriverIdentity, ScopedContent, AuditedContent {
  readonly dateOfBirth: IsoDate;
  readonly nationalityCode: string;
  readonly preferredNumber: number | null;
}
export interface Circuit extends ScopedContent, AuditedContent {
  readonly name: string;
  readonly countryCode: string;
  readonly city: string | null;
  readonly lengthMeters: number;
  readonly defaultLapCount: number;
}
export interface Season extends ScopedContent, AuditedContent {
  readonly year: number;
  readonly name: string;
}
export interface SeasonTeamEntry {
  readonly id: EntityId;
  readonly gameDatabaseId: EntityId;
  readonly seasonId: EntityId;
  readonly teamId: EntityId;
  readonly entryOrder: number;
  /** Game-balance data (development values, 0–100), separate from team identity. Absent on legacy content. */
  readonly carPerformance?: number | null;
}
export type DriverRole = "RACE_DRIVER" | "RESERVE_DRIVER";
export interface SeasonDriverEntry {
  readonly id: EntityId;
  readonly gameDatabaseId: EntityId;
  readonly seasonId: EntityId;
  readonly driverId: EntityId;
  readonly teamId: EntityId;
  readonly carNumber: number | null;
  readonly role: DriverRole;
  /** Game-balance data (development values, 0–100), separate from driver identity. Absent on legacy content. */
  readonly pace?: number | null;
  readonly consistency?: number | null;
}
export interface CalendarEvent {
  readonly id: EntityId;
  readonly gameDatabaseId: EntityId;
  readonly seasonId: EntityId;
  readonly circuitId: EntityId;
  readonly round: number;
  readonly name: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
}

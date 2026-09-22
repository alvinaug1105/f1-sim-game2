import type { CareerErrorCode } from "../../game/domain/career";
export interface CareerActionState {
  readonly error: CareerErrorCode | null;
}

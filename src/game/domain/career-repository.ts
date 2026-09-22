import type { GameContentRepository } from "./content-repository";
import type {
  Career,
  CareerWorld,
  CareerOverview,
  CareerSummary,
  CareerCreationOptions,
} from "./career";
import type { EntityId } from "./identity";
export interface CareerCreationTransaction {
  readonly source: GameContentRepository;
  saveWorld(world: CareerWorld): Promise<void>;
}
export interface CareerRepository {
  /** Both source reads and all snapshot writes share one repeatable-read transaction. */
  createAtomically(
    work: (transaction: CareerCreationTransaction) => Promise<Career>,
  ): Promise<Career>;
  getCareerById(id: EntityId): Promise<Career | null>;
  getCareerOverview(id: EntityId): Promise<CareerOverview | null>;
  listCareers(): Promise<readonly CareerSummary[]>;
  getCreationOptions(): Promise<CareerCreationOptions>;
}

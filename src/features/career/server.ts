import "server-only";
import { getPrisma } from "../../data/prisma/client";
import { PrismaCareerRepository } from "../../data/repositories/prisma-career";
import type { CareerRepository } from "../../game/domain/career-repository";
import { CareerError, type CareerErrorCode } from "../../game/domain/career";
export function getCareerRepository(): CareerRepository {
  return new PrismaCareerRepository(getPrisma());
}
export type CareerLoadResult<T> =
  { ok: true; data: T } | { ok: false; code: CareerErrorCode };
/** Infrastructure details stay in server logs, never in serialized UI errors. */
export async function loadCareerData<T>(
  read: (repository: CareerRepository) => Promise<T>,
): Promise<CareerLoadResult<T>> {
  try {
    return { ok: true, data: await read(getCareerRepository()) };
  } catch (error) {
    console.error("Career read failed", error);
    return {
      ok: false,
      code: error instanceof CareerError ? error.code : "PERSISTENCE_FAILED",
    };
  }
}

import { PrismaProgressionRepository } from "../../data/repositories/prisma-progression";
import type { CareerProgressionRepository } from "../../game/domain/progression";
export function getProgressionRepository(): CareerProgressionRepository {
  return new PrismaProgressionRepository(getPrisma());
}

import { PrismaRaceRepository } from "../../data/repositories/prisma-race";
import type { CareerRaceRepository, RaceKind } from "../../game/domain/race-repository";
/** One repository per session kind: the Grand Prix (RACE) or the Sprint (SPRINT). */
export function getRaceRepository(kind: RaceKind = "RACE"): CareerRaceRepository {
  return new PrismaRaceRepository(getPrisma(), kind);
}

import { PrismaPracticeRepository } from "../../data/repositories/prisma-practice";
import type { CareerPracticeRepository } from "../../game/domain/practice-repository";
export function getPracticeRepository(): CareerPracticeRepository {
  return new PrismaPracticeRepository(getPrisma());
}

import { PrismaQualifyingRepository } from "../../data/repositories/prisma-qualifying";
import type { CareerQualifyingRepository, QualifyingKind } from "../../game/domain/qualifying-repository";
/** One repository per session kind: Grand Prix Qualifying or Sprint Qualifying. */
export function getQualifyingRepository(kind: QualifyingKind = "QUALIFYING"): CareerQualifyingRepository {
  return new PrismaQualifyingRepository(getPrisma(), kind);
}

import { PrismaChampionshipRepository } from "../../data/repositories/prisma-championship";
import type { ChampionshipRepository } from "../../game/domain/championship-repository";
/** Read-only Championship source: completed results of the Career's current season, loaded in bounded queries. */
export function getChampionshipRepository(): ChampionshipRepository {
  return new PrismaChampionshipRepository(getPrisma());
}

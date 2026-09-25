import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { assertContentId } from "../../game/domain/content-repository";
import { isPractice } from "../../game/domain/progression";
import { PracticeError, type CareerPracticeData, type CareerPracticeRepository, type WeekendPreparationRecord } from "../../game/domain/practice-repository";
import { validatePracticeInput } from "../../simulation/practice/engine";
import { SETUP_DIMENSIONS, type FeedbackLevel, type PracticeSessionType, type PracticeState, type Preparation, type Setup, type SetupDimension } from "../../simulation/practice/model";
import { validateTyreConfiguration, validateTyreState, type TyreCompound, type TyreConfiguration } from "../../simulation/race/tyres/model";
import { validateWeatherState, type WeatherConfiguration } from "../../simulation/race/weather/model";
import { loadProgress, persistProgress } from "./prisma-progression";
import { rosterBalance } from "../../game/domain/race-repository";
const COLUMN: Readonly<Record<SetupDimension, string>> = { AERO: "Aero", MECHANICAL: "Mechanical", RIDE: "Ride", BRAKE: "Brake", TYRE: "Tyre" };
const KNOWLEDGE: Readonly<Record<TyreCompound, string>> = { SOFT: "knowledgeSoft", MEDIUM: "knowledgeMedium", HARD: "knowledgeHard", INTERMEDIATE: "knowledgeIntermediate", WET: "knowledgeWet" };
type PrepRow = Prisma.CareerWeekendPreparationGetPayload<object>;
function validate(...ids: string[]) {
    try { for (const id of ids) assertContentId(id); } catch { throw new PracticeError("NOT_FOUND"); }
}
async function protect<T>(work: () => Promise<T>) {
    try { return await work(); } catch (cause) { if (cause instanceof PracticeError) throw cause; throw new PracticeError("PERSISTENCE_FAILED", { cause }); }
}
const setupFrom = (row: PrepRow, prefix: "ideal" | "setup"): Setup => Object.fromEntries(SETUP_DIMENSIONS.map(d => [d, row[`${prefix}${COLUMN[d]}` as keyof PrepRow] as number])) as Setup;
/** Weekend preparation row → record (shared with Qualifying, which consumes the same carry-over). */
export function readPreparation(row: PrepRow): WeekendPreparationRecord {
    const feedback = SETUP_DIMENSIONS.map(d => row[`feedback${COLUMN[d]}` as keyof PrepRow] as number | null);
    const preparation: Preparation = {
        setup: setupFrom(row, "setup"), setupRevision: row.setupRevision, confidence: row.confidence, acclimatisation: row.acclimatisation,
        tyreKnowledge: Object.fromEntries(Object.entries(KNOWLEDGE).map(([c, column]) => [c, row[column as keyof PrepRow] as number])) as Record<TyreCompound, number>,
        feedback: feedback.every(v => v !== null) ? Object.fromEntries(SETUP_DIMENSIONS.map((d, i) => [d, feedback[i] as FeedbackLevel])) as Record<SetupDimension, FeedbackLevel> : null,
        feedbackReliability: row.feedbackReliability, feedbackRevision: row.feedbackRevision, representativeLaps: row.representativeLaps,
    };
    return { driverId: row.careerDriverId, ideal: setupFrom(row, "ideal"), preparation };
}
function preparationColumns(ideal: Setup, p: Preparation) {
    return {
        ...Object.fromEntries(SETUP_DIMENSIONS.flatMap(d => [[`ideal${COLUMN[d]}`, ideal[d]], [`setup${COLUMN[d]}`, p.setup[d]], [`feedback${COLUMN[d]}`, p.feedback ? p.feedback[d] : null]])),
        ...Object.fromEntries(Object.entries(KNOWLEDGE).map(([c, column]) => [column, p.tyreKnowledge[c as TyreCompound]])),
        setupRevision: p.setupRevision, confidence: p.confidence, acclimatisation: p.acclimatisation,
        feedbackReliability: p.feedbackReliability, feedbackRevision: p.feedbackRevision, representativeLaps: p.representativeLaps,
    } as unknown as Omit<Prisma.CareerWeekendPreparationUncheckedCreateInput, "careerId" | "careerRaceWeekendId" | "careerDriverId">;
}
async function read(tx: Prisma.TransactionClient, careerId: string, eventId: string, sessionId: string): Promise<CareerPracticeData | null> {
    const progress = await loadProgress(tx, careerId);
    const event = progress?.events.find(e => e.id === eventId);
    const session = event?.weekend?.sessions.find(s => s.id === sessionId);
    if (!progress || !event?.weekend || !session || !isPractice(session.type)) return null;
    // Sequential: one transaction connection must never run overlapping queries.
    const row = await tx.careerPracticeSimulation.findUnique({ where: { careerSessionId: sessionId }, include: { entrants: { orderBy: { entryOrder: "asc" }, include: { runs: { orderBy: { number: "asc" } } } } } });
    const circuit = await tx.careerCircuit.findUniqueOrThrow({ where: { id: event.careerCircuitId } });
    const roster = await tx.careerSeasonDriverEntry.findMany({
            where: { careerId, careerSeasonId: event.careerSeasonId, role: "RACE_DRIVER" },
            include: { driver: true, teamEntry: { include: { team: true } } },
            orderBy: [{ teamEntry: { entryOrder: "asc" } }, { driver: { sourceDriverId: "asc" } }, { id: "asc" }],
        });
    const preps = await tx.careerWeekendPreparation.findMany({ where: { careerId, careerRaceWeekendId: event.weekend.id } });
    const preparations = preps.map(readPreparation);
    let state: PracticeState | null = null;
    if (row) {
        const tyres = row.tyreProfile as unknown as TyreConfiguration, weather = row.weatherProfile as unknown as WeatherConfiguration;
        validateTyreConfiguration(tyres);
        const prep = (driverId: string) => { const p = preparations.find(x => x.driverId === driverId); if (!p) throw new PracticeError("INVALID_INPUT"); return p; };
        state = {
            practiceVersion: 1,
            input: {
                version: 1, sessionType: row.sessionType as PracticeSessionType, seed: Number(row.seed), durationMs: row.durationMs, stepMs: row.stepMs, weatherTickMs: row.weatherTickMs,
                baseLapTimeMs: row.baseLapTimeMs, tyres, weather,
                entrants: row.entrants.map(e => ({ entrantId: e.id, driverId: e.careerDriverId, teamId: e.careerTeamId, controller: e.controller, driver: { pace: e.driverPace, consistency: e.driverConsistency }, car: { performance: e.carPerformance }, ideal: prep(e.careerDriverId).ideal })),
            },
            rngState: Number(row.rngState), elapsedMs: row.elapsedMs, status: row.status, weatherTick: row.weatherTick, evolution: row.evolution, autoPlayer: row.autoPlayer,
            weather: { rainfallIntensity: row.rainfallIntensity, airTemperatureMilliC: row.airTemperatureMilliC, trackTemperatureMilliC: row.trackTemperatureMilliC, trackWater: row.trackWater, drsState: row.drsState as "DRS_ENABLED" | "DRS_DISABLED_WET" },
            entrants: row.entrants.map(e => {
                const tyre = e.tyreCompound ? { compound: e.tyreCompound, ageLaps: e.tyreAgeLaps!, wearPermille: e.tyreWearPermille!, temperatureMilliC: e.tyreTemperatureMilliC! } : null;
                if (tyre) validateTyreState(tyre);
                return {
                    entrantId: e.id, location: e.location, distance: Number(e.distanceMicrolaps) / 1e6, lapElapsedMs: e.lapElapsedMs, lapTimeMs: e.lapTimeMs, tyre,
                    run: e.runNumber === null ? null : { number: e.runNumber, plan: { compound: e.runCompound!, targetLaps: e.runTargetLaps!, pace: e.runPace! }, timedLaps: e.runTimedLaps!, bestLapMs: e.runBestLapMs, callIn: e.runCallIn!, startedAtMs: e.runStartedAtMs!, endedAtMs: null },
                    runs: e.runs.map(r => ({ number: r.number, plan: { compound: r.compound, targetLaps: r.targetLaps, pace: r.pace }, timedLaps: r.timedLaps, bestLapMs: r.bestLapMs, callIn: false, startedAtMs: r.startedAtMs, endedAtMs: r.endedAtMs })),
                    readyAtMs: e.readyAtMs, lapsCompleted: e.lapsCompleted, timedLaps: e.timedLaps, lastLapMs: e.lastLapMs, bestLapMs: e.bestLapMs, bestLapCompound: e.bestLapCompound, commandRevision: e.commandRevision,
                    preparation: prep(e.careerDriverId).preparation,
                };
            }),
        };
        validatePracticeInput(state.input);
        validateWeatherState(state.weather);
    }
    return {
        progress, eventId, weekendId: event.weekend.id, sessionId, sessionType: session.type as PracticeSessionType, state,
        roster: roster.map(e => ({ driverId: e.careerDriverId, teamId: e.teamEntry.careerTeamId, driverName: `${e.driver.firstName} ${e.driver.lastName}`, teamName: e.teamEntry.team.name, teamOrder: e.teamEntry.entryOrder, abbreviation: e.driver.abbreviation, teamColor: e.teamEntry.team.color, carNumber: e.carNumber ?? e.driver.preferredNumber, balance: rosterBalance(e) })),
        entrantDrivers: Object.fromEntries((row?.entrants ?? []).map(e => [e.id, e.careerDriverId])),
        circuit: { sourceCircuitId: circuit.sourceCircuitId, lengthMeters: circuit.lengthMeters },
        preparations,
    };
}
function entrantColumns(e: PracticeState["entrants"][number]) {
    return {
        location: e.location, distanceMicrolaps: BigInt(Math.round(e.distance * 1e6)), lapElapsedMs: e.lapElapsedMs, lapTimeMs: e.lapTimeMs,
        tyreCompound: e.tyre?.compound ?? null, tyreAgeLaps: e.tyre?.ageLaps ?? null, tyreWearPermille: e.tyre?.wearPermille ?? null, tyreTemperatureMilliC: e.tyre?.temperatureMilliC ?? null,
        runNumber: e.run?.number ?? null, runCompound: e.run?.plan.compound ?? null, runTargetLaps: e.run?.plan.targetLaps ?? null, runPace: e.run?.plan.pace ?? null,
        runTimedLaps: e.run?.timedLaps ?? null, runBestLapMs: e.run?.bestLapMs ?? null, runCallIn: e.run?.callIn ?? null, runStartedAtMs: e.run?.startedAtMs ?? null,
        readyAtMs: e.readyAtMs, lapsCompleted: e.lapsCompleted, timedLaps: e.timedLaps, lastLapMs: e.lastLapMs, bestLapMs: e.bestLapMs, bestLapCompound: e.bestLapCompound, commandRevision: e.commandRevision,
    };
}
function sessionColumns(s: PracticeState) {
    return { rngState: BigInt(s.rngState), elapsedMs: s.elapsedMs, status: s.status, weatherTick: s.weatherTick, evolution: s.evolution, autoPlayer: s.autoPlayer, ...s.weather };
}
export class PrismaPracticeRepository implements CareerPracticeRepository {
    constructor(private readonly client: PrismaClient) {}
    async getPractice(careerId: string, eventId: string, sessionId: string) {
        validate(careerId, eventId, sessionId);
        return protect(() => this.client.$transaction(tx => read(tx, careerId, eventId, sessionId), { isolationLevel: "RepeatableRead" }));
    }
    async changePractice(careerId: string, eventId: string, sessionId: string, change: Parameters<CareerPracticeRepository["changePractice"]>[3]) {
        validate(careerId, eventId, sessionId);
        return protect(() => this.client.$transaction(async tx => {
            // Career row lock: every Practice / Race / progression mutation for this Career is serialised.
            const locked = await tx.career.updateMany({ where: { id: careerId }, data: { updatedAt: new Date() } });
            if (!locked.count) throw new PracticeError("NOT_FOUND");
            const before = await read(tx, careerId, eventId, sessionId);
            if (!before) throw new PracticeError("NOT_FOUND");
            const after = change(before), s = after.state;
            validatePracticeInput(s.input);
            const drivers = after.entrantDrivers ?? before.entrantDrivers;
            let simulationId: string;
            if (!before.state) {
                const created = await tx.careerPracticeSimulation.create({
                    data: {
                        careerId, careerSessionId: sessionId, sessionType: s.input.sessionType, practiceVersion: 1, seed: BigInt(s.input.seed), durationMs: s.input.durationMs,
                        stepMs: s.input.stepMs, weatherTickMs: s.input.weatherTickMs, baseLapTimeMs: s.input.baseLapTimeMs,
                        tyreProfile: JSON.parse(JSON.stringify(s.input.tyres)), weatherProfile: JSON.parse(JSON.stringify(s.input.weather)), ...sessionColumns(s),
                    },
                });
                simulationId = created.id;
                await tx.careerPracticeEntrant.createMany({
                    data: s.input.entrants.map((source, i) => {
                        const roster = before.roster.find(r => r.driverId === source.driverId)!;
                        return {
                            id: source.entrantId, careerId, careerPracticeSimulationId: simulationId, careerDriverId: source.driverId, careerTeamId: source.teamId,
                            driverName: roster.driverName, teamName: roster.teamName, entryOrder: i + 1, controller: source.controller,
                            driverPace: source.driver.pace, driverConsistency: source.driver.consistency, carPerformance: source.car.performance, ...entrantColumns(s.entrants[i]),
                        };
                    }),
                });
            } else {
                simulationId = (await tx.careerPracticeSimulation.update({ where: { careerSessionId: sessionId }, data: sessionColumns(s) })).id;
                for (const e of s.entrants) await tx.careerPracticeEntrant.update({ where: { id: e.entrantId }, data: entrantColumns(e) });
            }
            // Completed runs are immutable history: append only the new ones.
            for (const e of s.entrants) {
                const known = before.state?.entrants.find(x => x.entrantId === e.entrantId)?.runs.length ?? 0;
                const fresh = e.runs.slice(known);
                if (fresh.length) await tx.careerPracticeRun.createMany({ data: fresh.map(r => ({ careerId, careerPracticeEntrantId: e.entrantId, number: r.number, compound: r.plan.compound, targetLaps: r.plan.targetLaps, pace: r.plan.pace, timedLaps: r.timedLaps, bestLapMs: r.bestLapMs, startedAtMs: r.startedAtMs, endedAtMs: r.endedAtMs! })) });
            }
            // Weekend learning (and the hidden target) per driver, carried into later sessions.
            for (const source of s.input.entrants) {
                const driverId = drivers[source.entrantId] ?? source.driverId, prep = s.entrants.find(e => e.entrantId === source.entrantId)!.preparation;
                const data = preparationColumns(source.ideal, prep);
                await tx.careerWeekendPreparation.upsert({
                    where: { careerRaceWeekendId_careerDriverId: { careerRaceWeekendId: before.weekendId, careerDriverId: driverId } },
                    create: { careerId, careerRaceWeekendId: before.weekendId, careerDriverId: driverId, ...data },
                    update: data,
                });
            }
            await persistProgress(tx, before.progress, after.progress);
            const reread = await read(tx, careerId, eventId, sessionId);
            if (!reread) throw new PracticeError("NOT_FOUND");
            return reread;
        }, { isolationLevel: "ReadCommitted", timeout: 30000, maxWait: 5000 }));
    }
}

import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { assertContentId } from "../../game/domain/content-repository";
import { rosterBalance } from "../../game/domain/race-repository";
import { QualifyingError, type CareerQualifyingData, type CareerQualifyingRepository, type QualifyingKind } from "../../game/domain/qualifying-repository";
import { validateQualifyingInput } from "../../simulation/qualifying/engine";
import type { QualifyingFormat, QualifyingPreparation, QualifyingState } from "../../simulation/qualifying/model";
import { validateTyreConfiguration, validateTyreState, type TyreConfiguration } from "../../simulation/race/tyres/model";
import { validateWeatherState, type WeatherConfiguration } from "../../simulation/race/weather/model";
import { loadProgress, persistProgress } from "./prisma-progression";
import { readPreparation } from "./prisma-practice";
function validate(...ids: string[]) {
    try { for (const id of ids) assertContentId(id); } catch { throw new QualifyingError("NOT_FOUND"); }
}
async function protect<T>(work: () => Promise<T>) {
    try { return await work(); } catch (cause) { if (cause instanceof QualifyingError) throw cause; throw new QualifyingError("PERSISTENCE_FAILED", { cause }); }
}
const best = (ms: number | null, at: number | null) => ms === null || at === null ? null : { ms, setAtMs: at };
async function read(tx: Prisma.TransactionClient, careerId: string, eventId: string, kind: QualifyingKind): Promise<CareerQualifyingData | null> {
    const progress = await loadProgress(tx, careerId);
    const event = progress?.events.find(e => e.id === eventId);
    // Exact session type: a Sprint weekend holds both SPRINT_QUALIFYING and QUALIFYING.
    const session = event?.weekend?.sessions.find(s => s.type === kind);
    if (!progress || !event?.weekend || !session) return null;
    // Sequential: one transaction connection must never run overlapping queries.
    const row = await tx.careerQualifyingSimulation.findUnique({ where: { careerSessionId: session.id }, include: { entrants: { orderBy: { entryOrder: "asc" } } } });
    const circuit = await tx.careerCircuit.findUniqueOrThrow({ where: { id: event.careerCircuitId } });
    const roster = await tx.careerSeasonDriverEntry.findMany({
        where: { careerId, careerSeasonId: event.careerSeasonId, role: "RACE_DRIVER" },
        include: { driver: true, teamEntry: { include: { team: true } } },
        orderBy: [{ teamEntry: { entryOrder: "asc" } }, { driver: { sourceDriverId: "asc" } }, { id: "asc" }],
    });
    const preps = await tx.careerWeekendPreparation.findMany({ where: { careerId, careerRaceWeekendId: event.weekend.id } });
    // Latest completed Practice classification (by best lap) for the Q1 no-time fallback.
    const practice = [...event.weekend.sessions].filter(s => s.type.startsWith("PRACTICE") && s.status === "COMPLETED").sort((a, b) => b.order - a.order);
    let practiceOrder: string[] = [];
    for (const p of practice) {
        const sim = await tx.careerPracticeSimulation.findUnique({ where: { careerSessionId: p.id }, include: { entrants: true } });
        if (!sim) continue;
        practiceOrder = [...sim.entrants].sort((a, b) => (a.bestLapMs ?? Infinity) - (b.bestLapMs ?? Infinity) || a.entryOrder - b.entryOrder).map(e => e.careerDriverId);
        break;
    }
    let state: QualifyingState | null = null;
    if (row) {
        const tyres = row.tyreProfile as unknown as TyreConfiguration, weather = row.weatherProfile as unknown as WeatherConfiguration, format = row.formatProfile as unknown as QualifyingFormat;
        validateTyreConfiguration(tyres);
        state = {
            qualifyingVersion: 1,
            input: {
                version: 1, seed: Number(row.seed), stepMs: row.stepMs, weatherTickMs: row.weatherTickMs, baseLapTimeMs: row.baseLapTimeMs, format, tyres, weather,
                entrants: row.entrants.map(e => ({ entrantId: e.id, driverId: e.careerDriverId, teamId: e.careerTeamId, controller: e.controller,
                    driver: { pace: e.driverPace, consistency: e.driverConsistency }, car: { performance: e.carPerformance },
                    preparation: e.preparationProfile as unknown as QualifyingPreparation, fallbackRank: e.fallbackRank })),
            },
            rngState: Number(row.rngState), status: row.status, phase: row.phase, phaseStatus: row.phaseStatus, phaseElapsedMs: row.phaseElapsedMs, sessionElapsedMs: row.sessionElapsedMs,
            weather: { rainfallIntensity: row.rainfallIntensity, airTemperatureMilliC: row.airTemperatureMilliC, trackTemperatureMilliC: row.trackTemperatureMilliC, trackWater: row.trackWater, drsState: row.drsState as "DRS_ENABLED" | "DRS_DISABLED_WET" },
            weatherTick: row.weatherTick, evolution: row.evolution, autoPlayer: row.autoPlayer,
            entrants: row.entrants.map(e => {
                const tyre = e.tyreCompound ? { compound: e.tyreCompound, ageLaps: e.tyreAgeLaps!, wearPermille: e.tyreWearPermille!, temperatureMilliC: e.tyreTemperatureMilliC! } : null;
                if (tyre) validateTyreState(tyre);
                return {
                    entrantId: e.id, location: e.location, distance: Number(e.distanceMicrolaps) / 1e6, lapElapsedMs: e.lapElapsedMs, lapTimeMs: e.lapTimeMs, lapTrafficMs: e.lapTrafficMs, tyre,
                    run: e.runCompound === null ? null : { plan: { compound: e.runCompound, pushLaps: e.runPushLaps! }, pushDone: e.runPushDone!, callIn: e.runCallIn!, startedAtMs: e.runStartedAtMs! },
                    readyAtMs: e.readyAtMs, releaseAtMs: e.releaseAtMs, windowOffsetMs: e.windowOffsetMs, attempts: e.attempts, eliminatedIn: e.eliminatedIn,
                    best: { Q1: best(e.q1BestMs, e.q1SetAtMs), Q2: best(e.q2BestMs, e.q2SetAtMs), Q3: best(e.q3BestMs, e.q3SetAtMs) },
                    lastLapMs: e.lastLapMs, lastLapTrafficMs: e.lastLapTrafficMs, lapsCompleted: e.lapsCompleted, commandRevision: e.commandRevision, finalPosition: e.finalPosition,
                };
            }),
        };
        validateQualifyingInput(state.input);
        validateWeatherState(state.weather);
    }
    return {
        progress, eventId, weekendId: event.weekend.id, kind, sessionId: session.id, state,
        roster: roster.map(e => ({ driverId: e.careerDriverId, teamId: e.teamEntry.careerTeamId, driverName: `${e.driver.firstName} ${e.driver.lastName}`, teamName: e.teamEntry.team.name, teamOrder: e.teamEntry.entryOrder, abbreviation: e.driver.abbreviation, teamColor: e.teamEntry.team.color, carNumber: e.carNumber ?? e.driver.preferredNumber, balance: rosterBalance(e) })),
        circuit: { sourceCircuitId: circuit.sourceCircuitId, lengthMeters: circuit.lengthMeters },
        preparations: preps.map(readPreparation), practiceOrder,
    };
}
function entrantColumns(e: QualifyingState["entrants"][number]) {
    return {
        location: e.location, distanceMicrolaps: BigInt(Math.round(e.distance * 1e6)), lapElapsedMs: e.lapElapsedMs, lapTimeMs: e.lapTimeMs, lapTrafficMs: e.lapTrafficMs,
        tyreCompound: e.tyre?.compound ?? null, tyreAgeLaps: e.tyre?.ageLaps ?? null, tyreWearPermille: e.tyre?.wearPermille ?? null, tyreTemperatureMilliC: e.tyre?.temperatureMilliC ?? null,
        runCompound: e.run?.plan.compound ?? null, runPushLaps: e.run?.plan.pushLaps ?? null, runPushDone: e.run?.pushDone ?? null, runCallIn: e.run?.callIn ?? null, runStartedAtMs: e.run?.startedAtMs ?? null,
        readyAtMs: e.readyAtMs, releaseAtMs: e.releaseAtMs, windowOffsetMs: e.windowOffsetMs, attempts: e.attempts, eliminatedIn: e.eliminatedIn,
        q1BestMs: e.best.Q1?.ms ?? null, q1SetAtMs: e.best.Q1?.setAtMs ?? null, q2BestMs: e.best.Q2?.ms ?? null, q2SetAtMs: e.best.Q2?.setAtMs ?? null, q3BestMs: e.best.Q3?.ms ?? null, q3SetAtMs: e.best.Q3?.setAtMs ?? null,
        lastLapMs: e.lastLapMs, lastLapTrafficMs: e.lastLapTrafficMs, lapsCompleted: e.lapsCompleted, commandRevision: e.commandRevision, finalPosition: e.finalPosition,
    };
}
function sessionColumns(s: QualifyingState) {
    return { rngState: BigInt(s.rngState), status: s.status, phase: s.phase, phaseStatus: s.phaseStatus, phaseElapsedMs: s.phaseElapsedMs, sessionElapsedMs: s.sessionElapsedMs,
        weatherTick: s.weatherTick, evolution: s.evolution, autoPlayer: s.autoPlayer, ...s.weather };
}
export class PrismaQualifyingRepository implements CareerQualifyingRepository {
    constructor(private readonly client: PrismaClient, private readonly kind: QualifyingKind = "QUALIFYING") {}
    async getQualifying(careerId: string, eventId: string) {
        validate(careerId, eventId);
        return protect(() => this.client.$transaction(tx => read(tx, careerId, eventId, this.kind), { isolationLevel: "RepeatableRead" }));
    }
    async changeQualifying(careerId: string, eventId: string, change: Parameters<CareerQualifyingRepository["changeQualifying"]>[2]) {
        validate(careerId, eventId);
        return protect(() => this.client.$transaction(async tx => {
            // Career row lock: every Qualifying / Practice / Race / progression mutation for this Career is serialised.
            const locked = await tx.career.updateMany({ where: { id: careerId }, data: { updatedAt: new Date() } });
            if (!locked.count) throw new QualifyingError("NOT_FOUND");
            const before = await read(tx, careerId, eventId, this.kind);
            if (!before) throw new QualifyingError("NOT_FOUND");
            const after = change(before), s = after.state;
            validateQualifyingInput(s.input);
            if (!before.state) {
                const created = await tx.careerQualifyingSimulation.create({
                    data: {
                        careerId, careerSessionId: before.sessionId, sessionType: before.kind, qualifyingVersion: 1, seed: BigInt(s.input.seed), stepMs: s.input.stepMs,
                        weatherTickMs: s.input.weatherTickMs, baseLapTimeMs: s.input.baseLapTimeMs, formatProfile: JSON.parse(JSON.stringify(s.input.format)),
                        tyreProfile: JSON.parse(JSON.stringify(s.input.tyres)), weatherProfile: JSON.parse(JSON.stringify(s.input.weather)), ...sessionColumns(s),
                    },
                });
                await tx.careerQualifyingEntrant.createMany({
                    data: s.input.entrants.map((source, i) => {
                        const roster = before.roster.find(r => r.driverId === source.driverId)!;
                        return {
                            id: source.entrantId, careerId, careerQualifyingSimulationId: created.id, careerDriverId: source.driverId, careerTeamId: source.teamId,
                            driverName: roster.driverName, teamName: roster.teamName, entryOrder: i + 1, controller: source.controller,
                            driverPace: source.driver.pace, driverConsistency: source.driver.consistency, carPerformance: source.car.performance,
                            preparationProfile: JSON.parse(JSON.stringify(source.preparation)), fallbackRank: source.fallbackRank, ...entrantColumns(s.entrants[i]),
                        };
                    }),
                });
            } else {
                await tx.careerQualifyingSimulation.update({ where: { careerSessionId: before.sessionId }, data: sessionColumns(s) });
                for (const e of s.entrants) await tx.careerQualifyingEntrant.update({ where: { id: e.entrantId }, data: entrantColumns(e) });
            }
            await persistProgress(tx, before.progress, after.progress);
            const reread = await read(tx, careerId, eventId, this.kind);
            if (!reread) throw new QualifyingError("NOT_FOUND");
            return reread;
        }, { isolationLevel: "ReadCommitted", timeout: 30000, maxWait: 5000 }));
    }
}

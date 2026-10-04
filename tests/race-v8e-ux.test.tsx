/**
 * Race v8E player-facing changes: Overtake Mode reasons, Active Aero explanation, pace-qualified tyre life and the
 * rejoin estimate, pit-leader presentation, strategic-event additions (approaching cliff, POOR tyre, named
 * simultaneous items), event-feed grouping / filters, the wet-grid slick warning rule, and EN / ZH-Hant key parity.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/provider";
import en from "../src/i18n/en/messages.json";
import zh from "../src/i18n/zh-TW/messages.json";
import { advanceRace, advanceRaceLap } from "../src/simulation/race/engine";
import { projectRaceState, projectRaceView } from "../src/features/race/projection";
import { timingRows } from "../src/features/race/viewer/model";
import { TimingTower } from "../src/features/race/viewer/timing-tower";
import { DriverPanel } from "../src/features/race/viewer/driver-panel";
import { assessCheckpoint, initialAttention, CLIFF_WARNING_LAPS } from "../src/features/race/viewer/attention";
import { groupFeed, feedMatches, slickStartRisk, FEED_GROUP_MIN, type FeedItem } from "../src/features/race/viewer/race-view";
import type { RacePublicState } from "../src/features/race/public-view";
import type { RaceSimulationState } from "../src/simulation/race/types";
import { neutralise } from "./helpers/incidents";
import { placeInPitPhase } from "./helpers/pit-phase";
import { viewerData } from "./helpers/viewer";
import { v8eRace } from "./helpers/v8e";

const html = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider initialLocale="en">{node}</I18nProvider>);
const team = (s: RaceSimulationState) => s.input.entrants[0].teamId;
const view = (s: RaceSimulationState) => { const d = viewerData(4); return projectRaceView({ ...d, state: s, progress: { ...d.progress, career: { ...d.progress.career, playerTeamId: team(s) } } }); };
const running = () => advanceRace(v8eRace({ count: 6, players: 2, laps: 20, quiet: true, seed: 3 }), 3);

describe("Overtake Mode and Active Aero explanations (own car only, public facts only)", () => {
    it("Safety Car: Overtake Mode not eligible because of the SC; Active Aero restricted by the SC", () => {
        let s = neutralise(running(), "SAFETY_CAR", 4); s = advanceRaceLap(s);
        const own = projectRaceState(s, team(s)).entrants.find(e => e.entrantId === s.input.entrants[0].entrantId)!;
        expect(own.assistance!.overtakeReason).toBe("SAFETY_CAR");
        expect(own.assistance!.aeroReason).toBe("SAFETY_CAR");
        expect(own.assistance!.aeroStraightDeltaMs).toBe(s.input.progression!.assistance!.straightDeltaMs);
    }, 60_000);
    it("pit lane and zero-energy eligibility are named; rivals carry no reasons", () => {
        const base = running(), id = base.input.entrants[0].entrantId;
        const lane = placeInPitPhase(structuredClone(base), id, "LANE");
        lane.progression!.cars[id].assistance!.overtake = "NOT_ELIGIBLE";
        expect(projectRaceState(lane, team(lane)).entrants.find(e => e.entrantId === id)!.assistance!.overtakeReason).toBe("PIT_LANE");
        const empty = structuredClone(base);
        empty.progression!.cars[id].assistance!.overtake = "AVAILABLE"; empty.progression!.cars[id].assistance!.energy = 0;
        expect(projectRaceState(empty, team(empty)).entrants.find(e => e.entrantId === id)!.assistance!.overtakeReason).toBe("ELIGIBLE_NO_ENERGY");
        const rival = projectRaceState(base, team(base)).entrants.find(e => e.entrantId === base.input.entrants[5].entrantId)!;
        expect(rival.assistance).toBeUndefined();
        const json = JSON.stringify(projectRaceState(base, team(base)));
        for (const k of ["weatherRisk", "wetCompound", "attackCooldownMs", "attackRearmGapMs", "attacksThisLap", "lastAttackAtMs", "attackArmed", "passingCause", "scTrainCatchupPermille", "weatherHorizonSpreadLaps"]) expect(json).not.toContain(k);
    });
    it("the Driver Panel states the reason in words (never colour alone) and explains Active Aero without calling it DRS", () => {
        const s = running(), d = view(s), rows = timingRows(d), row = rows.find(r => r.id === s.input.entrants[0].entrantId)!;
        const panel = html(<DriverPanel data={d} row={row} busy={false} send={() => {}} rows={rows}/>);
        const reason = d.state!.entrants.find(e => e.entrantId === row.id)!.assistance!.overtakeReason!;
        expect(panel).toContain((en as Record<string, string>)[`assistance.overtakeReason.${reason}`].split("{")[0].trim());
        expect(panel).toContain("Active Aero");
        expect(panel).not.toMatch(/DRS/);
    });
});

describe("tyre life and rejoin estimates", () => {
    it("the estimate names its pace assumption and the range over pace modes; the rejoin region uses current gaps", () => {
        const s = running(), own = projectRaceState(s, team(s)).entrants.find(e => e.entrantId === s.input.entrants[0].entrantId)!;
        const est = own.insight!.pitEstimate!;
        expect(est.paceMode).toBe(s.entrants.find(e => e.entrantId === own.entrantId)!.commands!.paceMode);
        expect(est.lapsToCliffMin!).toBeLessThanOrEqual(est.lapsToCliff); expect(est.lapsToCliffMax!).toBeGreaterThanOrEqual(est.lapsToCliff);
        expect(est.rejoin!.best).toBeGreaterThanOrEqual(1); expect(est.rejoin!.best).toBeLessThanOrEqual(est.rejoin!.worst); expect(est.rejoin!.worst).toBeLessThanOrEqual(s.entrants.length);
        const d = view(s), rows = timingRows(d), row = rows.find(r => r.id === own.entrantId)!;
        expect(html(<DriverPanel data={d} row={row} busy={false} send={() => {}} rows={rows}/>)).toMatch(/at the current .* pace|Est\. rejoin/);
    });
});

describe("pit-leader presentation (Issue 16)", () => {
    it("the official leader in the pit lane reads 'Leader · In pit lane', not 'Leader PIT'; timing position is unchanged", () => {
        const s = running(), leader = s.entrants.find(e => e.position === 1)!.entrantId, lane = placeInPitPhase(structuredClone(s), leader, "LANE");
        const d = view(lane), rows = timingRows(d), tower = html(<TimingTower state={d.state!} rows={rows} selected={rows[0].id} onSelect={() => {}} interval={false} onInterval={() => {}}/>);
        expect(tower).toContain("In pit lane"); expect(tower).not.toMatch(/Leader<\/td>|Leader<small[^>]*>PIT/);
        expect(d.state!.entrants.find(e => e.entrantId === leader)!.position).toBe(1);
    });
});

describe("Next Strategic Event additions (Issue 17)", () => {
    const pub = (s: RaceSimulationState) => projectRaceState(s, team(s));
    const withOwn = (p: RacePublicState, change: (e: RacePublicState["entrants"][number]) => RacePublicState["entrants"][number]) =>
        ({ ...p, entrants: p.entrants.map(e => e.entrantId === p.input.entrants[0].entrantId ? change(e) : e) }) as RacePublicState;
    it("a tyre approaching its cliff is announced once per stint, before it is crossed", () => {
        const p0 = pub(running()), memory = initialAttention(withOwn(p0, e => ({ ...e, insight: { ...e.insight!, pitEstimate: { ...e.insight!.pitEstimate!, lapsToCliff: 10 } } })), team(running()));
        const near = withOwn(p0, e => ({ ...e, insight: { ...e.insight!, pitEstimate: { ...e.insight!.pitEstimate!, lapsToCliff: CLIFF_WARNING_LAPS } } }));
        const first = assessCheckpoint(memory, near, team(running()));
        expect(first.items.map(i => i.kind)).toContain("TYRE_CLIFF_SOON");
        expect(assessCheckpoint(first.memory, near, team(running())).items.map(i => i.kind)).not.toContain("TYRE_CLIFF_SOON");
    });
    it("a tyre family that becomes POOR is announced with a reason", () => {
        const p0 = pub(running()), id = p0.input.entrants[0].entrantId, family = "DRY" as const;
        const good = { ...p0, tyreFit: { best: family, levels: { DRY: "SUITABLE", INTERMEDIATE: "POOR", WET: "POOR" } } } as RacePublicState;
        const bad = { ...p0, tyreFit: { best: "WET", levels: { DRY: "POOR", INTERMEDIATE: "MARGINAL", WET: "SUITABLE" } } } as RacePublicState;
        const items = assessCheckpoint(initialAttention(good, team(running())), bad, team(running())).items;
        expect(items.find(i => i.kind === "TYRE_POOR")?.entrantId).toBe(id);
        for (const i of items) expect(i.reason).toBeTruthy();
    });
});

describe("event feed grouping and filters (Issue 19)", () => {
    const stop = (id: string, lap: number, player = false): FeedItem => ({ key: `p${id}`, lap, category: "PIT", important: player, player, entrantIds: [id],
        stop: { number: 1, lap, oldCompound: "MEDIUM", newCompound: "INTERMEDIATE", pitLaneLossMs: 20000, stationaryTimeMs: 2500, totalLossMs: 22500 } });
    it("simultaneous rival stops onto one compound collapse into one item; player stops never do; nothing is dropped", () => {
        const items = [stop("a", 9), stop("b", 9), stop("c", 9), stop("me", 9, true), stop("d", 8)];
        const grouped = groupFeed(items);
        const g = grouped.find(x => x.group)!;
        expect(g.group!.items.map(x => x.entrantIds[0])).toEqual(["a", "b", "c"]);
        expect(grouped.some(x => x.entrantIds[0] === "me" && !x.group)).toBe(true);
        expect(grouped.flatMap(x => x.group ? x.group.items : [x])).toHaveLength(items.length);
        expect(groupFeed(items.slice(0, FEED_GROUP_MIN - 1)).some(x => x.group)).toBe(false);
        expect(feedMatches(stop("me", 9, true), "PLAYER")).toBe(true); expect(feedMatches(stop("a", 9), "PLAYER")).toBe(false);
        expect(feedMatches(stop("a", 9), "STRATEGY")).toBe(true); expect(feedMatches(stop("a", 9), "OVERTAKE")).toBe(false);
    });
});

describe("wet-grid slick warning (Issue 20)", () => {
    it("warns only when a player car would start on a dry tyre and dry tyres are POOR on the current grid", () => {
        const wet = { best: "WET" as const, levels: { DRY: "POOR" as const, INTERMEDIATE: "MARGINAL" as const, WET: "SUITABLE" as const } };
        const damp = { best: "INTERMEDIATE" as const, levels: { DRY: "MARGINAL" as const, INTERMEDIATE: "SUITABLE" as const, WET: "POOR" as const } };
        expect(slickStartRisk(wet, ["SOFT", "WET"])).toBe(true);
        expect(slickStartRisk(wet, ["WET", "INTERMEDIATE"])).toBe(false);
        expect(slickStartRisk(damp, ["SOFT"])).toBe(false);
        expect(slickStartRisk(null, ["SOFT"])).toBe(false);
    });
    it("the preparation view carries the current-grid assessment (never the weather timeline)", () => {
        const d = viewerData(4), prep = projectRaceView({ ...d, state: null }).preparation!;
        expect(prep.gridTyreFit).toMatchObject({ best: expect.any(String), levels: { DRY: expect.any(String), INTERMEDIATE: expect.any(String), WET: expect.any(String) } });
        expect(JSON.stringify(prep)).not.toContain("timeline");
    });
});

describe("i18n (EN / ZH-Hant)", () => {
    it("every v8E key exists in both locales and the catalogues stay in parity", () => {
        const keys = ["assistance.overtakeReason.ACTIVE", "assistance.overtakeReason.ELIGIBLE", "assistance.overtakeReason.ELIGIBLE_NO_ENERGY", "assistance.overtakeReason.NOT_RUNNING",
            "assistance.overtakeReason.PIT_LANE", "assistance.overtakeReason.SAFETY_CAR", "assistance.overtakeReason.VSC", "assistance.overtakeReason.WET", "assistance.overtakeReason.NO_CAR_AHEAD",
            "assistance.overtakeReason.LAPPING", "assistance.overtakeReason.GAP", "assistance.overtakeReason.AWAITING_DETECTION", "assistance.aeroReason.STRAIGHT", "assistance.aeroReason.CORNER",
            "assistance.aeroReason.NOT_RUNNING", "assistance.aeroReason.PIT_LANE", "assistance.aeroReason.SAFETY_CAR", "assistance.aeroReason.VSC", "assistance.aeroReason.WET", "assistance.aeroHelp",
            "assistance.aeroEffect", "assistance.aeroEffectBaseline", "viewer.tyreLifeAtPace", "viewer.tyreLifeRange", "pit.rejoin", "pit.rejoinAt", "pit.rejoinRange", "pit.rejoinNote",
            "viewer.leaderBadge", "viewer.inPitLane", "viewer.attention.TYRE_CLIFF_SOON", "viewer.attention.TYRE_POOR", "viewer.alsoAttention", "viewer.feedGroup", "viewer.feedGroupDetails",
            "viewer.feedFilter", "viewer.feedFilter.ALL", "viewer.feedFilter.PLAYER", "viewer.feedFilter.OVERTAKE", "viewer.feedFilter.STRATEGY", "viewer.feedFilter.CONTROL",
            "qualifying.fitNote.SUITABLE", "qualifying.fitNote.MARGINAL", "qualifying.fitNote.POOR", "prep.slickWarning", "prep.slickConfirm", "incident.gapNote.VSC", "incident.gapNote.SAFETY_CAR"];
        for (const k of keys) { expect((en as Record<string, string>)[k], k).toBeTruthy(); expect((zh as Record<string, string>)[k], k).toBeTruthy(); }
        expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
        expect((en as Record<string, string>)["viewer.reason.LIMIT"]).not.toMatch(/^\?$/);
        for (const [k, v] of Object.entries(en)) expect(v.trim(), k).not.toBe("?");
    });
});

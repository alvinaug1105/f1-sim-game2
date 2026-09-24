import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { placeLabels, labelRect, slotCentre, LABEL_SIZE, LABEL_TIER, STICKY_FRAMES, type Rect, type SlotMemory, type LabelRequest, type Point } from '../src/features/race/viewer/labels';
import { battleContext, labelTiers, raceFeed, tyreCondition, drsState, driverSnapshot, BATTLE_GAP_MS } from '../src/features/race/viewer/race-view';
import { timingRows } from '../src/features/race/viewer/model';
import { TrackMap } from '../src/features/race/viewer/track-map';
import { DriverPanel } from '../src/features/race/viewer/driver-panel';
import { layoutForCircuit } from '../src/data/seed/circuit-layouts';
import { I18nProvider } from '../src/i18n/provider';
import { viewerData } from './helpers/viewer';
import type { CareerRaceData } from '../src/game/domain/race-repository';
const bounds: Rect = { x: 0, y: 0, w: 1000, h: 650 };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Fixture with explicit authoritative order and intervals; nothing is simulated. */
function withIntervals(intervals: (number | null)[]): CareerRaceData {
    const d = viewerData(intervals.length), s = d.state!;
    let gap = 0;
    const entrants = s.entrants.map((e, i) => { gap += intervals[i] ?? 0; return { ...e, position: i + 1, intervalToAheadMs: i === 0 ? null : intervals[i], gapToLeaderMs: i === 0 ? null : gap }; });
    return { ...d, state: { ...s, lap: 5, entrants } };
}
describe('map label placement', () => {
    const pack = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, x: 500 + (i % 5) * 7, y: 300 + Math.floor(i / 5) * 7 }));
    const tiers = (i: number) => i === 0 ? LABEL_TIER.SELECTED : i === 1 ? LABEL_TIER.PLAYER : i < 4 ? LABEL_TIER.BATTLE : i === 4 ? LABEL_TIER.LEADER : LABEL_TIER.FIELD;
    const requests = pack.map((c, i) => ({ ...c, tier: tiers(i) }));
    it('keeps selected and player labels in a dense 20-car pack, hides field labels, and never stacks placed labels', () => {
        const placed = placeLabels(requests, { bounds, markers: pack });
        expect(placed.get('c0')).not.toBeNull(); expect(placed.get('c1')).not.toBeNull();
        for (let i = 5; i < 20; i++) expect(placed.get(`c${i}`)).toBeNull();
        const rects = requests.filter(r => placed.get(r.id)).map(r => labelRect(placed.get(r.id)!, LABEL_SIZE[r.tier]));
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
        // The selected label never sits on top of any marker when free slots exist.
        const selected = rects[0];
        expect(pack.some(m => m.x > selected.x && m.x < selected.x + selected.w && m.y > selected.y && m.y < selected.y + selected.h)).toBe(false);
    });
    it('is deterministic and does not depend on request order beyond tier ties', () => {
        const a = placeLabels(requests, { bounds, markers: pack }), b = placeLabels([...requests].reverse(), { bounds, markers: pack });
        expect([...a.entries()].sort()).toEqual([...placeLabels(requests, { bounds, markers: pack }).entries()].sort());
        expect(a.get('c0')).toEqual(b.get('c0')); expect(a.get('c1')).toEqual(b.get('c1'));
    });
    it('never covers a reserved START / FINISH region', () => {
        const reserved: Rect = { x: 470, y: 320, w: 150, h: 24 };
        const car = { id: 'a', x: 500, y: 300, tier: LABEL_TIER.SELECTED };
        const at = placeLabels([car], { bounds, markers: [car], reserved: [reserved] }).get('a')!;
        expect(overlaps(labelRect(at, LABEL_SIZE[0]), reserved)).toBe(false);
    });
    it('prefers the previous slot while it stays free (no flicker)', () => {
        const car = { id: 'a', x: 500, y: 300, tier: LABEL_TIER.BATTLE };
        expect(placeLabels([car], { bounds, markers: [car], previous: new Map([['a', { slot: 5, blocked: 0 }]]) }).get('a')!.slot).toBe(5);
    });
    it('hides low-priority labels without a free slot but forces the selected label to stay visible', () => {
        const tight: Rect = { x: 480, y: 280, w: 40, h: 40 };
        const cars = [{ id: 's', x: 500, y: 300, tier: LABEL_TIER.SELECTED }, { id: 'l', x: 505, y: 300, tier: LABEL_TIER.LEADER }];
        const placed = placeLabels(cars, { bounds: tight, markers: cars });
        expect(placed.get('s')!.forced).toBe(true); expect(placed.get('l')).toBeNull();
    });
});
describe('sticky label slots (Phase 12B stability repair)', () => {
    /** Feeds each frame's result back as the next frame's memory, exactly as the map's RAF loop does. */
    function run(frames: { requests: LabelRequest[]; markers: Point[]; reserved?: Rect[] }[], start?: Map<string, SlotMemory>) {
        let memory = new Map(start ?? []);
        return frames.map(f => {
            const placed = placeLabels(f.requests, { bounds, markers: f.markers, reserved: f.reserved, previous: memory });
            memory = new Map([...placed].filter(([, p]) => p).map(([id, p]) => [id, p!.memory]));
            return placed;
        });
    }
    const player = { id: 'p', x: 500, y: 300, tier: LABEL_TIER.PLAYER };
    const box = slotCentre(player, 0, LABEL_SIZE[LABEL_TIER.PLAYER]);
    it('A: a lower-priority marker passing through the label box does not move the player label', () => {
        // An AI marker sweeps horizontally straight through slot 0's box over 20 frames.
        const frames = Array.from({ length: 20 }, (_, i) => { const ai = { x: box.x - 40 + i * 4, y: box.y }; return { requests: [player, { id: 'ai', ...ai, tier: LABEL_TIER.FIELD }], markers: [player, ai] }; });
        const slots = run(frames, new Map([['p', { slot: 0, blocked: 0 }]])).map(f => f.get('p')!.slot);
        expect(new Set(slots)).toEqual(new Set([0]));
    });
    it('A: only a persistent obstruction moves the label, once, to a clean slot', () => {
        const parked = { x: box.x, y: box.y };
        const frames = Array.from({ length: STICKY_FRAMES + 10 }, () => ({ requests: [player], markers: [player, parked] }));
        const slots = run(frames, new Map([['p', { slot: 0, blocked: 0 }]])).map(f => f.get('p')!.slot);
        expect(slots.slice(0, STICKY_FRAMES - 1).every(slot => slot === 0)).toBe(true);
        const moves = slots.filter((slot, i) => i > 0 && slot !== slots[i - 1]).length;
        expect(moves).toBe(1); expect(slots.at(-1)).not.toBe(0);
    });
    it('B: genuine conflicts still move the label immediately (reserved region, higher-priority label, map bounds)', () => {
        const kept = new Map([['p', { slot: 0, blocked: 0 }]]);
        const own = labelRect(box, LABEL_SIZE[LABEL_TIER.PLAYER]);
        const reserved = run([{ requests: [player], markers: [player], reserved: [own] }], kept)[0].get('p')!;
        expect(reserved.slot).not.toBe(0); expect(overlaps(labelRect(reserved, LABEL_SIZE[LABEL_TIER.PLAYER]), own)).toBe(false);
        // The selected label claims the player label's slot area: the player label yields, never overlaps it.
        const selected = { id: 's', x: 500 + (box.x - 500) * 2, y: 300, tier: LABEL_TIER.SELECTED };
        const both = run([{ requests: [player, selected], markers: [player, selected] }], new Map([...kept, ['s', { slot: 5, blocked: 0 }]]))[0];
        const a = labelRect(both.get('p')!, LABEL_SIZE[LABEL_TIER.PLAYER]), b = labelRect(both.get('s')!, LABEL_SIZE[LABEL_TIER.SELECTED]);
        expect(overlaps(a, b)).toBe(false);
        // Near the top-right edge slot 0 (up-right) leaves the map.
        const edge = { id: 'p', x: 960, y: 20, tier: LABEL_TIER.PLAYER };
        const moved = run([{ requests: [edge], markers: [edge] }], kept)[0].get('p')!;
        expect(moved.slot).not.toBe(0);
        const r = labelRect(moved, LABEL_SIZE[LABEL_TIER.PLAYER]);
        expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1000 && r.y + r.h <= 650).toBe(true);
    });
    it('C: selected and player labels never oscillate A→B→A across consecutive frames in a moving pack', () => {
        // Selected + player cruise while 18 AI cars stream past on three lines through their label slots, with the
        // map's frame-to-frame lateral lane jitter. Pre-repair placement changed slots 41–45 times here (9–19 A→B→A).
        const frames = Array.from({ length: 240 }, (_, f) => {
            const s = { id: 's', x: 420 + f, y: 320 }, p = { id: 'p', x: 470 + f, y: 322 };
            const ai = Array.from({ length: 18 }, (_, i) => ({ id: `a${i}`, x: 200 + (i % 6) * 70 + f * (2.2 + (i % 4) * .6) + (i % 3) * 23, y: 322 + ((i % 3) - 1) * 30 + (((f + i) % 3) - 1) * 10 }));
            return { requests: [{ ...s, tier: LABEL_TIER.SELECTED }, { ...p, tier: LABEL_TIER.PLAYER }, ...ai.map(a => ({ ...a, tier: LABEL_TIER.FIELD }))], markers: [s, p, ...ai] };
        });
        const results = run(frames);
        for (const id of ['s', 'p']) {
            const slots = results.map(r => r.get(id)!.slot);
            for (let i = 1; i < slots.length - 1; i++) expect(slots[i] !== slots[i - 1] && slots[i + 1] === slots[i - 1]).toBe(false);
            // 240 frames ≈ 4 s at 60 fps: at most one marker-driven move per sticky window.
            expect(slots.filter((slot, i) => i > 0 && slot !== slots[i - 1]).length).toBeLessThanOrEqual(Math.ceil(slots.length / STICKY_FRAMES) + 2);
        }
        // Stability never permits selected/player labels to overlap each other.
        for (const r of results) expect(overlaps(labelRect(r.get('s')!, LABEL_SIZE[0]), labelRect(r.get('p')!, LABEL_SIZE[1]))).toBe(false);
    });
    it('D: two close player cars crossing START / FINISH keep stable, visible, non-overlapping labels', () => {
        // Reserved regions exactly as the map derives them for a START / FINISH line at (500, 300).
        const reserved: Rect[] = [{ x: 460, y: 322, w: 164, h: 24 }, { x: 484, y: 284, w: 32, h: 32 }];
        // Selected car crosses the line; the other player car runs 60–100 units ahead with changing relative motion and
        // frame-to-frame lane jitter, so its label genuinely conflicts with the selected label. Four AI markers pass.
        // Pre-repair relocation changed the player label 19 times here, with 3 quick returns (A→B→A / B→C→B).
        const frames = Array.from({ length: 300 }, (_, f) => {
            const sx = 250 + f * 2, ahead = 80 + 20 * Math.sin(f / 5);
            const s = { id: 's', x: sx, y: 300 + ((f % 3) - 1) * 5 };
            const p = { id: 'p', x: sx + ahead, y: 300 + 20 * Math.sin(f / 4) + (f % 2 ? 10 : -10) - ((f % 3) - 1) * 5 };
            const ai = Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, x: 150 + i * 45 + f * 2.6, y: 300 + (i % 2 ? 12 : -12) }));
            return { requests: [{ ...s, tier: LABEL_TIER.SELECTED }, { ...p, tier: LABEL_TIER.PLAYER }, ...ai.map(a => ({ ...a, tier: LABEL_TIER.FIELD }))], markers: [s, p, ...ai], reserved };
        });
        expect(frames[0].requests[0].x).toBeLessThan(484); expect(frames.at(-1)!.requests[0].x).toBeGreaterThan(516);
        const results = run(frames);
        for (const r of results) {
            const sel = r.get('s'), ply = r.get('p');
            expect(sel).toBeTruthy(); expect(ply).toBeTruthy();
            const a = labelRect(sel!, LABEL_SIZE[LABEL_TIER.SELECTED]), b = labelRect(ply!, LABEL_SIZE[LABEL_TIER.PLAYER]);
            expect(overlaps(a, b)).toBe(false);
            for (const q of reserved) { expect(overlaps(a, q)).toBe(false); expect(overlaps(b, q)).toBe(false); }
        }
        for (const id of ['s', 'p']) {
            const slots = results.map(r => r.get(id)!.slot);
            // No return to a just-left slot within 10 frames (covers A→B→A and B→C→B).
            for (let i = 1; i < slots.length; i++) if (slots[i] !== slots[i - 1]) expect(slots.slice(i + 1, i + 11)).not.toContain(slots[i - 1]);
            // 300 frames ≈ 5 s: only a handful of deliberate moves.
            expect(slots.filter((slot, i) => i > 0 && slot !== slots[i - 1]).length).toBeLessThanOrEqual(4);
        }
    });
});
describe('derived race views', () => {
    it('identifies close neighbours from authoritative intervals and skips retired cars', () => {
        const d = withIntervals([null, 600, 2500, 800, 400]), rows = timingRows(d);
        const b = battleContext(rows, rows[2].id, d.state!);
        expect(b.ahead?.id).toBe(rows[1].id); expect(b.behind?.id).toBe(rows[3].id);
        expect(b.gapAheadMs).toBe(2500); expect(b.gapBehindMs).toBe(800);
        expect(b.battleAhead).toBe(false); expect(b.battleBehind).toBe(true);
        expect(BATTLE_GAP_MS).toBe(1000);
        const retired = { ...d, state: { ...d.state!, entrants: d.state!.entrants.map((e, i) => i === 3 ? { ...e, incident: { status: 'RETIRED' as const, mechanicalPenaltyMs: 0, retiredLap: 4, retirementOrder: 1 } } : e) } };
        const r = timingRows(retired);
        expect(battleContext(r, r[2].id, retired.state!).behind?.id).toBe(r[4].id);
    });
    it('shows no battles under VSC / Safety Car', () => {
        const d = withIntervals([null, 300, 300, 300]);
        const vsc = { ...d, state: { ...d.state!, incidents: { ...d.state!.incidents!, mode: 'VSC' as const } } };
        const rows = timingRows(vsc), b = battleContext(rows, rows[1].id, vsc.state!);
        expect(b.battleAhead || b.battleBehind).toBe(false);
    });
    it('prioritises selected, other player car, battle opponents and leader; everything else is marker-only', () => {
        const d = withIntervals([null, 3000, 3000, 3000, 500, 3000]), rows = timingRows(d);
        // Fixture player cars are the first two entrants; select entrant index 3 (an AI car) to test battle tiers.
        const tiers = labelTiers(rows, rows[3].id, d.state!);
        expect(tiers.get(rows[3].id)).toBe(LABEL_TIER.SELECTED);
        expect(rows.filter(r => r.player).every(r => r.id === rows[3].id || tiers.get(r.id) === LABEL_TIER.PLAYER)).toBe(true);
        expect(tiers.get(rows[4].id)).toBe(LABEL_TIER.BATTLE);
        expect(tiers.get(rows[5].id)).toBe(LABEL_TIER.FIELD);
        const player = timingRows(d).find(r => r.player)!;
        expect(labelTiers(rows, player.id, d.state!).get(player.id)).toBe(LABEL_TIER.SELECTED);
    });
    it('reads DRS state from engine flags only', () => {
        const d = viewerData(), s = d.state!;
        expect(drsState(s)).toBe('ENABLED');
        expect(drsState({ ...s, weather: { ...s.weather!, drsState: 'DRS_DISABLED_WET' } })).toBe('WET');
        expect(drsState({ ...s, incidents: { ...s.incidents!, mode: 'SAFETY_CAR' } })).toBe('CONTROL');
        expect(drsState({ ...s, incidents: { ...s.incidents!, drsDelay: 2 } })).toBe('RESTART');
        expect(drsState({ ...s, input: { ...s.input, interaction: undefined } })).toBe('UNAVAILABLE');
    });
    it('flags tyre warnings from the compound profile thresholds', () => {
        const s = viewerData().state!, e = s.entrants[0], p = s.input.tyres!.profiles[e.stint!.tyre.compound];
        const at = (wearPermille: number, temperatureMilliC = (p.idealTemperatureMinMilliC + p.idealTemperatureMaxMilliC) / 2) => tyreCondition(s, { ...e, stint: { ...e.stint!, tyre: { ...e.stint!.tyre, wearPermille, temperatureMilliC } } });
        expect(at(0)).toEqual({ wear: 'OK', temperature: 'OK' });
        expect(at(p.degradationStartWear)!.wear).toBe('HIGH'); expect(at(p.cliffWear)!.wear).toBe('CRITICAL');
        expect(at(0, p.idealTemperatureMinMilliC - 1)!.temperature).toBe('COLD'); expect(at(0, p.idealTemperatureMaxMilliC + 1)!.temperature).toBe('HOT');
    });
    it('comparison snapshot does not mutate state and rounds fuel delta to 0.1 kg', () => {
        const d = viewerData(), before = structuredClone(d), v = driverSnapshot(timingRows(d)[0], d.state!);
        expect(d).toEqual(before); expect(Number.isInteger(Math.round(v.fuelDeltaKg! * 10))).toBe(true);
    });
    it('builds a categorised, newest-first feed from persisted records and marks important/player items', () => {
        const d = viewerData(), s = d.state!, team = d.progress.career.playerTeamId, me = s.entrants[0].entrantId, ai = s.entrants[3].entrantId;
        const state = { ...s, lap: 6, incidents: { ...s.incidents!, events: [
            { sequence: 1, lap: 2, type: 'INCIDENT' as const, entrantIds: [ai], kind: 'SPIN' as const, severity: 'MINOR' as const, timeLossMs: 900 },
            { sequence: 2, lap: 4, type: 'SAFETY_CAR_START' as const, entrantIds: [], kind: null, severity: null, timeLossMs: 0 },
        ] }, entrants: s.entrants.map(e => e.entrantId === me ? { ...e, pit: { ...e.pit!, stops: [{ number: 1, lap: 5, oldCompound: 'MEDIUM' as const, newCompound: 'HARD' as const, pitLaneLossMs: 18000, stationaryTimeMs: 2500, totalLossMs: 20500 }] } } : e) };
        const feed = raceFeed(state, team);
        expect(feed.map(f => f.category)).toEqual(['PIT', 'CONTROL', 'INCIDENT']);
        expect(feed.map(f => f.important)).toEqual([true, true, false]);
        expect(feed[0].player).toBe(true);
        expect(JSON.stringify(feed)).not.toMatch(/Safety Car deployed|Pit stop/);
    });
});
describe('refined race UI rendering', () => {
    it('renders every marker but only prioritised labels on the map', () => {
        const d = viewerData(20), rows = timingRows(d), tiers = labelTiers(rows, rows[0].id, d.state!);
        const html = renderToStaticMarkup(<I18nProvider><TrackMap layout={layoutForCircuit()} rows={rows} selected={rows[0].id} onSelect={() => {}} speed={1} reduceMotion={true} tiers={tiers}/></I18nProvider>);
        expect(html.match(/data-car=/g)).toHaveLength(20);
        const labels = html.match(/data-label=/g)?.length ?? 0;
        expect(labels).toBeGreaterThanOrEqual(2); expect(labels).toBeLessThan(20);
    });
    it('retired player car shows RETIRED and no command controls', () => {
        const d = viewerData(), s = d.state!;
        const retired = { ...d, state: { ...s, lap: 3, entrants: s.entrants.map((e, i) => i === 0 ? { ...e, incident: { status: 'RETIRED' as const, mechanicalPenaltyMs: 0, retiredLap: 3, retirementOrder: 1 } } : e) } };
        const row = timingRows(retired)[0];
        expect(row.player).toBe(true);
        const html = renderToStaticMarkup(<I18nProvider><DriverPanel data={retired} row={row} busy={false} send={() => {}}/></I18nProvider>);
        expect(html).not.toContain('<button'); expect(html).toContain('Retired on lap 3');
    });
    it('editable player car keeps pace, fuel, ERS and pit controls', () => {
        const d = viewerData(), row = timingRows(d)[0];
        const html = renderToStaticMarkup(<I18nProvider><DriverPanel data={d} row={row} busy={false} send={() => {}}/></I18nProvider>);
        for (const text of ['Attack', 'Conserve', 'Overtake', 'Harvest', 'Box this lap']) expect(html).toContain(text);
    });
});

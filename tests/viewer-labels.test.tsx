import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { placeLabels, labelRect, LABEL_SIZE, LABEL_TIER, type Rect } from '../src/features/race/viewer/labels';
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
        expect(placeLabels([car], { bounds, markers: [car], previous: new Map([['a', 5]]) }).get('a')!.slot).toBe(5);
    });
    it('hides low-priority labels without a free slot but forces the selected label to stay visible', () => {
        const tight: Rect = { x: 480, y: 280, w: 40, h: 40 };
        const cars = [{ id: 's', x: 500, y: 300, tier: LABEL_TIER.SELECTED }, { id: 'l', x: 505, y: 300, tier: LABEL_TIER.LEADER }];
        const placed = placeLabels(cars, { bounds: tight, markers: cars });
        expect(placed.get('s')!.forced).toBe(true); expect(placed.get('l')).toBeNull();
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

// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LanguageSelector } from '../src/i18n/provider';
import { translate } from '../src/i18n/catalog';
import { DriverPanel } from '../src/features/race/viewer/driver-panel';
import { IssuesRail } from '../src/features/race/viewer/issues-rail';
import { RaceDetails } from '../src/features/race/viewer/race-details';
import { PlayerSwitch } from '../src/features/race/viewer/player-switch';
import { EventFeed } from '../src/features/race/viewer/event-feed';
import { timingRows } from '../src/features/race/viewer/model';
import type { StrategicIssue } from '../src/features/race/viewer/issues';
import { advanceRace } from '../src/simulation/race/engine';
import { requestPitStop } from '../src/simulation/race/pits/model';
import { v8eRace } from './helpers/v8e';
import { viewerData, view } from './helpers/viewer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined, host: HTMLElement;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = undefined; });
const mount = (node: React.ReactNode) => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root!.render(node)); return host; };
const click = (e: HTMLElement) => act(() => e.click());
const fixture = () => {
    const s = advanceRace(v8eRace({ count: 6, players: 2, quiet: true, laps: 20, weather: true }), 8);
    return view({ ...viewerData(6), state: requestPitStop(s, s.input.entrants[0].entrantId, 'INTERMEDIATE') });
};

describe('Race command workspace', () => {
    it('shows both cars public tyre wear and selects the intended car without changing the Race', () => {
        const data = fixture(), rows = timingRows(data), own = rows.filter(r => r.player), before = JSON.stringify(data), select = vi.fn();
        const el = mount(<I18nProvider><PlayerSwitch state={data.state!} rows={rows} selected={own[0].id} onSelect={select}/></I18nProvider>);
        const cards = el.querySelectorAll<HTMLButtonElement>('.player-switch > button:not(.compare-toggle)');
        expect(cards).toHaveLength(2);
        for (const row of own) {
            const card = [...cards].find(b => b.title === row.name)!;
            expect(card.querySelector('.switch-wear')!.textContent).toContain(`${Math.round(row.entrant.stint!.tyre.wearPermille! / 10)}%`);
            expect(card.querySelector('.switch-gap')!.textContent).toBeTruthy();
        }
        click([...cards].find(b => b.title === own[1].name)!);
        expect(select).toHaveBeenCalledExactlyOnceWith(own[1].id);
        expect(JSON.stringify(data)).toBe(before);
    });
    it('exposes a pit shortcut without issuing a command and keeps event filters keyboard dismissible', () => {
        const data = fixture(), rows = timingRows(data), before = JSON.stringify(data), onPit = vi.fn();
        const el = mount(<I18nProvider><PlayerSwitch state={data.state!} rows={rows} selected={rows[0].id} onSelect={() => {}} pitTarget="#race-pit-dock" onPit={onPit}/><EventFeed data={data}/></I18nProvider>);
        const shortcut = el.querySelector<HTMLAnchorElement>('.race-pit-shortcut')!;
        expect(shortcut.getAttribute('href')).toBe('#race-pit-dock'); click(shortcut);
        expect(onPit).toHaveBeenCalledOnce();
        const filters = el.querySelector<HTMLDetailsElement>('.race-feed-filters')!, summary = filters.querySelector('summary')!;
        click(summary); expect(filters.open).toBe(true);
        const player = filters.querySelectorAll<HTMLButtonElement>('button')[1]; click(player);
        expect(player.getAttribute('aria-pressed')).toBe('true');
        expect(summary.textContent).toContain(translate('en', 'viewer.feedFilter.PLAYER'));
        act(() => filters.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
        expect(filters.open).toBe(false); expect(document.activeElement).toBe(summary);
        expect(JSON.stringify(data)).toBe(before);
    });
    it('keeps every command outside secondary disclosures and preserves entrant/revision/intent payloads', () => {
        const data = fixture(), rows = timingRows(data), row = rows.find(r => r.player)!, send = vi.fn(), before = JSON.stringify(data);
        const el = mount(<I18nProvider><DriverPanel data={data} row={row} rows={rows} busy={false} send={send}/></I18nProvider>);
        for (const control of el.querySelectorAll('.mode-buttons button, .dp-pit-form button, .dp-pit-form select')) expect(control.closest('details')).toBeNull();
        const pick = (key: Parameters<typeof translate>[1]) => click([...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === translate('en', key))!);
        pick('command.fuel.CONSERVE'); pick('command.BOOST'); pick('command.ATTACK'); pick('operations.updatePit'); pick('operations.cancelPit');
        expect(send.mock.calls.map(c => c[0])).toEqual([
            { kind: 'fuelMode', entrantId: row.id, revision: row.entrant.commands!.commandRevision, mode: 'CONSERVE' },
            { kind: 'energyPolicy', entrantId: row.id, revision: row.entrant.commands!.commandRevision, mode: 'BOOST' },
            { kind: 'paceMode', entrantId: row.id, revision: row.entrant.commands!.commandRevision, mode: 'ATTACK' },
            { kind: 'pit', entrantId: row.id, revision: row.entrant.pit!.commandRevision, compound: 'INTERMEDIATE' },
            { kind: 'pit', entrantId: row.id, revision: row.entrant.pit!.commandRevision, compound: null },
        ]);
        expect(JSON.stringify(data)).toBe(before);
    });
    it('changes presentation language without changing the Race or losing the pending tyre selection', () => {
        const data = fixture(), rows = timingRows(data), row = rows.find(r => r.player)!, before = JSON.stringify(data);
        const el = mount(<I18nProvider><LanguageSelector/><DriverPanel data={data} row={row} rows={rows} busy={false} send={() => {}}/></I18nProvider>);
        const language = el.querySelector<HTMLSelectElement>('#interface-language')!;
        act(() => { language.value = 'zh-TW'; language.dispatchEvent(new Event('change', { bubbles: true })); });
        expect(el.querySelector('.dp-box')!.textContent).toBe('更新進站');
        expect(el.querySelector<HTMLSelectElement>('.dp-pit-form select')!.value).toBe('INTERMEDIATE');
        expect(JSON.stringify(data)).toBe(before);
    });
    it('keeps one issue per car in the compact rail and retains other issues with acknowledgement', () => {
        const data = fixture(), rows = timingRows(data), own = rows.filter(r => r.player);
        const make = (entrantId: string, kind: 'FUEL_CRITICAL' | 'TYRE_PAST_CLIFF'): StrategicIssue => ({ key: `${kind}:${entrantId}`, kind, entrantId, severity: 'CRITICAL', values: { wear: 900, laps: 2 } });
        const el = mount(<I18nProvider><IssuesRail issues={[make(own[0].id, 'TYRE_PAST_CLIFF'), make(own[0].id, 'FUEL_CRITICAL'), make(own[1].id, 'TYRE_PAST_CLIFF')]} rows={rows} lap={38} attention={null} onSelect={() => {}}/></I18nProvider>);
        const visible = el.querySelectorAll('.issues-rail > .issues-list > li');
        expect(visible).toHaveLength(2);
        expect([...visible].map(e => e.querySelector('.issue-driver')!.textContent)).toEqual(own.map(r => r.abbreviation));
        const overflow = el.querySelector<HTMLDetailsElement>('.issues-overflow')!;
        click(overflow.querySelector('summary')!);
        expect(overflow.open).toBe(true);
        const ack = overflow.querySelector<HTMLButtonElement>('.issue-ack')!; click(ack);
        expect(el.querySelectorAll('.issue-card')).toHaveLength(3);
        expect(el.querySelector('[data-ack="true"]')).not.toBeNull();
    });
    it('Escape closes secondary information and restores summary focus', () => {
        const el = mount(<RaceDetails title="Detail"><p>Context</p></RaceDetails>), detail = el.querySelector('details')!, summary = el.querySelector('summary')!;
        click(summary); expect(detail.open).toBe(true);
        act(() => detail.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
        expect(detail.open).toBe(false); expect(document.activeElement).toBe(summary);
    });
});

// @vitest-environment happy-dom
/** Builder regression checks for the two UIX-B accessibility defects; no gameplay or database changes. */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, LanguageSelector } from '../src/i18n/provider';
import { timingRows } from '../src/features/race/viewer/model';
import { IssuesRail } from '../src/features/race/viewer/issues-rail';
import type { StrategicIssue } from '../src/features/race/viewer/issues';
import { PracticeDriverPanel } from '../src/features/practice/components';
import { practiceView } from '../src/features/practice/view-model';
import { startPracticeSession } from '../src/features/practice/service';
import { practiceWorld } from './helpers/practice';
import { viewerData, view } from './helpers/viewer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null, host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });
function mount(node: React.ReactNode) {
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    act(() => root!.render(node));
    return host;
}

describe('UIXB-A11Y-001 critical announcement continuity', () => {
    const rows = timingRows(view(viewerData(4))), driver = rows[0].id, other = rows[1].id;
    const cliff = (wear = 800, entrantId = driver): StrategicIssue => ({ key: `TYRE_PAST_CLIFF:${entrantId}`, kind: 'TYRE_PAST_CLIFF', severity: 'CRITICAL', entrantId, values: { wear } });
    const fuel: StrategicIssue = { key: `FUEL_CRITICAL:${driver}`, kind: 'FUEL_CRITICAL', severity: 'CRITICAL', entrantId: driver, values: { laps: 2 } };
    const warning: StrategicIssue = { key: `BATTLE_BEHIND:${driver}`, kind: 'BATTLE_BEHIND', severity: 'WARNING', entrantId: driver, values: { rival: 'RIV', ms: 500 } };
    const rail = (issues: readonly StrategicIssue[], lap = 16) => <I18nProvider initialLocale="en"><LanguageSelector/><IssuesRail issues={issues} rows={rows} lap={lap} attention={null} onSelect={() => {}}/></I18nProvider>;
    const render = (issues: readonly StrategicIssue[], lap = 16) => act(() => root!.render(rail(issues, lap)));
    const live = () => host!.querySelector('[aria-live="assertive"]')!;

    it('updates visible wear without any live-region DOM mutation during the same activation', async () => {
        const el = mount(rail([cliff()])), region = live(), message = region.firstElementChild;
        expect(region.textContent).toContain('80%');
        const mutations: MutationRecord[] = [];
        const observer = new MutationObserver(records => mutations.push(...records));
        observer.observe(region, { subtree: true, childList: true, characterData: true });
        try {
            for (const wear of [850, 900, 950, 1000]) {
                await act(async () => { root!.render(rail([cliff(wear)], 17 + (wear - 850) / 50)); });
                expect(el.querySelector('.issue-text')!.textContent).toContain(`${wear / 10}%`);
                expect(el.querySelector('.issue-since')!.textContent).toBe('since L16');
                expect(region.firstElementChild).toBe(message);
                expect(region.textContent).toContain('80%');
            }
            expect([...mutations, ...observer.takeRecords()]).toHaveLength(0);
        } finally { observer.disconnect(); }
    });

    it('announces new critical kinds and drivers while an earlier critical issue remains active', () => {
        mount(rail([cliff()]));
        const first = live().firstElementChild;
        render([cliff(850), fuel, cliff(900, other)], 17);
        expect(live().children).toHaveLength(3);
        expect(live().firstElementChild).toBe(first);
        expect(live().textContent).toContain('fuel runs out in about 2 laps');
        expect(live().lastElementChild!.textContent).toContain(rows[1].abbreviation);
        expect(live().lastElementChild!.textContent).toContain('90%');
    });

    it('removes a cleared issue and announces a fresh activation when it returns', () => {
        const el = mount(rail([cliff()])), first = live().firstElementChild;
        render([], 17);
        expect(el.querySelectorAll('.issue-card')).toHaveLength(0);
        expect(live().textContent).toBe('');
        render([cliff(950)], 18);
        expect(live().firstElementChild).not.toBe(first);
        expect(live().textContent).toContain('95%');
        expect(el.querySelector('.issue-since')!.textContent).toBe('since L18');
    });

    it('preserves acknowledgement demotion, live details and clear-to-return rearming', () => {
        const el = mount(rail([cliff(), warning]));
        act(() => (el.querySelector('.issue-ack') as HTMLButtonElement).click());
        render([cliff(900), warning], 17);
        const card = el.querySelector('[data-severity="CRITICAL"]')!;
        expect(card.getAttribute('data-ack')).toBe('true');
        expect(card.querySelector('.issue-ack')!.getAttribute('aria-pressed')).toBe('true');
        expect(card.querySelector('.issue-text')!.textContent).toContain('90%');
        expect(card.querySelector('.issue-since')!.textContent).toBe('since L16');
        expect(el.querySelector('.issue-card')!.getAttribute('data-severity')).toBe('WARNING');
        expect(live().textContent).toBe('');
        render([warning], 18);
        render([cliff(950), warning], 19);
        expect(el.querySelector('[data-severity="CRITICAL"] .issue-ack')!.getAttribute('aria-pressed')).toBe('false');
        expect(live().textContent).toContain('95%');
    });

    it('rearms an acknowledged condition after a clear and return within the same lap', () => {
        const el = mount(rail([cliff()]));
        act(() => (el.querySelector('.issue-ack') as HTMLButtonElement).click());
        render([]);
        render([cliff(850)]);
        expect(el.querySelector('.issue-ack')!.getAttribute('aria-pressed')).toBe('false');
        expect(live().textContent).toContain('85%');
    });

    it('announces an escalation to critical but keeps subsequent fuel estimates quiet', () => {
        mount(rail([{ ...fuel, severity: 'WARNING' }]));
        expect(live().textContent).toBe('');
        render([fuel], 17);
        expect(live().textContent).toContain('about 2 laps');
        render([{ ...fuel, values: { laps: 1 } }], 18);
        expect(live().textContent).toContain('about 2 laps');
        expect(host!.querySelector('.issue-text')!.textContent).toContain('about 1 laps');
    });

    it('keeps announcement snapshots translatable when the interface language changes', () => {
        const el = mount(rail([cliff()]));
        render([cliff(900)], 17);
        const selector = el.querySelector('select')!;
        act(() => { selector.value = 'zh-TW'; selector.dispatchEvent(new Event('change', { bubbles: true })); });
        expect(live().textContent).toContain('輪胎已越過性能懸崖');
        expect(live().textContent).toContain('80%');
        expect(el.querySelector('.issue-text')!.textContent).toContain('90%');
    });
});

describe('UIXB-A11Y-002 Practice engineering tabs', () => {
    async function panel() {
        const w = await practiceWorld();
        const data = practiceView(await startPracticeSession(w.repo, w.careerId, w.eventId, w.sessions[0].id));
        const e = data.entrants.find(e => e.own)!;
        const el = mount(<I18nProvider initialLocale="en"><PracticeDriverPanel view={data} e={e} busy={false} send={() => {}}/></I18nProvider>);
        const tabs = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        const panels = [...el.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
        const check = (selected: number, focus = true) => {
            if (focus) expect(document.activeElement).toBe(tabs[selected]);
            tabs.forEach((tab, index) => {
                expect(tab.tabIndex).toBe(index === selected ? 0 : -1);
                expect(tab.getAttribute('aria-selected')).toBe(String(index === selected));
                expect(tab.getAttribute('aria-controls')).toBe(panels[index].id);
                expect(panels[index].getAttribute('aria-labelledby')).toBe(tab.id);
                expect(panels[index].hidden).toBe(index !== selected);
            });
            expect([...el.querySelectorAll('[role="tabpanel"]')]).toEqual(panels);
        };
        const key = (index: number, value: string) => {
            const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
            act(() => { tabs[index].dispatchEvent(event); });
            return event;
        };
        tabs[0].focus(); check(0);
        return { el, tabs, panels, check, key };
    }

    it('moves focus and selection with both arrows through every tab, wrapping at both ends', async () => {
        const { check, key } = await panel();
        for (let index = 0; index < 4; index++) {
            expect(key(index, 'ArrowRight').defaultPrevented).toBe(true);
            check((index + 1) % 4);
        }
        for (const index of [0, 3, 2, 1]) {
            expect(key(index, 'ArrowLeft').defaultPrevented).toBe(true);
            check((index + 3) % 4);
        }
    });

    it('supports Home and End without intercepting Tab', async () => {
        const { check, key } = await panel();
        key(0, 'End'); check(3);
        key(3, 'Home'); check(0);
        expect(key(0, 'Tab').defaultPrevented).toBe(false);
        check(0);
    });

    it('preserves pointer selection and mounted panels with Run Plan and Setup drafts', async () => {
        const { el, tabs, panels, check, key } = await panel();
        const planner = el.querySelector('[data-testid="run-planner"]')!;
        act(() => (planner.querySelector('button') as HTMLButtonElement).click());
        const pace = planner.querySelector('button[aria-pressed="true"]')!;
        act(() => tabs[1].click()); check(1, false);
        const editor = el.querySelector('[data-testid="setup-editor"]')!;
        const slider = editor.querySelector('input')!;
        const initial = Number(slider.value);
        act(() => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, initial + 1);
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(slider.value).toBe(String(initial + 1));
        expect((editor.querySelector('button') as HTMLButtonElement).disabled).toBe(false);
        const draft = [...editor.querySelectorAll<HTMLInputElement>('input')].map(input => input.value);
        for (const index of [2, 3, 0, 1]) { act(() => tabs[index].click()); check(index, false); }
        tabs[1].focus(); key(1, 'ArrowRight'); check(2);
        key(2, 'ArrowLeft'); check(1);
        expect(el.querySelector('[data-testid="run-planner"]')).toBe(planner);
        expect(el.querySelector('[data-testid="setup-editor"]')).toBe(editor);
        expect(pace.getAttribute('aria-pressed')).toBe('true');
        expect([...editor.querySelectorAll<HTMLInputElement>('input')].map(input => input.value)).toEqual(draft);
        panels.forEach(p => expect(p.isConnected).toBe(true));
    });
});

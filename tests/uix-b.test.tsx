// @vitest-environment happy-dom
/**
 * UIX-B live operations: the persistent strategic-issues read model (UX-RACE-001) and its rail, plus the shared live
 * frame primitives. Presentation only — these tests never change or assert Race rules.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/i18n/provider';
import { translate } from '../src/i18n/catalog';
import { timingRows } from '../src/features/race/viewer/model';
import { strategicIssues, worstSeverity, type IssueKind, type StrategicIssue } from '../src/features/race/viewer/issues';
import { IssuesRail } from '../src/features/race/viewer/issues-rail';
import { PaneSwitch, PlaybackControls } from '../src/features/live/live-frame';
import { advanceRace } from '../src/simulation/race/engine';
import { viewerData, view } from './helpers/viewer';
import type { CareerRaceData } from '../src/game/domain/race-repository';
import type { RaceSimulationState } from '../src/simulation/race/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const advanced = (d: CareerRaceData, laps: number): CareerRaceData => ({ ...d, state: advanceRace(d.state!, laps) });
/** Public view with the given entrant's tyre wear set (authoritative state edited before projection, as the server would). */
function withWear(d: CareerRaceData, index: number, wear: (cliff: number, start: number) => number) {
    const s = d.state!;
    const authoritative: RaceSimulationState = { ...s, entrants: s.entrants.map((e, i) => {
        if (i !== index) return e;
        const p = s.input.tyres!.profiles[e.stint!.tyre.compound];
        return { ...e, stint: { ...e.stint!, tyre: { ...e.stint!.tyre, wearPermille: wear(p.cliffWear, p.degradationStartWear) } } };
    }) };
    return view({ ...d, state: authoritative });
}

describe('strategic issues read model', () => {
    const base = advanced(viewerData(4), 5);
    it('is empty unless the Race is running', () => {
        const data = withWear(base, 0, cliff => cliff), rows = timingRows(data);
        expect(strategicIssues(rows, data.state!).length).toBeGreaterThan(0);
        expect(strategicIssues(rows, { ...data.state!, status: 'FINISHED' })).toEqual([]);
    });
    it('raises a CRITICAL tyre-past-cliff issue for a player car, keyed by condition + car, sorted first', () => {
        const data = withWear(base, 1, cliff => cliff), rows = timingRows(data), id = data.state!.entrants[1].entrantId;
        const issues = strategicIssues(rows, data.state!), past = issues.find(i => i.kind === 'TYRE_PAST_CLIFF')!;
        expect(past).toMatchObject({ key: `TYRE_PAST_CLIFF:${id}`, severity: 'CRITICAL', entrantId: id });
        expect(issues[0].severity).toBe('CRITICAL');
        expect(worstSeverity(issues, id)).toBe('CRITICAL');
    });
    it('reports the same condition with the same key at every checkpoint while it holds (it never expires on a timer)', () => {
        const first = withWear(base, 0, cliff => cliff), later = withWear(advanced(base, 3), 0, cliff => cliff + 50);
        const key = (d: ReturnType<typeof view>) => strategicIssues(timingRows(d), d.state!).filter(i => i.kind === 'TYRE_PAST_CLIFF').map(i => i.key);
        expect(key(first)).toEqual(key(later));
        expect(key(first)).toHaveLength(1);
    });
    it('degrading-but-not-critical wear is INFO; healthy tyres raise no tyre issue', () => {
        const high = withWear(base, 0, (_, start) => start), healthy = withWear(base, 0, () => 0);
        const kinds = (d: ReturnType<typeof view>) => strategicIssues(timingRows(d), d.state!).filter(i => i.entrantId === d.state!.entrants[0].entrantId).map(i => i.kind);
        expect(kinds(high)).toContain('TYRE_HIGH');
        expect(kinds(healthy)).not.toEqual(expect.arrayContaining(['TYRE_HIGH', 'TYRE_PAST_CLIFF']));
    });
    it('never lists rival cars, and does not mutate its inputs', () => {
        const data = withWear(base, 2, cliff => cliff), rows = timingRows(data), rival = data.state!.entrants[2].entrantId;
        const before = JSON.stringify(data.state);
        const issues = strategicIssues(rows, data.state!);
        expect(issues.some(i => i.entrantId === rival)).toBe(false);
        expect(JSON.stringify(data.state)).toBe(before);
    });
    it('has complete EN and ZH-Hant copy for every kind and severity', () => {
        const kinds: IssueKind[] = ['FUEL_CRITICAL', 'TYRE_PAST_CLIFF', 'TYRE_RULE_URGENT', 'TYRE_POOR', 'TYRE_CLIFF_SOON', 'FUEL_SHORT', 'TYRE_HIGH', 'BATTLE_BEHIND', 'BATTLE_AHEAD', 'OVERTAKE_AVAILABLE', 'BOX_REQUESTED', 'NEUTRALISED'];
        for (const locale of ['en', 'zh-TW'] as const) {
            for (const kind of kinds) expect(translate(locale, `issues.${kind}`)).not.toBe(`issues.${kind}`);
            for (const sev of ['CRITICAL', 'WARNING', 'OPPORTUNITY', 'INFO'] as const) expect(translate(locale, `issues.severity.${sev}`)).not.toBe(`issues.severity.${sev}`);
        }
    });
});

describe('issues rail', () => {
    let root: Root | null = null, host: HTMLElement | null = null;
    afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });
    const mount = (node: React.ReactNode) => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); act(() => root!.render(node)); return host; };
    const data = withWear(advanced(viewerData(4), 5), 0, cliff => cliff), rows = timingRows(data);
    const issues = strategicIssues(rows, data.state!);
    const rail = (list: readonly StrategicIssue[], lap: number) => <I18nProvider initialLocale="en"><IssuesRail issues={list} rows={rows} lap={lap} attention={null} onSelect={() => {}}/></I18nProvider>;

    it('labels severity in text (not colour alone) and announces the newest unacknowledged critical issue', () => {
        const html = renderToStaticMarkup(rail(issues, 6));
        expect(html).toContain('data-severity="CRITICAL"');
        expect(html).toContain('>Critical</span>');
        expect(html).toMatch(/aria-live="assertive">[^<]*tyre is past its cliff/);
    });
    it('keeps the first-seen lap while the condition persists across checkpoints', () => {
        const el = mount(rail(issues, 6));
        expect(el.textContent).toContain('since L6');
        act(() => root!.render(rail(issues, 9)));
        expect(el.textContent).toContain('since L6');
        expect(el.textContent).not.toContain('since L9');
    });
    it('acknowledging keeps the issue visible (demoted, not dismissed) and silences the announcement', () => {
        const el = mount(rail(issues, 6)), critical = el.querySelector('[data-severity="CRITICAL"]')!;
        act(() => (critical.querySelector('.issue-ack') as HTMLButtonElement).click());
        const after = el.querySelector('[data-severity="CRITICAL"]')!;
        expect(after.getAttribute('data-ack')).toBe('true');
        expect(after.querySelector('.issue-ack')!.getAttribute('aria-pressed')).toBe('true');
        expect(el.querySelector('[aria-live="assertive"]')!.textContent).toBe('');
    });
    it('shows a calm empty state with no issues', () => {
        expect(renderToStaticMarkup(rail([], 6))).toContain('No strategic issues right now');
    });
});

describe('shared live frame', () => {
    it('the pane switch exposes the active pane with aria-pressed', () => {
        const html = renderToStaticMarkup(<PaneSwitch panes={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} active="b" onPick={() => {}} label="Panes"/>);
        expect(html).toContain('role="group"'); expect(html).toContain('aria-label="Panes"');
        expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
        expect(html).toMatch(/aria-pressed="true"[^>]*>B</);
    });
    it('playback controls keep play/pause, step, speed, skip, auto-pause and reduce-motion as real controls', () => {
        const playback = { phase: 'paused', playing: false, busy: false, speed: 2, autoPause: true, skipping: false } as unknown as Parameters<typeof PlaybackControls>[0]['playback'];
        const html = renderToStaticMarkup(<I18nProvider initialLocale="en"><PlaybackControls playback={playback} done={false} onToggle={() => {}} onStep={() => {}} stepLabel="Step" onSpeed={() => {}} onSkip={() => {}} skipLabel="Next" onAutoPause={() => {}} reduceMotion={false} onReduceMotion={() => {}} status="Paused"/></I18nProvider>);
        expect(html).toContain('data-playing="false"');
        expect(html.match(/role="switch"/g)).toHaveLength(2);
        expect(html).toMatch(/role="switch" checked=""/); expect(html).toContain('Auto pause');
        expect(html).toContain('Step'); expect(html).toContain('Next');
        expect(html.match(/aria-pressed="true"/g)!.length).toBeGreaterThanOrEqual(1);
    });
});

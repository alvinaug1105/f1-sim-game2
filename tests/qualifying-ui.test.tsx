// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n/provider';
import { QualifyingDriverPanel, QualifyingTower } from '../src/features/qualifying/components';
import { qualifyingView, type QualifyingView } from '../src/features/qualifying/view-model';
import { advanceQualifyingSession, continueQualifyingPhase, qualifyingCommand, startQualifyingSession } from '../src/features/qualifying/service';
import { WeekendView } from '../src/features/career/progression-views';
import { qualifyingWorld } from './helpers/qualifying';
vi.mock('../src/features/career/progression-actions', () => ({ progressionAction: vi.fn() }));
vi.mock('../src/features/practice/actions', () => ({ practiceWeekendAction: vi.fn() }));
vi.mock('../src/features/qualifying/actions', () => ({ qualifyingWeekendAction: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const html = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
let root: Root | null = null, host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });
describe('Qualifying UI', () => {
    it('the weekend offers Manage Qualifying and Simulate Qualifying — no development placeholder controls', async () => {
        const w = await qualifyingWorld('team-mclaren');
        const text = html(<WeekendView progress={w.repo.progress} eventId={w.eventId}/>);
        expect(text).toContain(`href="/career/${w.careerId}/events/${w.eventId}/qualifying"`);
        expect(text).toContain('Manage Qualifying');
        expect(text).toContain('Simulate Qualifying (auto-manage)');
        for (const placeholder of ['Complete Session — Development', 'Start — Development', 'development placeholder']) expect(text).not.toContain(placeholder);
    });
    it('the tower shows 22 rows, a textual cutoff line and player status', async () => {
        const w = await qualifyingWorld('team-cadillac');
        let d = await startQualifyingSession(w.repo, w.careerId, w.eventId);
        for (let i = 0; i < 30; i++) d = await advanceQualifyingSession(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs);
        const view = qualifyingView(d), text = html(<QualifyingTower view={view} selected={view.entrants[0].entrantId} onSelect={() => {}}/>);
        expect(text.match(/data-entrant=/g)).toHaveLength(22);
        expect(text).toContain('Cutoff: P16 advances — below this line is the elimination zone');
        expect(text.match(/class="q-status status-/g)!.length).toBeGreaterThanOrEqual(2);
    });
    it('driver panel re-renders: one planner in the garage, none on track; an eliminated car is read-only while its teammate stays controllable', async () => {
        const w = await qualifyingWorld('team-aurora');
        let d = await startQualifyingSession(w.repo, w.careerId, w.eventId);
        const [a, b] = d.state!.input.entrants.filter(e => e.controller === 'PLAYER').map(e => e.entrantId);
        host = document.createElement('div'); document.body.append(host); root = createRoot(host);
        const render = (view: QualifyingView, id: string) => {
            const e = view.entrants.find(x => x.entrantId === id)!;
            act(() => root!.render(<I18nProvider><QualifyingDriverPanel key={id} view={view} e={e} busy={false} send={() => {}} onSelect={() => {}}/></I18nProvider>));
            return { planners: host!.querySelectorAll('[data-testid="q-run-planner"]').length, sendOut: [...host!.querySelectorAll('button')].filter(x => x.textContent === 'Send out').length, elements: host!.querySelectorAll('*').length };
        };
        let r = render(qualifyingView(d), a);
        expect([r.planners, r.sendOut]).toEqual([1, 1]);
        const garage = r.elements;
        for (let i = 0; i < 3; i++) { d = await advanceQualifyingSession(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs); r = render(qualifyingView(d), a); expect([r.planners, r.elements]).toEqual([1, garage]); }
        d = await qualifyingCommand(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs, { kind: 'send', entrantId: a, revision: 0, plan: { compound: 'SOFT', pushLaps: 1 } });
        r = render(qualifyingView(d), a);
        expect([r.planners, r.sendOut]).toEqual([0, 0]);
        // Force the Q1 end, then pretend car A was eliminated: it becomes read-only, B keeps its planner.
        while (d.state!.phaseStatus !== 'COMPLETE') d = await advanceQualifyingSession(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs);
        d = await continueQualifyingPhase(w.repo, w.careerId, w.eventId, d.state!.sessionElapsedMs, 'Q1');
        const index = d.state!.entrants.findIndex(e => e.entrantId === a);
        const forced = { ...d, state: { ...d.state!, entrants: d.state!.entrants.map((e, i) => i === index ? { ...e, eliminatedIn: 'Q1' as const } : e) } };
        r = render(qualifyingView(forced), a);
        expect([r.planners, r.sendOut]).toEqual([0, 0]);
        expect(host.textContent).toContain('This car is now read-only.');
        const teammate = qualifyingView(forced).entrants.find(e => e.entrantId === b)!;
        r = render(qualifyingView(forced), b);
        expect(r.planners).toBe(teammate.eliminatedIn === null ? 1 : 0);
    });
});

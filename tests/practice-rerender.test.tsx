// @vitest-environment happy-dom
/**
 * Re-render / reconciliation regression for the Practice driver panel: one mounted React root receives successive
 * authoritative views (as playback does), so sibling-key collisions show up as duplicated or orphaned blocks.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/i18n/provider';
import { PracticeDriverPanel } from '../src/features/practice/components';
import { practiceView, type PracticeView } from '../src/features/practice/view-model';
import { advancePracticeSession, practiceCommand, startPracticeSession } from '../src/features/practice/service';
import { practiceWorld } from './helpers/practice';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null, host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });
const plan = { compound: 'MEDIUM' as const, targetLaps: 2, pace: 'BALANCED' as const };
function mount() { host = document.createElement('div'); document.body.append(host); root = createRoot(host); }
function render(view: PracticeView, entrantId: string) {
    const e = view.entrants.find(x => x.entrantId === entrantId)!;
    // Keyed by entrant exactly as the Practice screen renders the selected driver's panel.
    act(() => root!.render(<I18nProvider><PracticeDriverPanel key={entrantId} view={view} e={e} busy={false} send={() => {}}/></I18nProvider>));
    const buttons = [...host!.querySelectorAll('button')].map(b => b.textContent ?? '');
    return {
        planners: host!.querySelectorAll('[data-testid="run-planner"]').length,
        editors: host!.querySelectorAll('[data-testid="setup-editor"]').length,
        sendOut: buttons.filter(text => text === 'Send out').length,
        elements: host!.querySelectorAll('*').length,
        own: e.own!,
        location: e.location,
    };
}
describe('practice driver panel re-render', () => {
    it('keeps exactly one planner / setup editor across equal, command-only, setup-only and combined revision changes', async () => {
        const w = await practiceWorld(), p1 = w.sessions[0].id;
        mount();
        let data = await startPracticeSession(w.repo, w.careerId, w.eventId, p1);
        const [id, other] = data.state!.input.entrants.filter(e => e.controller === 'PLAYER').map(e => e.entrantId);
        // 1. Fresh P1: command revision 0 === setup revision 0 (the colliding case).
        let r = render(practiceView(data), id);
        expect([r.own.commandRevision, r.own.preparation.setupRevision]).toEqual([0, 0]);
        expect([r.planners, r.editors, r.sendOut]).toEqual([1, 1, 1]);
        const garageElements = r.elements;
        // Switching between the two player cars never accumulates planners.
        for (let i = 0; i < 3; i++) {
            expect(render(practiceView(data), other)).toMatchObject({ planners: 1, editors: 1, sendOut: 1 });
            r = render(practiceView(data), id);
            expect([r.planners, r.editors, r.sendOut, r.elements]).toEqual([1, 1, 1, garageElements]);
        }
        // 2. Several authoritative steps with equal revisions: nothing grows.
        for (let i = 0; i < 4; i++) {
            data = await advancePracticeSession(w.repo, w.careerId, w.eventId, p1, data.state!.elapsedMs);
            r = render(practiceView(data), id);
            expect([r.planners, r.editors, r.sendOut, r.elements]).toEqual([1, 1, 1, garageElements]);
        }
        // 3. Setup revision changes only (projection edited: the planner must survive, the editor must be replaced once).
        const view = practiceView(data);
        const setupOnly: PracticeView = { ...view, entrants: view.entrants.map(e => e.entrantId === id ? { ...e, own: { ...e.own!, preparation: { ...e.own!.preparation, setupRevision: 1 } } } : e) };
        r = render(setupOnly, id);
        expect([r.planners, r.editors, r.sendOut, r.elements]).toEqual([1, 1, 1, garageElements]);
        r = render(practiceView(data), id);
        expect([r.planners, r.editors, r.elements]).toEqual([1, 1, garageElements]);
        // 4. Both change (a real garage setup change bumps the command and setup revisions together).
        const setup = { ...r.own.preparation.setup, AERO: r.own.preparation.setup.AERO + 4 };
        data = await practiceCommand(w.repo, w.careerId, w.eventId, p1, data.state!.elapsedMs, { kind: 'setup', entrantId: id, revision: r.own.commandRevision, setup });
        r = render(practiceView(data), id);
        expect([r.own.commandRevision, r.own.preparation.setupRevision]).toEqual([1, 1]);
        expect([r.planners, r.editors]).toEqual([1, 1]);
        while (r.own.readyAtMs > data.state!.elapsedMs) {
            data = await advancePracticeSession(w.repo, w.careerId, w.eventId, p1, data.state!.elapsedMs);
            r = render(practiceView(data), id);
            expect([r.planners, r.editors]).toEqual([1, 1]);
        }
        // 5. Command revision changes only: sent out → on track with no planner and no stale Send out.
        data = await practiceCommand(w.repo, w.careerId, w.eventId, p1, data.state!.elapsedMs, { kind: 'send', entrantId: id, revision: r.own.commandRevision, plan });
        r = render(practiceView(data), id);
        expect([r.own.commandRevision, r.own.preparation.setupRevision]).toEqual([2, 1]);
        expect(r.location).not.toBe('GARAGE');
        expect([r.planners, r.editors, r.sendOut]).toEqual([0, 1, 0]);
        expect(host!.querySelectorAll('[data-testid="setup-editor"] input[type=range]:not([disabled])')).toHaveLength(0);
        // 6. Many steps on track (as at 8×): counts never grow, no stale Send out appears.
        const onTrack: number[] = [];
        while (r.location !== 'GARAGE') {
            data = await advancePracticeSession(w.repo, w.careerId, w.eventId, p1, data.state!.elapsedMs);
            r = render(practiceView(data), id);
            if (r.location !== 'GARAGE') { expect([r.planners, r.editors, r.sendOut]).toEqual([0, 1, 0]); onTrack.push(r.elements); }
        }
        expect(Math.max(...onTrack) - Math.min(...onTrack)).toBeLessThanOrEqual(2);
        // 7. Back in the garage: exactly one fresh planner again.
        expect([r.planners, r.editors, r.sendOut]).toEqual([1, 1, 1]);
        for (let i = 0; i < 6; i++) {
            data = await advancePracticeSession(w.repo, w.careerId, w.eventId, p1, data.state!.elapsedMs);
            r = render(practiceView(data), id);
            expect([r.planners, r.editors, r.sendOut]).toEqual([1, 1, 1]);
        }
        expect(r.elements).toBeLessThan(garageElements + 20); // only the run-history list was added
    });
});

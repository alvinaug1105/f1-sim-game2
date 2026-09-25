import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/provider';
import { PracticeDriverPanel, PracticeSummary, PracticeTiming } from '../src/features/practice/components';
import { practiceView } from '../src/features/practice/view-model';
import { simulatePracticeSession, startPracticeSession } from '../src/features/practice/service';
import { WeekendView } from '../src/features/career/progression-views';
import { practiceWorld } from './helpers/practice';
// Server actions are server-only; the weekend view only needs their identities to render forms.
vi.mock('../src/features/career/progression-actions', () => ({ progressionAction: vi.fn() }));
vi.mock('../src/features/practice/actions', () => ({ practiceWeekendAction: vi.fn() }));
const html = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
describe('practice UI', () => {
    it('own cars get garage controls (labelled range inputs, run plan); rivals are read only', async () => {
        const w = await practiceWorld();
        const view = practiceView(await startPracticeSession(w.repo, w.careerId, w.eventId, w.sessions[0].id));
        const mine = view.entrants.find(e => e.own)!, rival = view.entrants.find(e => !e.own)!;
        const own = html(<PracticeDriverPanel view={view} e={mine} busy={false} send={() => {}}/>);
        expect(own.match(/type="range"/g)).toHaveLength(5);
        expect(own).toMatch(/<label for="setup-[^"]+-AERO">/);
        expect(own).toContain('Send out');
        expect(own).toContain('Setup confidence');
        const other = html(<PracticeDriverPanel view={view} e={rival} busy={false} send={() => {}}/>);
        expect(other).not.toContain('type="range"');
        expect(other).not.toContain('Send out');
        expect(other).toContain('Rival setups, run plans and driver feedback are not visible.');
    });
    it('timing states use text, and the summary offers Continue back to the weekend', async () => {
        const w = await practiceWorld();
        const view = practiceView(await simulatePracticeSession(w.repo, w.careerId, w.eventId, w.sessions[0].id));
        const timing = html(<PracticeTiming view={view} selected={view.entrants[0].entrantId} onSelect={() => {}}/>);
        expect(timing).toContain('Session classification');
        expect(timing).toContain('Garage');
        const summary = html(<PracticeSummary view={view} weekendHref="/weekend"/>);
        expect(summary).toContain('href="/weekend"');
        expect(summary).toContain('Continue');
        expect(summary).toContain('Practice 2 is now available.');
    });
    it('weekend Practice offers Manage and Simulate Session, never a plain Skip', async () => {
        const w = await practiceWorld();
        const page = () => html(<WeekendView progress={w.repo.progress} eventId={w.eventId}/>);
        let text = page();
        expect(text).not.toContain('Skip Practice');
        expect(text).not.toMatch(/value="skipPractice"/);
        expect(text).toContain(`href="/career/${w.careerId}/events/${w.eventId}/practice/${w.sessions[0].id}"`);
        expect(text).toContain('Open session');
        expect(text).toContain('Simulate session (auto-manage)');
        expect(text).toContain('Simulate all remaining Practice');
        // After P1 is simulated, P2 offers the same two choices; still no Skip anywhere in the weekend.
        await simulatePracticeSession(w.repo, w.careerId, w.eventId, w.sessions[0].id);
        text = page();
        expect(text).not.toContain('Skip Practice');
        expect(text).toContain(`href="/career/${w.careerId}/events/${w.eventId}/practice/${w.sessions[1].id}"`);
        expect(text).toContain('View summary');
    });
});

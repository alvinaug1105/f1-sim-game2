import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/provider';
import { PracticeDriverPanel, PracticeSummary, PracticeTiming } from '../src/features/practice/components';
import { practiceView } from '../src/features/practice/view-model';
import { simulatePracticeSession, startPracticeSession } from '../src/features/practice/service';
import { practiceWorld } from './helpers/practice';
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
});

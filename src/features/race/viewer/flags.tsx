"use client";
import { useI18n } from '../../../i18n/provider';
import type { DriverFlag } from './race-view';
const GLYPH: Record<DriverFlag, string> = { RETIRED: '✕', FINISHED: '■', PIT: '◧', BOX: '↘', ATTENTION: '⚑', TYRE_CRITICAL: '⚠', TYRE_HIGH: '⚠', FUEL: '⛽', BATTLE: '⚔' };
/** Compact per-driver status chips: text + glyph (never colour alone), short form for dense rows. */
export function FlagChips({ flags, compact = false }: { flags: readonly DriverFlag[]; compact?: boolean }) {
    const { t } = useI18n();
    if (!flags.length) return null;
    return <span className={`flag-chips${compact ? ' compact' : ''}`}>{flags.map(flag => <span key={flag} className={`flag flag-${flag}`} title={t(`viewer.flag.${flag}`)}>
        <span aria-hidden="true">{GLYPH[flag]} </span>{compact ? <><span aria-hidden="true">{t(`viewer.flagShort.${flag}`)}</span><span className="sr-only">{t(`viewer.flag.${flag}`)}</span></> : t(`viewer.flag.${flag}`)}
    </span>)}</span>;
}

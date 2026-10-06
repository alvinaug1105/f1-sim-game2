"use client";
import type { ReactNode } from 'react';
import { useI18n } from '../../../i18n/provider';
import type { timingRows } from './model';
import type { PlaybackController, PlaybackSnapshot } from './playback';
import { SEEK_LIMIT } from './playback';
import type { Attention } from './attention';
import type { TyreCompound } from '../../../simulation/race/tyres/model';
import type { PaceMode, FuelMode, ErsMode } from '../../../simulation/race/commands/model';
import { PlaybackControls } from '../../live/live-frame';
import { Icon, type IconName } from '../../../components/ui/icon';
type Rows = ReturnType<typeof timingRows>;
const TONE_ICON: Record<string, IconName> = { info: 'info', finish: 'flag', command: 'check', stopped: 'alert' };
/** Translated one-line description of an attention item; the driver is identified by abbreviation (data, not logic). */
export function useAttentionText(rows: readonly Rows[number][]) {
    const { t } = useI18n();
    return (a: Attention) => t(`viewer.attention.${a.kind}`, { driver: rows.find(r => r.id === a.entrantId)?.abbreviation ?? '' });
}
/**
 * Race-control tools (shared live frame) plus the strategic-attention line: why playback stopped (auto-pause / Next
 * Strategic Event / a command / the finish), or — with auto-pause off — the latest strategic change while playback
 * continues. Persistent strategic issues live in the issues rail (UX-RACE-001); this line explains the moment.
 */
export function PlaybackBar({ controller, playback, rows, reduceMotion, onReduceMotion, alerts, extra }: { controller: PlaybackController; playback: PlaybackSnapshot; rows: Rows; reduceMotion: boolean; onReduceMotion: (value: boolean) => void; alerts?: ReactNode; extra?: ReactNode }) {
    const { t, format } = useI18n(), describe = useAttentionText(rows), done = playback.phase === 'finished';
    // Command confirmations always name the driver the command targeted (from the command itself, not the selection).
    const confirm = playback.confirmation, confirmDriver = confirm ? rows.find(r => r.id === confirm.entrantId)?.abbreviation ?? '' : '';
    const confirmText = confirm ? `${confirmDriver} — ${confirm.kind === 'pit' ? (confirm.value ? t('viewer.confirm.pit', { compound: t(`tyre.${confirm.value as TyreCompound}`) }) : t('viewer.confirm.pitCancel')) : t(`viewer.confirm.${confirm.kind}`, { mode: confirm.kind === 'energyPolicy' ? t(`command.${confirm.value as 'RECHARGE' | 'BALANCED' | 'BOOST'}`) : confirm.kind === 'fuelMode' ? t(`command.fuel.${confirm.value as FuelMode}`) : t(`command.${confirm.value as PaceMode | ErsMode}`) })}` : '';
    const status = playback.busy && playback.phase !== 'finished' ? t('viewer.saving') : t(`viewer.phase.${playback.phase}`, { speed: format.number(playback.speed), limit: format.number(SEEK_LIMIT) });
    let attention: { tone: string; text: string } | null = null;
    if (playback.error) attention = null;
    else if (playback.reason === 'FINISH') attention = { tone: 'finish', text: t('viewer.reason.FINISH') };
    else if (playback.reason === 'COMMAND') attention = { tone: 'command', text: confirm ? `${confirmText} · ${t('viewer.resumeHint')}` : t('viewer.reason.COMMAND') };
    else if (playback.reason && playback.attention) {
        // v8E: simultaneous items are named (grouped on one line); only what does not fit is counted.
        const also = playback.alsoAttention ?? [], rest = Math.max(0, playback.moreAttention - also.length);
        attention = { tone: 'stopped', text: `${t('viewer.stoppedFor')} ${describe(playback.attention)}${also.length ? ` · ${t('viewer.alsoAttention', { items: also.map(describe).join('; ') })}` : ''}${rest ? ` · ${t('viewer.moreAttention', { count: format.number(rest) })}` : ''}` };
    }
    else if (playback.reason) attention = { tone: 'stopped', text: t(`viewer.reason.${playback.reason}`) };
    else if (confirm) attention = { tone: 'command', text: confirmText };
    else if (playback.playing && playback.lastAttention) attention = { tone: 'info', text: `${t('viewer.latestAttention', { lap: format.number(playback.lastAttention.lap) })} ${describe(playback.lastAttention)}` };
    return <section className="playback-bar" aria-label={t('viewer.playback')}>
        <PlaybackControls playback={playback} done={done} onToggle={playback.playing ? controller.pause : controller.play} onStep={() => void controller.step()} stepLabel={t('race.lap')}
            onSpeed={controller.setSpeed} onSkip={controller.skip} skipLabel={t('viewer.nextEvent')} onAutoPause={controller.setAutoPause}
            reduceMotion={reduceMotion} onReduceMotion={onReduceMotion} extra={extra} status={status}/>
        {/* Fixed-height status line: alerts and attention never push the Race layout up or down. */}
        <div className="race-status-line">
            {alerts}
            <p className={`attention-line attention-${attention?.tone ?? 'none'}`} role="status" aria-live="polite">{attention && <><Icon name={TONE_ICON[attention.tone] ?? 'info'} size={14}/>{attention.text}</>}</p>
            {playback.error && playback.error !== 'STALE' && <p role="alert" className="attention-line attention-error">{t('viewer.error')}</p>}
        </div>
    </section>;
}

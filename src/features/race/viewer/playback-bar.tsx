"use client";
import { useI18n } from '../../../i18n/provider';
import type { timingRows } from './model';
import type { PlaybackController, PlaybackSnapshot } from './playback';
import { PLAYBACK_SPEEDS, SEEK_LIMIT } from './playback';
import type { Attention } from './attention';
type Rows = ReturnType<typeof timingRows>;
const PHASE_GLYPH = { paused: '❚❚', running: '▶', seeking: '▶▶', finished: '■' } as const;
/** Translated one-line description of an attention item; the driver is identified by abbreviation (data, not logic). */
export function useAttentionText(rows: Rows) {
    const { t } = useI18n();
    return (a: Attention) => t(`viewer.attention.${a.kind}`, { driver: rows.find(r => r.id === a.entrantId)?.abbreviation ?? '' });
}
/**
 * Playback controls plus the strategic-attention line: why playback stopped (auto-pause / Next Strategic Event / a
 * command / the finish), or — with auto-pause off — the latest strategic change while playback continues.
 */
export function PlaybackBar({ controller, playback, rows, reduceMotion, onReduceMotion }: { controller: PlaybackController; playback: PlaybackSnapshot; rows: Rows; reduceMotion: boolean; onReduceMotion: (value: boolean) => void }) {
    const { t, format } = useI18n(), describe = useAttentionText(rows), done = playback.phase === 'finished';
    const status = playback.busy && playback.phase !== 'finished' ? t('viewer.saving') : t(`viewer.phase.${playback.phase}`, { speed: format.number(playback.speed), limit: format.number(SEEK_LIMIT) });
    let attention: { tone: string; text: string } | null = null;
    if (playback.error) attention = null;
    else if (playback.reason === 'FINISH') attention = { tone: 'finish', text: t('viewer.reason.FINISH') };
    else if (playback.reason === 'COMMAND') attention = { tone: 'command', text: t('viewer.reason.COMMAND') };
    else if (playback.reason && playback.attention) attention = { tone: 'stopped', text: `${t('viewer.stoppedFor')} ${describe(playback.attention)}${playback.moreAttention ? ` · ${t('viewer.moreAttention', { count: format.number(playback.moreAttention) })}` : ''}` };
    else if (playback.reason) attention = { tone: 'stopped', text: t(`viewer.reason.${playback.reason}`) };
    else if (playback.playing && playback.lastAttention) attention = { tone: 'info', text: `${t('viewer.latestAttention', { lap: format.number(playback.lastAttention.lap) })} ${describe(playback.lastAttention)}` };
    return <section className="playback-bar" aria-label={t('viewer.playback')}>
        <div className="playback-buttons">
            <button className="play-toggle" onClick={playback.playing ? controller.pause : controller.play} disabled={done} aria-label={t(playback.playing ? 'viewer.pause' : 'viewer.play')}><span aria-hidden="true">{playback.playing ? '❚❚ ' : '▶ '}</span>{t(playback.playing ? 'viewer.pause' : 'viewer.play')}</button>
            <button className="ops-secondary" onClick={() => void controller.step()} disabled={playback.busy || done}>{t('race.lap')}</button>
            <div role="group" aria-label={t('viewer.speed')}>{PLAYBACK_SPEEDS.map(speed => <button className="speed-button" key={speed} onClick={() => controller.setSpeed(speed)} aria-pressed={playback.speed === speed} disabled={done}>{format.number(speed)}×</button>)}</div>
            <button className="ops-secondary" onClick={controller.skip} disabled={done || playback.skipping} aria-pressed={playback.skipping}><span aria-hidden="true">▶▶ </span>{t('viewer.nextEvent')}</button>
        </div>
        <div className="viewer-settings">
            <label><input type="checkbox" checked={playback.autoPause} onChange={e => controller.setAutoPause(e.target.checked)} disabled={done}/>{t('viewer.autoPause')}</label>
            <label><input type="checkbox" checked={reduceMotion} onChange={e => onReduceMotion(e.target.checked)}/>{t('viewer.reduceMotion')}</label>
            <span role="status" className={`playback-phase phase-${playback.phase}`}><span aria-hidden="true">{PHASE_GLYPH[playback.phase]} </span>{status}</span>
        </div>
        {attention && <p className={`attention-line attention-${attention.tone}`} role="status" aria-live="polite"><span aria-hidden="true">{attention.tone === 'info' ? 'ⓘ ' : attention.tone === 'finish' ? '■ ' : '⚑ '}</span>{attention.text}</p>}
        {playback.error && <p role="alert">{t('viewer.error')}</p>}
    </section>;
}

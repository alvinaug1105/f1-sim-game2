import { useI18n } from '../../../i18n/provider';
import { Icon } from '../../../components/ui/icon';
import { FOCUS_ZOOM, MAX_ZOOM, overviewCamera, panCamera, zoomCamera, type TrackCamera } from './track-camera';

export function TrackCameraControls({ camera, onChange, available, scenery, onScenery, expanded, onExpand }: {
    camera: TrackCamera; onChange: (camera: TrackCamera) => void; available: boolean; scenery: boolean; onScenery: () => void; expanded: boolean; onExpand?: () => void;
}) {
    const { t } = useI18n();
    return <div className="track-tools" role="group" aria-label={t('trackViewer.controls')}>
        <button type="button" aria-pressed={camera.mode === 'overview'} onClick={() => onChange(overviewCamera())}><Icon name="circuit" size={16}/><span>{t('trackViewer.overview')}</span></button>
        <button type="button" aria-pressed={camera.mode === 'focus'} disabled={!available} onClick={() => onChange({ ...camera, mode: 'focus', zoom: FOCUS_ZOOM })}><Icon name="current" size={16}/><span>{t('trackViewer.focus')}</span></button>
        <button type="button" aria-label={t('trackViewer.zoomIn')} title={t('trackViewer.zoomIn')} disabled={camera.zoom >= MAX_ZOOM} onClick={() => onChange(zoomCamera(camera, 1.35))}>+</button>
        <button type="button" aria-label={t('trackViewer.zoomOut')} title={t('trackViewer.zoomOut')} disabled={camera.zoom <= 1} onClick={() => onChange(zoomCamera(camera, 1 / 1.35))}>−</button>
        <button type="button" onClick={() => onChange(overviewCamera())}>{t('trackViewer.reset')}</button>
        {onExpand && <button type="button" className="track-expand" aria-pressed={expanded} onClick={onExpand}><Icon name="menu" size={16}/><span>{t(expanded ? 'trackViewer.restore' : 'trackViewer.expand')}</span></button>}
        <button type="button" className="track-environment-toggle" aria-pressed={scenery} onClick={onScenery}><Icon name="circuit" size={16}/><span>{t('trackViewer.environment')}</span></button>
        {camera.zoom > 1 && <div className="track-pan" role="group" aria-label={t('trackViewer.pan')}>
            {(['left','up','down','right'] as const).map((direction, i) => <button key={direction} type="button" aria-label={t(`trackViewer.pan.${direction}`)} title={t(`trackViewer.pan.${direction}`)} onClick={() => onChange(panCamera(camera, i === 0 ? -.15 : i === 3 ? .15 : 0, i === 1 ? -.15 : i === 2 ? .15 : 0))}>{['←','↑','↓','→'][i]}</button>)}
        </div>}
    </div>;
}

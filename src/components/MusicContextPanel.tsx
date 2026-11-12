import { useEffect, useMemo, useRef } from 'react'
import { Popconfirm } from 'antd'
import {
  ArrowUpToLine,
  AudioLines,
  Captions,
  ListMusic,
  LocateFixed,
  Maximize2,
  Pause,
  Play,
  Trash2,
  X,
} from 'lucide-react'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { sourceLabel } from '../features/music/sources'
import MusicCover from './MusicCover'

export type MusicContextTab = 'now' | 'queue'

export default function MusicContextPanel({
  open,
  tab,
  onTabChange,
  onClose,
}: {
  open: boolean
  tab: MusicContextTab
  onTabChange: (tab: MusicContextTab) => void
  onClose: () => void
}) {
  const player = useMusicPlayer()
  const queueRef = useRef<HTMLDivElement>(null)
  const { current, playlist, currentIndex } = player
  const visibleQueue = useMemo(
    () => playlist.slice(Math.max(0, currentIndex)),
    [currentIndex, playlist],
  )
  const upcomingCount = currentIndex >= 0 ? Math.max(0, playlist.length - currentIndex - 1) : playlist.length

  useEffect(() => {
    if (!open || tab !== 'queue') return
    queueRef.current?.querySelector<HTMLElement>('.is-current')?.scrollIntoView({ block: 'center' })
  }, [current?.id, open, tab])

  if (!current || !open) return null

  const locateCurrent = () => {
    queueRef.current?.querySelector<HTMLElement>('.is-current')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <>
      <button className="music-context-scrim" type="button" aria-label="关闭播放面板" onClick={onClose} />
      <aside className="music-context-panel" aria-label="正在播放与待播队列">
        <header className="music-context-panel__header">
          <div className="music-context-panel__tabs" role="tablist" aria-label="播放上下文">
            <button type="button" role="tab" aria-selected={tab === 'now'} className={tab === 'now' ? 'is-active' : ''} onClick={() => onTabChange('now')}>
              <Captions size={15} />正在播放
            </button>
            <button type="button" role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'is-active' : ''} onClick={() => onTabChange('queue')}>
              <ListMusic size={15} />待播 <span>{upcomingCount}</span>
            </button>
          </div>
          <button type="button" className="music-studio-icon" aria-label="收起播放面板" onClick={onClose}><X size={18} /></button>
        </header>

        {tab === 'now' ? (
          <div className="music-context-now">
            <button type="button" className="music-context-now__cover" onClick={() => window.dispatchEvent(new Event('music:open-fullscreen'))} aria-label="展开完整播放器">
              <MusicCover src={current.coverUrl} size={240} rounded={18} loading="eager" />
              <span><Maximize2 size={17} /></span>
            </button>
            <div className="music-context-now__copy">
              <span className="music-context-now__eyebrow"><AudioLines size={14} />NOW PLAYING</span>
              <h2>{current.name || '未知歌曲'}</h2>
              <button type="button" className="music-inline-link" onClick={() => player.openArtist(current.source, current.artistId, current.artist || '')}>
                {current.artist || '未知歌手'}
              </button>
              <p>{current.album || sourceLabel(current.actualSource || current.source)}</p>
            </div>
            <div className="music-context-now__lyric">
              <span>当前歌词</span>
              <strong>{player.lyricPreview || '纯音乐，或暂未提供歌词'}</strong>
            </div>
            <button type="button" className="music-context-now__expand" onClick={() => window.dispatchEvent(new Event('music:open-fullscreen'))}>
              <Captions size={16} />打开歌词与完整播放器<Maximize2 size={15} />
            </button>
          </div>
        ) : (
          <div className="music-context-queue">
            <div className="music-context-queue__toolbar">
              <span>共 {playlist.length} 首 · 待播 {upcomingCount} 首</span>
              <div>
                <button type="button" className="music-studio-icon" onClick={locateCurrent} aria-label="定位当前歌曲" title="定位当前歌曲"><LocateFixed size={16} /></button>
                <Popconfirm title="清空全部待播？" description="当前歌曲会继续播放。" okText="清空" cancelText="取消" onConfirm={player.clearQueue}>
                  <button type="button" className="music-studio-icon" aria-label="清空待播队列" title="清空待播"><Trash2 size={16} /></button>
                </Popconfirm>
              </div>
            </div>
            <div className="music-context-queue__list" ref={queueRef}>
              {visibleQueue.length ? visibleQueue.map((song, visibleIndex) => {
                const index = currentIndex >= 0 ? currentIndex + visibleIndex : visibleIndex
                const active = index === currentIndex
                return (
                  <div className={`music-context-queue__item${active ? ' is-current' : ''}`} key={`${song.source}:${song.id}:${index}`}>
                    <button type="button" className="music-context-queue__main" onClick={() => active ? player.togglePlay() : void player.playFromQueue(index)} aria-label={`${active ? (player.isPlaying ? '暂停' : '播放') : '播放'} ${song.name}`}>
                      <span className="music-context-queue__cover">
                        <MusicCover src={song.coverUrl} size={42} rounded={9} />
                        <i>{active && player.isPlaying ? <Pause size={14} /> : <Play size={14} />}</i>
                      </span>
                      <span className="music-context-queue__copy"><strong>{song.name}</strong><small>{song.artist}</small></span>
                    </button>
                    <div className="music-context-queue__actions">
                      {!active && index !== currentIndex + 1 && <button type="button" onClick={() => player.moveQueueToNext(index)} aria-label={`移到下一首：${song.name}`} title="移到下一首"><ArrowUpToLine size={15} /></button>}
                      {!active && <button type="button" onClick={() => player.removeFromQueue(index)} aria-label={`从队列移除：${song.name}`} title="从队列移除"><X size={15} /></button>}
                    </div>
                  </div>
                )
              }) : (
                <div className="music-context-queue__empty"><ListMusic size={28} /><strong>队列里没有歌曲</strong><span>在歌曲旁点击“添加到队列”</span></div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

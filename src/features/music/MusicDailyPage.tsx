import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Skeleton } from 'antd'
import {
  AudioLines,
  Headphones,
  Heart,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { qishuiDiscovery } from '../../api/music'
import { useAuth } from '../../context/AuthContext'
import { useMusicBrowse } from '../../context/MusicPlayerContext'
import type { SongSearchItem } from '../../types'
import MusicCover from '../../components/MusicCover'
import { useMusicAiRecommendations } from '../../hooks/useMusicAiRecommendations'
import { dailyMeta, formatClock, matchReason, songKey, useSongActions } from './MusicHomeShared'

/** Content-first discovery home: quick actions, daily feature and a dense playable track grid. */
export default function MusicDailyPage() {
  const { token, username } = useAuth()
  const navigate = useNavigate()
  const player = useMusicBrowse()
  const [songs, setSongs] = useState<SongSearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [aiOpen, setAiOpen] = useState(false)
  const ai = useMusicAiRecommendations()
  const meta = useMemo(() => dailyMeta(), [])
  const reload = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => setSongs([]), [token])
  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void qishuiDiscovery(controller.signal, revision > 0)
      .then((value) => { if (!controller.signal.aborted) setSongs(value.list) })
      .catch(() => { if (!controller.signal.aborted) setError('今日推荐暂时未能加载，请稍后重试。') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, revision])

  const { renderActions } = useSongActions(songs)
  const featured = songs[0]
  const featuredIsCurrent = !!featured && !!player.current && songKey(featured) === songKey(player.current)
  const totalDuration = songs.reduce((sum, song) => sum + (song.durationMs ? song.durationMs / 1000 : song.durationSec || 0), 0)
  const totalMinutes = Math.round(totalDuration / 60)
  const aiReasonFor = (song: { name?: string | null; artist?: string | null }) => matchReason(song, ai.recommendations)
  const heroReason = featured ? aiReasonFor(featured) : ''

  const playDaily = () => {
    if (!songs.length) return
    if (featuredIsCurrent) player.togglePlay()
    else void player.playPlaylist(songs)
  }
  const openAi = () => {
    setAiOpen(true)
    if (!ai.loading && ai.recommendations.length === 0) void ai.generateRecommendations()
  }

  const quickActions = [
    { label: '播放今日推荐', detail: `${songs.length || '—'} 首精选`, icon: Play, action: playDaily, tone: 'coral', disabled: !songs.length },
    { label: '音乐漫游', detail: '按场景持续收听', icon: Radio, action: () => navigate('/music?view=roaming'), tone: 'violet' },
    { label: '热门榜单', detail: '发现正在流行', icon: Trophy, action: () => navigate('/music?view=toplist'), tone: 'blue' },
    { label: '我的喜欢', detail: '回到熟悉的旋律', icon: Heart, action: () => navigate('/music?view=favorites'), tone: 'green' },
  ]

  return (
    <div className="music-daily music-discovery music-home-v4">
      <header className="daily-home-head">
        <div>
          <span>{meta.dateLabel} · {meta.weekday}</span>
          <h1>今天想听什么？</h1>
          <p>{username ? `${username}，为你准备好今日推荐。` : '从一首喜欢的歌开始，慢慢发现更多。'}</p>
        </div>
        <button type="button" className="music-studio-icon" onClick={reload} disabled={loading} aria-label="刷新今日推荐" title="刷新推荐">
          <RefreshCw size={19} className={loading ? 'is-spinning' : ''} />
        </button>
      </header>

      <section className="daily-quick-grid" aria-label="快捷入口">
        {quickActions.map(({ label, detail, icon: Icon, action, tone, disabled }) => (
          <button type="button" key={label} className={`daily-quick daily-quick--${tone}`} onClick={action} disabled={disabled}>
            <span className="daily-quick__icon"><Icon size={21} fill={label === '播放今日推荐' ? 'currentColor' : 'none'} /></span>
            <span><strong>{label}</strong><small>{detail}</small></span>
          </button>
        ))}
      </section>

      <section className="daily-hero" aria-label="每日推荐">
        <div className="daily-hero__art">
          {featured ? <MusicCover src={featured.coverUrl} size={196} rounded={16} loading="eager" /> : <div className="daily-hero__art-empty"><Headphones size={52} /></div>}
        </div>
        <div className="daily-hero__copy">
          <span className="daily-hero__eyebrow"><Sparkles size={14} />每日推荐 · DAILY MIX</span>
          <h2>{featured?.name || '你的今日专属歌单'}</h2>
          {featured?.artist ? (
            <button type="button" className="daily-hero__artist" onClick={() => player.openArtist(featured.source, featured.artistId, featured.artist)}>{featured.artist}</button>
          ) : <span className="daily-hero__artist">正在为你挑选</span>}
          <p>{heroReason || ai.summary || '根据汽水官方推荐，每天更新一份。无需设置，点击就能开始听。'}</p>
          <div className="daily-hero__actions">
            <Button type="primary" size="large" icon={featuredIsCurrent && player.isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />} disabled={!featured} loading={featuredIsCurrent && player.playLoading} onClick={playDaily}>
              {featuredIsCurrent ? (player.isPlaying ? '暂停' : '继续播放') : '播放全部'}
            </Button>
            <button type="button" className="daily-hero__secondary" onClick={reload} disabled={loading}><RefreshCw size={16} />换一批</button>
          </div>
          <div className="daily-hero__meta"><span>{songs.length} 首歌曲</span>{totalMinutes > 0 && <span>约 {totalMinutes} 分钟</span>}<span>汽水音乐 · 官方推荐</span></div>
        </div>
      </section>

      <section className="daily-list" aria-label="为你推荐">
        <div className="daily-section-head">
          <div><h2>为你推荐 <span>{songs.length || ''}</span></h2><p>点击歌曲立即播放，也可以插播或加入待播队列</p></div>
          <Button icon={<Play size={15} />} disabled={!songs.length} onClick={() => void player.playPlaylist(songs)}>播放全部</Button>
        </div>
        {error ? <Alert type="warning" message={error} action={<Button onClick={reload}>重试</Button>} /> : loading && !songs.length ? (
          <div className="daily-skeleton"><Skeleton active paragraph={{ rows: 6 }} /></div>
        ) : songs.length ? (
          <div className="daily-track-grid">
            {songs.map((song, index) => {
              const isCurrent = player.current && songKey(player.current) === songKey(song)
              const reason = aiReasonFor(song)
              return (
                <article key={`${songKey(song)}:${index}`} className={`daily-track${isCurrent ? ' is-current' : ''}`}>
                  <button type="button" className="daily-track__main" onClick={() => void player.playPlaylist(songs, index)} aria-label={`播放 ${song.name}`}>
                    <span className="daily-track__cover">
                      <MusicCover src={song.coverUrl} size={50} rounded={10} loading="lazy" />
                      <i>{isCurrent && player.isPlaying ? <AudioLines size={16} /> : <Play size={15} fill="currentColor" />}</i>
                    </span>
                    <span className="daily-track__info"><strong>{song.name}</strong><small>{song.artist}{song.album ? ` · ${song.album}` : ''}</small>{reason && <em>{reason}</em>}</span>
                  </button>
                  <span className="daily-track__dur">{formatClock(song.durationMs, song.durationSec)}</span>
                  <span className="daily-track__ops">{renderActions(song)}</span>
                </article>
              )
            })}
          </div>
        ) : <Empty description="今天还没有推荐，搜索一位喜欢的歌手吧" />}
      </section>

      <section className="daily-ai" aria-label="AI 挑歌">
        <div className="daily-ai__head">
          <span className="daily-ai__icon"><Sparkles size={20} /></span>
          <div><h3>让 AI 说说为什么</h3><p>结合最近的播放历史生成推荐理由，按需请求，不影响首屏。</p></div>
          <Button onClick={aiOpen ? () => void ai.generateRecommendations() : openAi} loading={ai.loading} icon={aiOpen ? <RefreshCw size={15} /> : <Sparkles size={15} />}>{aiOpen ? '重新生成' : '生成推荐语'}</Button>
        </div>
        {aiOpen && <div className="daily-ai__body">
          {ai.loading && <div className="daily-ai__loading"><span className="daily-ai__pulse" /><span>{ai.phase || '正在准备推荐'}</span><Skeleton active paragraph={{ rows: 2 }} title={false} /></div>}
          {!ai.loading && ai.error && <Alert type="info" message={ai.error} />}
          {!ai.loading && ai.summary && <blockquote className="daily-ai__summary">{ai.summary}</blockquote>}
          {!ai.loading && ai.recommendations.length > 0 && <div className="daily-ai__grid">{ai.recommendations.slice(0, 6).map((item, index) => (
            <button type="button" className="daily-ai__card" key={songKey(item.song)} onClick={() => void player.playPlaylist(ai.recommendations.map((entry) => entry.song), index)}>
              <MusicCover src={item.song.coverUrl} size={48} rounded={9} loading="lazy" /><span className="daily-ai__card-copy"><strong>{item.song.name}</strong><small>{item.song.artist}</small><em>{item.reason}</em></span><Play size={15} />
            </button>
          ))}</div>}
        </div>}
      </section>
    </div>
  )
}

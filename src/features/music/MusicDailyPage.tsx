import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Skeleton } from 'antd'
import {
  ArrowRight,
  AudioLines,
  Headphones,
  Heart,
  ListMusic,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { qishuiDiscovery } from '../../api/music'
import { useAuth } from '../../context/AuthContext'
import { useMusicBrowse } from '../../context/MusicPlayerContext'
import type { SongSearchItem } from '../../types'
import MusicCover from '../../components/MusicCover'
import { useMusicAiRecommendations } from '../../hooks/useMusicAiRecommendations'
import {
  dailyMeta,
  formatClock,
  matchReason,
  songKey,
  useSongActions,
} from './MusicHomeShared'

/**
 * 今日推荐（discover）
 * 信息架构：每日头版（日期 + 主推单曲）→ 今日歌单（编辑式列表，分主打/继续发现）
 *          → AI 挑歌（按需触发，复用已存在但此前未接入的 useMusicAiRecommendations）
 * 数据仍来自 /api/v1/music/qishui/discovery，路由与接口零改动。
 */
export default function MusicDailyPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const player = useMusicBrowse()
  const [songs, setSongs] = useState<SongSearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((n) => n + 1), [])
  const [aiOpen, setAiOpen] = useState(false)
  const ai = useMusicAiRecommendations()
  const meta = useMemo(() => dailyMeta(), [])

  useEffect(() => {
    setSongs([])
  }, [token])

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void qishuiDiscovery(controller.signal, revision > 0)
      .then((value) => {
        if (!controller.signal.aborted) setSongs(value.list)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('今日推荐暂时未能加载，请稍后重试。')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [token, revision])

  const { renderActions } = useSongActions(songs)
  const featured = useMemo(
    () => player.current || songs[0],
    [player.current, songs],
  )
  const leadSongs = songs.slice(0, 3)
  const moreSongs = songs.slice(3)
  const totalDuration = songs.reduce(
    (sum, song) => sum + (song.durationMs ? song.durationMs / 1000 : song.durationSec || 0),
    0,
  )
  const totalMinutes = Math.round(totalDuration / 60)
  const aiReasonFor = (song: { name?: string | null; artist?: string | null }) =>
    matchReason(song, ai.recommendations)
  // 只有真的匹配到理由时才多出一列，避免用重复的「官方推荐」标签占位
  const hasAiReasons = songs.some((song) => !!aiReasonFor(song))
  const heroReason = featured ? aiReasonFor(featured) : ''

  const openAi = () => {
    setAiOpen(true)
    if (!ai.loading && ai.recommendations.length === 0) void ai.generateRecommendations()
  }

  const trackRow = (song: SongSearchItem, index: number, lead: boolean) => {
    const reason = aiReasonFor(song)
    const isCurrent = player.current && songKey(player.current) === songKey(song)
    return (
      <li
        key={songKey(song)}
        className={`daily-track${lead ? ' daily-track--lead' : ''}${isCurrent ? ' is-current' : ''}`}
      >
        <button
          type="button"
          className="daily-track__main"
          onClick={() => void player.playPlaylist(songs, index)}
          aria-label={`播放 ${song.name}`}
        >
          <span className="daily-track__no">
            {isCurrent && player.isPlaying ? (
              <AudioLines size={15} />
            ) : (
              String(index + 1).padStart(2, '0')
            )}
          </span>
          <MusicCover src={song.coverUrl} size={lead ? 56 : 46} rounded={8} loading="lazy" />
          <span className="daily-track__info">
            <strong>{song.name}</strong>
            <small>
              {song.artist}
              {song.album ? ` · ${song.album}` : ''}
            </small>
          </span>
        </button>
        {hasAiReasons && (
          <span className="daily-track__reason" title={reason || undefined}>
            {reason}
          </span>
        )}
        <span className="daily-track__dur">
          {formatClock(song.durationMs, song.durationSec)}
        </span>
        <span className="daily-track__ops">{renderActions(song)}</span>
      </li>
    )
  }

  return (
    <div className="music-daily music-discovery">
      {/* 1. 每日头版 */}
      <section className="daily-hero" aria-label="今日推荐头版">
        <div className="daily-hero__meta">
          <span className="daily-hero__date">
            {meta.dateLabel} · {meta.weekday}
          </span>
          <span className="daily-hero__edition">DAILY EDITION</span>
        </div>
        <div className="daily-hero__body">
          <div className="daily-hero__lead">
            <span className="music-eyebrow">
              <Sparkles size={16} />
              TODAY&apos;S PICK
            </span>
            <h2>
              今天，
              <br />
              从这一首开始。
            </h2>
            <p>
              {ai.summary
                ? ai.summary
                : '每天一份汽水官方推荐，按顺序听，或挑一首顺眼的开始。'}
            </p>
            <div className="daily-hero__actions">
              <Button
                type="primary"
                size="large"
                icon={
                  player.current && player.isPlaying ? <Pause size={17} /> : <Play size={17} />
                }
                disabled={!featured}
                loading={player.playLoading}
                onClick={() =>
                  player.current
                    ? player.togglePlay()
                    : void player.playPlaylist(songs)
                }
              >
                {player.current
                  ? player.isPlaying
                    ? '暂停'
                    : '继续播放'
                  : '播放今日'}
              </Button>
              <button
                type="button"
                className="daily-hero__secondary"
                onClick={reload}
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? 'is-spinning' : ''} />
                <span>换一份</span>
              </button>
            </div>
          </div>
          <div className="daily-hero__feature">
            <div className="daily-hero__art">
              {featured ? (
                <MusicCover
                  src={featured.coverUrl}
                  size={260}
                  rounded={12}
                  loading="eager"
                />
              ) : (
                <div className="daily-hero__art-empty">
                  <Headphones size={64} />
                </div>
              )}
              <span className="daily-hero__art-badge">今日主打</span>
            </div>
            <div className="daily-hero__feature-copy">
              <small>{player.current ? '正在收听' : '推荐给你'}</small>
              <h3>{featured?.name || '准备好，听一首新歌'}</h3>
              {featured?.artist && (
                <button
                  type="button"
                  className="music-inline-link"
                  onClick={() =>
                    player.openArtist(
                      featured.source,
                      featured.artistId,
                      featured.artist || '',
                    )
                  }
                >
                  {featured.artist}
                </button>
              )}
              {heroReason && <p className="daily-hero__reason">{heroReason}</p>}
            </div>
          </div>
        </div>
        <div className="daily-hero__foot">
          <span>
            今日 {songs.length} 首
            {totalMinutes > 0 ? ` · 约 ${totalMinutes} 分钟` : ''}
          </span>
          <span className="daily-hero__dot" />
          <span>汽水音乐 · 官方推荐</span>
          <span className="daily-hero__foot-right">{meta.shortDate}</span>
        </div>
      </section>

      {/* 2. 今日歌单 */}
      <section className="daily-list" aria-label="今日歌单">
        <div className="daily-section-head">
          <div>
            <h3>
              今日歌单 <span className="music-count">{songs.length || ''}</span>
            </h3>
            <p>{hasAiReasons ? '已附上 AI 推荐理由' : '按顺序听，或挑一首顺眼的开始'}</p>
          </div>
          <div className="daily-section-head__actions">
            <Button
              icon={<Play size={15} />}
              disabled={!songs.length}
              onClick={() => void player.playPlaylist(songs)}
            >
              播放全部
            </Button>
            <button
              type="button"
              className={`music-studio-icon${loading ? ' is-loading' : ''}`}
              aria-label="刷新今日推荐"
              onClick={reload}
              disabled={loading}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </div>

        {error ? (
          <Alert
            type="warning"
            message={error}
            action={<Button onClick={reload}>重试</Button>}
          />
        ) : loading && !songs.length ? (
          <div className="daily-skeleton">
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : songs.length ? (
          <>
            <div className="daily-list__group-label">今日主打</div>
            <ol className={`daily-tracklist${hasAiReasons ? ' has-reasons' : ''}`}>
              {leadSongs.map((song, index) => trackRow(song, index, true))}
            </ol>
            {moreSongs.length > 0 && (
              <>
                <div className="daily-list__group-label">继续发现</div>
                <ol className={`daily-tracklist${hasAiReasons ? ' has-reasons' : ''}`}>
                  {moreSongs.map((song, index) =>
                    trackRow(song, index + leadSongs.length, false),
                  )}
                </ol>
              </>
            )}
          </>
        ) : (
          <Empty description="今天还没有推荐，搜索一位喜欢的歌手吧" />
        )}
      </section>

      {/* 3. AI 挑歌：按需触发，不阻塞首屏 */}
      <section className="daily-ai" aria-label="AI 挑歌">
        <div className="daily-ai__head">
          <span className="daily-ai__icon">
            <Sparkles size={20} />
          </span>
          <div>
            <h3>让 AI 说说为什么</h3>
            <p>结合你最近的播放历史，挑几首并给出理由。不点就不会发起请求。</p>
          </div>
          {!aiOpen && (
            <Button onClick={openAi} icon={<Sparkles size={15} />}>
              生成推荐语
            </Button>
          )}
          {aiOpen && (
            <Button
              onClick={() => void ai.generateRecommendations()}
              loading={ai.loading}
              icon={<RefreshCw size={15} />}
            >
              重新生成
            </Button>
          )}
        </div>
        {aiOpen && (
          <div className="daily-ai__body">
            {ai.loading && (
              <div className="daily-ai__loading">
                <span className="daily-ai__pulse" />
                <span>{ai.phase || '正在准备推荐'}</span>
                <Skeleton active paragraph={{ rows: 2 }} title={false} />
              </div>
            )}
            {!ai.loading && ai.error && (
              <Alert type="info" message={ai.error} />
            )}
            {!ai.loading && ai.summary && (
              <blockquote className="daily-ai__summary">{ai.summary}</blockquote>
            )}
            {!ai.loading && ai.recommendations.length > 0 && (
              <div className="daily-ai__grid">
                {ai.recommendations.slice(0, 6).map((item, index) => (
                  <button
                    type="button"
                    className="daily-ai__card"
                    key={songKey(item.song)}
                    onClick={() =>
                      void player.playPlaylist(
                        ai.recommendations.map((r) => r.song),
                        index,
                      )
                    }
                  >
                    <MusicCover src={item.song.coverUrl} size={48} rounded={8} loading="lazy" />
                    <span className="daily-ai__card-copy">
                      <strong>{item.song.name}</strong>
                      <small>{item.song.artist}</small>
                      <em>{item.reason}</em>
                    </span>
                    <Play size={15} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 4. 快捷入口 */}
      <div className="music-discovery-links">
        <button onClick={() => navigate('/music?view=roaming')}>
          <Radio size={22} />
          <span>
            <strong>音乐漫游</strong>
            <small>选一个场景，持续听下去</small>
          </span>
          <ArrowRight size={18} />
        </button>
        <button onClick={() => navigate('/music?view=my-playlists')}>
          <ListMusic size={22} />
          <span>
            <strong>我的歌单</strong>
            <small>收藏与分享链接导入</small>
          </span>
          <ArrowRight size={18} />
        </button>
        <button onClick={() => navigate('/music?view=favorites')}>
          <Heart size={22} />
          <span>
            <strong>我喜欢的音乐</strong>
            <small>让喜欢的旋律常在</small>
          </span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}

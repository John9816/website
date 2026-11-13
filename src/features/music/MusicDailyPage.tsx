import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Empty, Skeleton } from 'antd'
import {
  ArrowRight,
  AudioLines,
  ChevronRight,
  Headphones,
  Heart,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  getMusicHistory,
  musicNewSongs,
  musicSearch,
  qishuiDiscovery,
} from '../../api/music'
import { useAuth } from '../../context/AuthContext'
import { useMusicBrowse, useMusicPlayer } from '../../context/MusicPlayerContext'
import type { MusicQuality, SongSearchItem } from '../../types'
import MusicCover from '../../components/MusicCover'
import { useMusicAiRecommendations } from '../../hooks/useMusicAiRecommendations'
import {
  AURORA_SCENES,
  AuroraCover,
  AuroraSceneArt,
  HOT_SEARCHES,
  clearRecentSearchesStorage,
  dailyMeta,
  formatClock,
  matchReason,
  pushRecentSearch,
  readRecentSearches,
  songKey,
  useSongActions,
} from './MusicHomeShared'

const ALL_QUALITIES: MusicQuality[] = ['128k', '320k', 'flac', 'flac24bit']

/** 只有「正在播放」那张卡片订阅音频时钟，其余列表不受每秒更新影响。 */
function ContinueProgress() {
  const { currentTime, duration } = useMusicPlayer()
  const pct = duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0
  return <span className="ab-continue-card__bar"><i style={{ width: `${pct}%` }} /></span>
}

function historyToSong(item: {
  songId: string
  source: SongSearchItem['source']
  name: string
  artist?: string | null
  album?: string | null
  coverUrl?: string | null
  durationSec?: number | null
}): SongSearchItem {
  return {
    id: item.songId,
    source: item.source,
    name: item.name,
    artist: item.artist ?? '',
    album: item.album ?? undefined,
    coverUrl: item.coverUrl ?? undefined,
    durationSec: item.durationSec ?? undefined,
    availableQualities: [...ALL_QUALITIES],
  }
}

/** Aurora Live 发现页：今日焦点、继续聆听、场景频道、新歌速递与覆盖式搜索。 */
export default function MusicDailyPage() {
  const { token, username } = useAuth()
  const navigate = useNavigate()
  const player = useMusicBrowse()
  const [songs, setSongs] = useState<SongSearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [aiOpen, setAiOpen] = useState(false)
  const [history, setHistory] = useState<SongSearchItem[]>([])
  const [chart, setChart] = useState<SongSearchItem[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<SongSearchItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const scrollRestoreRef = useRef(0)
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

  // 继续聆听 / 新歌速递：仅登录时按需请求，失败静默隐藏，不影响首屏与游客态。
  useEffect(() => {
    if (!token) { setHistory([]); setChart([]); return }
    let alive = true
    void getMusicHistory(0, 8)
      .then((page) => { if (alive) setHistory((page.items || []).map(historyToSong)) })
      .catch(() => { if (alive) setHistory([]) })
    void musicNewSongs('netease', 1, 8)
      .then((detail) => { if (alive) setChart(detail.list || []) })
      .catch(() => { if (alive) setChart([]) })
    return () => { alive = false }
  }, [token])

  // 覆盖式搜索：防抖请求，结果只做预览；关闭后恢复原来的滚动位置。
  useEffect(() => {
    const keyword = searchKeyword.trim()
    setSearchResults([])
    if (!searchOpen || !keyword || !token) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearchLoading(true)
      void musicSearch('qq', keyword, 1, 6, 'song', controller.signal)
        .then((data) => { if (!controller.signal.aborted) setSearchResults(data.list || []) })
        .catch(() => { if (!controller.signal.aborted) setSearchResults([]) })
        .finally(() => { if (!controller.signal.aborted) setSearchLoading(false) })
    }, 320)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [searchOpen, searchKeyword, token])

  const openSearch = () => {
    scrollRestoreRef.current = window.scrollY
    setRecentSearches(readRecentSearches())
    setSearchKeyword('')
    setSearchOpen(true)
    document.body.style.overflow = 'hidden'
  }

  const closeSearch = () => {
    setSearchOpen(false)
    document.body.style.overflow = ''
    window.requestAnimationFrame(() => window.scrollTo(0, scrollRestoreRef.current))
  }

  useEffect(() => () => { document.body.style.overflow = '' }, [])

  const submitSearch = (keyword: string) => {
    const trimmed = keyword.trim()
    if (!trimmed) return
    pushRecentSearch(trimmed)
    closeSearch()
    navigate('/music?view=search')
  }

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
    <div className="music-daily music-discovery music-home-v4 aurora-home">
      <header className="daily-home-head ab-home-head">
        <div>
          <span>{meta.dateLabel} · {meta.weekday}</span>
          <h1>今天想听什么？</h1>
          <p>{username ? `${username}，为你准备好今日推荐。` : '从一首喜欢的歌开始，慢慢发现更多。'}</p>
        </div>
        <div className="ab-home-head__ops">
          <button type="button" className="ab-search-trigger" onClick={openSearch}>
            <Search size={17} /> 搜索歌曲
          </button>
          <button type="button" className="music-studio-icon" onClick={reload} disabled={loading} aria-label="刷新今日推荐" title="刷新推荐">
            <RefreshCw size={19} className={loading ? 'is-spinning' : ''} />
          </button>
        </div>
      </header>

      <section className="daily-quick-grid ab-quick-grid" aria-label="快捷入口">
        {quickActions.map(({ label, detail, icon: Icon, action, tone, disabled }) => (
          <button type="button" key={label} className={`daily-quick daily-quick--${tone} ab-quick`} onClick={action} disabled={disabled}>
            <span className="daily-quick__icon"><Icon size={21} fill={label === '播放今日推荐' ? 'currentColor' : 'none'} /></span>
            <span><strong>{label}</strong><small>{detail}</small></span>
          </button>
        ))}
      </section>

      {/* 今日焦点：封面拼贴 + 渐变环境光 + 单一主播放按钮 */}
      <section className="daily-hero ab-hero" aria-label="每日推荐">
        <span className="ab-hero__glow" aria-hidden="true" />
        <div className="daily-hero__art ab-hero__collage">
          {songs.length ? (
            <div className="ab-hero__tiles">
              {songs.slice(0, 4).map((song, index) => (
                <span key={`${songKey(song)}:${index}`} className={`ab-hero__tile ab-hero__tile--${index}`}>
                  <AuroraCover
                    src={song.coverUrl}
                    seed={songKey(song)}
                    size={index === 0 ? 176 : 84}
                    rounded={index === 0 ? 18 : 12}
                    loading="eager"
                  />
                </span>
              ))}
            </div>
          ) : <div className="daily-hero__art-empty"><Headphones size={52} /></div>}
        </div>
        <div className="daily-hero__copy ab-hero__copy">
          <span className="daily-hero__eyebrow"><Sparkles size={14} />每日推荐 · DAILY MIX</span>
          <h2>{featured?.name || '你的今日专属歌单'}</h2>
          {featured?.artist ? (
            <button type="button" className="daily-hero__artist" onClick={() => player.openArtist(featured.source, featured.artistId, featured.artist)}>{featured.artist}</button>
          ) : <span className="daily-hero__artist">正在为你挑选</span>}
          <p>{heroReason || ai.summary || '根据汽水官方推荐，每天更新一份。无需设置，点击就能开始听。'}</p>
          <div className="daily-hero__actions ab-hero__actions">
            <Button type="primary" size="large" icon={featuredIsCurrent && player.isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />} disabled={!featured} loading={featuredIsCurrent && player.playLoading} onClick={playDaily}>
              {featuredIsCurrent ? (player.isPlaying ? '暂停' : '继续播放') : '立即播放'}
            </Button>
            <button type="button" className="daily-hero__secondary" onClick={reload} disabled={loading}><RefreshCw size={16} />换一批</button>
          </div>
          <div className="daily-hero__meta"><span>{songs.length} 首歌曲</span>{totalMinutes > 0 && <span>约 {totalMinutes} 分钟</span>}<span>汽水音乐 · 官方推荐</span></div>
        </div>
      </section>

      {/* 继续聆听：横向最近播放，封面带播放进度标记 */}
      <section className="ab-section daily-continue" aria-label="继续聆听">
        <div className="ab-section__head">
          <div><h2>继续聆听</h2><p>从上次停下的地方接着听</p></div>
          <button type="button" className="ab-section__more" onClick={() => navigate('/music?view=history')}>播放历史 <ChevronRight size={15} /></button>
        </div>
        {token && history.length ? (
          <div className="ab-continue-rail">
            {history.slice(0, 8).map((song) => {
              const isCurrent = !!player.current && songKey(player.current) === songKey(song)
              return (
                <button type="button" key={songKey(song)} className={`ab-continue-card${isCurrent ? ' is-current' : ''}`}
                  onClick={() => void player.playPlaylist(history, history.findIndex((item) => songKey(item) === songKey(song)))}
                  aria-label={`播放 ${song.name}`}>
                  <AuroraCover src={song.coverUrl} seed={songKey(song)} size={72} rounded={14} />
                  <span className="ab-continue-card__copy"><strong>{song.name}</strong><small>{song.artist}</small></span>
                  {isCurrent ? <ContinueProgress /> : null}
                  <span className="ab-continue-card__play"><Play size={14} fill="currentColor" /></span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="ab-empty">{token ? '最近还没有播放记录，先听一首吧。' : '登录后可在这里接着听最近播放的歌曲。'}</p>
        )}
      </section>

      {/* 场景频道：渐变 + 动态图形 + 内置图标兜底 */}
      <section className="ab-section daily-scenes" aria-label="按场景听">
        <div className="ab-section__head">
          <div><h2>按场景听</h2><p>挑一个此刻的心情</p></div>
        </div>
        <div className="ab-scene-grid">
          {AURORA_SCENES.map((scene) => (
            <button type="button" key={scene.id} className={`ab-scene ab-tone--${scene.tone}`}
              onClick={() => navigate(`/music?view=${scene.view}`)}>
              <span className={`ab-scene__glyph ab-scene__glyph--${scene.glyph}`} aria-hidden="true" />
              <AuroraSceneArt Icon={scene.Icon} tone={scene.tone} seed={scene.id} size={44} />
              <span className="ab-scene__copy"><strong>{scene.name}</strong><small>{scene.desc}</small></span>
              <ArrowRight size={16} className="ab-scene__arrow" />
            </button>
          ))}
        </div>
      </section>

      {/* 新歌速递：高密度列表，炫酷效果集中在焦点区 */}
      {chart.length ? (
        <section className="ab-section daily-charts" aria-label="新歌速递">
          <div className="ab-section__head">
            <div><h2>新歌速递</h2><p>刚上架的声音，先听为快</p></div>
            <button type="button" className="ab-section__more" onClick={() => navigate('/music?view=new')}>全部新歌 <ChevronRight size={15} /></button>
          </div>
          <ol className="ab-chart-list">
            {chart.slice(0, 6).map((song, index) => (
              <li key={`${songKey(song)}:${index}`}>
                <span className="ab-chart-list__no">{String(index + 1).padStart(2, '0')}</span>
                <AuroraCover src={song.coverUrl} seed={songKey(song)} size={44} rounded={9} />
                <button type="button" className="ab-chart-list__main" onClick={() => void player.playPlaylist(chart, index)} aria-label={`播放 ${song.name}`}>
                  <strong>{song.name}</strong><small>{song.artist}{song.album ? ` · ${song.album}` : ''}</small>
                </button>
                <span className="ab-chart-list__dur">{formatClock(song.durationMs, song.durationSec)}</span>
                <span className="ab-chart-list__play"><Play size={14} fill="currentColor" /></span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="daily-list ab-daily-list" aria-label="为你推荐">
        <div className="daily-section-head">
          <div><h2>为你推荐 <span>{songs.length || ''}</span></h2><p>点击歌曲立即播放，也可以插播或加入待播队列</p></div>
          <Button icon={<Play size={15} />} disabled={!songs.length} onClick={() => void player.playPlaylist(songs)}>播放全部</Button>
        </div>
        {error ? <Alert type="warning" message={error} action={<Button onClick={reload}>重试</Button>} /> : loading && !songs.length ? (
          <div className="daily-skeleton"><Skeleton active paragraph={{ rows: 6 }} /></div>
        ) : songs.length ? (
          <div className="daily-track-grid ab-track-grid">
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

      {/* 覆盖式搜索：最近搜索 / 热门词 / 结果预览，关闭恢复滚动位置 */}
      {searchOpen && (
        <div className="ab-search" role="dialog" aria-modal="true" aria-label="搜索音乐"
          onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); closeSearch() } }}>
          <button type="button" className="ab-search__scrim" onClick={closeSearch} aria-label="关闭搜索" />
          <div className="ab-search__panel">
            <div className="ab-search__bar">
              <Search size={18} />
              <input
                autoFocus
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') submitSearch(searchKeyword) }}
                placeholder="搜索歌曲、歌手…"
                aria-label="搜索关键词"
              />
              <button type="button" onClick={closeSearch} aria-label="关闭搜索"><X size={18} /></button>
            </div>

            <div className="ab-search__body">
              {!searchKeyword.trim() ? (
                <>
                  <div className="ab-search__group">
                    <div className="ab-search__group-head">
                      <span>最近搜索</span>
                      {recentSearches.length ? (
                        <button type="button" onClick={() => { clearRecentSearchesStorage(); setRecentSearches([]) }}>清空</button>
                      ) : null}
                    </div>
                    <div className="ab-search__chips">
                      {recentSearches.length ? recentSearches.map((item) => (
                        <button type="button" key={item} onClick={() => setSearchKeyword(item)}>{item}</button>
                      )) : <span className="ab-search__empty">还没有搜索记录</span>}
                    </div>
                  </div>
                  <div className="ab-search__group">
                    <div className="ab-search__group-head"><span>大家都在搜</span></div>
                    <div className="ab-search__chips ab-search__hot">
                      {HOT_SEARCHES.map((item) => (
                        <button type="button" key={item} onClick={() => setSearchKeyword(item)}>{item}</button>
                      ))}
                    </div>
                  </div>
                </>
              ) : !token ? (
                <p className="ab-search__hint">登录后可查看搜索结果并直接播放。</p>
              ) : searchLoading ? (
                <div className="ab-search__preview-loading"><Skeleton active paragraph={{ rows: 3 }} title={false} /></div>
              ) : searchResults.length ? (
                <div className="ab-search__preview">
                  {searchResults.map((song, index) => (
                    <button type="button" key={`${songKey(song)}:${index}`} className="ab-preview-row"
                      onClick={() => { pushRecentSearch(searchKeyword); void player.playPlaylist(searchResults, index); closeSearch() }}>
                      <AuroraCover src={song.coverUrl} seed={songKey(song)} size={40} rounded={8} />
                      <span className="ab-preview-row__copy"><strong>{song.name}</strong><small>{song.artist}</small></span>
                      <span className="ab-preview-row__dur">{formatClock(song.durationMs, song.durationSec)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="ab-search__hint">没有找到匹配的歌曲，换个关键词试试。</p>
              )}
            </div>

            <div className="ab-search__footer">
              <button type="button" className="ab-search__submit" onClick={() => submitSearch(searchKeyword)}>
                前往完整搜索 <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

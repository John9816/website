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
  SkipForward,
  Square,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  getQishuiAccount,
  qishuiDiscovery,
  qishuiRoamingModes,
} from '../../api/music'
import { useAuth } from '../../context/AuthContext'
import {
  useMusicBrowse,
  useMusicPlayer,
} from '../../context/MusicPlayerContext'
import type {
  QishuiAccountView,
  QishuiFeedMode,
  SongSearchItem,
} from '../../types'
import MusicCover from '../../components/MusicCover'
import MusicSongTable from '../../components/MusicSongTable'
import { useMusicFavorites } from '../../hooks/useMusicFavorites'
import MusicShareAction from '../../components/MusicShareAction'
import QishuiAccountControl from './QishuiAccountControl'

function ListeningLyric() {
  const { current, lyricPreview } = useMusicPlayer()
  return (
    <span className="music-home__lyric">
      {current ? lyricPreview : '汽水音乐 · 官方推荐'}
    </span>
  )
}

export default function QishuiMusicHome({
  view,
}: {
  view: 'discover' | 'roaming'
}) {
  const { token } = useAuth(),
    navigate = useNavigate(),
    player = useMusicBrowse()
  const [songs, setSongs] = useState<SongSearchItem[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('')
  const [account, setAccount] = useState<QishuiAccountView | null>(null),
    [modes, setModes] = useState<QishuiFeedMode[]>([])
  const [mode, setMode] = useState(''),
    [accountLoading, setAccountLoading] = useState(false),
    [accountError, setAccountError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((n) => n + 1), [])
  useEffect(() => {
    setAccount(null)
    setSongs([])
  }, [token])
  useEffect(() => {
    window.addEventListener('qishui-account-changed', reload)
    return () => window.removeEventListener('qishui-account-changed', reload)
  }, [reload])
  useEffect(() => {
    if (!token) return
    const c = new AbortController()
    setLoading(true)
    setError('')
    void qishuiDiscovery(c.signal, revision > 0)
      .then((v) => {
        if (!c.signal.aborted) setSongs(v.list)
      })
      .catch(() => {
        if (!c.signal.aborted) setError('推荐暂时未能加载，请稍后重试。')
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [token, revision])
  useEffect(() => {
    if (!token || view !== 'roaming') return
    const c = new AbortController()
    setAccountLoading(true)
    setAccountError('')
    void getQishuiAccount(c.signal)
      .then(async (a) => {
        if (c.signal.aborted) return
        setAccount(a)
        if (a.bound && a.status !== 'expired') {
          const list = await qishuiRoamingModes(c.signal)
          if (!c.signal.aborted) {
            setModes(list)
            setMode((previous) =>
              list.some((m) => m.id === previous)
                ? previous
                : list.some((m) => m.id === player.roamingSession?.modeId)
                  ? player.roamingSession!.modeId
                  : list[0]?.id || '',
            )
          }
        } else setModes([])
      })
      .catch(() => {
        if (!c.signal.aborted)
          setAccountError('账号状态或漫游场景加载失败，请重试。')
      })
      .finally(() => {
        if (!c.signal.aborted) setAccountLoading(false)
      })
    return () => c.abort()
  }, [token, revision, view])
  const favoriteSongs = useMemo(
    () => [...songs, ...(player.roamingSession?.list || [])],
    [songs, player.roamingSession?.list],
  )
  const favorites = useMusicFavorites(favoriteSongs)
  const actions = (song: SongSearchItem) => (
    <>
      <button
        type="button"
        className={`music-icon-action${favorites.isFavorite(song) ? ' is-active' : ''}`}
        disabled={favorites.isFavoriteLoading(song)}
        aria-label={favorites.isFavorite(song) ? '取消喜欢' : '加入喜欢'}
        onClick={(event) => {
          event.stopPropagation()
          void favorites.toggleFavorite(song)
        }}
      >
        <Heart
          size={16}
          fill={favorites.isFavorite(song) ? 'currentColor' : 'none'}
        />
      </button>
      <MusicShareAction song={song} />
    </>
  )
  const ready = account?.bound && account.status !== 'expired',
    active = player.roamingSession
  const featured = player.current || songs[0],
    covers = [featured, ...songs.filter((s) => s.id !== featured?.id)]
      .filter(Boolean)
      .slice(0, 3)
  return (
    <div className="music-home music-discovery">
      <section
        className={`music-listening-stage${view === 'roaming' ? ' is-radio' : ''}`}
        aria-label="收听卡片"
      >
        <div className="music-listening-stage__copy">
          <span className="music-eyebrow">
            <AudioLines size={16} />
            {view === 'roaming' ? 'YOUR PERSONAL RADIO' : 'MADE FOR LISTENING'}
          </span>
          <h2>
            {view === 'roaming' ? (
              <>
                下一首，
                <br />
                正合你心意。
              </>
            ) : (
              <>
                让好音乐，
                <br />
                接着发生。
              </>
            )}
          </h2>
          <p>
            {view === 'roaming'
              ? '选一个场景，把下一首交给漫游。'
              : '从一首喜欢，听见更多可能。'}
          </p>
          <div className="music-home__actions">
            <Button
              type="primary"
              size="large"
              icon={
                player.current && player.isPlaying ? (
                  <Pause size={17} />
                ) : (
                  <Play size={17} />
                )
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
                : '开始收听'}
            </Button>
            {player.current ? (
              <button
                type="button"
                className="music-stage-next"
                disabled={!player.canNext || player.roamingBusy}
                onClick={player.playNext}
              >
                <SkipForward size={19} />
                <span>下一首</span>
              </button>
            ) : (
              <button
                type="button"
                className="music-stage-next"
                onClick={() => navigate('/music?view=roaming')}
              >
                <Radio size={19} />
                <span>开启漫游</span>
              </button>
            )}
          </div>
        </div>
        <div className="music-record-display" aria-hidden="true">
          <div
            className={`music-record-disc${player.isPlaying ? ' is-spinning' : ''}`}
          >
            <span />
          </div>
          {covers.map((song, index) => (
            <div
              className={`music-record-sleeve music-record-sleeve--${index}`}
              key={`${song!.source}:${song!.id}`}
            >
              <MusicCover
                src={song!.coverUrl}
                size={240}
                rounded={8}
                loading={index === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
          {!covers.length && (
            <div className="music-record-placeholder">
              <Headphones size={68} />
            </div>
          )}
        </div>
        <div className="music-stage-track">
          <span
            className={`music-live-dot${player.isPlaying ? ' is-playing' : ''}`}
          />
          <small>{player.current ? '正在收听' : '今日推荐'}</small>
          <h3>{featured?.name || '准备好，听一首新歌'}</h3>
          {featured?.artist && (
            <button
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
          <ListeningLyric />
        </div>
      </section>
      {view === 'roaming' ? (
        <section className="music-radio-console" aria-label="音乐漫游控制">
          <div className="music-radio-console__intro">
            <Radio size={22} />
            <div>
              <h3>
                音乐漫游{' '}
                <span>
                  {active ? '正在漫游' : ready ? '已连接' : '等待连接'}
                </span>
              </h3>
              <p>
                {ready
                  ? `为 ${account.nickname || '你'} 持续推荐`
                  : '绑定汽水账号，开启属于你的推荐。普通搜索与公开推荐无需扫码。'}
              </p>
            </div>
            <QishuiAccountControl />
          </div>
          {accountLoading ? (
            <Skeleton active paragraph={{ rows: 1 }} title={false} />
          ) : (
            ready &&
            modes.length > 0 && (
              <div className="music-radio-console__controls">
                <label>
                  收听场景
                  <select
                    aria-label="漫游场景"
                    value={mode}
                    disabled={player.roamingBusy}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    {Array.from(
                      new Set(modes.map((m) => m.group || '推荐')),
                    ).map((group) => (
                      <optgroup key={group} label={group}>
                        {modes
                          .filter((m) => (m.group || '推荐') === group)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <Button
                  type="primary"
                  icon={<Radio size={16} />}
                  loading={player.roamingBusy}
                  onClick={() => void player.startRoaming(mode || undefined)}
                >
                  {active ? '按所选场景重新开始' : '开始漫游'}
                </Button>
                {active && (
                  <>
                    <Button
                      disabled={!active.hasMore || player.roamingBusy}
                      onClick={() => void player.nextRoaming()}
                    >
                      换一批
                    </Button>
                    <Button
                      icon={<Square size={15} />}
                      onClick={player.stopRoaming}
                    >
                      结束
                    </Button>
                  </>
                )}
              </div>
            )
          )}
          {accountError && (
            <Alert
              type="warning"
              message={accountError}
              action={<Button onClick={reload}>重试</Button>}
            />
          )}
          {player.roamingError && (
            <Alert
              type="warning"
              message={player.roamingError}
              action={
                active ? (
                  <Button
                    disabled={player.roamingBusy}
                    onClick={() => void player.nextRoaming()}
                  >
                    重试
                  </Button>
                ) : undefined
              }
            />
          )}
        </section>
      ) : (
        <div className="music-discovery-links">
          <button onClick={() => navigate('/music?view=roaming')}>
            <Radio size={22} />
            <span>
              <strong>音乐漫游</strong>
              <small>下一首，交给你的口味</small>
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
      )}
      {view === 'roaming' && active && (
        <section>
          <div className="music-home__section-head">
            <div>
              <h3>当前漫游队列</h3>
              <p>
                {modes.find((m) => m.id === active.modeId)?.name || '个人推荐'}{' '}
                · 播完后自动继续
              </p>
            </div>
            <span>切换页面不中断</span>
          </div>
          <MusicSongTable
            songs={active.list}
            loading={player.roamingBusy}
            emptyText="暂无推荐，可重新开始漫游"
            page={1}
            pageSize={30}
            renderActions={actions}
            actionColumnWidth={160}
          />
        </section>
      )}
      <section>
        <div className="music-home__section-head">
          <div>
            <h3>
              为你推荐 <span className="music-count">{songs.length || ''}</span>
            </h3>
            <p>汽水官方推荐 · 不止于熟悉的旋律</p>
          </div>
          <div className="music-home__actions">
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
              aria-label="刷新推荐"
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
          <Skeleton active paragraph={{ rows: 7 }} />
        ) : songs.length ? (
          <MusicSongTable
            songs={songs}
            loading={loading}
            emptyText="暂无推荐"
            page={1}
            pageSize={songs.length}
            renderActions={actions}
            actionColumnWidth={160}
          />
        ) : (
          <Empty description="暂时没有推荐，搜索一位喜欢的歌手吧" />
        )}
      </section>
    </div>
  )
}

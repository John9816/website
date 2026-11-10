import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Skeleton } from 'antd'
import {
  ArrowRight,
  AudioLines,
  Compass,
  Headphones,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  SkipForward,
  Sparkles,
  Square,
  Trophy,
  Waves,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getQishuiAccount, qishuiRoamingModes } from '../../api/music'
import { useAuth } from '../../context/AuthContext'
import { useMusicBrowse } from '../../context/MusicPlayerContext'
import type { QishuiAccountView, QishuiFeedMode, SongSearchItem } from '../../types'
import MusicCover from '../../components/MusicCover'
import { coverUrlForSize } from '../../utils/musicPlayer'
import QishuiAccountControl from './QishuiAccountControl'
import { formatClock, songKey, useSongActions } from './MusicHomeShared'

/**
 * 音乐漫游（roaming）
 * 与「今日推荐」彻底拆开：不再复用 Hero + 推荐表格，也不再请求 discovery。
 * 四态状态机：加载中 → 未连接（引导）→ 已连接选场景 → 漫游中（旅程轨道）。
 * 场景使用接口真实返回的 iconUrl / toast / group，而非单一 <select>。
 */
export default function MusicRoamingPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const player = useMusicBrowse()
  const [account, setAccount] = useState<QishuiAccountView | null>(null)
  const [modes, setModes] = useState<QishuiFeedMode[]>([])
  const [mode, setMode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((n) => n + 1), [])

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void getQishuiAccount(controller.signal)
      .then(async (value) => {
        if (controller.signal.aborted) return
        setAccount(value)
        if (value.bound && value.status !== 'expired') {
          const list = await qishuiRoamingModes(controller.signal)
          if (controller.signal.aborted) return
          setModes(list)
          setMode((previous) =>
            list.some((item) => item.id === previous)
              ? previous
              : list.some((item) => item.id === player.roamingSession?.modeId)
                ? player.roamingSession!.modeId
                : list[0]?.id || '',
          )
        } else {
          setModes([])
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('账号状态或漫游场景加载失败，请重试。')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
    // player.roamingSession 只用于首次对齐选中场景，不作为依赖避免重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, revision])

  useEffect(() => {
    const handler = () => reload()
    window.addEventListener('qishui-account-changed', handler)
    return () => window.removeEventListener('qishui-account-changed', handler)
  }, [reload])

  const ready = !!account?.bound && account.status !== 'expired'
  const active = player.roamingSession
  const { renderActions } = useSongActions(active?.list || [])
  const groups = useMemo(() => {
    const result: Array<{ name: string; items: QishuiFeedMode[] }> = []
    modes.forEach((item) => {
      const name = item.group || '推荐'
      const found = result.find((group) => group.name === name)
      if (found) found.items.push(item)
      else result.push({ name, items: [item] })
    })
    return result
  }, [modes])
  const activeMode = modes.find((item) => item.id === (active?.modeId || mode))
  const queue = active?.list || []
  const currentIndex = useMemo(() => {
    if (!player.current) return 0
    const index = queue.findIndex((song) => songKey(song) === songKey(player.current!))
    return index >= 0 ? index : 0
  }, [player.current, queue])
  const progress = queue.length
    ? Math.round(((currentIndex + 1) / queue.length) * 100)
    : 0
  const nextUp = queue[currentIndex + 1]

  const start = () => void player.startRoaming(mode || undefined)

  const sceneCard = (item: QishuiFeedMode) => {
    const icon = coverUrlForSize(item.iconUrl, 48) || item.iconUrl || ''
    return (
      <button
        type="button"
        key={item.id}
        className={`roam-scene${mode === item.id ? ' is-active' : ''}`}
        onClick={() => setMode(item.id)}
        aria-pressed={mode === item.id}
      >
        <span className="roam-scene__liquid" aria-hidden="true" />
        <span className="roam-scene__icon">
          {icon ? (
            <img src={icon} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          ) : (
            <Waves size={22} />
          )}
        </span>
        <strong>{item.name}</strong>
        {item.toast && <small>{item.toast}</small>}
      </button>
    )
  }

  return (
    <div className="music-roam">
      {/* 顶部身份条：两页共用的轻量上下文，不重复 Hero */}
      <div className="roam-topbar">
        <span className="music-eyebrow">
          <Radio size={16} />
          YOUR PERSONAL RADIO
        </span>
        <div className="roam-topbar__right">
          <span className={`roam-status${active ? ' is-live' : ''}`}>
            <span className="roam-status__dot" />
            {active ? '正在漫游' : ready ? '已连接' : '等待连接'}
          </span>
          <QishuiAccountControl />
        </div>
      </div>

      {loading && !account ? (
        <section className="roam-panel" aria-label="加载中">
          <Skeleton active paragraph={{ rows: 4 }} />
        </section>
      ) : !ready ? (
        /* 状态一：未连接 —— 引导而非空控制台 */
        <section className="roam-intro" aria-label="连接漫游">
          <div className="roam-intro__art" aria-hidden="true">
            <span className="roam-intro__ring roam-intro__ring--1" />
            <span className="roam-intro__ring roam-intro__ring--2" />
            <span className="roam-intro__ring roam-intro__ring--3" />
            <Radio size={46} />
          </div>
          <div className="roam-intro__copy">
            <h2>
              下一首，
              <br />
              正合你心意。
            </h2>
            <p>
              漫游会根据你选的收听场景，持续推送歌曲；这一批播完，自动接下一批。
              普通搜索与公开推荐无需扫码，个人漫游需要连接汽水账号。
            </p>
            <ol className="roam-steps">
              <li>
                <span>01</span>
                <div>
                  <strong>连接账号</strong>
                  <small>扫码绑定，授权已在后台自动续期</small>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>选一个场景</strong>
                  <small>深夜、通勤、专注……按此刻的心情</small>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>一直听下去</strong>
                  <small>切换页面不中断，播完自动续接</small>
                </div>
              </li>
            </ol>
            <div className="roam-intro__actions">
              <Button type="primary" size="large" icon={<Play size={17} />} onClick={reload}>
                检查连接状态
              </Button>
              <button
                type="button"
                className="roam-intro__link"
                onClick={() => navigate('/music?view=discover')}
              >
                先去看看今日推荐 <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>
      ) : !active ? (
        /* 状态二：已连接 —— 场景卡片墙 */
        <section className="roam-scenes" aria-label="选择收听场景">
          <div className="roam-scenes__head">
            <div>
              <h2>现在，想听点什么？</h2>
              <p>
                为 {account?.nickname || '你'} 挑一个场景，剩下的交给漫游。
              </p>
            </div>
            {activeMode?.toast && (
              <span className="roam-scenes__hint">
                <AudioLines size={16} />
                {activeMode.toast}
              </span>
            )}
          </div>
          {groups.length ? (
            groups.map((group) => (
              <div className="roam-scenes__group" key={group.name}>
                <h3>{group.name}</h3>
                <div className="roam-scenes__grid">{group.items.map(sceneCard)}</div>
              </div>
            ))
          ) : (
            <Alert
              type="info"
              message="漫游场景暂时不可用"
              action={<Button onClick={reload}>重试</Button>}
            />
          )}
          <div className="roam-scenes__start">
            <Button
              type="primary"
              size="large"
              icon={<Radio size={18} />}
              loading={player.roamingBusy}
              disabled={!modes.length}
              onClick={start}
            >
              开始漫游
            </Button>
            <span>选好后随时可以换一批或结束</span>
          </div>
        </section>
      ) : (
        /* 状态三：漫游中 —— 旅程轨道 */
        <section className="roam-journey" aria-label="正在漫游">
          <div className="roam-journey__now">
            <div className="roam-journey__art">
              {player.current ? (
                <MusicCover
                  src={player.current.coverUrl}
                  size={220}
                  rounded={12}
                  loading="eager"
                />
              ) : (
                <div className="roam-journey__art-empty">
                  <Headphones size={56} />
                </div>
              )}
            </div>
            <div className="roam-journey__copy">
              <span className="roam-journey__scene">
                <Compass size={15} />
                {activeMode?.name || '个人推荐'}
              </span>
              <h2>{player.current?.name || '准备下一首'}</h2>
              <p>{player.current?.artist || '漫游正在为你挑选歌曲'}</p>
              <div className="roam-journey__progress">
                <div className="roam-journey__progress-bar">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <small>
                  第 {currentIndex + 1} / {queue.length} 首 · 本批
                </small>
              </div>
              <div className="roam-journey__controls">
                <Button
                  type="primary"
                  icon={
                    player.isPlaying ? <Pause size={16} /> : <Play size={16} />
                  }
                  onClick={player.togglePlay}
                  disabled={!player.current}
                >
                  {player.isPlaying ? '暂停' : '继续'}
                </Button>
                <Button
                  icon={<SkipForward size={16} />}
                  disabled={!player.canNext}
                  onClick={player.playNext}
                >
                  下一首
                </Button>
                <Button
                  icon={<RefreshCw size={16} />}
                  loading={player.roamingBusy}
                  disabled={!active.hasMore || player.roamingBusy}
                  onClick={() => void player.nextRoaming()}
                >
                  换一批
                </Button>
                <Button icon={<Square size={15} />} onClick={player.stopRoaming}>
                  结束
                </Button>
              </div>
            </div>
          </div>

          {nextUp && (
            <div className="roam-next" aria-label="接下来播放">
              <span className="roam-next__label">UP NEXT</span>
              <MusicCover src={nextUp.coverUrl} size={44} rounded={8} loading="lazy" />
              <span className="roam-next__copy">
                <strong>{nextUp.name}</strong>
                <small>{nextUp.artist}</small>
              </span>
              <span className="roam-next__dur">
                {formatClock(nextUp.durationMs, nextUp.durationSec)}
              </span>
            </div>
          )}

          <div className="roam-queue">
            <div className="roam-queue__head">
              <h3>漫游队列</h3>
              <span>{active.hasMore ? '播完自动续接' : '本批已到末尾'}</span>
            </div>
            <ol className="roam-queue__track">
              {queue.map((song: SongSearchItem, index: number) => {
                const state =
                  index < currentIndex ? 'played' : index === currentIndex ? 'now' : 'next'
                return (
                  <li key={songKey(song)} className={`roam-queue__item is-${state}`}>
                    <span className="roam-queue__no">
                      {state === 'now' ? <AudioLines size={14} /> : String(index + 1).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      className="roam-queue__main"
                      onClick={() => void player.playPlaylist(queue, index)}
                      aria-label={`播放 ${song.name}`}
                    >
                      <MusicCover src={song.coverUrl} size={44} rounded={8} loading="lazy" />
                      <span className="roam-queue__copy">
                        <strong>{song.name}</strong>
                        <small>{song.artist}</small>
                      </span>
                    </button>
                    <span className="roam-queue__state">
                      {state === 'now' ? '正在播放' : state === 'played' ? '已听过' : '即将播放'}
                    </span>
                    <span className="roam-queue__ops">{renderActions(song)}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>
      )}

      {/* 未开始漫游时给出真实的替代路径，避免下半屏空白 */}
      {!active && (
        <section className="roam-elsewhere" aria-label="其他收听方式">
          <h3>还没开始漫游？先听听这些</h3>
          <p>公开内容不需要连接账号，随时可以听。</p>
          <div className="roam-elsewhere__grid">
            <button
              type="button"
              className="roam-elsewhere__card"
              onClick={() => navigate('/music?view=discover')}
            >
              <span className="roam-elsewhere__icon">
                <Sparkles size={18} />
              </span>
              <span className="roam-elsewhere__copy">
                <strong>今日推荐</strong>
                <small>每天一份汽水官方推荐</small>
              </span>
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="roam-elsewhere__card"
              onClick={() => navigate('/music?view=search')}
            >
              <span className="roam-elsewhere__icon">
                <Search size={18} />
              </span>
              <span className="roam-elsewhere__copy">
                <strong>搜索歌曲</strong>
                <small>四个音源，找想听的那首</small>
              </span>
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="roam-elsewhere__card"
              onClick={() => navigate('/music?view=toplist')}
            >
              <span className="roam-elsewhere__icon">
                <Trophy size={18} />
              </span>
              <span className="roam-elsewhere__copy">
                <strong>热门榜单</strong>
                <small>看看大家都在听什么</small>
              </span>
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}

      {(error || player.roamingError) && (
        <div className="roam-alerts">
          {error && (
            <Alert
              type="warning"
              message={error}
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
        </div>
      )}
    </div>
  )
}

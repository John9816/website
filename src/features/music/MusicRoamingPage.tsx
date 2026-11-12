import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Skeleton } from 'antd'
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  CarFront,
  Check,
  CloudRain,
  Coffee,
  Compass,
  Dumbbell,
  MoonStar,
  Music2,
  PartyPopper,
  Pause,
  Play,
  QrCode,
  Radio,
  RefreshCw,
  Search,
  SkipForward,
  Sparkles,
  Square,
  Trophy,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getQishuiAccount, qishuiRoamingModes } from '../../api/music'
import { useAuth } from '../../context/AuthContext'
import { useMusicBrowse } from '../../context/MusicPlayerContext'
import type { QishuiAccountView, QishuiFeedMode, SongSearchItem } from '../../types'
import { coverUrlForSize, normalizeCoverUrl } from '../../utils/musicPlayer'
import QishuiAccountControl from './QishuiAccountControl'
import { formatClock, songKey, useSongActions } from './MusicHomeShared'

/**
 * 音乐漫游 · v4
 *
 * 设计对齐 music-v4 每日页：大标题、清晰层级、彩色场景图标、可点击卡片。
 * 参考网易云「私人漫游」/ Apple Music Radio / Spotify 的信息架构：
 *   未连接 → 沉浸式引导；已连接 → 场景选择；漫游中 → 正在播放 + 待播队列。
 *
 * 图片策略（修复「图标封面不显示」）：
 *   场景 iconUrl / 歌曲 coverUrl 都只作为「可选增强」。底层永远是内置
 *   lucide 图标 + 渐变背景；远程图成功加载才覆盖上去，加载失败或返回
 *   0x0 时自动露出底层图标，因此不会出现破图或空白方块。
 */
type Tone = 'coral' | 'violet' | 'blue' | 'green' | 'amber'

const TONES: Tone[] = ['coral', 'violet', 'blue', 'green', 'amber']

const SCENE_RULES: Array<{ keys: string[]; Icon: LucideIcon; tone: Tone }> = [
  { keys: ['推荐', '为你', '精选', '发现'], Icon: Sparkles, tone: 'coral' },
  { keys: ['深夜', '凌晨', '夜晚', '睡眠', '独处', '安静', '失眠', '夜'], Icon: MoonStar, tone: 'violet' },
  { keys: ['通勤', '路上', '开车', '驾车', '地铁', '旅行', '出行'], Icon: CarFront, tone: 'blue' },
  { keys: ['专注', '学习', '工作', '阅读', '办公', '效率'], Icon: BookOpen, tone: 'green' },
  { keys: ['运动', '跑步', '健身', '燃', '节拍', '律动'], Icon: Dumbbell, tone: 'coral' },
  { keys: ['雨', '阴', '情绪', '伤感', '治愈', '放松', '慢'], Icon: CloudRain, tone: 'blue' },
  { keys: ['派对', '快乐', '欢快', '蹦', '热闹'], Icon: PartyPopper, tone: 'violet' },
  { keys: ['咖啡', '午后', '休闲', '慵懒'], Icon: Coffee, tone: 'amber' },
  { keys: ['海', '风', '自然', '漫游'], Icon: Waves, tone: 'blue' },
]

function sceneVisual(mode: QishuiFeedMode): { Icon: LucideIcon; tone: Tone } {
  const text = `${mode.name || ''} ${mode.group || ''}`
  return SCENE_RULES.find((rule) => rule.keys.some((key) => text.includes(key)))
    || { Icon: Radio, tone: 'violet' }
}

function toneForSeed(seed: string): Tone {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return TONES[hash % TONES.length]
}

/** 远程图只作为增强层：底层内置图标始终存在，永不破图。 */
function RoamSceneIcon({ mode, size = 26 }: { mode: QishuiFeedMode; size?: number }) {
  const { Icon, tone } = sceneVisual(mode)
  const url = useMemo(() => normalizeCoverUrl(mode.iconUrl), [mode.iconUrl])
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])

  return (
    <span className={`roam-v4-icon roam-v4-tone--${tone}`} style={{ width: size + 24, height: size + 24 }} aria-hidden="true">
      <Icon size={size} strokeWidth={1.9} className="roam-v4-icon__fallback" />
      {url && !failed && (
        <img
          className="roam-v4-icon__remote"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(event) => { if (!event.currentTarget.naturalWidth) setFailed(true) }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

/** 封面同样以渐变 + 音符兜底；远程封面沿用 CDN 缩略图优化。 */
function RoamCover({
  src,
  seed,
  size,
  rounded = 10,
  loading = 'lazy',
}: {
  src?: string
  seed: string
  size: number
  rounded?: number
  loading?: 'lazy' | 'eager'
}) {
  const tone = useMemo(() => toneForSeed(seed), [seed])
  const url = useMemo(() => coverUrlForSize(src, size), [src, size])
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])

  return (
    <span className={`roam-v4-cover roam-v4-tone--${tone}`} style={{ width: size, height: size, borderRadius: rounded }}>
      <Music2 size={Math.round(size * 0.4)} strokeWidth={1.7} className="roam-v4-cover__fallback" />
      {url && !failed && (
        <img
          className="roam-v4-cover__remote"
          src={url}
          alt=""
          loading={loading}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(event) => { if (!event.currentTarget.naturalWidth) setFailed(true) }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

export default function MusicRoamingPage() {
  const { token, username } = useAuth()
  const navigate = useNavigate()
  const player = useMusicBrowse()
  const [account, setAccount] = useState<QishuiAccountView | null>(null)
  const [modes, setModes] = useState<QishuiFeedMode[]>([])
  const [mode, setMode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [connectSignal, setConnectSignal] = useState(0)
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
  const selectedMode = modes.find((item) => item.id === (active?.modeId || mode))
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

  const headTitle = active ? '正在漫游' : ready ? '现在，想听点什么？' : '让音乐自己往前走'
  const headSubtitle = active
    ? `${selectedMode?.name || '个人推荐'} · 这一批播完会自动接上下一批`
    : ready
      ? `${username || account?.nickname || '你'}，挑一个场景，剩下的交给漫游。`
      : '按此刻的心情持续推送歌曲，切换页面也不会中断。'

  return (
    <div className="music-roam-v4">
      <header className="roam-v4-head">
        <div className="roam-v4-head__copy">
          <span className="roam-v4-eyebrow"><Radio size={14} />音乐漫游 · PERSONAL RADIO</span>
          <h1>{headTitle}</h1>
          <p>{headSubtitle}</p>
        </div>
        <div className="roam-v4-head__ops">
          <span className={`roam-v4-status${active ? ' is-live' : ready ? ' is-ready' : ''}`}>
            <span className="roam-v4-status__dot" />
            {active ? '正在漫游' : ready ? '已连接' : '等待连接'}
          </span>
          <QishuiAccountControl openSignal={connectSignal} />
          <button type="button" className="roam-v4-icon-btn" onClick={reload} disabled={loading} aria-label="刷新状态" title="刷新状态">
            <RefreshCw size={18} className={loading ? 'is-spinning' : ''} />
          </button>
        </div>
      </header>

      {loading && !account ? (
        <section className="roam-v4-panel" aria-label="加载中"><Skeleton active paragraph={{ rows: 5 }} /></section>
      ) : !ready ? (
        /* 状态一：未连接 —— 沉浸式引导 */
        <>
          <section className="roam-v4-intro" aria-label="连接漫游">
            <div className="roam-v4-intro__art" aria-hidden="true">
              <span className="roam-v4-intro__ring roam-v4-intro__ring--1" />
              <span className="roam-v4-intro__ring roam-v4-intro__ring--2" />
              <span className="roam-v4-intro__ring roam-v4-intro__ring--3" />
              <span className="roam-v4-intro__disc"><Radio size={54} strokeWidth={1.6} /></span>
            </div>
            <div className="roam-v4-intro__copy">
              <span className="roam-v4-intro__tag"><Sparkles size={13} />越听越懂你</span>
              <h2>下一首，<br />正合你心意。</h2>
              <p>
                漫游会根据你选的收听场景持续推送歌曲；这一批播完，自动接下一批。
                普通搜索与公开推荐无需扫码，个人漫游需要连接汽水账号。
              </p>
              <ol className="roam-v4-steps">
                <li><span>01</span><div><strong>连接账号</strong><small>扫码绑定，后台自动续期</small></div></li>
                <li><span>02</span><div><strong>选一个场景</strong><small>深夜、通勤、专注……按心情</small></div></li>
                <li><span>03</span><div><strong>一直听下去</strong><small>切页不中断，播完自动续接</small></div></li>
              </ol>
              <div className="roam-v4-intro__actions">
                <Button type="primary" size="large" icon={<QrCode size={17} />} onClick={() => setConnectSignal((n) => n + 1)}>
                  连接汽水账号
                </Button>
                <button type="button" className="roam-v4-intro__link" onClick={() => navigate('/music?view=discover')}>
                  先去看看今日推荐 <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </section>
          <RoamElsewhere navigate={navigate} />
        </>
      ) : !active ? (
        /* 状态二：已连接 —— 场景卡片墙 */
        <>
          <section className="roam-v4-scenes" aria-label="选择收听场景">
            {groups.length ? groups.map((group) => (
              <div className="roam-v4-group" key={group.name}>
                <div className="roam-v4-group__head">
                  <h2>{group.name}</h2>
                  <span>{group.items.length} 个场景</span>
                </div>
                <div className="roam-v4-scene-grid">
                  {group.items.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`roam-v4-scene${mode === item.id ? ' is-active' : ''}`}
                      onClick={() => setMode(item.id)}
                      aria-pressed={mode === item.id}
                    >
                      <RoamSceneIcon mode={item} />
                      <span className="roam-v4-scene__copy">
                        <strong>{item.name}</strong>
                        <small>{item.toast || '按这个场景为你挑歌'}</small>
                      </span>
                      <span className="roam-v4-scene__check"><Check size={14} strokeWidth={2.6} /></span>
                    </button>
                  ))}
                </div>
              </div>
            )) : (
              <Alert type="info" message="漫游场景暂时不可用" action={<Button onClick={reload}>重试</Button>} />
            )}

            <div className="roam-v4-launch">
              <div className="roam-v4-launch__copy">
                <span>已选场景</span>
                <strong>{selectedMode?.name || '为你推荐'}</strong>
                <small>{selectedMode?.toast || '随时可以换一批或结束'}</small>
              </div>
              <Button
                type="primary"
                size="large"
                icon={<Play size={18} fill="currentColor" />}
                loading={player.roamingBusy}
                disabled={!modes.length}
                onClick={start}
              >
                开始漫游
              </Button>
            </div>
          </section>
          <RoamElsewhere navigate={navigate} />
        </>
      ) : (
        /* 状态三：漫游中 —— 正在播放 + 待播队列 */
        <section className="roam-v4-journey" aria-label="正在漫游">
          <div className="roam-v4-now">
            <div className="roam-v4-now__art">
              <RoamCover
                src={player.current?.coverUrl}
                seed={player.current ? songKey(player.current) : selectedMode?.id || 'roam'}
                size={208}
                rounded={18}
                loading="eager"
              />
            </div>
            <div className="roam-v4-now__copy">
              <span className="roam-v4-now__scene"><Compass size={15} />{selectedMode?.name || '个人推荐'}</span>
              <h2>{player.current?.name || '准备下一首'}</h2>
              <p>{player.current?.artist || '漫游正在为你挑选歌曲'}</p>
              <div className="roam-v4-progress">
                <div className="roam-v4-progress__bar"><span style={{ width: `${progress}%` }} /></div>
                <small>第 {currentIndex + 1} / {queue.length || '—'} 首 · 本批 {progress}%</small>
              </div>
              <div className="roam-v4-controls">
                <Button type="primary" icon={player.isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
                  onClick={player.togglePlay} disabled={!player.current}>
                  {player.isPlaying ? '暂停' : '继续'}
                </Button>
                <Button icon={<SkipForward size={16} />} disabled={!player.canNext} onClick={player.playNext}>下一首</Button>
                <Button icon={<RefreshCw size={16} />} loading={player.roamingBusy}
                  disabled={!active.hasMore || player.roamingBusy} onClick={() => void player.nextRoaming()}>换一批</Button>
                <Button icon={<Square size={15} />} onClick={player.stopRoaming}>结束</Button>
              </div>
            </div>
          </div>

          {nextUp && (
            <div className="roam-v4-next" aria-label="接下来播放">
              <span className="roam-v4-next__label">UP NEXT</span>
              <RoamCover src={nextUp.coverUrl} seed={songKey(nextUp)} size={48} rounded={9} />
              <span className="roam-v4-next__copy"><strong>{nextUp.name}</strong><small>{nextUp.artist}</small></span>
              <span className="roam-v4-next__dur">{formatClock(nextUp.durationMs, nextUp.durationSec)}</span>
            </div>
          )}

          <div className="roam-v4-queue">
            <div className="roam-v4-queue__head">
              <div><h2>漫游队列 <span>{queue.length}</span></h2><p>点击歌曲立即播放，也可以插播或加入待播队列</p></div>
              <span className="roam-v4-queue__hint">{active.hasMore ? '播完自动续接' : '本批已到末尾'}</span>
            </div>
            <ol className="roam-v4-queue__list">
              {queue.map((song: SongSearchItem, index: number) => {
                const state = index < currentIndex ? 'played' : index === currentIndex ? 'now' : 'next'
                return (
                  <li key={songKey(song)} className={`roam-v4-queue__item is-${state}`}>
                    <span className="roam-v4-queue__no">
                      {state === 'now' ? <AudioLines size={15} /> : String(index + 1).padStart(2, '0')}
                    </span>
                    <button type="button" className="roam-v4-queue__main"
                      onClick={() => void player.playPlaylist(queue, index)} aria-label={`播放 ${song.name}`}>
                      <RoamCover src={song.coverUrl} seed={songKey(song)} size={48} rounded={9} />
                      <span className="roam-v4-queue__copy"><strong>{song.name}</strong><small>{song.artist}</small></span>
                    </button>
                    <span className="roam-v4-queue__state">
                      {state === 'now' ? '正在播放' : state === 'played' ? '已听过' : '即将播放'}
                    </span>
                    <span className="roam-v4-queue__ops">{renderActions(song)}</span>
                    <span className="roam-v4-queue__dur">{formatClock(song.durationMs, song.durationSec)}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>
      )}

      {(error || player.roamingError) && (
        <div className="roam-v4-alerts">
          {error && <Alert type="warning" message={error} action={<Button onClick={reload}>重试</Button>} />}
          {player.roamingError && (
            <Alert type="warning" message={player.roamingError} action={active ? (
              <Button disabled={player.roamingBusy} onClick={() => void player.nextRoaming()}>重试</Button>
            ) : undefined} />
          )}
        </div>
      )}
    </div>
  )
}

function RoamElsewhere({ navigate }: { navigate: (path: string) => void }) {
  const cards = [
    { label: '今日推荐', detail: '每天一份汽水官方推荐', icon: Sparkles, tone: 'coral', path: '/music?view=discover' },
    { label: '搜索歌曲', detail: '四个音源，找想听的那首', icon: Search, tone: 'blue', path: '/music?view=search' },
    { label: '热门榜单', detail: '看看大家都在听什么', icon: Trophy, tone: 'green', path: '/music?view=toplist' },
  ] as const
  return (
    <section className="roam-v4-elsewhere" aria-label="其他收听方式">
      <div className="roam-v4-elsewhere__head">
        <h2>还没开始漫游？先听听这些</h2>
        <p>公开内容不需要连接账号，随时可以听。</p>
      </div>
      <div className="roam-v4-elsewhere__grid">
        {cards.map(({ label, detail, icon: Icon, tone, path }) => (
          <button type="button" key={label} className={`roam-v4-elsewhere__card roam-v4-tone--${tone}`} onClick={() => navigate(path)}>
            <span className="roam-v4-elsewhere__icon"><Icon size={20} /></span>
            <span className="roam-v4-elsewhere__copy"><strong>{label}</strong><small>{detail}</small></span>
            <ArrowRight size={17} className="roam-v4-elsewhere__arrow" />
          </button>
        ))}
      </div>
    </section>
  )
}
